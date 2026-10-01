import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
}

const baseClassName =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const variantClassName = {
  primary: 'bg-[var(--color-accent)] text-[var(--color-bg)] not-disabled:hover:bg-[var(--color-accent-hover)]',
  secondary:
    'bg-transparent text-[var(--color-text-primary)] border border-[var(--color-border)] not-disabled:hover:bg-[var(--color-border)]/50',
};

// Shared button so every action (submit, logout, retry, tab...) shares the
// same visual treatment instead of an unstyled native <button>.
export function Button({ variant = 'primary', type = 'button', className, ...rest }: ButtonProps) {
  const classes = [baseClassName, variantClassName[variant], className].filter(Boolean).join(' ');
  return <button type={type} className={classes} {...rest} />;
}
