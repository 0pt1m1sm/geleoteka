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
export { WmsError } from "./errors";
export type {
  WmsItemRef,
  MovementReason,
  MovementSource,
  RecordMovementInput,
  MovementResult,
  StockItemView,
} from "./types";
export type { DbClientPort } from "../internal/repository";
