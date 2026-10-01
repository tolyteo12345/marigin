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
      <div className="flex items-center justify-end gap-2 border-b border-[var(--color-border)] px-6 py-4">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-[420px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-left shadow-[var(--shadow)]">
          {showRegister ? (
            <RegisterForm onRegistered={goToAccount} />
          ) : (
            <LoginForm onLoggedIn={goToAccount} />
          )}
          <Button variant="secondary" onClick={() => setShowRegister((v) => !v)} className="mt-2 w-full">
            {showRegister ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}
          </Button>
        </div>
      </div>
    </>
  );
}
