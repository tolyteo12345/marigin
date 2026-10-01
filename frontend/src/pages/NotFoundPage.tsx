import { Link } from 'react-router';

// Route element for the catch-all "*" path (AC-008). Deliberately outside
// AppShell/requireSession — rendering it the same way regardless of session
// state avoids leaking "this route exists but needs login" through a
// behavior difference (architecture/app-navigation-shell.md).
export function NotFoundPage() {
  return (
    <div className="app-main">
      <div>
        <h2>Không tìm thấy trang</h2>
        <p>Trang bạn truy cập không tồn tại.</p>
        <Link to="/account" className="btn btn-primary">
          Quay về trang chính
        </Link>
      </div>
    </div>
  );
}
