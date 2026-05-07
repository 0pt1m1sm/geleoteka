import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Inline label — wraps input in <label>. Use `aria-label` instead for icon-only checkboxes. */
  label?: ReactNode;
  description?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, id, className = "", ...rest },
  ref,
) {
  const reactId = id ?? rest.name;
  const input = (
    <input ref={ref} id={reactId} type="checkbox" className={className} {...rest} />
  );
  if (!label && !description) return input;
  return (
    <label htmlFor={reactId} className="flex items-start gap-2 cursor-pointer select-none">
      {input}
      <span className="flex flex-col gap-0.5">
        {label ? <span className="text-sm">{label}</span> : null}
        {description ? <span className="text-xs text-[var(--foreground-muted)]">{description}</span> : null}
      </span>
    </label>
  );
});
