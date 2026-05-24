/**
 * Public surface of the WMS core — the ONLY entry point host code may import.
 * The core has zero imports of host/CRM/Deal/Estimate code; the host injects a
 * Prisma client per call and translates its lifecycle events into the opaque
 * `MovementSource`. See docs/design/2026-05-22-wms-module-seam.md and
 * lib/wms/README.md (extraction checklist).
 */
export { recordMovement } from "./record-movement";
export { consumeStock } from "./consumption";
export { availableStock } from "./stock";
export { lookupByCode, lookupByItemId } from "./lookup";
export { placeStock, transferStock, removeFromBin, binsForItem, itemsInLocation } from "./placement";
export { parseScanCode, formatScanCode } from "./qr";
export type { ScanObjectType, ParsedScanCode } from "./qr";
export { assertLocationUsable, getLocation, listLocations, setLocationBlocked } from "./locations";
export type { WmsLocation } from "./locations";
export { recordScanEvent } from "./scan";
export type { ScanEventInput, ScanResult } from "./scan";
export {
  createCountSession,
  recordCount,
  recordUnknownScan,
  finalizeSession,
  postCountSession,
  reopenSession,
  cancelSession,
  getCountSession,
  listCountSessions,
  sessionVariance,
} from "./stocktake";
export type {
  StockCountScope,
  StockCountStatus,
  StockCountClassification,
  CountLine,
  CountSession,
  CreateCountSessionInput,
  PostResult,
  PartVariance,
} from "./stocktake";
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
  ConsumeStockInput,
} from "./types";
export type { DbClientPort } from "../internal/repository";
