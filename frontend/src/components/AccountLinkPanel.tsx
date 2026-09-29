import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, linkLocal, me } from '../api/authClient';
import type { MeResponse } from '../api/types';
import { Button, InlineAlert, InlineStatus, TextField } from './common';
import { TelegramLoginButton } from './TelegramLoginButton';

// Shown only while logged in. Fetches GET /api/auth/me and offers the
// appropriate "link" action per BR-002/003/004: link Telegram (reuses
// TelegramLoginButton, server infers purpose=LINK from the session) or add
// a local email+password credential.
export function AccountLinkPanel() {
  const [status, setStatus] = useState<MeResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [linkEmail, setLinkEmail] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [linkLocalError, setLinkLocalError] = useState<string | null>(null);
  const [linkLocalSuccess, setLinkLocalSuccess] = useState(false);

  async function refresh() {
    try {
      const result = await me();
      setStatus(result);
      setLoadError(null);
    } catch {
      setLoadError('Không thể tải trạng thái tài khoản.');
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleLinkLocalSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLinkLocalError(null);
    try {
      await linkLocal(linkEmail, linkPassword);
      setLinkLocalSuccess(true);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setLinkLocalError('Phương thức này đã được liên kết với một tài khoản khác.');
      } else {
        setLinkLocalError('Không thể liên kết, vui lòng thử lại.');
      }
    }
  }

  if (loadError) {
    return <InlineAlert>{loadError}</InlineAlert>;
  }

  if (!status) {
    return <p>Đang tải...</p>;
  }

  return (
    <div>
      <h2>Liên kết tài khoản</h2>
      <ul>
        <li>Email/Password: {status.hasLocalCredential ? 'Đã liên kết' : 'Chưa liên kết'}</li>
        <li>Telegram: {status.hasTelegramIdentity ? 'Đã liên kết' : 'Chưa liên kết'}</li>
      </ul>

      {!status.hasTelegramIdentity && (
        <TelegramLoginButton label="Liên kết Telegram" onClaimed={() => void refresh()} />
      )}

      {!status.hasLocalCredential && (
        <form onSubmit={handleLinkLocalSubmit}>
          <TextField
            label="Email"
            type="email"
            value={linkEmail}
            onChange={(e) => setLinkEmail(e.target.value)}
            required
          />
          <TextField
            label="Password"
            type="password"
            value={linkPassword}
            onChange={(e) => setLinkPassword(e.target.value)}
            minLength={8}
            required
          />
          {linkLocalError && <InlineAlert>{linkLocalError}</InlineAlert>}
          {linkLocalSuccess && <InlineStatus>Đã thêm email + password.</InlineStatus>}
          <Button type="submit">Thêm email + password</Button>
        </form>
      )}
    </div>
  );
}
