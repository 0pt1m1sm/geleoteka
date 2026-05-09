"use client";

import { useId, useRef } from "react";

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
 * Mobile-safe date field. Renders a button styled like .input that opens
 * the native date picker via showPicker(). Avoids iOS Safari's intrinsic-
 * width quirks where <input type="date"> can overflow its container.
 */
export function DateField({
  label,
  value,
  onChange,
  min,
  required,
}: DateFieldProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  function openPicker(): void {
    const el = inputRef.current;
    if (!el) return;
    const anyEl = el as HTMLInputElement & { showPicker?: () => void };
    if (typeof anyEl.showPicker === "function") {
      try {
        anyEl.showPicker();
        return;
      } catch {
        // fall through to focus-based fallback
      }
    }
    el.focus();
    el.click();
  }

  return (
    <div className="min-w-0 w-full">
      <label htmlFor={id} className="block text-sm font-medium mb-2">
        {label}
      </label>
      <button
        id={id}
        type="button"
        onClick={openPicker}
        className="input w-full text-left flex items-center justify-between gap-2 cursor-pointer"
      >
        <span
          className={value ? "" : "text-[var(--foreground-muted)]"}
          style={{ minWidth: 0, flex: "1 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {value ? formatDisplay(value) : "дд.мм.гггг"}
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
      </button>
      <input
        ref={inputRef}
        type="date"
        required={required}
        min={min}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
          opacity: 0,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
