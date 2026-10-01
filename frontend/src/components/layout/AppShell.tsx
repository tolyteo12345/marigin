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
    <div className="app-shell">
      <NavSidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="app-shell-content">
        <div className="app-header">
          <button
            type="button"
            className="nav-toggle-btn"
            aria-label="Mở menu điều hướng"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen((open) => !open)}
          >
            ☰
          </button>
          <div className="app-header-actions">
            <ThemeToggle />
            <LogoutButton onLoggedOut={() => navigate('/login', { replace: true })} />
          </div>
        </div>
        <div className="app-main app-main-shell">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
