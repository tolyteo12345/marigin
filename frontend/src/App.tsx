import { useState } from 'react';
import { AccountLinkPanel } from './components/AccountLinkPanel';
import { LoginForm } from './components/LoginForm';
import { LogoutButton } from './components/LogoutButton';
import { RegisterForm } from './components/RegisterForm';

// Minimal shell wiring the auth components together. Session state itself
// lives server-side (cookie); this local boolean only drives which screen
// to render and is reset on logout/login events raised by the components.
function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  if (isLoggedIn) {
    return (
      <div>
        <LogoutButton onLoggedOut={() => setIsLoggedIn(false)} />
        <AccountLinkPanel />
      </div>
    );
  }

  return (
    <div>
      {showRegister ? (
        <RegisterForm onRegistered={() => setIsLoggedIn(true)} />
      ) : (
        <LoginForm onLoggedIn={() => setIsLoggedIn(true)} />
      )}
      <button type="button" onClick={() => setShowRegister((v) => !v)}>
        {showRegister ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}
      </button>
    </div>
  );
}

export default App;
