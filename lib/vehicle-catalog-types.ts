/**
 * Pure types + label helpers for the vehicle catalog. No DB imports here so
 * the module is safe to import from client components.
 *
 * Server-only queries (which use Prisma) live in `@/lib/vehicle-catalog`.
 */

export interface Generation {
  id: string;
  code: string;
  yearFrom: number;
  yearTo: number | null;
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

/** Just the code, for compact contexts. */
export function generationShort(g: Pick<Generation, "code">): string {
  return g.code;
}
