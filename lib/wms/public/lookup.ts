import type { StockItemView } from "./types";
import { findViewByCode, findViewByItemId, type DbClientPort } from "../internal/repository";

const DEFAULT_TENANT = "default";

/**
 * Resolve a scanned code to a stock view. The core resolves barcode/gtin only —
 * `article` is host catalog identity, so the host route supplies an article
 * fallback resolver (see Task 12). Returns null when no item matches.
 */
export async function lookupByCode(
  client: DbClientPort,
  code: string,
  warehouseId: string,
  tenantKey?: string,
): Promise<StockItemView | null> {
  return findViewByCode(client, code, tenantKey ?? DEFAULT_TENANT, warehouseId);
}

/** Resolve a stock view by external itemId (= partId today) in a warehouse. */
export async function lookupByItemId(
  client: DbClientPort,
  itemId: string,
  warehouseId: string,
): Promise<StockItemView | null> {
  return findViewByItemId(client, itemId, warehouseId);
}
