import { WmsError } from "./errors";
import {
  findLocation,
  ensureLocation,
  listLocationRows,
  updateLocationFlags,
  renameLocationCode,
  relocateBins,
  onHandByLocation,
  type DbClientPort,
  type StockLocationRow,
} from "../internal/repository";
import { txCapable, type TxCapable } from "../internal/tx";

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

/** Create a location (active+unblocked) in a warehouse; no-op if it already exists. */
export async function createLocation(
  client: DbClientPort,
  code: string,
  warehouseId: string,
  tenantKey?: string,
): Promise<WmsLocation> {
  return ensureLocation(client, normalizeLocation(code), tenantKey ?? DEFAULT_TENANT, warehouseId);
}

/** Rename a location: move its registry code AND all its bins, atomically.
 *  Rejects when the target code already exists (LOCATION_EXISTS) or the source
 *  is unknown (LOCATION_NOT_FOUND). Self-wraps in a tx when given the base client. */
export async function renameLocation(
  client: DbClientPort,
  from: string,
  to: string,
  warehouseId: string,
  tenantKey?: string,
): Promise<void> {
  const tenant = tenantKey ?? DEFAULT_TENANT;
  const fromN = normalizeLocation(from);
  const toN = normalizeLocation(to);
  if (!toN) throw new Error("INVALID_LOCATION");
  if (fromN === toN) return;
  const run = async (tx: DbClientPort): Promise<void> => {
    if (!(await findLocation(tx, fromN, tenant, warehouseId))) throw new Error("LOCATION_NOT_FOUND");
    if (await findLocation(tx, toN, tenant, warehouseId)) throw new Error("LOCATION_EXISTS");
    await renameLocationCode(tx, fromN, toN, tenant, warehouseId);
    await relocateBins(tx, fromN, toN, tenant, warehouseId);
  };
  return txCapable(client) ? (client as unknown as TxCapable).$transaction(run) : run(client);
}

/** Locations + their placed on-hand (Σ bins) for the layout view. */
export async function listLocationsWithOnHand(
  client: DbClientPort,
  warehouseId: string,
  tenantKey?: string,
): Promise<Array<WmsLocation & { onHand: number }>> {
  const tenant = tenantKey ?? DEFAULT_TENANT;
  const [rows, onHand] = await Promise.all([
    listLocationRows(client, tenant, warehouseId),
    onHandByLocation(client, tenant, warehouseId),
  ]);
  return rows.map((l) => ({ ...l, onHand: onHand.get(l.code) ?? 0 }));
}
