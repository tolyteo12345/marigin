import type { ReactNode } from 'react';

interface InlineMessageProps {
  children: ReactNode;
}

const baseClassName = 'rounded-lg border-l-4 px-3 py-2 text-sm text-left';

// Exported so TelegramLoginButton (which needs a <div> wrapper, not a <p>, to
// hold multiple child lines + a nested <Button>) can reuse the exact same
// look without duplicating the Tailwind string.
export const alertClassName = `${baseClassName} text-[var(--color-danger)] border-l-[var(--color-danger)] bg-[color-mix(in_srgb,var(--color-danger)_12%,var(--color-surface))]`;
export const statusClassName = `${baseClassName} text-[var(--color-success)] border-l-[var(--color-success)] bg-[color-mix(in_srgb,var(--color-success)_12%,var(--color-surface))]`;

// role="alert" — error/rejection copy. Tests and screen readers key off this role.
export function InlineAlert({ children }: InlineMessageProps) {
  return (
    <p className={alertClassName} role="alert">
      {children}
    </p>
  );
}

// role="status" — non-error progress/success copy (polite live region).
export function InlineStatus({ children }: InlineMessageProps) {
  return (
    <p className={statusClassName} role="status">
      {children}
    </p>
  );
}
