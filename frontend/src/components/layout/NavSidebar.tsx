import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router';
import { NAV_GROUPS } from '../../navigation/navConfig';

interface NavSidebarProps {
  open: boolean;
  onClose: () => void;
}

const navItemClassName = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium no-underline ${
    isActive
      ? 'bg-[var(--color-border)] text-[var(--color-text-primary)]'
      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]/50 hover:text-[var(--color-text-primary)]'
  }`;

// design/app-navigation-shell.md mục 2 (near.com-inspired style, see
// design/ui-visual-refresh.md rev 3): flat list of pill-shaped nav items with
// icons, grouped by domain. Desktop (>=768px, Tailwind's `md`): static
// column, always visible — the `translate-x`/`open` logic below is ignored
// entirely via the `md:` overrides, so a stale `open=true` left over from a
// previous mobile session can never cover desktop content.
// Mobile (<768px): fixed off-canvas panel, slid in via `open`.
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
      {open && (
        <div className="fixed inset-0 z-10 bg-black/50 md:hidden" aria-hidden="true" onClick={onClose} />
      )}
      <nav
        aria-label="Điều hướng chính"
        data-open={open}
        className={`fixed inset-y-0 left-0 z-20 flex w-72 flex-col gap-6 overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition-transform duration-200 ease-in-out md:static md:z-auto md:w-64 md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {NAV_GROUPS.map((group) => (
          <div key={group.id}>
            <h3 className="mb-1 px-3 text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
              {group.label}
            </h3>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.path}>
                    <NavLink to={item.path} className={navItemClassName}>
                      <Icon />
                      {item.label}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
