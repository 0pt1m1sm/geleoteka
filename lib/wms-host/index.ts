// HOST ADAPTER for the WMS core. This is the deletable bridge — on extraction
// of lib/wms into a standalone product, this module is removed and replaced
// with the new host's adapter. It is the ONE place allowed to import the host
// db singleton; the core (lib/wms) never does.
import { db } from "@/lib/db";

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
