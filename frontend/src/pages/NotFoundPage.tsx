import { Link } from 'react-router';

// Route element for the catch-all "*" path (AC-008). Deliberately outside
// AppShell/requireSession — rendering it the same way regardless of session
// state avoids leaking "this route exists but needs login" through a
// behavior difference (architecture/app-navigation-shell.md).
export function NotFoundPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex flex-col items-start gap-3 text-left">
        <h2>Không tìm thấy trang</h2>
        <p className="text-[var(--color-text-secondary)]">Trang bạn truy cập không tồn tại.</p>
        <Link
          to="/account"
          className="inline-flex items-center justify-center rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-bg)] no-underline hover:bg-[var(--color-accent-hover)]"
        >
          Quay về trang chính
        </Link>
      </div>
    </div>
  );
}
