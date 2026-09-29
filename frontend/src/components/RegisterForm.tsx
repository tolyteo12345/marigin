import { useState, type FormEvent } from 'react';
import { ApiError, register } from '../api/authClient';
import { Button, InlineAlert, TextField } from './common';

interface RegisterFormProps {
  onRegistered: () => void;
}

// Client-side length check is UX only (immediate feedback) — the backend is
// the actual enforcement point for BR-015 (min 8 chars, NIST 800-63B).
const MIN_PASSWORD_LENGTH = 8;

export function RegisterForm({ onRegistered }: RegisterFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(email, password);
      onRegistered();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('Email đã được sử dụng.');
      } else {
        setError('Không thể đăng ký, vui lòng thử lại.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
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
        minLength={MIN_PASSWORD_LENGTH}
        required
      />
      <p>Password tối thiểu {MIN_PASSWORD_LENGTH} ký tự.</p>
      {error && <InlineAlert>{error}</InlineAlert>}
      <Button type="submit" disabled={submitting}>
        Đăng ký
      </Button>
    </form>
  );
}
