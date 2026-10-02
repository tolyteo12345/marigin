import { useId, type SelectHTMLAttributes } from 'react';

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: { value: string; label: string }[];
}

// New in capital-provenance-ledger (design/capital-provenance-ledger.md
// "Common component mapping"): the first feature needing a dropdown (choose
// fundingSource, asset, or a funding Borrow Position) — mirrors TextField's
// label+id pattern rather than inventing a different shape.
export function SelectField({ label, id, options, ...selectProps }: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className="my-3 flex w-full flex-col items-start gap-1 text-left">
      <label htmlFor={selectId} className="text-xs text-[var(--color-text-secondary)]">
        {label}
      </label>
      <select
        id={selectId}
        {...selectProps}
        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text-primary)] focus-visible:border-[var(--color-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
