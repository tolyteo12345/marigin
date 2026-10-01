import { useId, type InputHTMLAttributes } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

// Shared label+input pair so every form (login/register/account-link) renders
// the same markup/spacing instead of hand-rolling <label><input/></label>.
export function TextField({ label, id, ...inputProps }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="my-3 flex w-full flex-col items-start gap-1 text-left">
      <label htmlFor={inputId} className="text-xs text-[var(--color-text-secondary)]">
        {label}
      </label>
      <input
        id={inputId}
        {...inputProps}
        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text-primary)] focus-visible:border-[var(--color-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]"
      />
    </div>
  );
}
