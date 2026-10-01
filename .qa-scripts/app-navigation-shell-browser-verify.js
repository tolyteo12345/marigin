// QA browser verification script for feature app-navigation-shell, WARN-N01.
// Ad-hoc script, not part of the product repo. Run: node verify.js
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5173';
const EMAIL = process.env.QA_EMAIL;
const PASSWORD = process.env.QA_PASSWORD || 'TestPass123!';
const OUT_DIR = path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });

if (!EMAIL) {
  console.error('Set QA_EMAIL env var to a pre-registered user email');
  process.exit(1);
}

// WCAG relative luminance / contrast ratio implementation (standard formula).
function srgbToLinear(c) {
  const cs = c / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}
function relLuminance([r, g, b]) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
function parseRgb(str) {
  const m = str.match(/rgba?\(([^)]+)\)/);
  const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
  return parts;
}
function contrastRatio(fgStr, bgStr) {
  const fg = parseRgb(fgStr);
  const bg = parseRgb(bgStr);
  const L1 = relLuminance(fg);
  const L2 = relLuminance(bg);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL(`${BASE_URL}/account`);
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem('mtl-theme', t);
  }, theme);
  await page.reload();
  await page.waitForSelector('nav[aria-label="Điều hướng chính"]');
}

(async () => {
  const browser = await chromium.launch();
  const results = { ac006: {}, ac009: {}, visual: {} };

  // ---- AC-006: mobile overlay vs desktop static, real viewport ----
  {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await context.newPage();
    await login(page);

    const nav = page.locator('nav[aria-label="Điều hướng chính"]');
    const navBoxBefore = await nav.boundingBox();
    const navClassBefore = await nav.getAttribute('class');
    results.ac006.mobile_initial_box = navBoxBefore;
    results.ac006.mobile_initial_class_has_translate_full = navClassBefore.includes('-translate-x-full');

    await page.screenshot({ path: path.join(OUT_DIR, 'ac006-mobile-closed.png') });

    // Open the overlay via the toggle button.
    await page.getByRole('button', { name: 'Mở menu điều hướng' }).click();
    await page.waitForTimeout(300); // CSS transition duration 200ms
    const navClassAfter = await nav.getAttribute('class');
    results.ac006.mobile_open_class_has_translate_0 = navClassAfter.includes('translate-x-0');
    const navBoxAfter = await nav.boundingBox();
    results.ac006.mobile_open_box = navBoxAfter;
    // visually on-screen check: x should be 0 (or very close) when open
    results.ac006.mobile_open_onscreen = navBoxAfter.x > -10 && navBoxAfter.x < 10;
    results.ac006.mobile_closed_offscreen = navBoxBefore.x <= -navBoxBefore.width + 10;

    await page.screenshot({ path: path.join(OUT_DIR, 'ac006-mobile-open-overlay.png') });

    // click a DIFFERENT nav item (we're on /account) -> overlay should auto-close on pathname change
    await page.getByRole('link', { name: 'Kết nối Binance' }).click();
    await page.waitForURL(`${BASE_URL}/connections/binance`);
    await page.waitForTimeout(300);
    const navClassAfterNav = await nav.getAttribute('class');
    results.ac006.closes_on_nav_select = navClassAfterNav.includes('-translate-x-full');

    await context.close();
  }

  // ---- AC-006 desktop: sidebar static, not overlay ----
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await login(page);
    const nav = page.locator('nav[aria-label="Điều hướng chính"]');
    const box = await nav.boundingBox();
    results.ac006.desktop_box = box;
    results.ac006.desktop_onscreen_static = box.x >= 0 && box.x < 50;
    // mobile toggle button should be hidden on desktop (md:hidden)
    const toggleBtn = page.getByRole('button', { name: 'Mở menu điều hướng' });
    results.ac006.desktop_toggle_hidden = !(await toggleBtn.isVisible());
    // backdrop should not exist
    const backdropCount = await page.locator('div.bg-black\\/50').count();
    results.ac006.desktop_backdrop_count = backdropCount;

    await page.screenshot({ path: path.join(OUT_DIR, 'ac006-desktop-static.png') });
    await page.screenshot({ path: path.join(OUT_DIR, 'visual-desktop-full.png'), fullPage: true });
    await context.close();
  }

  // ---- AC-009: contrast active nav item, light + dark ----
  for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await login(page);
    await setTheme(page, theme);

    const activeLink = page.locator('nav[aria-label="Điều hướng chính"] a[aria-current="page"]');
    await activeLink.waitFor();
    const styles = await activeLink.evaluate((el) => {
      const cs = getComputedStyle(el);
      // Walk up to find actual background (active link bg via bg-[var(--color-border)], no own bg? check)
      return {
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
      };
    });
    let bg = styles.backgroundColor;
    // If transparent/none, walk up ancestors to find actual rendered background.
    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
      bg = await activeLink.evaluate((el) => {
        let node = el.parentElement;
        while (node) {
          const bgc = getComputedStyle(node).backgroundColor;
          if (bgc && bgc !== 'rgba(0, 0, 0, 0)' && bgc !== 'transparent') return bgc;
          node = node.parentElement;
        }
        return getComputedStyle(document.body).backgroundColor;
      });
    }
    const ratio = contrastRatio(styles.color, bg);
    results.ac009[theme] = { ...styles, resolvedBackground: bg, contrastRatio: ratio, passesAA: ratio >= 4.5 };

    await page.screenshot({ path: path.join(OUT_DIR, `ac009-${theme}-active-state.png`) });
    await context.close();
  }

  await browser.close();

  fs.writeFileSync(path.join(OUT_DIR, '..', 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})();
