import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import type { VehicleModel } from "./vehicle-catalog-types";

export type { Generation, VehicleModel, Manufacturer } from "./vehicle-catalog-types";
export { generationLabel, generationShort } from "./vehicle-catalog-types";

const loadActiveModels = cache(async (): Promise<VehicleModel[]> => {
  const rows = (await db.vehicleModel.findMany({
    where: { isActive: true },
    orderBy: [{ manufacturerId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      engines: true,
      features: true,
      generations: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { yearFrom: "asc" }],
        select: { id: true, code: true, yearFrom: true, yearTo: true },
      },
    },
  })) as VehicleModel[];
  return rows;
});

/** All active models, sorted, with their active generations. */
export async function getActiveModels(): Promise<VehicleModel[]> {
  return loadActiveModels();
}

/** Lookup by slug for the public detail page. */
export async function getModelBySlug(slug: string): Promise<VehicleModel | null> {
  const all = await loadActiveModels();
  return all.find((m) => m.slug === slug) ?? null;
}

/** Map name → string[] of generation codes. Backwards-compat shape for parts
 *  validation (Part.compatibleModels stores "<Model> <Code>" strings). */
export async function getModelGenerationsMap(): Promise<Record<string, string[]>> {
  const models = await loadActiveModels();
  return Object.fromEntries(models.map((m) => [m.name, m.generations.map((g) => g.code)]));
}
