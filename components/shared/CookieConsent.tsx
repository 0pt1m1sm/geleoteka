"use client";

import { useCallback, useSyncExternalStore } from "react";

const CONSENT_KEY = "cookie-consent";

let listeners: Array<() => void> = [];

function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => { listeners = listeners.filter((l) => l !== cb); };
}

function getSnapshot(): boolean {
  return !localStorage.getItem(CONSENT_KEY);
}

function getServerSnapshot(): boolean {
  return false; // Never show on server
}

export function CookieConsent() {
  const visible = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const accept = useCallback(() => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    listeners.forEach((l) => l());
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 p-4 bg-[var(--card)] border-t border-[var(--border)]">
      <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-sm text-[var(--foreground-muted)]">
          Мы используем файлы cookie для улучшения работы сайта. Продолжая
          пользоваться сайтом, вы соглашаетесь с{" "}
          <span className="text-[var(--foreground)]">
            политикой обработки персональных данных (152-ФЗ)
          </span>
          .
        </p>
        <button
          type="button"
          onClick={accept}
          className="btn btn-primary text-sm shrink-0"
        >
          Принять
        </button>
      </div>
    </div>
  );
}
