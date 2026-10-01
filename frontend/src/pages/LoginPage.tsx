import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/common';
import { LoginForm } from '../components/LoginForm';
import { RegisterForm } from '../components/RegisterForm';
import { ThemeToggle } from '../theme/ThemeToggle';

// Route element for "/login" — moved verbatim from the old App.tsx
// unauthenticated branch (architecture/app-navigation-shell.md), no change
// to copy/behavior, only location.
export function LoginPage() {
  const navigate = useNavigate();
  const [showRegister, setShowRegister] = useState(false);

  function goToAccount() {
    navigate('/account', { replace: true });
  }

  return (
    <>
      <div className="app-header">
        <ThemeToggle />
      </div>
      <div className="app-main">
        <div className="card">
          {showRegister ? (
            <RegisterForm onRegistered={goToAccount} />
          ) : (
            <LoginForm onLoggedIn={goToAccount} />
          )}
          <Button variant="secondary" onClick={() => setShowRegister((v) => !v)}>
            {showRegister ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}
          </Button>
        </div>
      </div>
    </>
  );
}
