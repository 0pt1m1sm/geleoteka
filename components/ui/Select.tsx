import { forwardRef, type SelectHTMLAttributes, type ReactNode } from "react";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
  label?: string;
  helperText?: string;
  children: ReactNode;
}

/** Native <select> styled per design system. Server-friendly (no JS dropdown). */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { error, label, helperText, id, className = "", children, ...rest },
  ref,
) {
  const reactId = id ?? rest.name;
  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={reactId} className="text-sm font-medium">
          {label}
        </label>
      ) : null}
      <select
        ref={ref}
        id={reactId}
        className={`input ${className}`.trim()}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${reactId}-error` : helperText ? `${reactId}-help` : undefined}
        {...rest}
      >
        {children}
      </select>
      {error ? (
        <p id={`${reactId}-error`} className="text-xs text-[var(--color-error)]" role="alert">
          {error}
        </p>
      ) : helperText ? (
        <p id={`${reactId}-help`} className="text-xs text-[var(--foreground-muted)]">
          {helperText}
        </p>
      ) : null}
    </div>
  );
});
