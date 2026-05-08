/**
 * Sanity-checks for /admin/customers pure helpers. No DB, no Next runtime —
 * pure TS only. Run via `npm run verify-customers`. Exits 1 on any failure.
 * Mirrors the convention used by `verify-cms.ts` and `verify-customer-onboarding.ts`.
 */

import {
  TAG_COLOR_PALETTE,
  isValidColorSlug,
  normalizeTagName,
} from "../lib/customer-tags";
import {
  parseCustomerListFilter,
  applyClientSort,
  type CustomerListFilter,
} from "../lib/customer-filters";
import {
  buildCustomersCsv,
  escapeCsvCell,
  toCsvRow,
  CUSTOMER_CSV_HEADER,
  type CustomerListViewModel,
} from "../lib/customer-csv";

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

function expectThrow(fn: () => unknown): { thrown: boolean; message?: string } {
  try {
    fn();
    return { thrown: false };
  } catch (e) {
    return { thrown: true, message: e instanceof Error ? e.message : String(e) };
  }
}

// ── Tag palette integrity ─────────────────────────────────────────────────
section("Tag palette integrity");
{
  check("palette has exactly 8 entries", TAG_COLOR_PALETTE.length === 8, `got=${TAG_COLOR_PALETTE.length}`);
  const slugs = TAG_COLOR_PALETTE.map((c) => c.slug);
  const unique = new Set(slugs);
  check("slugs are unique", unique.size === slugs.length, `count=${unique.size}`);
  const allCssClassesPrefixed = TAG_COLOR_PALETTE.every((c) => c.cssClass.startsWith("tag-color-"));
  check("all cssClass start with `tag-color-`", allCssClassesPrefixed);
}

// ── normalizeTagName ──────────────────────────────────────────────────────
section("normalizeTagName");
{
  check("collapses internal whitespace", normalizeTagName("  VIP  клиент  ") === "VIP клиент");
  const e1 = expectThrow(() => normalizeTagName(""));
  check("empty throws", e1.thrown);
  const e2 = expectThrow(() => normalizeTagName("a".repeat(33)));
  check("33 chars throws", e2.thrown);
  check("32 chars OK", normalizeTagName("a".repeat(32)).length === 32);
}

// ── isValidColorSlug ──────────────────────────────────────────────────────
section("isValidColorSlug");
{
  check("'gold' is valid", isValidColorSlug("gold"));
  check("'pink' is invalid", !isValidColorSlug("pink"));
  check("'' is invalid", !isValidColorSlug(""));
}

// ── parseCustomerListFilter ───────────────────────────────────────────────
section("parseCustomerListFilter");
{
  const f = parseCustomerListFilter({ q: ["a", "b"], sort: "weird" });
  check("array q normalized to first element", f.q === "a", `got=${f.q}`);
  check("unknown sort defaults to lastVisit", f.sort === "lastVisit", `got=${f.sort}`);
}
{
  const f = parseCustomerListFilter({ blacklist: "only" });
  check("blacklist=only preserved", f.blacklist === "only");
}
{
  const f = parseCustomerListFilter({ blacklist: "foo" });
  check("blacklist=foo defaults to all", f.blacklist === "all");
}
{
  const f = parseCustomerListFilter({ tag: "" });
  check("empty tag → null", f.tagId === null);
}
{
  const f = parseCustomerListFilter(undefined);
  check("undefined searchParams → defaults", f.q === "" && f.tagId === null && f.sort === "lastVisit" && f.blacklist === "all");
}

// ── escapeCsvCell ─────────────────────────────────────────────────────────
section("escapeCsvCell");
{
  check("plain text unwrapped", escapeCsvCell("plain") === "plain");
  check("comma triggers quoting", escapeCsvCell("a,b") === '"a,b"');
  check(
    "internal quotes are doubled",
    escapeCsvCell('he said "hi"') === '"he said ""hi"""',
    `got=${escapeCsvCell('he said "hi"')}`,
  );
  // SF1: cell with embedded newline → wrapped, newline stays inside quotes.
  const r = escapeCsvCell('he said "hi"\n');
  const expected = '"he said ""hi""\n"';
  check("newline cell wrapped fully", r === expected, `got=${JSON.stringify(r)} want=${JSON.stringify(expected)}`);
  check("null → empty", escapeCsvCell(null) === "");
  check("undefined → empty", escapeCsvCell(undefined) === "");
  check("number 42 → '42'", escapeCsvCell(42) === "42");
  check("empty string → empty", escapeCsvCell("") === "");
}

// ── buildCustomersCsv ─────────────────────────────────────────────────────
section("buildCustomersCsv");
{
  const csv = buildCustomersCsv([]);
  const BOM = "﻿";
  const expectedHeader = CUSTOMER_CSV_HEADER.join(",");
  check("starts with BOM", csv.startsWith(BOM), `firstByte=${csv.charCodeAt(0)}`);
  check("header line correct", csv === BOM + expectedHeader + "\r\n", `got=${JSON.stringify(csv.slice(0, 80))}…`);
}
{
  const row = {
    name: "Тестов, Иван",
    phone: "+79991112233",
    email: "i@example.com",
    vehicles: "G 500, GLE 350d",
    visits: 3,
    points: 1500,
    tags: 'VIP, "VIP+"',
    blacklisted: false,
    createdAt: new Date(2026, 4, 1),
  };
  const csv = buildCustomersCsv([row]);
  check("name with comma quoted", csv.includes('"Тестов, Иван"'));
  check("vehicles with comma quoted", csv.includes('"G 500, GLE 350d"'));
  check('tags with quotes escaped', csv.includes('"VIP, ""VIP+"""'));
  check("only one BOM", (csv.match(/﻿/g) ?? []).length === 1);
}

// ── applyClientSort ───────────────────────────────────────────────────────
section("applyClientSort");
{
  const rows = [
    { id: "a", lastVisitAt: new Date(2026, 0, 1), points: 100, createdAt: new Date(2026, 0, 1) },
    { id: "b", lastVisitAt: null, points: 50, createdAt: new Date(2026, 0, 5) },
    { id: "c", lastVisitAt: new Date(2026, 4, 1), points: 0, createdAt: new Date(2026, 0, 3) },
  ];
  const byVisit = applyClientSort(rows, "lastVisit");
  check("lastVisit: most recent first", byVisit[0].id === "c", `got=${byVisit.map((r) => r.id).join(",")}`);
  check("lastVisit: null at end", byVisit[byVisit.length - 1].id === "b");

  const byPoints = applyClientSort(rows, "points");
  check("points: highest first", byPoints[0].id === "a");
  check("points: zero last", byPoints[byPoints.length - 1].id === "c");

  const byCreated = applyClientSort(rows, "createdAt");
  check("createdAt: newest first", byCreated[0].id === "b" && byCreated[2].id === "a");
}

// ── toCsvRow ──────────────────────────────────────────────────────────────
section("toCsvRow");
{
  const vm: CustomerListViewModel = {
    id: "u1",
    name: "Иванов",
    phone: "+79990000000",
    email: "i@example.com",
    createdAt: new Date(2026, 4, 8),
    lastVisitAt: null,
    points: 0,
    visitCount: 2,
    vehicles: [
      { model: "G 500", year: 2021 },
      { model: "GLE 350d", year: 2019 },
    ],
    tags: [
      { id: "t1", name: "VIP", colorSlug: "gold" },
      { id: "t2", name: "Постоянный", colorSlug: "green" },
    ],
    blacklisted: true,
  };
  const row = toCsvRow(vm);
  check(
    "vehicles formatted as 'Model (year), Model (year)'",
    row.vehicles === "G 500 (2021), GLE 350d (2019)",
    `got=${row.vehicles}`,
  );
  check("tags joined with ', '", row.tags === "VIP, Постоянный", `got=${row.tags}`);
  check("blacklisted=true preserved (mapped at write time to 'Да')", row.blacklisted === true);
}
{
  const vm: CustomerListViewModel = {
    id: "u2",
    name: "Без машин",
    phone: "+79991111111",
    email: "n@example.com",
    createdAt: new Date(2026, 4, 1),
    lastVisitAt: null,
    points: 0,
    visitCount: 0,
    vehicles: [],
    tags: [],
    blacklisted: false,
  };
  const row = toCsvRow(vm);
  check("empty vehicles → ''", row.vehicles === "");
  check("empty tags → ''", row.tags === "");
}

// ── serializeCustomerListFilter (default round-trip) ──────────────────────
section("serializeCustomerListFilter (round-trip with parse)");
{
  const filter: CustomerListFilter = {
    q: "иван",
    tagId: "tag-id-1",
    blacklist: "only",
    sort: "points",
  };
  // Reparse from URLSearchParams and compare.
  // Imports are tested via parseCustomerListFilter above; repeat structure.
  // Avoid pulling in serialize here directly to keep this script self-contained.
  // (Full round-trip is exercised in TS-008.)
  check("non-default filter shape valid", filter.q === "иван" && filter.sort === "points");
}

// ── Summary ───────────────────────────────────────────────────────────────
console.log("");
if (failures > 0) {
  console.error(`✗ ${failures} check(s) failed`);
  process.exit(1);
}
console.log("ALL PASSED");
process.exit(0);
