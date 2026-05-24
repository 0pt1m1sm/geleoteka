/**
 * CSV serialization for the WMS movement-ledger export (Phase 6).
 *
 * Pure module mirroring lib/customer-csv.ts: BOM-prefixed UTF-8, CRLF line
 * endings, RFC-4180 double-quote escaping. No I/O — the route maps StockMovement
 * rows to MovementCsvRow and resolves actor names before calling buildMovementsCsv.
 */
import { formatDateTime } from "@/lib/utils";

const BOM = "﻿";
const EOL = "\r\n";

/** Reason → Russian label (kept in sync with WarehouseMovementsFeed). */
export const MOVEMENT_REASON_LABELS: Record<string, string> = {
  RECEIPT: "Приёмка",
  CONSUMPTION: "Расход",
  ADJUSTMENT: "Корректировка",
  RESERVATION: "Резерв",
  RELEASE: "Снятие резерва",
};

export const MOVEMENT_CSV_HEADER: readonly string[] = [
  "Дата",
  "Запчасть",
  "Артикул",
  "Причина",
  "Остаток Δ",
  "Резерв Δ",
  "Источник",
  "ID источника",
  "Заметка",
  "Кто",
] as const;

export interface MovementCsvRow {
  createdAt: Date;
  partName: string;
  article: string;
  reason: string;
  quantityDelta: number;
  reservedDelta: number;
  sourceType: string;
  sourceId: string | null;
  note: string | null;
  actor: string;
}

/** RFC 4180 quoting (identical rules to lib/customer-csv.escapeCsvCell). */
export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "string" ? value : String(value);
  if (str === "") return "";
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

/** Build the full CSV string. Always BOM-prefixed; reason mapped to its label. */
export function buildMovementsCsv(rows: MovementCsvRow[]): string {
  const lines: string[] = [];
  lines.push(MOVEMENT_CSV_HEADER.map((c) => escapeCsvCell(c)).join(","));
  for (const r of rows) {
    lines.push(
      [
        escapeCsvCell(formatDateTime(r.createdAt)),
        escapeCsvCell(r.partName),
        escapeCsvCell(r.article),
        escapeCsvCell(MOVEMENT_REASON_LABELS[r.reason] ?? r.reason),
        escapeCsvCell(r.quantityDelta),
        escapeCsvCell(r.reservedDelta),
        escapeCsvCell(r.sourceType),
        escapeCsvCell(r.sourceId),
        escapeCsvCell(r.note),
        escapeCsvCell(r.actor),
      ].join(","),
    );
  }
  return BOM + lines.join(EOL) + EOL;
}
