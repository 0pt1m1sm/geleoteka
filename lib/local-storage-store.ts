"use client";

import { useSyncExternalStore } from "react";

/**
 * Factory for a localStorage-backed React 19 store.
 *
 * Solves the cached-snapshot problem mandated by `geleoteka-conventions.md`:
 * `useSyncExternalStore` requires `getSnapshot` to return the SAME reference
 * when the underlying value hasn't changed, otherwise React 19 strict mode
 * triggers infinite re-renders.
 *
 * Each call to `createLocalStorageStore` creates an independent closure with
 * its own cache — calling the factory twice with different keys keeps the
 * caches isolated.
 *
 * Cross-tab updates fire a `storage` event; same-tab updates fire a custom
 * `geleoteka:store-change:<key>` event. Both are subscribed.
 *
 * **Validator contract:**
 *   `(parsed: unknown) => { ok: T } | null`
 *
 * Returning `{ ok: <value> }` provides the validated value (which may itself
 * be `null` if `T` includes null — no ambiguity). Returning `null` from the
 * validator is the self-heal sentinel: helper removes the bad entry and
 * returns `initial`. The factory's `result == null` check (note `==` not
 * `===`) defends against a buggy validator returning `undefined`.
 */

export interface LocalStorageStore<T> {
  /** React 19-safe subscribe hook. */
  useStore: () => T;
  /** Imperative setter — updates cache + localStorage + dispatches change. */
  setStore: (value: T) => void;
  /** Read current value without subscribing (for event handlers/actions). */
  getStore: () => T;
  /** Storage key, exposed for one-shot reads (e.g. router.replace from MyCarInit). */
  KEY: string;
}

export function createLocalStorageStore<T>(
  key: string,
  initial: T,
  validator?: (parsed: unknown) => { ok: T } | null,
): LocalStorageStore<T> {
  const eventName = `geleoteka:store-change:${key}`;
  let cachedRaw: string | null | undefined = undefined; // undefined = not yet read
  let cachedValue: T = initial;

  function readFromStorage(): T {
    if (typeof window === "undefined") return initial;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      return initial;
    }
    if (raw === cachedRaw) return cachedValue;
    cachedRaw = raw;
    if (raw === null) {
      cachedValue = initial;
      return cachedValue;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (validator) {
        const result = validator(parsed);
        // == null catches both null and a buggy-undefined return.
        if (result == null) {
          // Self-heal: bad shape → clear and return initial.
          try {
            localStorage.removeItem(key);
          } catch {}
          cachedRaw = null;
          cachedValue = initial;
          return cachedValue;
        }
        cachedValue = result.ok;
      } else {
        cachedValue = parsed as T;
      }
      return cachedValue;
    } catch {
      try {
        localStorage.removeItem(key);
      } catch {}
      cachedRaw = null;
      cachedValue = initial;
      return cachedValue;
    }
  }

  function getServerSnapshot(): T {
    return initial;
  }

  function subscribe(cb: () => void): () => void {
    // Subscribers attach directly to window events: `storage` for cross-tab
    // updates, `eventName` for same-tab updates dispatched by setStore.
    // No internal listeners array — same-tab dispatch goes through window.
    const onStorage = (e: StorageEvent): void => {
      if (e.key === key || e.key === null) cb();
    };
    const onChange = (): void => cb();
    window.addEventListener("storage", onStorage);
    window.addEventListener(eventName, onChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(eventName, onChange);
    };
  }

  function setStore(value: T): void {
    const raw = JSON.stringify(value);
    // Update cache BEFORE write so any synchronous getStore() call sees the
    // new value even if localStorage write fails.
    cachedRaw = raw;
    cachedValue = value;
    try {
      localStorage.setItem(key, raw);
    } catch {}
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(eventName));
    }
  }

  function getStore(): T {
    return readFromStorage();
  }

  function useStore(): T {
    return useSyncExternalStore(subscribe, readFromStorage, getServerSnapshot);
  }

  return { useStore, setStore, getStore, KEY: key };
}
