"use client";

import { useSyncExternalStore } from "react";

const KEY = "cookie-consent";
const EVENT = "geleoteka:cookie-consent-change";

let listeners: Array<() => void> = [];

function emit(): void {
  listeners.forEach((l) => l());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENT));
  }
}

function subscribe(cb: () => void): () => void {
  listeners.push(cb);
  if (typeof window !== "undefined") {
    window.addEventListener(EVENT, cb);
    window.addEventListener("storage", cb);
  }
  return () => {
    listeners = listeners.filter((l) => l !== cb);
    if (typeof window !== "undefined") {
      window.removeEventListener(EVENT, cb);
      window.removeEventListener("storage", cb);
    }
  };
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return !window.localStorage.getItem(KEY);
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * Whether the cookie-consent banner is currently visible. Both CookieConsent
 * (renders the banner) and FloatingButtons (offsets above the banner so it
 * doesn't overlap) subscribe to this single source of truth.
 */
export function useCookieConsentVisible(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function acceptCookieConsent(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, "accepted");
  emit();
}
