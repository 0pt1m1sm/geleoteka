"use client";

import { useId } from "react";

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  required?: boolean;
}

function formatDisplay(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}.${m}.${y}`;
}

/**
 * Mobile-safe date field. The visible surface is a styled <div>; the real
 * <input type="date"> is absolutely positioned over it at opacity 0 so
 * native taps reach the input and iOS opens its picker. Absolute position
 * takes the input out of normal flow, so its intrinsic widget width can't
 * overflow the container.
 */
export function DateField({
  label,
  value,
  onChange,
  min,
  required,
}: DateFieldProps): React.ReactElement {
  const id = useId();
  const display = value ? formatDisplay(value) : "дд.мм.гггг";

  return (
    <div className="min-w-0 w-full">
      <label htmlFor={id} className="block text-sm font-medium mb-2">
        {label}
      </label>
      <div className="relative w-full min-w-0">
        <div className="input w-full flex items-center justify-between gap-2 cursor-pointer pointer-events-none">
          <span
            className={value ? "" : "text-[var(--foreground-muted)]"}
            style={{ minWidth: 0, flex: "1 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {display}
          </span>
          <svg
            aria-hidden
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-[var(--color-accent)]"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
        </div>
        <input
          id={id}
          type="date"
          required={required}
          min={min}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="date-overlay-input absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          style={{ WebkitAppearance: "none", appearance: "none" }}
        />
      </div>
    </div>
  );
}
