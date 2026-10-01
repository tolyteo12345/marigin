import { createMemoryRouter, RouterProvider } from 'react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../theme/ThemeProvider';
import { routeConfig } from './routes';

// Replaces the old App.test.tsx (COND-N02, architecture/app-navigation-shell.md
// "Validation và rollout"): builds a createMemoryRouter from the exact same
// route tree used in production (routeConfig) instead of mounting <App/>.

function mockApi({ meStatus = 200, meDelayMs = 0 }: { meStatus?: number; meDelayMs?: number } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) {
        if (meDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, meDelayMs));
        }
        return meStatus === 200
          ? new Response(JSON.stringify({ userId: 'u1', hasLocalCredential: true, hasTelegramIdentity: false }), { status: 200 })
          : new Response(JSON.stringify({ message: 'unauthorized' }), { status: 401 });
      }
      if (url.endsWith('/api/binance-connections')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    }),
  );
}

function renderAt(initialEntry: string) {
  const router = createMemoryRouter(routeConfig, { initialEntries: [initialEntry] });
  return render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
}

describe('app-navigation-shell routing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // AC-001, AC-004
  it('shows the sidebar with both nav groups and marks the current page active when logged in', async () => {
    mockApi();
    renderAt('/account');

    expect(await screen.findByText('Liên kết tài khoản')).toBeInTheDocument();
    const accountLink = screen.getByRole('link', { name: 'Tài khoản' });
    const binanceLink = screen.getByRole('link', { name: 'Kết nối Binance' });
    expect(accountLink).toHaveAttribute('aria-current', 'page');
    expect(binanceLink).not.toHaveAttribute('aria-current');
  });

  // AC-003
  it('switches page content and active state when a nav item is clicked', async () => {
    mockApi();
    renderAt('/account');
    await screen.findByText('Liên kết tài khoản');

    await userEvent.click(screen.getByRole('link', { name: 'Kết nối Binance' }));

    expect(await screen.findByText('Bạn chưa có kết nối Binance nào.')).toBeInTheDocument();
    expect(screen.queryByText('Liên kết tài khoản')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kết nối Binance' })).toHaveAttribute('aria-current', 'page');
  });

  // AC-005: deep link directly into a protected route without clicking through "/account" first.
  it('renders the correct page when loading a protected URL directly (deep link)', async () => {
    mockApi();
    renderAt('/connections/binance');

    expect(await screen.findByText('Bạn chưa có kết nối Binance nào.')).toBeInTheDocument();
    expect(screen.queryByText('Liên kết tài khoản')).not.toBeInTheDocument();
  });

  // AC-002, AC-007: no session -> redirected to /login, protected content never renders.
  it('redirects to the login page without rendering protected content when there is no session', async () => {
    mockApi({ meStatus: 401 });
    renderAt('/connections/binance');

    expect(await screen.findByRole('button', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(screen.queryByText('Liên kết tài khoản')).not.toBeInTheDocument();
    expect(screen.queryByText('Bạn chưa có kết nối Binance nào.')).not.toBeInTheDocument();
  });

  // AC-008
  it('shows the 404 page for an unknown route and links back to the default page', async () => {
    mockApi();
    renderAt('/this-route-does-not-exist');

    expect(await screen.findByText('Không tìm thấy trang')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quay về trang chính' })).toHaveAttribute('href', '/account');
  });

  // AC-010: the HydrateFallback loading state renders without the sidebar while the session check is pending.
  it('shows the loading state without the sidebar while the session check is pending', async () => {
    mockApi({ meDelayMs: 50 });
    renderAt('/account');

    expect(screen.getByText('Đang tải...')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Điều hướng chính' })).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toBeInTheDocument());
  });

  // AC-006 (JS wiring only — jsdom does not evaluate the real @media breakpoint,
  // see implementation.md "Hạn chế môi trường"): toggle button opens/closes the
  // overlay, and selecting a nav item while open closes it again.
  it('toggles the mobile sidebar overlay open/closed via the header button and auto-closes on navigation', async () => {
    mockApi();
    renderAt('/account');
    await screen.findByText('Liên kết tài khoản');

    const toggleBtn = screen.getByRole('button', { name: 'Mở menu điều hướng' });
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });

    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    expect(nav.className).not.toContain('nav-sidebar-open');

    await userEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    expect(nav.className).toContain('nav-sidebar-open');

    await userEvent.click(screen.getByRole('link', { name: 'Kết nối Binance' }));
    await screen.findByText('Bạn chưa có kết nối Binance nào.');
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    expect(nav.className).not.toContain('nav-sidebar-open');
  });
});
