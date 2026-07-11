/**
 * Public types of the WMS core. The core knows a stockable item ONLY as a
 * `WmsItemRef` (an opaque `itemId`) and a movement's provenance ONLY as an
 * opaque `MovementSource` ({ type, id } strings). It attaches no meaning to
 * either — that is what makes the module extractable. See
 * docs/design/2026-05-22-wms-module-seam.md.
 */

/** The only shape the core knows about a stockable item. `itemId` is opaque:
 *  it is StockItem.partId in the auto-service host today, a SKU id elsewhere.
 *  `warehouseId` (Phase 6) is the opaque physical-site key the host injects; a
 *  stock row is identified by (itemId, warehouseId). */
export interface WmsItemRef {
  itemId: string;
  warehouseId: string;
}

export type MovementReason =
  | "RECEIPT" // inbound on-hand
  | "RECEIPT_REVERSAL" // сторно — undo of an erroneous receipt (−on-hand, reserved untouched)
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
  /** Client-supplied idempotency key (retry safety); independent of the source triple. */
  idempotencyKey?: string;
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

// ── Multi-bin placement layer ──────────────────────────────────────────────
// StockBin records WHERE an item's on-hand sits. The aggregate StockItem stays
// authoritative; placement ops move stock between unplaced↔bin↔bin and never
// change quantity/reserved. Invariant: Σ bins ≤ quantity.

/** A single location holding some of an item's on-hand. */
export interface BinPlacement {
  location: string;
  quantity: number;
}

/** An item's placement breakdown. `unplaced = max(0, quantity − placed)`.
 *  `reconcileNeeded` is true when placed exceeds on-hand (Phase-1 drift: an
 *  aggregate CONSUMPTION lowered on-hand without deducting bins). */
export interface ItemPlacement {
  itemId: string;
  quantity: number;
  placed: number;
  unplaced: number;
  reconcileNeeded: boolean;
  bins: BinPlacement[];
}

/** Common audit fields for a placement op. */
interface PlacementMeta {
  itemId: string;
  /** Physical-site key (Phase 6); host injects the default warehouse. */
  warehouseId: string;
  qty: number;
  actorId?: string;
  note?: string;
  /** Client-supplied idempotency key (retry safety). */
  idempotencyKey?: string;
  tenantKey?: string;
}

export interface PlaceStockInput extends PlacementMeta {
  location: string;
}

export interface TransferStockInput extends PlacementMeta {
  from: string;
  to: string;
}

export interface RemoveFromBinInput extends PlacementMeta {
  location: string;
}

/** Bin-aware outbound consumption. Records a CONSUMPTION movement (aggregate)
 *  then deducts bins so Σbins tracks on-hand. `fromLocation` picks from one
 *  explicit bin (scan-to-pick); omitting it auto-drains unplaced-first then
 *  oldest bins (server-side fulfillment). */
export interface ConsumeStockInput {
  item: WmsItemRef;
  qty: number;
  source: MovementSource;
  actorId?: string;
  note?: string;
  idempotencyKey?: string;
  tenantKey?: string;
  /** When set, consume from this exact bin (rejects INSUFFICIENT_BIN if short). */
  fromLocation?: string;
}

/** What an item occupies a given location with (itemId is the external partId). */
export interface ItemInLocation {
  itemId: string;
  quantity: number;
}
