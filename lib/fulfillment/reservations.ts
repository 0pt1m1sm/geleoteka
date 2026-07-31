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
 * How much hold each line still owns, straight from the movement ledger.
 *
 * A line's reserved counter is the sum of the `reservedDelta`s of every
 * movement that names it: `+qty` when reserved, `−qty` when released, and
 * `−qty` again when CONSUMPTION turns the hold into a physical removal. Both
 * id shapes point back to the same line — reservations key it as a prefix
 * (`<lineId>:reserve`), consumption as a suffix (`<sourceId>:<lineId>`, see
 * lib/fulfillment/consume-parts.ts) — so both are collected here.
 *
 * Asking the ledger, rather than trusting the line's current qty, is what
 * makes the release below safe to call from any state: a line whose parts are
 * already on the car sums to zero and gets nothing back.
 */
async function outstandingHolds(
  client: DbClientPort,
  lineIds: string[],
): Promise<Map<string, number>> {
  const holds = new Map<string, number>(lineIds.map((id) => [id, 0]));
  if (lineIds.length === 0) return holds;

  const rows = (await client.stockMovement.findMany({
    where: {
      tenantKey: TENANT_KEY,
      OR: [
        ...lineIds.map((id) => ({ sourceId: { startsWith: `${id}:` } })),
        ...lineIds.map((id) => ({ sourceId: { endsWith: `:${id}` } })),
      ],
    },
    select: { sourceId: true, reservedDelta: true },
  })) as Array<{ sourceId: string | null; reservedDelta: number }>;

  for (const row of rows) {
    const sid = row.sourceId;
    if (!sid) continue;
    const owner = lineIds.find((id) => sid.startsWith(`${id}:`) || sid.endsWith(`:${id}`));
    if (owner) holds.set(owner, (holds.get(owner) ?? 0) + row.reservedDelta);
  }
  return holds;
}

/**
 * Give back whatever hold this estimate's PART lines still own.
 *
 * A hold ends exactly once — either here (the estimate is declined, superseded,
 * expired or deleted) or as CONSUMPTION when the job closes, which decrements
 * `reserved` as the parts physically leave. Parts already fitted to the car or
 * shipped therefore have nothing to give back.
 *
 * Releasing them anyway does not show up as a negative counter — recordMovement
 * clamps at zero — which is exactly what makes it dangerous. `reserved` is a
 * single number per stock item, shared by every estimate holding that part, so
 * an unwarranted release silently eats somebody else's live hold: delete a deal
 * whose parts were already fitted and another customer's reserved parts become
 * available to promise again. Verified in scripts/verify-reservation-release.ts.
 *
 * So the amount comes from the ledger, not from the line: a draft estimate's
 * untouched parts return in full, consumed ones return nothing, and a line
 * whose qty was edited returns exactly what is still held. That also makes this
 * idempotent — the second call finds zero outstanding and writes no movement.
 */
export async function releasePartLinesForEstimate(
  client: DbClientPort,
  estimateId: string,
  actorId?: string,
): Promise<void> {
  const lines = (await partLinesOf(client, estimateId)).filter((l) => l.partId);
  const holds = await outstandingHolds(client, lines.map((l) => l.id));

  for (const line of lines) {
    // Never more than the line itself holds: the cap keeps a stray inbound
    // reservation on the same id from being refunded through this estimate.
    const qty = Math.min(Math.round(line.qty), holds.get(line.id) ?? 0);
    if (qty <= 0) continue;
    await releaseForLine(client, { partId: line.partId as string, qty, lineId: line.id, actorId });
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
