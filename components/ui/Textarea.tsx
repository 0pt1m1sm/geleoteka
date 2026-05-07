import { forwardRef, type TextareaHTMLAttributes } from "react";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
  label?: string;
  helperText?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { error, label, helperText, id, className = "", rows = 4, ...rest },
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
      <textarea
        ref={ref}
        id={reactId}
        rows={rows}
        className={`input ${className}`.trim()}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${reactId}-error` : helperText ? `${reactId}-help` : undefined}
        {...rest}
      />
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
