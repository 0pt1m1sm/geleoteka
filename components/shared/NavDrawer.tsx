"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface NavDrawerProps {
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
  /** Drawer header content (logo + title). The close button renders automatically. */
  header: ReactNode;
  /** Scrollable nav body — the consumer renders the link list. */
  children: ReactNode;
  /** Optional sticky footer (logout button, theme toggle, CTAs). */
  footer?: ReactNode;
}

/**
 * Slot-based portal mobile drawer. Owns:
 *  - open/close lifecycle (caller controls `open` boolean)
 *  - portal mount on `document.body`
 *  - backdrop click → onClose
 *  - Escape key → onClose (a11y: WAI-ARIA dialog pattern)
 *  - panel chrome (background, borders, shadow, close button)
 *
 * Each consumer composes its own `header`, body (`children`) and `footer`.
 */
export function NavDrawer({ open, onClose, side, header, children, footer }: NavDrawerProps): React.ReactElement | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const sideClasses =
    side === "left" ? "top-0 left-0" : "top-0 right-0";
  const borderSide = side === "left" ? "borderRight" : "borderLeft";

  const overlay = (
    <>
      <div
        className="fixed inset-0 z-50"
        style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`fixed z-[60] h-full w-72 flex flex-col ${sideClasses}`}
        style={{
          backgroundColor: "var(--card)",
          color: "var(--card-foreground)",
          [borderSide]: "1px solid var(--border)",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
        }}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="flex items-center justify-between p-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          {header}
          <button
            type="button"
            onClick={onClose}
            className="p-2"
            style={{ color: "var(--foreground-muted)" }}
            aria-label="Закрыть меню"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">{children}</nav>
        {footer && (
          <div className="p-4 space-y-1" style={{ borderTop: "1px solid var(--border)" }}>
            {footer}
          </div>
        )}
      </div>
    </>
  );

  return createPortal(overlay, document.body);
}
