import { ThemeToggle } from '../theme/ThemeToggle';

// HydrateFallback for the "protected" route — rendered only while the
// initial requireSession loader is pending (AC-010). Split into its own file
// so router/routes.tsx can export non-component values (routeConfig, router)
// without tripping the fast-refresh "only export components" lint rule.
export function LoadingShell() {
  return (
    <>
      <div className="flex items-center justify-end gap-2 border-b border-[var(--color-border)] px-6 py-4">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-[var(--color-text-secondary)]">Đang tải...</p>
      </div>
    </>
  );
}
