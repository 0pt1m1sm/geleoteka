import { cache } from "react";
import { db } from "@/lib/db";
import {
  CMS_SCHEMA,
  type CMSKey,
  type CMSValue,
  type CMSBlockType,
} from "@/lib/cms-schema";

interface CMSContentLegacy {
  text?: string;
  value?: string;
  markdown?: string;
  items?: unknown;
  url?: string;
}

interface CMSRow {
  type: CMSBlockType;
  content: CMSContentLegacy;
}

/**
 * Loads ALL CMSBlock rows once per request (React cache dedupes across server
 * components within the same request) and returns a Map<key, { type, content }>.
 * Both legacy `{ text }` and current `{ value }` shapes are preserved in the
 * stored content; readers below pull whichever field is appropriate.
 */
const loadAllCMS = cache(async (): Promise<Map<string, CMSRow>> => {
  const rows = (await db.cMSBlock.findMany({
    select: { key: true, type: true, content: true },
  })) as Array<{ key: string; type: string; content: CMSContentLegacy | null }>;
  const map = new Map<string, CMSRow>();
  for (const row of rows) {
    const t = (row.type ?? "text") as CMSBlockType;
    map.set(row.key, { type: t, content: row.content ?? {} });
  }
  return map;
});

// ─────────────────────────────────────────────────────────────────────────
// Legacy string-only API (kept for the existing call-sites in
// app/(public)/page.tsx, contacts/page.tsx, layout.tsx, parts/[slug],
// rentals/[id]). Reads the `text` or `value` field, falling back to caller's
// fallback or schema default.
// ─────────────────────────────────────────────────────────────────────────

function defaultStringFor(key: string, fallback: string): string {
  if (key in CMS_SCHEMA) {
    const def = CMS_SCHEMA[key as CMSKey];
    if (def.type === "text" || def.type === "richtext") return def.defaultValue;
  }
  return fallback;
}

function rowToString(row: CMSRow | undefined): string | null {
  if (!row) return null;
  const c = row.content;
  if (typeof c.value === "string") return c.value;
  if (typeof c.text === "string") return c.text;
  if (typeof c.markdown === "string") return c.markdown;
  return null;
}

/** Read one CMS block as a string. Falls back to caller's fallback or schema default. */
export async function getCMS(key: string, fallback = ""): Promise<string> {
  const map = await loadAllCMS();
  const v = rowToString(map.get(key));
  return v ?? defaultStringFor(key, fallback);
}

/** Read multiple CMS blocks as strings. Same per-request cache. */
export async function getCMSMany(
  keys: readonly string[],
  fallbacks: Partial<Record<string, string>> = {},
): Promise<Record<string, string>> {
  const map = await loadAllCMS();
  const out: Record<string, string> = {};
  for (const key of keys) {
    const v = rowToString(map.get(key));
    out[key] = v ?? defaultStringFor(key, fallbacks[key] ?? "");
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Typed API — schema-driven. Use for new call-sites.
// ─────────────────────────────────────────────────────────────────────────

function isArrayValue(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

/** Read a `text` key. TS error if `K` is not a text key. */
export async function getCMSText<
  K extends CMSKey & {
    [P in CMSKey]: (typeof CMS_SCHEMA)[P] extends { type: "text" } ? P : never;
  }[CMSKey],
>(key: K): Promise<string> {
  const map = await loadAllCMS();
  const v = rowToString(map.get(key));
  return v ?? (CMS_SCHEMA[key].defaultValue as string);
}

/** Read a `richtext` (markdown) key. TS error if `K` is not richtext. */
export async function getCMSRichtext<
  K extends CMSKey & {
    [P in CMSKey]: (typeof CMS_SCHEMA)[P] extends { type: "richtext" } ? P : never;
  }[CMSKey],
>(key: K): Promise<string> {
  const map = await loadAllCMS();
  const row = map.get(key);
  if (row && typeof row.content.markdown === "string") return row.content.markdown;
  // Defensive fallback to legacy `text` / `value` field (e.g. if a richtext
  // key was previously stored as plain text). Reader keeps working either way.
  const legacy = rowToString(row);
  if (legacy) return legacy;
  return CMS_SCHEMA[key].defaultValue as string;
}

/** Read a `list` key as an array of typed-row objects. TS error if not list. */
export async function getCMSList<
  K extends CMSKey & {
    [P in CMSKey]: (typeof CMS_SCHEMA)[P] extends { type: "list" } ? P : never;
  }[CMSKey],
>(key: K): Promise<Array<Record<string, string>>> {
  const map = await loadAllCMS();
  const row = map.get(key);
  if (row && isArrayValue(row.content.items)) {
    return row.content.items as Array<Record<string, string>>;
  }
  return CMS_SCHEMA[key].defaultValue as Array<Record<string, string>>;
}

/** Read an `image` key as a URL string. TS error if not image. */
export async function getCMSImage<
  K extends CMSKey & {
    [P in CMSKey]: (typeof CMS_SCHEMA)[P] extends { type: "image" } ? P : never;
  }[CMSKey],
>(key: K): Promise<string> {
  const map = await loadAllCMS();
  const row = map.get(key);
  if (row && typeof row.content.url === "string" && row.content.url.length > 0) {
    return row.content.url;
  }
  return CMS_SCHEMA[key].defaultValue as string;
}

/** Discriminated reader — picks the right shape based on the key's schema type. */
export async function getCMSTyped<K extends CMSKey>(key: K): Promise<CMSValue<K>> {
  const def = CMS_SCHEMA[key];
  if (def.type === "text") {
    return (await getCMSText(key as never)) as CMSValue<K>;
  }
  if (def.type === "richtext") {
    return (await getCMSRichtext(key as never)) as CMSValue<K>;
  }
  if (def.type === "image") {
    return (await getCMSImage(key as never)) as CMSValue<K>;
  }
  return (await getCMSList(key as never)) as CMSValue<K>;
}
