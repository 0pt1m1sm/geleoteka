import { cache } from "react";
import { db } from "@/lib/db";

interface CMSContent {
  text?: string;
  value?: string;
}

/**
 * Loads ALL CMSBlock rows once per request (React cache dedupes across server
 * components within the same request) and returns a Map<key, string>. Each
 * block's content is `{ text: "..." }` or `{ value: "..." }` per the seed
 * convention; we coalesce both shapes to a single string.
 */
const loadAllCMS = cache(async (): Promise<Map<string, string>> => {
  const rows = (await db.cMSBlock.findMany({
    select: { key: true, content: true },
  })) as Array<{ key: string; content: CMSContent | null }>;
  const map = new Map<string, string>();
  for (const row of rows) {
    const c = row.content ?? {};
    const v = c.text ?? c.value;
    if (typeof v === "string") map.set(row.key, v);
  }
  return map;
});

/** Read one CMS block. Falls back to the supplied default if the key is missing. */
export async function getCMS(key: string, fallback = ""): Promise<string> {
  const map = await loadAllCMS();
  return map.get(key) ?? fallback;
}

/** Read multiple CMS blocks at once. Same per-request cache. */
export async function getCMSMany(
  keys: readonly string[],
  fallbacks: Partial<Record<string, string>> = {},
): Promise<Record<string, string>> {
  const map = await loadAllCMS();
  const out: Record<string, string> = {};
  for (const key of keys) {
    out[key] = map.get(key) ?? fallbacks[key] ?? "";
  }
  return out;
}
