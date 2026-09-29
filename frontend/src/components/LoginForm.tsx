import { useState, type FormEvent } from 'react';
import { login } from '../api/authClient';
import { TelegramLoginButton } from './TelegramLoginButton';

// Fixed neutral message per BR-010/AC-004: never distinguish "wrong email" vs
// "wrong password" vs "account temporarily locked" — always the same text,
// regardless of what the backend error response actually says.
const NEUTRAL_ERROR_MESSAGE = 'Email hoặc password không đúng.';

interface LoginFormProps {
  onLoggedIn: () => void;
}

type ActiveTab = 'password' | 'telegram';

export function LoginForm({ onLoggedIn }: LoginFormProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      onLoggedIn();
    } catch {
      // Deliberately ignore the actual error content/status — client never
      // reveals whether the email exists or the account is locked.
      setError(NEUTRAL_ERROR_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'password'}
          onClick={() => setActiveTab('password')}
        >
          Email/Password
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'telegram'}
          onClick={() => setActiveTab('telegram')}
        >
          Telegram
        </button>
      </div>

      {activeTab === 'password' && (
        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={submitting}>
            Đăng nhập
          </button>
        </form>
      )}

      {activeTab === 'telegram' && (
        <TelegramLoginButton label="Đăng nhập với Telegram" onClaimed={onLoggedIn} />
      )}
    </div>
  );
}
