/**
 * URL-driven filter parser and pure list helpers for /admin/customers.
 *
 * No DB or Next imports — used by both the server page and the CSV export
 * route as the single source of truth for "what does ?q=…&sort=… mean".
 */

export type BlacklistFilter = "all" | "only" | "hide";
export type CustomerSort = "lastVisit" | "points" | "createdAt";

export interface CustomerListFilter {
  q: string;
  tagId: string | null;
  blacklist: BlacklistFilter;
  sort: CustomerSort;
}

const VALID_BLACKLIST: ReadonlySet<string> = new Set<BlacklistFilter>(["all", "only", "hide"]);
const VALID_SORT: ReadonlySet<string> = new Set<CustomerSort>(["lastVisit", "points", "createdAt"]);

const DEFAULT_FILTER: CustomerListFilter = {
  q: "",
  tagId: null,
  blacklist: "all",
  sort: "lastVisit",
};

function asString(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

/** Parse Next.js searchParams (each value is `string | string[] | undefined`). */
export function parseCustomerListFilter(
  searchParams: { [k: string]: string | string[] | undefined } | undefined | null,
): CustomerListFilter {
  const sp = searchParams ?? {};
  const q = asString(sp.q).trim();

  const rawTag = asString(sp.tag).trim();
  const tagId = rawTag === "" ? null : rawTag;

  const rawBlacklist = asString(sp.blacklist);
  const blacklist: BlacklistFilter = VALID_BLACKLIST.has(rawBlacklist)
    ? (rawBlacklist as BlacklistFilter)
    : DEFAULT_FILTER.blacklist;

  const rawSort = asString(sp.sort);
  const sort: CustomerSort = VALID_SORT.has(rawSort)
    ? (rawSort as CustomerSort)
    : DEFAULT_FILTER.sort;

  return { q, tagId, blacklist, sort };
}

/** Serialize a filter back to URLSearchParams. Defaults are omitted. */
export function serializeCustomerListFilter(filter: CustomerListFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.q !== DEFAULT_FILTER.q) params.set("q", filter.q);
  if (filter.tagId !== null) params.set("tag", filter.tagId);
  if (filter.blacklist !== DEFAULT_FILTER.blacklist) params.set("blacklist", filter.blacklist);
  if (filter.sort !== DEFAULT_FILTER.sort) params.set("sort", filter.sort);
  return params;
}

interface SortableRow {
  lastVisitAt: Date | null;
  points: number;
  createdAt: Date;
}

/**
 * Stable sort by selected column. Pre-fixes:
 *  - `lastVisit` desc, with null going to the end
 *  - `points` desc (0 stays mixed since it's a real value, but the plan/test
 *    expects rows with positive points before zero-point rows — so we sort
 *    desc and let zeros land last naturally)
 *  - `createdAt` desc
 */
export function applyClientSort<T extends SortableRow>(rows: T[], sort: CustomerSort): T[] {
  const copy = rows.slice();
  if (sort === "lastVisit") {
    copy.sort((a, b) => {
      const aTime = a.lastVisitAt?.getTime() ?? null;
      const bTime = b.lastVisitAt?.getTime() ?? null;
      if (aTime === null && bTime === null) return 0;
      if (aTime === null) return 1;
      if (bTime === null) return -1;
      return bTime - aTime;
    });
    return copy;
  }
  if (sort === "points") {
    copy.sort((a, b) => b.points - a.points);
    return copy;
  }
  copy.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return copy;
}

interface SearchableRow {
  name: string;
  phone: string;
  email: string;
}

/** Case-insensitive `contains` against name + phone + email. Empty `q` = no-op. */
export function applyTextFilter<T extends SearchableRow>(rows: T[], q: string): T[] {
  const trimmed = q.trim();
  if (trimmed === "") return rows;
  const needle = trimmed.toLocaleLowerCase("ru");
  return rows.filter((row) => {
    if (row.name.toLocaleLowerCase("ru").includes(needle)) return true;
    if (row.phone.toLocaleLowerCase("ru").includes(needle)) return true;
    if (row.email.toLocaleLowerCase("ru").includes(needle)) return true;
    return false;
  });
}
