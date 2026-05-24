// Host orchestration: translate estimate PART-line edits into WMS reservation
// movements. A PART line "holds" reserved stock equal to its current qty:
//   add → RESERVATION qty, qty edit → RELEASE old + RESERVATION new,
//   delete / estimate decline·supersede·expire → RELEASE qty.
// Reservation events are user-driven (no status-machine re-fire), so each gets
// a unique source id; the lineId is encoded for audit traceability.
import { recordMovement, type DbClientPort } from "@/lib/wms/public";
import { TENANT_KEY, defaultWarehouseId } from "@/lib/wms-host";

// Source id is deterministic per (line, kind) so the WMS idempotency key
// (tenantKey, sourceType, sourceId, reason) makes a repeated add-reserve or
// delete-release a no-op (network retry / double-submit safe). A qty-EDIT must
// issue a fresh hold after releasing the old one, so it passes a `version`
// suffix to dodge the already-consumed base key.
function sourceId(lineId: string, kind: "reserve" | "release", version?: string | number): string {
  return version === undefined ? `${lineId}:${kind}` : `${lineId}:${kind}:${version}`;
}

export async function reserveForLine(
  client: DbClientPort,
  input: { partId: string; qty: number; lineId: string; version?: string | number; actorId?: string },
): Promise<void> {
  if (input.qty <= 0) return;
  await recordMovement(client, {
    item: { itemId: input.partId, warehouseId: await defaultWarehouseId(client) },
    reason: "RESERVATION",
    qty: input.qty,
    source: { type: "EstimateLine", id: sourceId(input.lineId, "reserve", input.version) },
    actorId: input.actorId,
    note: `reserve line ${input.lineId}`,
    tenantKey: TENANT_KEY,
  });
}

export async function releaseForLine(
  client: DbClientPort,
  input: { partId: string; qty: number; lineId: string; version?: string | number; actorId?: string },
): Promise<void> {
  if (input.qty <= 0) return;
  await recordMovement(client, {
    item: { itemId: input.partId, warehouseId: await defaultWarehouseId(client) },
    reason: "RELEASE",
    qty: input.qty,
    source: { type: "EstimateLine", id: sourceId(input.lineId, "release", input.version) },
    actorId: input.actorId,
    note: `release line ${input.lineId}`,
    tenantKey: TENANT_KEY,
  });
}

interface PartLineRow {
  id: string;
  partId: string | null;
  qty: number;
}

async function partLinesOf(client: DbClientPort, estimateId: string): Promise<PartLineRow[]> {
  return (await client.estimateLine.findMany({
    where: { estimateId, type: "PART", partId: { not: null } },
    select: { id: true, partId: true, qty: true },
  })) as PartLineRow[];
}

/**
 * Release every PART-line hold for an estimate. Call ONLY when transitioning
 * out of a state where holds were active (DRAFT/SENT) — releasing an already-
 * released estimate would wrongly reduce the shared reserved counter.
 */
export async function releasePartLinesForEstimate(
  client: DbClientPort,
  estimateId: string,
  actorId?: string,
): Promise<void> {
  for (const line of await partLinesOf(client, estimateId)) {
    if (!line.partId) continue;
    await releaseForLine(client, { partId: line.partId, qty: Math.round(line.qty), lineId: line.id, actorId });
  }
}

/** Reserve every PART-line hold for an estimate (e.g. a freshly cloned DRAFT child). */
export async function reservePartLinesForEstimate(
  client: DbClientPort,
  estimateId: string,
  actorId?: string,
): Promise<void> {
  for (const line of await partLinesOf(client, estimateId)) {
    if (!line.partId) continue;
    await reserveForLine(client, { partId: line.partId, qty: Math.round(line.qty), lineId: line.id, actorId });
  }
}
