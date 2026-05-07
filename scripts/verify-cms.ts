/**
 * Sanity-checks for the CMS schema registry and validator. Pure TS — no DB
 * connection, no Prisma. Run via `npm run verify-cms`. Exits 1 on any failure.
 *
 * Intentionally NOT a unit test framework (`jest`/`vitest` aren't installed
 * in this project). Mirrors the existing `scripts/verify-vehicle-catalog.ts`
 * convention.
 */

import { CMS_SCHEMA, GROUP_ORDER, allKeysInDisplayOrder } from "../lib/cms-schema";
import { validateCMSContent } from "../lib/cms-validate";

let failures = 0;

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string): void {
  console.log(`\n━━ ${title} ━━`);
}

// ── Schema integrity ────────────────────────────────────────────────────
section("Schema integrity");

const keys = Object.keys(CMS_SCHEMA);
check("at least 50 keys defined", keys.length >= 50, `actual=${keys.length}`);

const seen = new Set<string>();
let dupes = 0;
for (const k of keys) {
  if (seen.has(k)) dupes += 1;
  seen.add(k);
}
check("no duplicate keys", dupes === 0, `dupes=${dupes}`);

for (const k of keys) {
  const def = (CMS_SCHEMA as Record<string, { type: string; group: string; label: string; defaultValue: unknown; fields?: unknown }>)[k];
  check(`${k}: has label`, typeof def.label === "string" && def.label.length > 0);
  check(`${k}: has group`, typeof def.group === "string" && def.group.length > 0);
  if (def.type === "list") {
    check(
      `${k}: list has fields[]`,
      Array.isArray(def.fields) && (def.fields as unknown[]).length > 0,
    );
    check(
      `${k}: list defaultValue is array`,
      Array.isArray(def.defaultValue),
    );
  } else if (def.type === "text" || def.type === "richtext") {
    check(`${k}: defaultValue is string`, typeof def.defaultValue === "string");
  } else {
    check(`${k}: type is one of text|richtext|list`, false, `type=${def.type}`);
  }
}

const allKeys = allKeysInDisplayOrder();
check(
  "allKeysInDisplayOrder covers every key",
  allKeys.length === keys.length,
  `displayOrder=${allKeys.length} totalKeys=${keys.length}`,
);
check(
  "GROUP_ORDER is non-empty",
  GROUP_ORDER.length > 0,
  `len=${GROUP_ORDER.length}`,
);

// ── Validator: positive cases ────────────────────────────────────────────
section("Validator: positive cases");

{
  const r = validateCMSContent("home.hero.left.title", { value: "Test" });
  check("text accepts { value: string }", r.ok && r.type === "text");
}
{
  const r = validateCMSContent("home.hero.left.lede", { markdown: "Hello **world**" });
  check("richtext accepts { markdown: string }", r.ok && r.type === "richtext");
}
{
  const r = validateCMSContent("home.faq.items", {
    items: [
      { question: "Q1", answer: "A1" },
      { question: "Q2", answer: "A2" },
    ],
  });
  check("list accepts well-shaped items", r.ok && r.type === "list");
}
{
  const r = validateCMSContent("home.faq.items", { items: [] });
  check("list accepts empty array", r.ok && r.type === "list");
}

// ── Validator: negative cases ────────────────────────────────────────────
section("Validator: negative cases");

{
  const r = validateCMSContent("nonexistent.key", { value: "x" });
  check("rejects unknown key", !r.ok && r.error === "Unknown key");
}
{
  const r = validateCMSContent("home.hero.left.title", null);
  check("rejects null content", !r.ok);
}
{
  const r = validateCMSContent("home.hero.left.title", "raw string");
  check("rejects primitive content", !r.ok);
}
{
  const r = validateCMSContent("home.hero.left.title", { wrong: "field" });
  check("text: rejects wrong field name", !r.ok);
}
{
  const r = validateCMSContent("home.hero.left.title", { value: 123 });
  check("text: rejects non-string value", !r.ok);
}
{
  const r = validateCMSContent("home.hero.left.lede", { value: "wrong slot" });
  check("richtext: rejects { value: ... } (expects markdown)", !r.ok);
}
{
  const r = validateCMSContent("home.faq.items", { items: "not-an-array" });
  check("list: rejects non-array items", !r.ok);
}
{
  const r = validateCMSContent("home.faq.items", {
    items: [{ question: "Q", answer: "A", extra: "key" }],
  });
  check("list: rejects extra keys (length mismatch)", !r.ok);
}
{
  const r = validateCMSContent("home.faq.items", { items: [{ question: "Q" }] });
  check("list: rejects missing fields", !r.ok);
}
{
  const r = validateCMSContent("home.faq.items", {
    items: [{ question: "Q", answer: 123 }],
  });
  check("list: rejects non-string field value", !r.ok);
}

// ── Defaults round-trip through validator ────────────────────────────────
section("Defaults round-trip through validator");

for (const k of keys) {
  const def = CMS_SCHEMA[k as keyof typeof CMS_SCHEMA];
  let payload: Record<string, unknown>;
  if (def.type === "text") payload = { value: def.defaultValue };
  else if (def.type === "richtext") payload = { markdown: def.defaultValue };
  else payload = { items: def.defaultValue };
  const r = validateCMSContent(k, payload);
  if (!r.ok) {
    check(`default for ${k} validates`, false, r.error);
  }
}
check("all defaults validate", true);

// ── Result ───────────────────────────────────────────────────────────────
console.log(`\nSummary: ${failures === 0 ? "ALL PASSED" : `${failures} FAILURE(S)`}`);
process.exit(failures > 0 ? 1 : 0);
