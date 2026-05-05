/**
 * Pure types + label helpers for the vehicle catalog. No DB imports here so
 * the module is safe to import from client components.
 *
 * Server-only queries (which use Prisma) live in `@/lib/vehicle-catalog`.
 */

export type FuelType = "PETROL" | "DIESEL" | "ELECTRIC" | "HYBRID";

export interface Trim {
  id: string;
  code: string;
  bodyStyle: string | null;
  drivetrain: string | null;
  fuelType: FuelType | null;
  engineCode: string | null;
  /** Decimal serialised as string by Prisma. Render as float when needed. */
  displacementL: string | null;
  horsepower: number | null;
  notes: string | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface Generation {
  id: string;
  code: string;
  yearFrom: number;
  yearTo: number | null;
  /** Populated only by trim-aware queries (`getActiveModelsWithTrims`). */
  trims?: Trim[];
  /** Default trim id for the generation, populated by trim-aware queries. */
  defaultTrimId?: string;
}

export interface VehicleModel {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  engines: string | null;
  features: string[];
  generations: Generation[];
}

export interface Manufacturer {
  id: string;
  slug: string;
  name: string;
}

/** "1990–2018 · W463" / "2018–н.в. · W464" */
export function generationLabel(g: Pick<Generation, "code" | "yearFrom" | "yearTo">): string {
  const end = g.yearTo === null ? "н.в." : String(g.yearTo);
  return `${g.yearFrom}–${end} · ${g.code}`;
}

/**
 * Display name for a vehicle model in pickers and saved-car strips. Prepends
 * the manufacturer brand so single-letter models ("CLA", "GLE") read
 * consistently next to suffixed ones ("G-Class", "S-Class"). Single seam for
 * the future multi-brand refactor — when brand becomes config-driven this is
 * the function that swaps "Mercedes-Benz" for the active brand's display
 * name.
 */
export function modelDisplayName(modelName: string): string {
  return `Mercedes-Benz ${modelName}`;
}

/** Just the code, for compact contexts. */
export function generationShort(g: Pick<Generation, "code">): string {
  return g.code;
}

/**
 * Human-readable trim label for picker dropdowns and admin UI. Joins non-empty
 * fields with " · " in priority order: code · engineCode · drivetrain ·
 * bodyStyle. Default trims render as "Все варианты этого поколения".
 */
export function trimLabel(
  t: Pick<Trim, "code" | "engineCode" | "drivetrain" | "bodyStyle" | "isDefault">,
): string {
  if (t.isDefault) return "Все варианты этого поколения";
  const parts = [t.code, t.engineCode, t.drivetrain, t.bodyStyle].filter(
    (p): p is string => Boolean(p && p.trim()),
  );
  return parts.join(" · ");
}
