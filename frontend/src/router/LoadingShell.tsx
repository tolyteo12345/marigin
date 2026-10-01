import { ThemeToggle } from '../theme/ThemeToggle';

// HydrateFallback for the "protected" route — rendered only while the
// initial requireSession loader is pending (AC-010). Split into its own file
// so router/routes.tsx can export non-component values (routeConfig, router)
// without tripping the fast-refresh "only export components" lint rule.
export function LoadingShell() {
  return (
    <>
      <div className="app-header">
        <ThemeToggle />
      </div>
      <div className="app-main">
        <p>Đang tải...</p>
      </div>
    </>
  );
}
