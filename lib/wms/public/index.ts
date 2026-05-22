/**
 * Public surface of the WMS core — the ONLY entry point host code may import.
 * The core has zero imports of host/CRM/Deal/Estimate code; the host injects a
 * Prisma client per call and translates its lifecycle events into the opaque
 * `MovementSource`. See docs/design/2026-05-22-wms-module-seam.md and
 * lib/wms/README.md (extraction checklist).
 */
export { recordMovement } from "./record-movement";
export { availableStock } from "./stock";
export { lookupByCode, lookupByItemId } from "./lookup";
export { placeStock, transferStock, removeFromBin, binsForItem, itemsInLocation } from "./placement";
export { WmsError } from "./errors";
export type { WmsErrorCode } from "./errors";
export type {
  WmsItemRef,
  MovementReason,
  MovementSource,
  RecordMovementInput,
  MovementResult,
  StockItemView,
  BinPlacement,
  ItemPlacement,
  ItemInLocation,
  PlaceStockInput,
  TransferStockInput,
  RemoveFromBinInput,
} from "./types";
export type { DbClientPort } from "../internal/repository";
