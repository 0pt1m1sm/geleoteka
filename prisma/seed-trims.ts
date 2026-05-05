import type { PrismaClient } from "../app/generated/prisma/client";

interface CuratedTrim {
  code: string;
  bodyStyle?: string;
  drivetrain?: string;
  fuelType: "PETROL" | "DIESEL" | "ELECTRIC" | "HYBRID";
  engineCode?: string;
  displacementL?: number;
  horsepower?: number;
  notes?: string;
}

interface CuratedGeneration {
  modelSlug: string;
  generationCode: string;
  trims: CuratedTrim[];
}

/**
 * Hand-picked trims for the most common Russian-market generations. The full
 * Mercedes lineup spans hundreds of variants — this set covers what customers
 * actually drive into the shop. Generations not in this list rely on the
 * isDefault=true fallback ("Все варианты этого поколения").
 */
const CURATED: CuratedGeneration[] = [
  // G-Class W464 (2018 – present)
  {
    modelSlug: "g-class",
    generationCode: "W464",
    trims: [
      { code: "G 350 d", bodyStyle: "long", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM656", displacementL: 3.0, horsepower: 286, notes: "I6 дизель" },
      { code: "G 400 d", bodyStyle: "long", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM656", displacementL: 3.0, horsepower: 330, notes: "I6 дизель, более мощная версия" },
      { code: "G 500", bodyStyle: "long", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M176", displacementL: 4.0, horsepower: 422, notes: "V8 битурбо" },
      { code: "G 63 AMG", bodyStyle: "long", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M177", displacementL: 4.0, horsepower: 585, notes: "AMG handcrafted V8" },
    ],
  },
  // GLE V167 (2019 – present)
  {
    modelSlug: "gle",
    generationCode: "V167",
    trims: [
      { code: "GLE 300 d", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM654", displacementL: 2.0, horsepower: 245 },
      { code: "GLE 350 d", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM656", displacementL: 3.0, horsepower: 272 },
      { code: "GLE 400 d", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM656", displacementL: 3.0, horsepower: 330 },
      { code: "GLE 450", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M256", displacementL: 3.0, horsepower: 367, notes: "I6 + EQ Boost" },
      { code: "AMG GLE 53", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M256", displacementL: 3.0, horsepower: 435, notes: "AMG performance" },
      { code: "AMG GLE 63 S", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M177", displacementL: 4.0, horsepower: 612, notes: "V8 битурбо AMG" },
    ],
  },
  // GLS X167 (2019 – present)
  {
    modelSlug: "gls",
    generationCode: "X167",
    trims: [
      { code: "GLS 400 d", drivetrain: "4MATIC", fuelType: "DIESEL", engineCode: "OM656", displacementL: 3.0, horsepower: 330 },
      { code: "GLS 450", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M256", displacementL: 3.0, horsepower: 367 },
      { code: "GLS 580", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M176", displacementL: 4.0, horsepower: 489, notes: "V8 битурбо" },
      { code: "AMG GLS 63", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M177", displacementL: 4.0, horsepower: 612, notes: "AMG handcrafted" },
    ],
  },
  // E-Class W213 (2016 – 2023)
  {
    modelSlug: "e-class",
    generationCode: "W213",
    trims: [
      { code: "E 200", fuelType: "PETROL", engineCode: "M264", displacementL: 2.0, horsepower: 184 },
      { code: "E 220 d", fuelType: "DIESEL", engineCode: "OM654", displacementL: 2.0, horsepower: 194 },
      { code: "E 350", fuelType: "PETROL", engineCode: "M264", displacementL: 2.0, horsepower: 299 },
      { code: "E 450 4MATIC", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M256", displacementL: 3.0, horsepower: 367 },
      { code: "AMG E 53", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M256", displacementL: 3.0, horsepower: 435 },
      { code: "AMG E 63 S", drivetrain: "4MATIC+", fuelType: "PETROL", engineCode: "M177", displacementL: 4.0, horsepower: 612 },
    ],
  },
  // C-Class W205 (2014 – 2021)
  {
    modelSlug: "c-class",
    generationCode: "W205",
    trims: [
      { code: "C 180", fuelType: "PETROL", engineCode: "M274", displacementL: 1.6, horsepower: 156 },
      { code: "C 200", fuelType: "PETROL", engineCode: "M264", displacementL: 1.5, horsepower: 184, notes: "EQ Boost мягкий гибрид" },
      { code: "C 220 d", fuelType: "DIESEL", engineCode: "OM651", displacementL: 2.1, horsepower: 170 },
      { code: "C 300", fuelType: "PETROL", engineCode: "M274", displacementL: 2.0, horsepower: 245 },
      { code: "AMG C 43", drivetrain: "4MATIC", fuelType: "PETROL", engineCode: "M276", displacementL: 3.0, horsepower: 390 },
      { code: "AMG C 63 S", fuelType: "PETROL", engineCode: "M177", displacementL: 4.0, horsepower: 510, notes: "V8 битурбо AMG" },
    ],
  },
];

interface SeedSummary {
  defaultTrimsCreated: number;
  curatedTrimsUpserted: number;
  unmatchedCurated: string[];
}

/**
 * Idempotent. Runs two passes:
 * 1) Default trim per generation (one isDefault=true row per generation —
 *    represents the "Все варианты этого поколения" fallback).
 * 2) Curated non-default trims for the most common Russian-market generations.
 */
export async function seedTrims(prisma: PrismaClient): Promise<SeedSummary> {
  const summary: SeedSummary = {
    defaultTrimsCreated: 0,
    curatedTrimsUpserted: 0,
    unmatchedCurated: [],
  };

  // Pass 1: default trim per generation
  const allGenerations = (await prisma.vehicleGeneration.findMany({
    select: { id: true, code: true, modelId: true },
  })) as Array<{ id: string; code: string; modelId: string }>;

  for (const g of allGenerations) {
    const result = await prisma.vehicleTrim.upsert({
      where: { generationId_code: { generationId: g.id, code: "ALL" } },
      update: { isActive: true, isDefault: true, sortOrder: 0 },
      create: {
        generationId: g.id,
        code: "ALL",
        isDefault: true,
        isActive: true,
        sortOrder: 0,
      },
      select: { id: true, createdAt: true, updatedAt: true },
    });
    const r = result as { createdAt: Date; updatedAt: Date };
    if (r.createdAt.getTime() === r.updatedAt.getTime()) {
      summary.defaultTrimsCreated++;
    }
  }

  // Pass 2: curated trims
  for (const cg of CURATED) {
    const model = (await prisma.vehicleModel.findUnique({
      where: { slug: cg.modelSlug },
      select: { id: true },
    })) as { id: string } | null;
    if (!model) {
      summary.unmatchedCurated.push(`curated:model-not-found:${cg.modelSlug}`);
      continue;
    }
    const generation = (await prisma.vehicleGeneration.findUnique({
      where: { modelId_code: { modelId: model.id, code: cg.generationCode } },
      select: { id: true },
    })) as { id: string } | null;
    if (!generation) {
      summary.unmatchedCurated.push(`curated:gen-not-found:${cg.modelSlug}/${cg.generationCode}`);
      continue;
    }
    for (let i = 0; i < cg.trims.length; i++) {
      const t = cg.trims[i];
      await prisma.vehicleTrim.upsert({
        where: { generationId_code: { generationId: generation.id, code: t.code } },
        update: {
          bodyStyle: t.bodyStyle ?? null,
          drivetrain: t.drivetrain ?? null,
          fuelType: t.fuelType,
          engineCode: t.engineCode ?? null,
          displacementL: t.displacementL ?? null,
          horsepower: t.horsepower ?? null,
          notes: t.notes ?? null,
          isDefault: false,
          isActive: true,
          sortOrder: i + 1,
        },
        create: {
          generationId: generation.id,
          code: t.code,
          bodyStyle: t.bodyStyle ?? null,
          drivetrain: t.drivetrain ?? null,
          fuelType: t.fuelType,
          engineCode: t.engineCode ?? null,
          displacementL: t.displacementL ?? null,
          horsepower: t.horsepower ?? null,
          notes: t.notes ?? null,
          isDefault: false,
          isActive: true,
          sortOrder: i + 1,
        },
      });
      summary.curatedTrimsUpserted++;
    }
  }

  console.log(
    `Trims seeded: ${summary.defaultTrimsCreated} default trims new, ` +
      `${summary.curatedTrimsUpserted} curated trims upserted, ` +
      `${summary.unmatchedCurated.length} curated rows skipped`,
  );
  if (summary.unmatchedCurated.length > 0) {
    console.warn("Curated rows skipped (model or generation missing in catalog):");
    for (const e of summary.unmatchedCurated) console.warn(`  - ${e}`);
  }

  return summary;
}
