"use client";

import { useSyncExternalStore } from "react";

export interface MyCar {
  model: string;
  generation: string;
  /** Trim id. Optional — older entries lack it; "Не уверен" stores undefined. */
  trim?: string;
}

export const MY_CAR_KEY = "geleoteka:my-car";
const CHANGE_EVENT = "geleoteka:my-car-change";

// Cached snapshot pattern from geleoteka-conventions.md — re-parsing on every
// getSnapshot call would create a new object reference each time and trigger
// infinite re-render loops in React 19 strict mode.
let cachedRaw: string | null = null;
let cachedValue: MyCar | null = null;

function getSnapshot(): MyCar | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(MY_CAR_KEY);
  } catch {
    return null;
  }
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  if (raw === null) {
    cachedValue = null;
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { model?: unknown }).model !== "string" ||
      typeof (parsed as { generation?: unknown }).generation !== "string"
    ) {
      // Self-heal: bad shape => clear and return null
      try {
        localStorage.removeItem(MY_CAR_KEY);
      } catch {}
      cachedRaw = null;
      cachedValue = null;
      return null;
    }
    const obj = parsed as { model: string; generation: string; trim?: unknown };
    cachedValue = {
      model: obj.model,
      generation: obj.generation,
      trim: typeof obj.trim === "string" && obj.trim.length > 0 ? obj.trim : undefined,
    };
    return cachedValue;
  } catch {
    try {
      localStorage.removeItem(MY_CAR_KEY);
    } catch {}
    cachedRaw = null;
    cachedValue = null;
    return null;
  }
}

function getServerSnapshot(): null {
  return null;
}

function subscribe(cb: () => void): () => void {
  const onStorage = (e: StorageEvent): void => {
    if (e.key === MY_CAR_KEY || e.key === null) cb();
  };
  const onChange = (): void => cb();
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function useMyCar(): MyCar | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setMyCar(car: MyCar | null): void {
  try {
    if (car === null) {
      localStorage.removeItem(MY_CAR_KEY);
    } else {
      localStorage.setItem(MY_CAR_KEY, JSON.stringify(car));
    }
  } catch {}
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
