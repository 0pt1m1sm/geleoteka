/**
 * Public types of the WMS core. The core knows a stockable item ONLY as a
 * `WmsItemRef` (an opaque `itemId`) and a movement's provenance ONLY as an
 * opaque `MovementSource` ({ type, id } strings). It attaches no meaning to
 * either — that is what makes the module extractable. See
 * docs/design/2026-05-22-wms-module-seam.md.
 */

/** The only shape the core knows about a stockable item. `itemId` is opaque:
 *  it is StockItem.partId in the auto-service host today, a SKU id elsewhere. */
export interface WmsItemRef {
  itemId: string;
}

export type MovementReason =
  | "RECEIPT" // inbound on-hand
  | "CONSUMPTION" // outbound on-hand (also releases the matching hold)
  | "ADJUSTMENT" // manual correction; the ONLY reason allowed a null source / signed qty
  | "RESERVATION" // raise reserved, leave on-hand
  | "RELEASE"; // lower reserved, leave on-hand

/** Opaque provenance. The core stores type+id verbatim and uses
 *  (tenantKey, type, id, reason) as the idempotency key. `id` may be null
 *  ONLY when reason === "ADJUSTMENT". */
export interface MovementSource {
  type: string;
  id: string | null;
}

export interface RecordMovementInput {
  item: WmsItemRef;
  reason: MovementReason;
  /** Magnitude (> 0) for all reasons except ADJUSTMENT, where it is the signed delta. */
  qty: number;
  source: MovementSource;
  actorId?: string;
  note?: string;
  /** Tenant discriminator. Optional; the host adapter supplies it. */
  tenantKey?: string;
}

export interface MovementResult {
  /** false when the call was an idempotent no-op (duplicate source triple). */
  applied: boolean;
  itemId: string;
  quantity: number;
  reserved: number;
  available: number;
}

export interface StockItemView {
  itemId: string;
  barcode: string | null;
  quantity: number;
  reserved: number;
  available: number;
}
