import { useState, type FormEvent } from 'react';
import { login } from '../api/authClient';
import { Button, InlineAlert, TextField } from './common';
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
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={activeTab === 'password'}
          onClick={() => setActiveTab('password')}
        >
          Email/Password
        </button>
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={activeTab === 'telegram'}
          onClick={() => setActiveTab('telegram')}
        >
          Telegram
        </button>
      </div>

      {activeTab === 'password' && (
        <form onSubmit={handleSubmit}>
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <InlineAlert>{error}</InlineAlert>}
          <Button type="submit" disabled={submitting}>
            Đăng nhập
          </Button>
        </form>
      )}

      {activeTab === 'telegram' && (
        <TelegramLoginButton label="Đăng nhập với Telegram" onClaimed={onLoggedIn} />
      )}
    </div>
  );
}
