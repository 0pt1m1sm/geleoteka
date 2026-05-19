"use client";

/**
 * Imperative toast() — branded transient notifications. Singleton store with
 * listener fan-out so any client component can fire one without context.
 *
 * Usage:
 *   toast.success("Сохранено");
 *   toast.error("Не удалось отправить");
 *   toast.info("Скопировано", { duration: 2000 });
 */

export type ToastVariant = "success" | "error" | "info";

export interface ToastOptions {
  duration?: number;
}

export interface ToastEntry {
  id: number;
  variant: ToastVariant;
  message: string;
  duration: number;
  /** Set true once dismissal is in flight so the host can swap the animation. */
  exiting?: boolean;
}

type Listener = (toasts: ToastEntry[]) => void;

const DEFAULT_DURATION = 3500;
let nextId = 1;
let toasts: ToastEntry[] = [];
const listeners = new Set<Listener>();

function notify(): void {
  for (const l of listeners) l(toasts);
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => listeners.delete(listener);
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

const EXIT_DURATION_MS = 200;

export function dismissToastAnimated(id: number): void {
  // Mark for exit; the host will swap the animation class. Real removal
  // happens after the animation finishes so React doesn't unmount mid-flight.
  toasts = toasts.map((t) => (t.id === id ? { ...t, exiting: true } : t));
  notify();
  if (typeof window !== "undefined") {
    window.setTimeout(() => dismissToast(id), EXIT_DURATION_MS);
  }
}

function push(variant: ToastVariant, message: string, opts: ToastOptions = {}): number {
  if (typeof window === "undefined") return 0;
  const id = nextId++;
  const duration = opts.duration ?? DEFAULT_DURATION;
  toasts = [...toasts, { id, variant, message, duration }];
  notify();
  if (duration > 0) {
    window.setTimeout(() => dismissToastAnimated(id), duration);
  }
  return id;
}

export const toast = {
  success: (message: string, opts?: ToastOptions): number => push("success", message, opts),
  error: (message: string, opts?: ToastOptions): number => push("error", message, opts),
  info: (message: string, opts?: ToastOptions): number => push("info", message, opts),
};
