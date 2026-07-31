"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

export interface ActionsMenuItem {
  label: string;
  onSelect: () => void;
  /** Renders in the error colour, below a separator — for destructive actions. */
  danger?: boolean;
  disabled?: boolean;
}

/**
 * The "⋯" menu that collects an entity's actions next to its title.
 *
 * Written by hand rather than pulled from Radix: the project only depends on
 * `@radix-ui/react-dialog`, and a menu this small is not worth a second
 * dependency. What it does owe the user is the behaviour they expect from one —
 * closing on outside click and on Escape, and returning focus to the trigger.
 *
 * Destructive items are grouped last, after a separator, so "delete" never sits
 * where the eye expects "edit".
 */
export function ActionsMenu({
  items,
  label = "Действия",
  align = "right",
}: {
  items: ActionsMenuItem[];
  label?: string;
  align?: "left" | "right";
}): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent): void {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const safe = items.filter((i) => !i.disabled);
  if (safe.length === 0) return null;
  const ordinary = safe.filter((i) => !i.danger);
  const dangerous = safe.filter((i) => i.danger);

  function choose(item: ActionsMenuItem): void {
    setOpen(false);
    item.onSelect();
  }

  function renderItem(item: ActionsMenuItem): React.ReactElement {
    return (
      <button
        key={item.label}
        type="button"
        role="menuitem"
        onClick={() => choose(item)}
        className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-[var(--background-secondary)] ${
          item.danger ? "text-[var(--color-error)]" : ""
        }`}
      >
        {item.label}
      </button>
    );
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className="btn btn-secondary px-2 py-2"
      >
        <MoreHorizontal size={16} />
      </button>

      {open ? (
        <div
          role="menu"
          className={`absolute z-50 mt-1 min-w-56 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {ordinary.map(renderItem)}
          {ordinary.length > 0 && dangerous.length > 0 ? (
            <div className="border-t border-[var(--border)]" />
          ) : null}
          {dangerous.map(renderItem)}
        </div>
      ) : null}
    </div>
  );
}
