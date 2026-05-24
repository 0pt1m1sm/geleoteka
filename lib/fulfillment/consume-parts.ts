// Host orchestration: translate a fulfillment close into stock CONSUMPTION
// movements. Bridges CRM (the deal's APPROVED estimate PART lines) and the WMS
// core (recordMovement). NOT part of lib/wms — it knows about Estimate/Deal.
import { consumeStock, type DbClientPort } from "@/lib/wms/public";
import { TENANT_KEY, defaultWarehouseId } from "@/lib/wms-host";

interface ConsumeInput {
  /** The deal whose APPROVED estimate names the consumed parts. */
  dealId: string;
  /** Opaque source type stored on each movement (e.g. "RepairOrder", "PartShipment"). */
  sourceType: string;
  /** Source id base — the movement source id is `${sourceId}:${estimateLineId}`. */
  sourceId: string;
  actorId?: string;
}

/**
 * Consume the parts named on the deal's APPROVED estimate (canonical source).
 * One CONSUMPTION movement per PART line with a partId, keyed idempotently by
 * `${sourceId}:${lineId}` so a re-close is a no-op. If the deal has no APPROVED
 * estimate (e.g. a retail order whose estimate stays DRAFT — those consume at
 * sale time instead), this is a safe no-op.
 *
 * Runs inside the caller's `$transaction` (pass the tx as `client`).
 */
export async function consumeApprovedEstimateParts(
  client: DbClientPort,
  input: ConsumeInput,
): Promise<void> {
  const estimate = (await client.estimate.findFirst({
    where: { dealId: input.dealId, stage: "APPROVED" },
    orderBy: { approvedAt: "desc" },
    select: {
      estimateLines: {
        where: { type: "PART", partId: { not: null } },
        select: { id: true, partId: true, qty: true },
      },
    },
  })) as { estimateLines: Array<{ id: string; partId: string | null; qty: number }> } | null;
  if (!estimate) return;

  const warehouseId = await defaultWarehouseId(client);
  for (const line of estimate.estimateLines) {
    if (!line.partId) continue;
    const qty = Math.round(line.qty);
    if (qty <= 0) continue;
    // consumeStock = CONSUMPTION movement + bin deduction (unplaced-first, then
    // oldest bins) so Σbins tracks on-hand. Runs in the caller's tx (composed).
    await consumeStock(client, {
      item: { itemId: line.partId, warehouseId },
      qty,
      source: { type: input.sourceType, id: `${input.sourceId}:${line.id}` },
      actorId: input.actorId,
      tenantKey: TENANT_KEY,
    });
  }
}
