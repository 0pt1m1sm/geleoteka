"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authz";
import { db } from "@/lib/db";
import { TENANT_KEY } from "@/lib/tenant";
import { lockActiveServiceBays, type ServiceBayAllocationTx } from "@/lib/scheduling/service-bays";
import { isUniqueViolation } from "@/lib/scheduling/reschedule";

export interface ServiceBayActionResult {
  error: string | null;
}

function refreshServiceBays(): void {
  revalidatePath("/admin/service-bays");
  revalidatePath("/admin/calendar");
  revalidatePath("/booking/step-2");
}

function cleanName(value: string): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export async function createServiceBay(
  name: string,
  sortOrder: number,
): Promise<ServiceBayActionResult> {
  await requirePermission("service.manage");
  const clean = cleanName(name);
  if (!clean) return { error: "Укажите название поста" };
  if (clean.length > 80) return { error: "Название поста — не больше 80 символов" };
  const order = Number.isFinite(sortOrder) ? Math.trunc(sortOrder) : 0;

  try {
    await db.serviceBay.create({
      data: { name: clean, sortOrder: order, tenantKey: TENANT_KEY, isActive: true },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "Пост с таким названием уже существует" };
    throw error;
  }
  refreshServiceBays();
  return { error: null };
}

export async function updateServiceBay(
  id: string,
  name: string,
  sortOrder: number,
): Promise<ServiceBayActionResult> {
  await requirePermission("service.manage");
  const clean = cleanName(name);
  if (!clean) return { error: "Укажите название поста" };
  if (clean.length > 80) return { error: "Название поста — не больше 80 символов" };
  const order = Number.isFinite(sortOrder) ? Math.trunc(sortOrder) : 0;

  const exists = (await db.serviceBay.findFirst({
    where: { id, tenantKey: TENANT_KEY },
    select: { id: true },
  })) as { id: string } | null;
  if (!exists) return { error: "Рабочий пост не найден" };

  try {
    await db.serviceBay.update({ where: { id }, data: { name: clean, sortOrder: order } });
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "Пост с таким названием уже существует" };
    throw error;
  }
  refreshServiceBays();
  return { error: null };
}

export async function setServiceBayActive(
  id: string,
  active: boolean,
): Promise<ServiceBayActionResult> {
  await requirePermission("service.manage");

  const result = await db.$transaction(async (tx) => {
    const bay = (await tx.serviceBay.findFirst({
      where: { id, tenantKey: TENANT_KEY },
      select: { id: true, isActive: true },
    })) as { id: string; isActive: boolean } | null;
    if (!bay) return { error: "Рабочий пост не найден" };
    if (bay.isActive === active) return { error: null };

    if (!active) {
      // Same lock order as booking/reschedule: capacity cannot reach zero
      // between their resource read and this mutation.
      const activeBays = await lockActiveServiceBays(
        tx as unknown as ServiceBayAllocationTx,
      );
      if (activeBays.length <= 1) {
        return { error: "Нельзя отключить последний активный пост" };
      }
    }

    await tx.serviceBay.update({ where: { id }, data: { isActive: active } });
    return { error: null };
  });

  if (!result.error) refreshServiceBays();
  return result;
}
