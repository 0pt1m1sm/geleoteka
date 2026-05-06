"use client";

import { createLocalStorageStore } from "./local-storage-store";

export interface MyCar {
  model: string;
  generation: string;
  /** Trim id. Optional — older entries lack it; "Не уверен" stores undefined. */
  trim?: string;
}

function validateMyCar(parsed: unknown): MyCar | null {
  if (parsed === null || typeof parsed !== "object") return null;
  const obj = parsed as { model?: unknown; generation?: unknown; trim?: unknown };
  if (typeof obj.model !== "string" || typeof obj.generation !== "string") return null;
  return {
    model: obj.model,
    generation: obj.generation,
    trim: typeof obj.trim === "string" && obj.trim.length > 0 ? obj.trim : undefined,
  };
}

const store = createLocalStorageStore<MyCar | null>(
  "geleoteka:my-car",
  null,
  (parsed) => (parsed === null ? null : validateMyCar(parsed)),
);

export const MY_CAR_KEY = store.KEY;

export function setMyCar(car: MyCar | null): void {
  store.setStore(car);
}
