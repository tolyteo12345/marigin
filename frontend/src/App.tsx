import { useEffect, useState } from 'react';
import { AccountLinkPanel } from './components/AccountLinkPanel';
import { Button } from './components/common';
import { LoginForm } from './components/LoginForm';
import { LogoutButton } from './components/LogoutButton';
import { RegisterForm } from './components/RegisterForm';
import { ThemeToggle } from './theme/ThemeToggle';
import { BinanceConnectionsPage } from './components/binance/BinanceConnectionsPage';
import { me } from './api/authClient';

// Session state lives server-side (cookie); on mount we ask GET /api/auth/me
// once to find out whether a valid session already exists (e.g. after a page
// reload) instead of always defaulting to "logged out". `checking === null`
// is the brief window before that first check resolves.
function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    let cancelled = false;
    me()
      .then(() => {
        if (!cancelled) setIsLoggedIn(true);
      })
      .catch(() => {
        if (!cancelled) setIsLoggedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ThemeToggle is device preference, not tied to auth state, so it renders
  // in every branch (design/ui-visual-refresh.md "Theme toggle").
  if (isLoggedIn === null) {
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

  if (isLoggedIn) {
    return (
      <>
        <div className="app-header">
          <ThemeToggle />
          <LogoutButton onLoggedOut={() => setIsLoggedIn(false)} />
        </div>
        <div className="app-main">
          <div className="dashboard">
            <section className="panel">
              <AccountLinkPanel />
            </section>
            <section className="panel">
              <BinanceConnectionsPage />
            </section>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="app-header">
        <ThemeToggle />
      </div>
      <div className="app-main">
        <div className="card">
          {showRegister ? (
            <RegisterForm onRegistered={() => setIsLoggedIn(true)} />
          ) : (
            <LoginForm onLoggedIn={() => setIsLoggedIn(true)} />
          )}
          <Button variant="secondary" onClick={() => setShowRegister((v) => !v)}>
            {showRegister ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}
          </Button>
        </div>
      </div>
    </>
  );
}

export default App;
