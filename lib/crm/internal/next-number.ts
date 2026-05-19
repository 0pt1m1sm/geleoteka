import { db } from "@/lib/db";
import type { PrismaClient } from "@/app/generated/prisma/client";

/**
 * Human-readable sequential numbers for Deal / Estimate / RepairOrder.
 * Backed by Postgres sequences (migration 20260519030000_human_numbers)
 * so concurrent creates never collide.
 *
 * Format: `<PREFIX>-NNNN` zero-padded to 4 digits, growing past that
 * width once we cross 9999 of any one type. Year is intentionally NOT
 * encoded — createdAt already tells us when, and per-year sequence
 * resets complicate sorting/parsing later.
 *
 * Each helper accepts an optional Prisma transaction client so the
 * number is allocated inside the same tx as the row insert. Sequences
 * are session-independent in PG, so even if the surrounding tx rolls
 * back the consumed value is gone — that's intentional: numbers are
 * gap-tolerant identifiers, not row counts.
 */

type TxOrDb = PrismaClient | Parameters<Parameters<typeof db.$transaction>[0]>[0];

async function nextSeqValue(seqName: string, client?: TxOrDb): Promise<number> {
  const c = client ?? db;
  const rows = (await c.$queryRawUnsafe(
    `SELECT nextval('"${seqName}"') AS value`,
  )) as Array<{ value: bigint | number }>;
  const v = rows[0]?.value;
  if (v === undefined || v === null) throw new Error(`Sequence ${seqName} returned no value`);
  return typeof v === "bigint" ? Number(v) : v;
}

function format(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

export async function nextDealNumber(client?: TxOrDb): Promise<string> {
  return format("D", await nextSeqValue("Deal_number_seq", client));
}

export async function nextEstimateNumber(client?: TxOrDb): Promise<string> {
  return format("E", await nextSeqValue("Estimate_number_seq", client));
}

export async function nextRepairOrderNumber(client?: TxOrDb): Promise<string> {
  return format("RO", await nextSeqValue("RepairOrder_number_seq", client));
}
