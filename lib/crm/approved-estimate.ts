import { db } from "@/lib/db";

/**
 * Works cost (Работы) of a deal's most-recently-APPROVED estimate — the labor
 * subtotal, excluding parts — or null when the deal has no approved estimate.
 * This is the figure surfaced on fulfillment views (e.g. the RepairOrder
 * detail): the RO's own `total` is always 0 for SERVICE orders, since
 * dispatch-fulfillment creates the RO with no financial fields and money lives
 * on the estimate.
 */
export async function getApprovedWorksCost(dealId: string): Promise<number | null> {
  const est = (await db.estimate.findFirst({
    where: { dealId, stage: "APPROVED" },
    orderBy: { approvedAt: "desc" },
    select: { subtotalLabor: true },
  })) as { subtotalLabor: number } | null;
  return est?.subtotalLabor ?? null;
}
