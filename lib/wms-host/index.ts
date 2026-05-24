// HOST ADAPTER for the WMS core. This is the deletable bridge — on extraction
// of lib/wms into a standalone product, this module is removed and replaced
// with the new host's adapter. It is the ONE place allowed to import the host
// db singleton; the core (lib/wms) never does.
import { db } from "@/lib/db";
import type { DbClientPort } from "@/lib/wms/public";

/** Single-tenant discriminator until the WMS is extracted into a multi-tenant
 *  product. Host callers pass this to recordMovement / lookupByCode. */
export const TENANT_KEY = "geleoteka";

/** Host display policy: a part is "low stock" when available ≤ this threshold.
 *  Used by the warehouse overview for highlighting (Phase 5 makes it per-item). */
export const LOW_STOCK_THRESHOLD = 3;

/** Default staging cell for scanner receiving: received goods land here, then a
 *  putaway scan moves them to a real shelf. System-critical — kept active and
 *  unblocked by the stock-locations backfill so default receiving never breaks. */
export const STAGING_LOCATION = "ПРИЁМКА";

/** The host db singleton, surfaced as the WMS DB client port. Callers pass this
 *  (or a `$transaction` tx) into the core's recordMovement / lookup functions. */
export const wmsDb = db;

/** Map a host session to the opaque actorId the core stores on a movement. */
export function actorId(session: { id: string } | null | undefined): string | undefined {
  return session?.id;
}

/** Code of the default physical warehouse (Phase 6). Pre-Phase-6 stock and every
 *  host call that does not name a warehouse resolve to this one. */
export const DEFAULT_WAREHOUSE_CODE = "MAIN";

// Cache is process-lifetime; changing which warehouse is isDefault → restart server.
let cachedDefaultWarehouseId: string | null = null;

/** Resolve the default warehouse id for this tenant (the `isDefault` row, else
 *  MAIN by code). Memoized — the default warehouse never changes at runtime.
 *  This is the seam: the WMS core takes an opaque warehouseId; the host injects
 *  this value for every single-warehouse flow. */
export async function defaultWarehouseId(client: DbClientPort = wmsDb): Promise<string> {
  if (cachedDefaultWarehouseId) return cachedDefaultWarehouseId;
  const findFirst = client.warehouse.findFirst as (args: unknown) => Promise<{ id: string } | null>;
  const row = await findFirst({
    where: { tenantKey: TENANT_KEY, OR: [{ isDefault: true }, { code: DEFAULT_WAREHOUSE_CODE }] },
    orderBy: { isDefault: "desc" },
    select: { id: true },
  });
  if (!row) throw new Error("No default warehouse configured for tenant");
  cachedDefaultWarehouseId = row.id;
  return row.id;
}
