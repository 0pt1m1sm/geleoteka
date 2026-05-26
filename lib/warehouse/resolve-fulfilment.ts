import type { DbClientPort } from "@/lib/wms/public";

export interface FulfilmentTarget {
  kind: "pick" | "pack";
  id: string;
}

/**
 * Resolve a scanned/typed order code to a fulfilment target for the unified
 * worker screen: a PartShipment (its `orderNumber` PO-NNNN, or cuid id) routes
 * to PACK; a RepairOrder (its `roNumber`, or cuid id) routes to PICK. The two id
 * spaces don't overlap in practice (PO-NNNN vs roNumber vs distinct cuids);
 * PartShipment is tried first. Returns null when neither matches.
 */
export async function resolveFulfilmentTarget(
  client: DbClientPort,
  code: string,
): Promise<FulfilmentTarget | null> {
  const c = (code ?? "").trim();
  if (!c) return null;

  const shipment = (await client.partShipment.findFirst({
    where: { OR: [{ orderNumber: c }, { id: c }] },
    select: { id: true },
  })) as { id: string } | null;
  if (shipment) return { kind: "pack", id: shipment.id };

  const ro = (await client.repairOrder.findFirst({
    where: { OR: [{ roNumber: c }, { id: c }] },
    select: { id: true },
  })) as { id: string } | null;
  if (ro) return { kind: "pick", id: ro.id };

  return null;
}
