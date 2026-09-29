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
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <input id={inputId} {...inputProps} />
    </div>
  );
}
