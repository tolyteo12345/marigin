import { useState } from 'react';
import { AccountLinkPanel } from './components/AccountLinkPanel';
import { Button } from './components/common';
import { LoginForm } from './components/LoginForm';
import { LogoutButton } from './components/LogoutButton';
import { RegisterForm } from './components/RegisterForm';
import { ThemeToggle } from './theme/ThemeToggle';

// Minimal shell wiring the auth components together. Session state itself
// lives server-side (cookie); this local boolean only drives which screen
// to render and is reset on logout/login events raised by the components.
function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  // ThemeToggle is device preference, not tied to auth state, so it renders
  // in both the logged-in and logged-out shells (design/ui-visual-refresh.md
  // "Theme toggle"). .app-header/.app-main/.card structure per "Layout /
  // composition" (rev 2) — one card per branch, not nested.
  if (isLoggedIn) {
    return (
      <>
        <div className="app-header">
          <ThemeToggle />
          <LogoutButton onLoggedOut={() => setIsLoggedIn(false)} />
        </div>
        <div className="app-main">
          <div className="card">
            <AccountLinkPanel />
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
