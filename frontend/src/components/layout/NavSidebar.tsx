import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router';
import { NAV_GROUPS } from '../../navigation/navConfig';

interface NavSidebarProps {
  open: boolean;
  onClose: () => void;
}

// design/app-navigation-shell.md mục 2. Desktop: always visible (CSS media
// query ignores `open`/backdrop entirely — see .nav-sidebar rules in
// index.css, so a stale `open=true` from a previous mobile session can never
// get "stuck" covering content once the viewport is desktop-sized).
// Mobile: hidden by default, slides in as an overlay when `open`.
export function NavSidebar({ open, onClose }: NavSidebarProps) {
  const location = useLocation();

  // OQ-N04(a): close the mobile overlay on any navigation (including via the
  // browser back button) instead of wiring history entries for the overlay
  // itself.
  useEffect(() => {
    onClose();
  }, [location.pathname, onClose]);

  return (
    <>
      {open && <div className="nav-sidebar-backdrop" aria-hidden="true" onClick={onClose} />}
      <nav aria-label="Điều hướng chính" className={`nav-sidebar${open ? ' nav-sidebar-open' : ''}`}>
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="nav-group">
            <h3 className="nav-group-heading">{group.label}</h3>
            <ul className="nav-group-items">
              {group.items.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    className={({ isActive }) => `nav-item${isActive ? ' nav-item-active' : ''}`}
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
