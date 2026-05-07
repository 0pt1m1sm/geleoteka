"use client";

import { useId, type ReactNode } from "react";

export interface RadioOption<V extends string> {
  value: V;
  label: ReactNode;
  description?: string;
  disabled?: boolean;
}

export interface RadioGroupProps<V extends string> {
  name: string;
  value: V;
  onValueChange: (value: V) => void;
  options: RadioOption<V>[];
  /** Visible legend for the group. Required for a11y unless `aria-label` is supplied. */
  legend?: string;
  ariaLabel?: string;
  className?: string;
}

/** Accessible radio group. Native radio inputs handle keyboard arrow navigation natively. */
export function RadioGroup<V extends string>({
  name,
  value,
  onValueChange,
  options,
  legend,
  ariaLabel,
  className = "",
}: RadioGroupProps<V>): React.ReactElement {
  const groupId = useId();
  return (
    <fieldset
      className={`flex flex-col gap-2 ${className}`.trim()}
      aria-label={legend ? undefined : ariaLabel}
    >
      {legend ? <legend className="text-sm font-medium mb-1">{legend}</legend> : null}
      {options.map((opt) => {
        const id = `${groupId}-${opt.value}`;
        const isChecked = opt.value === value;
        return (
          <label
            key={opt.value}
            htmlFor={id}
            className={`flex items-start gap-2 px-3 py-2 rounded-[var(--radius-lg)] border border-[var(--border)] cursor-pointer transition-colors hover:bg-[var(--card-hover)] ${
              isChecked ? "border-[var(--color-accent)] bg-[var(--card-hover)]" : ""
            } ${opt.disabled ? "opacity-50 pointer-events-none" : ""}`.trim()}
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={opt.value}
              checked={isChecked}
              disabled={opt.disabled}
              onChange={() => onValueChange(opt.value)}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm">{opt.label}</span>
              {opt.description ? (
                <span className="text-xs text-[var(--foreground-muted)]">{opt.description}</span>
              ) : null}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
