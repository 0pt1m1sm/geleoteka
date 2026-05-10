import { db } from "@/lib/db";

interface DealLineRow {
  type: string;
  total: number;
}

/**
 * Recompute Deal money fields from its DealLine[] sums.
 *
 * Source of truth: DealLine.total. Deal.total = sum of all lines
 * (including DISCOUNT, which is negative, and FEE). Channel-specific
 * subtotals partition LABOR / PART / RENTAL_DAY for reporting.
 *
 * Internal helper — callers are CRM actions (addDealLine, removeDealLine,
 * etc.). Other modules talk to CRM through public actions, never this.
 */
export async function recomputeDealTotals(dealId: string): Promise<void> {
  const lines = (await db.dealLine.findMany({
    where: { dealId },
    select: { type: true, total: true },
  })) as DealLineRow[];

  let subtotalLabor = 0;
  let subtotalParts = 0;
  let subtotalRental = 0;
  let discount = 0;
  let total = 0;

  for (const l of lines) {
    total += l.total;
    switch (l.type) {
      case "LABOR":
        subtotalLabor += l.total;
        break;
      case "PART":
        subtotalParts += l.total;
        break;
      case "RENTAL_DAY":
        subtotalRental += l.total;
        break;
      case "DISCOUNT":
        discount += l.total;
        break;
      // FEE contributes to total only.
    }
  }

  await db.deal.update({
    where: { id: dealId },
    data: { subtotalLabor, subtotalParts, subtotalRental, discount, total },
  });
}
