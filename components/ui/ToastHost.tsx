"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import {
  dismissToast,
  dismissToastAnimated,
  subscribeToasts,
  type ToastEntry,
  type ToastVariant,
} from "@/lib/ui/toast";

const VARIANT_STYLE: Record<ToastVariant, { bg: string; border: string; icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }> }> = {
  success: {
    bg: "bg-[var(--color-success-bg,rgba(34,197,94,0.12))]",
    border: "border-[var(--color-success,#22c55e)]",
    icon: CheckCircle2,
  },
  error: {
    bg: "bg-[var(--color-error-bg)]",
    border: "border-[var(--color-error)]",
    icon: AlertCircle,
  },
  info: {
    bg: "bg-[var(--background-secondary)]",
    border: "border-[var(--border)]",
    icon: Info,
  },
};

/** Mounted once at root. Stacks toasts top-right, auto-dismisses. */
export function ToastHost(): React.ReactElement {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none max-w-[calc(100vw-2rem)] sm:max-w-sm"
    >
      {toasts.map((t) => {
        const cfg = VARIANT_STYLE[t.variant];
        const Icon = cfg.icon;
        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto rounded-[var(--radius-lg)] border ${cfg.border} ${cfg.bg} px-3 py-2.5 flex items-start gap-2.5 shadow-lg will-change-transform ${
              t.exiting ? "animate-toast-out" : "animate-toast-in"
            }`}
          >
            <Icon size={16} aria-hidden className="shrink-0 mt-0.5" />
            <p className="flex-1 text-sm">{t.message}</p>
            <button
              type="button"
              onClick={() => (t.exiting ? dismissToast(t.id) : dismissToastAnimated(t.id))}
              className="btn-icon shrink-0 -my-1 -mr-1"
              aria-label="Закрыть"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
