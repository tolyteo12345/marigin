import { useEffect, useRef, useState } from 'react';
import { ApiError, telegramStart, telegramStatus } from '../api/authClient';
import type { TelegramLoginRequestStatus } from '../api/types';
import { alertClassName, Button, InlineStatus, statusClassName } from './common';

const POLL_INTERVAL_MS = 2000;

interface TelegramLoginButtonProps {
  // Customizable label: "Đăng nhập với Telegram" (login) vs "Liên kết Telegram" (link).
  label: string;
  // Called once status becomes CLAIMED, so the parent decides navigation/refresh.
  onClaimed: () => void;
  // Test-only override for the poll interval so tests don't wait 2s per cycle.
  // Defaults to the real ~2s cadence from architecture/user-authentication.md.
  pollIntervalMs?: number;
  // Full-width when used as a primary action inside LoginPage's narrow .card
  // (matches the password form's full-width submit); auto-width when used
  // inline inside AccountLinkPanel's wider panel (default).
  fullWidth?: boolean;
}

type LocalPhase = 'idle' | 'starting' | 'waiting' | 'claimed' | 'rejected' | 'expired' | 'error';

// Button that drives the Telegram bot deep-link login/link flow:
// POST /telegram/start -> open deepLinkUrl in a new tab -> poll GET /telegram/status/:code
// every ~2s -> react to PENDING / CONFIRMED->CLAIMED / REJECTED / EXPIRED.
export function TelegramLoginButton({
  label,
  onClaimed,
  pollIntervalMs = POLL_INTERVAL_MS,
  fullWidth = false,
}: TelegramLoginButtonProps) {
  const [phase, setPhase] = useState<LocalPhase>('idle');
  const [deepLinkUrl, setDeepLinkUrl] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTimers() {
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (countdownTimerRef.current !== null) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }

  useEffect(() => clearTimers, []);

  function applyStatus(status: TelegramLoginRequestStatus, reason?: string) {
    if (status === 'PENDING') {
      setPhase('waiting');
      return;
    }
    clearTimers();
    if (status === 'CLAIMED') {
      setPhase('claimed');
      onClaimed();
      return;
    }
    if (status === 'REJECTED') {
      setPhase('rejected');
      setRejectReason(reason ?? 'Phương thức này đã được liên kết với một tài khoản khác.');
      return;
    }
    // EXPIRED (or unrecognized -> treat as expired per server contract)
    setPhase('expired');
  }

  async function pollOnce(activeCode: string) {
    try {
      const result = await telegramStatus(activeCode);
      applyStatus(result.status, result.reason);
    } catch {
      // Network/API error while polling: stop and surface a generic error state.
      clearTimers();
      setPhase('error');
    }
  }

  async function handleStart() {
    setPhase('starting');
    setRejectReason(null);
    try {
      const result = await telegramStart();
      setCode(result.code);
      setDeepLinkUrl(result.deepLinkUrl);
      setPhase('waiting');

      window.open(result.deepLinkUrl, '_blank', 'noopener,noreferrer');

      pollTimerRef.current = setInterval(() => {
        void pollOnce(result.code);
      }, pollIntervalMs);

      const expiresAtMs = new Date(result.expiresAt).getTime();
      const tickCountdown = () => {
        const remaining = Math.max(0, Math.round((expiresAtMs - Date.now()) / 1000));
        setSecondsLeft(remaining);
        if (remaining <= 0) {
          clearTimers();
          setPhase((current) => (current === 'waiting' ? 'expired' : current));
        }
      };
      tickCountdown();
      countdownTimerRef.current = setInterval(tickCountdown, 1000);
    } catch (err) {
      setPhase('error');
      if (err instanceof ApiError) {
        setRejectReason(err.message);
      }
    }
  }

  function handleRetry() {
    setCode(null);
    setDeepLinkUrl(null);
    setRejectReason(null);
    setPhase('idle');
    void handleStart();
  }

  if (phase === 'idle' || phase === 'starting') {
    return (
      <Button onClick={() => void handleStart()} disabled={phase === 'starting'} className={fullWidth ? 'w-full' : undefined}>
        {label}
      </Button>
    );
  }

  if (phase === 'waiting') {
    return (
      <div className={`${statusClassName} flex flex-col gap-1`} role="status">
        <p>Đang chờ xác nhận trên Telegram...</p>
        <p>Còn lại: {secondsLeft}s</p>
        {deepLinkUrl && code && <p>Nếu tab không tự mở, bấm lại nút để thử lại.</p>}
      </div>
    );
  }

  if (phase === 'claimed') {
    return <InlineStatus>Đã xác nhận, đang chuyển hướng...</InlineStatus>;
  }

  if (phase === 'rejected') {
    return (
      <div className={`${alertClassName} flex flex-col items-start gap-2`} role="alert">
        <p>{rejectReason}</p>
        <Button variant="secondary" onClick={handleRetry}>
          Tạo mã mới
        </Button>
      </div>
    );
  }

  if (phase === 'expired') {
    return (
      <div className="flex flex-col items-start gap-2">
        <p>Mã đã hết hạn.</p>
        <Button variant="secondary" onClick={handleRetry}>
          Tạo mã mới
        </Button>
      </div>
    );
  }

  // phase === 'error'
  return (
    <div className={`${alertClassName} flex flex-col items-start gap-2`} role="alert">
      <p>Không thể kết nối tới máy chủ, vui lòng thử lại.</p>
      <Button variant="secondary" onClick={handleRetry}>
        Thử lại
      </Button>
    </div>
  );
}
