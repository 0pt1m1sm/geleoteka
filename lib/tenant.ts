/**
 * The single tenant this installation serves, until the multi-tenant split
 * lands (docs/plans/2026-07-31-multi-tenant-platform.md).
 *
 * Lives on its own so the constant has one definition rather than a literal
 * repeated per subsystem — and so a module that only needs the key does not
 * have to import the warehouse host to get it.
 */
export const TENANT_KEY = "geleoteka";
