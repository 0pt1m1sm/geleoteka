/**
 * @deprecated Vehicle catalog data lives in the DB now.
 *
 * - Server-only queries: import from `@/lib/vehicle-catalog`
 *   (getActiveModels, getModelBySlug, getModelGenerationsMap)
 * - Pure types + label helpers (safe for client): import from
 *   `@/lib/vehicle-catalog-types`
 *
 * This file is a thin shim re-exporting only the client-safe pieces so
 * existing imports `from "@/lib/models-data"` keep compiling.
 */

export type { Generation, VehicleModel, Manufacturer } from "./vehicle-catalog-types";
export { generationLabel, generationShort } from "./vehicle-catalog-types";
