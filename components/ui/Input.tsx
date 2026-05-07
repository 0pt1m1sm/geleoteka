import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Validation error message — renders in `.alert-error` styling under the field. */
  error?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  /** Label text — visually adjacent above the input; if absent, caller must supply aria-label. */
  label?: string;
  /** Free-form helper text below the field. Hidden when `error` is shown. */
  helperText?: string;
}

/** Input — wraps native `<input>` with label/error/helperText slots. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { error, leftIcon, rightIcon, label, helperText, id, className = "", ...rest },
  ref,
) {
  const reactId = id ?? rest.name;
  const inputClasses = [
    "input",
    leftIcon ? "pl-10" : "",
    rightIcon ? "pr-10" : "",
    className,
  ].filter(Boolean).join(" ");
  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={reactId} className="text-sm font-medium">
          {label}
        </label>
      ) : null}
      <div className="relative">
        {leftIcon ? (
          <span aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)] pointer-events-none">
            {leftIcon}
          </span>
        ) : null}
        <input
          ref={ref}
          id={reactId}
          className={inputClasses}
          data-error={error ? "true" : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${reactId}-error` : helperText ? `${reactId}-help` : undefined}
          {...rest}
        />
        {rightIcon ? (
          <span aria-hidden className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)] pointer-events-none">
            {rightIcon}
          </span>
        ) : null}
      </div>
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
