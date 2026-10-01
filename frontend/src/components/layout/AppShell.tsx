import { useCallback, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { LogoutButton } from '../LogoutButton';
import { ThemeToggle } from '../../theme/ThemeToggle';
import { NavSidebar } from './NavSidebar';

// Element of the protected layout route — architecture/app-navigation-shell.md
// "Components và dependency contracts". Only rendered once requireSession's
// loader has resolved successfully.
export function AppShell() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="flex min-h-0 flex-1">
      <NavSidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-end gap-2 border-b border-[var(--color-border)] px-6 py-4">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-lg text-[var(--color-text-primary)] md:hidden"
            aria-label="Mở menu điều hướng"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen((open) => !open)}
          >
            ☰
          </button>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <LogoutButton onLoggedOut={() => navigate('/login', { replace: true })} />
          </div>
        </div>
        <div className="flex flex-1 items-start justify-center p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
