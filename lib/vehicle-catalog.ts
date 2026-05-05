import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import type { Trim, VehicleModel } from "./vehicle-catalog-types";

export type {
  FuelType,
  Generation,
  Manufacturer,
  Trim,
  VehicleModel,
} from "./vehicle-catalog-types";
export { generationLabel, generationShort, trimLabel } from "./vehicle-catalog-types";

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

const loadActiveModelsWithTrims = cache(async (): Promise<VehicleModel[]> => {
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
        select: {
          id: true,
          code: true,
          yearFrom: true,
          yearTo: true,
          trims: {
            where: { isActive: true },
            orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { code: "asc" }],
            select: {
              id: true,
              code: true,
              bodyStyle: true,
              drivetrain: true,
              fuelType: true,
              engineCode: true,
              displacementL: true,
              horsepower: true,
              notes: true,
              isDefault: true,
              isActive: true,
              sortOrder: true,
            },
          },
        },
      },
    },
  })) as Array<
    VehicleModel & {
      generations: Array<
        VehicleModel["generations"][number] & {
          trims: Array<Trim & { displacementL: unknown }>;
        }
      >;
    }
  >;

  return rows.map((m) => ({
    ...m,
    generations: m.generations.map((g) => {
      const rawTrims = g.trims ?? [];
      const allTrims = rawTrims.map((t) => ({
        ...t,
        // Prisma returns Decimal as Decimal-like; coerce to string for client safety.
        displacementL:
          t.displacementL === null || t.displacementL === undefined
            ? null
            : String(t.displacementL),
      })) as Trim[];
      const defaultTrim = allTrims.find((t) => t.isDefault);
      return {
        ...g,
        trims: allTrims.filter((t) => !t.isDefault),
        defaultTrimId: defaultTrim?.id,
      };
    }),
  }));
});

/** All active models, sorted, with their active generations. */
export async function getActiveModels(): Promise<VehicleModel[]> {
  return loadActiveModels();
}

/**
 * All active models with each generation's active non-default trims attached.
 * The default trim id is exposed via `generation.defaultTrimId` separately so
 * the admin part-trim picker can reference it without surfacing the row in
 * customer-facing UI.
 */
export async function getActiveModelsWithTrims(): Promise<VehicleModel[]> {
  return loadActiveModelsWithTrims();
}

/** Lookup by slug for the public detail page. */
export async function getModelBySlug(slug: string): Promise<VehicleModel | null> {
  const all = await loadActiveModels();
  return all.find((m) => m.slug === slug) ?? null;
}

const loadActiveTrimsForGeneration = cache(async (generationId: string): Promise<Trim[]> => {
  const rows = (await db.vehicleTrim.findMany({
    where: { generationId, isActive: true, isDefault: false },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      bodyStyle: true,
      drivetrain: true,
      fuelType: true,
      engineCode: true,
      displacementL: true,
      horsepower: true,
      notes: true,
      isDefault: true,
      isActive: true,
      sortOrder: true,
    },
  })) as Array<Trim & { displacementL: unknown }>;
  return rows.map((t) => ({
    ...t,
    displacementL:
      t.displacementL === null || t.displacementL === undefined ? null : String(t.displacementL),
  })) as Trim[];
});

/** Active non-default trims for a generation. Used by customer pickers. */
export async function getActiveTrimsForGeneration(generationId: string): Promise<Trim[]> {
  return loadActiveTrimsForGeneration(generationId);
}

const loadAllTrimsForGeneration = cache(async (generationId: string): Promise<Trim[]> => {
  const rows = (await db.vehicleTrim.findMany({
    where: { generationId, isActive: true },
    orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      bodyStyle: true,
      drivetrain: true,
      fuelType: true,
      engineCode: true,
      displacementL: true,
      horsepower: true,
      notes: true,
      isDefault: true,
      isActive: true,
      sortOrder: true,
    },
  })) as Array<Trim & { displacementL: unknown }>;
  return rows.map((t) => ({
    ...t,
    displacementL:
      t.displacementL === null || t.displacementL === undefined ? null : String(t.displacementL),
  })) as Trim[];
});

/**
 * All active trims for a generation including the default one. Used by admin
 * UI that needs to surface the "Все варианты" option as a real selectable row.
 */
export async function getAllTrimsForGeneration(generationId: string): Promise<Trim[]> {
  return loadAllTrimsForGeneration(generationId);
}

