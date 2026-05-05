"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

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
  const created = await db.vehicleGeneration.create({
    data: {
      code: input.code.trim(),
      yearFrom: input.yearFrom,
      yearTo: input.yearTo,
      modelId: input.modelId,
      isActive: input.isActive ?? true,
    },
    select: { id: true },
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
