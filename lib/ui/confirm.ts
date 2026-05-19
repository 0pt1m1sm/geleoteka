"use client";

/**
 * Imperative confirm() replacement — same call-shape as native window.confirm,
 * but Promise-based and rendered via the branded Dialog primitive (focus trap,
 * Esc-to-close, themed). Works from event handlers without React context drilling.
 *
 * Usage:
 *   if (!(await confirm({ message: "Удалить запись?" }))) return;
 *   if (!(await confirm({ title: "...", message: "...", danger: true }))) return;
 */

export interface ConfirmOptions {
  title?: string;
  message: string;
  /** Confirm button label. Default "Подтвердить". */
  confirmText?: string;
  /** Cancel button label. Default "Отмена". */
  cancelText?: string;
  /** Use destructive (red) styling on confirm button. */
  danger?: boolean;
}

export interface ConfirmRequest extends ConfirmOptions {
  resolve: (result: boolean) => void;
}

type Listener = (req: ConfirmRequest | null) => void;

let current: ConfirmRequest | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  for (const l of listeners) l(current);
}

export function subscribeConfirm(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => listeners.delete(listener);
}

export function confirm(options: ConfirmOptions): Promise<boolean> {
  // SSR / no host mounted → fall back to native confirm so legacy paths
  // never silently no-op.
  if (typeof window === "undefined" || listeners.size === 0) {
    if (typeof window === "undefined") return Promise.resolve(false);
    return Promise.resolve(window.confirm(options.message));
  }
  // Reject any in-flight prompt — only one confirm at a time.
  if (current) {
    current.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    current = { ...options, resolve };
    notify();
  });
}

export function resolveConfirm(result: boolean): void {
  if (!current) return;
  const req = current;
  current = null;
  notify();
  req.resolve(result);
}
