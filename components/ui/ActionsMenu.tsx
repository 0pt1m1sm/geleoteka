"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
 * The dropdown renders through a portal into <body>. Rendered in place it hung
 * over the NEXT list card, whose stretched link sat above it in a sibling
 * stacking context — taps on menu items opened that card instead. No z-index
 * fixes that across sibling contexts; leaving the card's subtree does.
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
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // The menu lives in a portal, so it is NOT inside the trigger's subtree —
    // the outside-click check must consult both refs, or pressing a menu item
    // would count as "outside" and close the menu before its click ever fires.
    function onPointerDown(e: MouseEvent): void {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    // Fixed positioning is a viewport snapshot: any scroll (capture catches
    // inner containers too) or resize would leave the menu floating detached
    // from its trigger, so both simply close it.
    function onScrollOrResize(): void {
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  const safe = items.filter((i) => !i.disabled);
  if (safe.length === 0) return null;
  const ordinary = safe.filter((i) => !i.danger);
  const dangerous = safe.filter((i) => i.danger);

  function toggle(): void {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos(
      align === "right"
        ? { top: rect.bottom + 4, right: window.innerWidth - rect.right }
        : { top: rect.bottom + 4, left: rect.left },
    );
    setOpen(true);
  }

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
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className="btn btn-secondary px-2 py-2"
      >
        <MoreHorizontal size={16} />
      </button>

      {open && pos
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{ top: pos.top, left: pos.left, right: pos.right }}
              className="fixed z-50 min-w-56 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] shadow-lg"
            >
              {ordinary.map(renderItem)}
              {ordinary.length > 0 && dangerous.length > 0 ? (
                <div className="border-t border-[var(--border)]" />
              ) : null}
              {dangerous.map(renderItem)}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
