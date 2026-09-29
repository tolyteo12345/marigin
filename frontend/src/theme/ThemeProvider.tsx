import { useState, type ReactNode } from 'react';
import { ThemeContext, type Theme } from './theme-context';

const STORAGE_KEY = 'mtl-theme';
const DEFAULT_THEME: Theme = 'dark';

// localStorage can throw (private mode, disabled storage) or hold a stale/
// invalid value; both fall back to DEFAULT_THEME rather than surfacing an
// error, since theme is a device preference, not data the user needs to know
// failed to load (design/ui-visual-refresh.md "Trạng thái UI bắt buộc").
function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'dark' || stored === 'light' ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function applyThemeAttribute(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Synchronous initializer (not useEffect) so the correct theme attribute
  // is set before first paint, avoiding a flash of the wrong theme.
  const [theme, setThemeState] = useState<Theme>(() => {
    const initial = readStoredTheme();
    applyThemeAttribute(initial);
    return initial;
  });

  function setTheme(next: Theme) {
    applyThemeAttribute(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable: theme still applies for this session, just not persisted.
    }
    setThemeState(next);
  }

  function toggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
