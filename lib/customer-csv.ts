/**
 * CSV serialization for /admin/customers export.
 *
 * Pure module: only depends on `formatDate` from `lib/utils.ts` (Intl wrapper,
 * itself pure). Output is Excel-friendly: BOM-prefixed UTF-8, CRLF line
 * endings, double-quote escaping per RFC 4180.
 */

import { formatDate } from "@/lib/utils";

const BOM = "﻿";
const EOL = "\r\n";

export const CUSTOMER_CSV_HEADER: readonly string[] = [
  "Имя",
  "Телефон",
  "Email",
  "Авто",
  "Визиты",
  "Баллы",
  "Тэги",
  "ЧС",
  "Дата создания",
] as const;

/**
 * View-model passed by the list page / export route to the CSV layer.
 * Mirrors the shape produced by `loadCustomersForList` in customer-queries.ts.
 */
export interface CustomerListViewModel {
  id: string;
  name: string;
  phone: string;
  email: string;
  lastVisitAt: Date | null;
  points: number;
  visitCount: number;
  createdAt: Date;
  vehicles: { model: string; year: number }[];
  tags: { id: string; name: string; colorSlug: string }[];
  blacklisted: boolean;
}

/** Cell shape after view-model → row mapping. */
export interface CustomerCsvRow {
  name: string;
  phone: string;
  email: string;
  vehicles: string;
  visits: number;
  points: number;
  tags: string;
  blacklisted: boolean;
  createdAt: Date;
}

/**
 * RFC 4180 quoting. null/undefined → empty cell. Numbers stringified.
 * Cells containing `,`, `"`, `\n`, or `\r` are wrapped in double quotes;
 * internal `"` are doubled. Newlines are preserved INSIDE the quoted cell.
 */
export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "string" ? value : String(value);
  if (str === "") return "";
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Map a list view-model to a flat CSV row. Pure; no I/O. */
export function toCsvRow(vm: CustomerListViewModel): CustomerCsvRow {
  return {
    name: vm.name,
    phone: vm.phone,
    email: vm.email,
    vehicles: vm.vehicles.map((v) => `${v.model} (${v.year})`).join(", "),
    visits: vm.visitCount,
    points: vm.points,
    tags: vm.tags.map((t) => t.name).join(", "),
    blacklisted: vm.blacklisted,
    createdAt: vm.createdAt,
  };
}

function formatRowDate(d: Date): string {
  return formatDate(d, { dateStyle: "short" });
}

/** Build the full CSV string. Always prefixes with BOM. */
export function buildCustomersCsv(rows: CustomerCsvRow[]): string {
  const lines: string[] = [];
  lines.push(CUSTOMER_CSV_HEADER.map((c) => escapeCsvCell(c)).join(","));
  for (const row of rows) {
    lines.push(
      [
        escapeCsvCell(row.name),
        escapeCsvCell(row.phone),
        escapeCsvCell(row.email),
        escapeCsvCell(row.vehicles),
        escapeCsvCell(row.visits),
        escapeCsvCell(row.points),
        escapeCsvCell(row.tags),
        escapeCsvCell(row.blacklisted ? "Да" : ""),
        escapeCsvCell(formatRowDate(row.createdAt)),
      ].join(","),
    );
  }
  return BOM + lines.join(EOL) + EOL;
}
