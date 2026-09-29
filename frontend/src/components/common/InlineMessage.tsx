import type { ReactNode } from 'react';

interface InlineMessageProps {
  children: ReactNode;
}

// role="alert" — error/rejection copy. Tests and screen readers key off this role.
export function InlineAlert({ children }: InlineMessageProps) {
  return (
    <p className="inline-message inline-message-alert" role="alert">
      {children}
    </p>
  );
}

// role="status" — non-error progress/success copy (polite live region).
export function InlineStatus({ children }: InlineMessageProps) {
  return (
    <p className="inline-message inline-message-status" role="status">
      {children}
    </p>
  );
}
