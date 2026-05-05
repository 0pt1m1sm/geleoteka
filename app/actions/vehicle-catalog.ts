"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import type { FuelType } from "@/lib/vehicle-catalog-types";

interface ModelFields {
  slug: string;
  name: string;
  description?: string;
  engines?: string;
  features?: string[];
  manufacturerId: string;
  isActive?: boolean;
}

interface GenerationFields {
  code: string;
  yearFrom: number;
  yearTo: number | null;
  modelId: string;
  isActive?: boolean;
}

interface TrimFields {
  generationId: string;
  code: string;
  bodyStyle?: string | null;
  drivetrain?: string | null;
  fuelType?: FuelType | null;
  engineCode?: string | null;
  displacementL?: string | number | null;
  horsepower?: number | null;
  notes?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

const VEHICLE_PUBLIC_PATHS = ["/models", "/booking", "/parts"] as const;
function revalidateAllConsumers(): void {
  for (const path of VEHICLE_PUBLIC_PATHS) revalidatePath(path);
  revalidatePath("/admin/models");
}

export async function createModel(input: ModelFields): Promise<{ id: string }> {
  await requireRole(["ADMIN", "MANAGER"]);
  const created = await db.vehicleModel.create({
    data: {
      slug: input.slug.trim(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      engines: input.engines?.trim() || null,
      features: input.features ?? [],
      manufacturerId: input.manufacturerId,
      isActive: input.isActive ?? true,
    },
    select: { id: true },
  });
  revalidateAllConsumers();
  return { id: created.id };
}

export async function updateModel(id: string, input: Partial<ModelFields>): Promise<void> {
  await requireRole(["ADMIN", "MANAGER"]);
  const data: Record<string, unknown> = {};
  if (input.slug !== undefined) data.slug = input.slug.trim();
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.engines !== undefined) data.engines = input.engines?.trim() || null;
  if (input.features !== undefined) data.features = input.features;
  if (input.manufacturerId !== undefined) data.manufacturerId = input.manufacturerId;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  await db.vehicleModel.update({ where: { id }, data });
  revalidateAllConsumers();
}

export async function deleteModel(id: string): Promise<void> {
  await requireRole(["ADMIN"]);
  await db.vehicleModel.delete({ where: { id } });
  revalidateAllConsumers();
}

export async function createGeneration(input: GenerationFields): Promise<{ id: string }> {
  await requireRole(["ADMIN", "MANAGER"]);
  const created = await db.$transaction(async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
    const generation = await tx.vehicleGeneration.create({
      data: {
        code: input.code.trim(),
        yearFrom: input.yearFrom,
        yearTo: input.yearTo,
        modelId: input.modelId,
        isActive: input.isActive ?? true,
      },
      select: { id: true },
    });
    await tx.vehicleTrim.create({
      data: {
        generationId: generation.id,
        code: "ALL",
        isDefault: true,
        isActive: true,
        sortOrder: 0,
      },
    });
    return generation;
  });
  revalidateAllConsumers();
  return { id: created.id };
}

export async function updateGeneration(
  id: string,
  input: Partial<GenerationFields>,
): Promise<void> {
  await requireRole(["ADMIN", "MANAGER"]);
  const data: Record<string, unknown> = {};
  if (input.code !== undefined) data.code = input.code.trim();
  if (input.yearFrom !== undefined) data.yearFrom = input.yearFrom;
  if (input.yearTo !== undefined) data.yearTo = input.yearTo;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  await db.vehicleGeneration.update({ where: { id }, data });
  revalidateAllConsumers();
}

export async function deleteGeneration(id: string): Promise<void> {
  await requireRole(["ADMIN"]);
  await db.vehicleGeneration.delete({ where: { id } });
  revalidateAllConsumers();
}

function normalizeTrimWriteData(input: Partial<TrimFields>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (input.code !== undefined) data.code = input.code.trim();
  if (input.bodyStyle !== undefined) data.bodyStyle = input.bodyStyle?.toString().trim() || null;
  if (input.drivetrain !== undefined) data.drivetrain = input.drivetrain?.toString().trim() || null;
  if (input.fuelType !== undefined) data.fuelType = input.fuelType ?? null;
  if (input.engineCode !== undefined) data.engineCode = input.engineCode?.toString().trim() || null;
  if (input.displacementL !== undefined) {
    if (input.displacementL === null || input.displacementL === "") {
      data.displacementL = null;
    } else {
      const n = typeof input.displacementL === "number"
        ? input.displacementL
        : parseFloat(String(input.displacementL));
      data.displacementL = Number.isFinite(n) ? n : null;
    }
  }
  if (input.horsepower !== undefined) {
    data.horsepower =
      input.horsepower === null || Number.isNaN(input.horsepower) ? null : input.horsepower;
  }
  if (input.notes !== undefined) data.notes = input.notes?.toString().trim() || null;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
  return data;
}

export async function createTrim(input: TrimFields): Promise<{ id: string }> {
  await requireRole(["ADMIN", "MANAGER"]);
  const code = input.code.trim();
  if (!code) throw new Error("Код варианта обязателен");
  if (code.toUpperCase() === "ALL") {
    throw new Error('Код "ALL" зарезервирован для системного варианта поколения');
  }
  const data: Record<string, unknown> = {
    generationId: input.generationId,
    code,
    isDefault: false,
    isActive: input.isActive ?? true,
    ...normalizeTrimWriteData({ ...input, code }),
  };
  const created = await db.vehicleTrim.create({
    data: data as Parameters<typeof db.vehicleTrim.create>[0]["data"],
    select: { id: true },
  });
  revalidateAllConsumers();
  return { id: created.id };
}

export async function updateTrim(id: string, input: Partial<TrimFields>): Promise<void> {
  await requireRole(["ADMIN", "MANAGER"]);
  const existing = await db.vehicleTrim.findUnique({
    where: { id },
    select: { isDefault: true },
  });
  if (!existing) throw new Error("Вариант не найден");
  const e = existing as Record<string, unknown>;
  if (e.isDefault === true) {
    throw new Error("Системный вариант (Все варианты) не редактируется");
  }
  const data = normalizeTrimWriteData(input);
  if (Object.keys(data).length === 0) return;
  await db.vehicleTrim.update({ where: { id }, data });
  revalidateAllConsumers();
}

export async function deleteTrim(id: string): Promise<void> {
  await requireRole(["ADMIN"]);
  const existing = await db.vehicleTrim.findUnique({
    where: { id },
    select: { isDefault: true },
  });
  if (!existing) throw new Error("Вариант не найден");
  const e = existing as Record<string, unknown>;
  if (e.isDefault === true) {
    throw new Error("Системный вариант (Все варианты) удалить нельзя");
  }
  await db.vehicleTrim.delete({ where: { id } });
  revalidateAllConsumers();
}
