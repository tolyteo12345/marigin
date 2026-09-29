import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from './ThemeProvider';
import { ThemeToggle } from './ThemeToggle';

function renderWithProvider() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe('ThemeProvider + ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  // AC-005 (requirements/ui-visual-refresh.md): default theme is dark (BR-003).
  it('defaults to dark theme and sets data-theme before first paint', () => {
    renderWithProvider();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByRole('button')).toHaveTextContent('Dark');
  });

  // AC-005: toggling switches data-theme immediately.
  it('toggles data-theme attribute and label on click', async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByRole('button'));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByRole('button')).toHaveTextContent('Light');
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button'));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });

  // AC-006: choice persists across reloads via localStorage.
  it('persists the chosen theme to localStorage and reads it back on next mount', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithProvider();

    await user.click(screen.getByRole('button'));
    expect(localStorage.getItem('mtl-theme')).toBe('light');

    unmount();
    renderWithProvider();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByRole('button')).toHaveTextContent('Light');
  });

  // Edge case from architecture/ui-visual-refresh.md: storage unavailable falls back to default.
  it('falls back to default theme when localStorage throws', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    renderWithProvider();
    expect(document.documentElement.dataset.theme).toBe('dark');

    getItemSpy.mockRestore();
  });
});
