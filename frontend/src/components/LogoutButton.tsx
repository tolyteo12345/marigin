import { useState } from 'react';
import { logout } from '../api/authClient';

interface LogoutButtonProps {
  onLoggedOut: () => void;
}

// Simple confirm per requirements "Logout có xác nhận đơn giản (không phải
// financial confirm)" — a plain window.confirm is sufficient here.
export function LogoutButton({ onLoggedOut }: LogoutButtonProps) {
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!window.confirm('Đăng xuất khỏi phiên hiện tại?')) {
      return;
    }
    try {
      await logout();
      onLoggedOut();
    } catch {
      setError('Không thể đăng xuất, vui lòng thử lại.');
    }
  }

  return (
    <div>
      <button type="button" onClick={() => void handleClick()}>
        Đăng xuất
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
