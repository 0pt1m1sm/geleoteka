import { WmsError } from "./errors";
import {
  findLocation,
  ensureLocation,
  listLocationRows,
  updateLocationFlags,
  type DbClientPort,
  type StockLocationRow,
} from "../internal/repository";

const DEFAULT_TENANT = "default";

/** Locations are matched case-insensitively; normalize to upper/trimmed. */
function normalizeLocation(code: string): string {
  return code.trim().toUpperCase();
}

export type WmsLocation = StockLocationRow;

/**
 * Assert a location may receive stock (putaway / transfer-in). A never-seen
 * location is auto-created active+unblocked and passes. A registry row that is
 * inactive or blocked throws LOCATION_BLOCKED. Removing FROM / transferring OUT
 * of a location does NOT call this (a blocked bin must still be evacuable).
 */
export async function assertLocationUsable(
  client: DbClientPort,
  code: string,
  warehouseId: string,
  tenantKey?: string,
): Promise<void> {
  const tenant = tenantKey ?? DEFAULT_TENANT;
  const loc = normalizeLocation(code);
  const existing = await findLocation(client, loc, tenant, warehouseId);
  if (!existing) {
    await ensureLocation(client, loc, tenant, warehouseId);
    return;
  }
  if (!existing.isActive || existing.isBlocked) throw WmsError.locationBlocked();
}

/** Read a single location's registry row (null when never seen). */
export async function getLocation(
  client: DbClientPort,
  code: string,
  warehouseId: string,
  tenantKey?: string,
): Promise<WmsLocation | null> {
  return findLocation(client, normalizeLocation(code), tenantKey ?? DEFAULT_TENANT, warehouseId);
}

/** List all known locations for the tenant + warehouse. */
export async function listLocations(
  client: DbClientPort,
  warehouseId: string,
  tenantKey?: string,
): Promise<WmsLocation[]> {
  return listLocationRows(client, tenantKey ?? DEFAULT_TENANT, warehouseId);
}

/** Set a location's active/blocked flags (create-if-absent). */
export async function setLocationBlocked(
  client: DbClientPort,
  code: string,
  warehouseId: string,
  tenantKey: string | undefined,
  flags: { isActive?: boolean; isBlocked?: boolean },
): Promise<WmsLocation> {
  return updateLocationFlags(client, normalizeLocation(code), tenantKey ?? DEFAULT_TENANT, warehouseId, flags);
}
