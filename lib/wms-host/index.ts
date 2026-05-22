// HOST ADAPTER for the WMS core. This is the deletable bridge — on extraction
// of lib/wms into a standalone product, this module is removed and replaced
// with the new host's adapter. It is the ONE place allowed to import the host
// db singleton; the core (lib/wms) never does.
import { db } from "@/lib/db";

/** Single-tenant discriminator until the WMS is extracted into a multi-tenant
 *  product. Host callers pass this to recordMovement / lookupByCode. */
export const TENANT_KEY = "geleoteka";

/** The host db singleton, surfaced as the WMS DB client port. Callers pass this
 *  (or a `$transaction` tx) into the core's recordMovement / lookup functions. */
export const wmsDb = db;

/** Map a host session to the opaque actorId the core stores on a movement. */
export function actorId(session: { id: string } | null | undefined): string | undefined {
  return session?.id;
}
