"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

interface ServiceFormData {
  slug: string;
  name: string;
  description: string | null;
  priceMin: number | null;
  priceMax: number | null;
  durationMinutes: number | null;
}

function parseServiceFormData(formData: FormData): ServiceFormData {
  const slug = ((formData.get("slug") as string) || "").trim().toLowerCase();
  const name = ((formData.get("name") as string) || "").trim();
  const description = ((formData.get("description") as string) || "").trim() || null;
  const priceMinRaw = (formData.get("priceMin") as string) || "";
  const priceMaxRaw = (formData.get("priceMax") as string) || "";
  const durationRaw = (formData.get("durationMinutes") as string) || "";
  const priceMin = priceMinRaw ? parseInt(priceMinRaw, 10) : null;
  const priceMax = priceMaxRaw ? parseInt(priceMaxRaw, 10) : null;
  const durationMinutes = durationRaw ? parseInt(durationRaw, 10) : null;
  return { slug, name, description, priceMin, priceMax, durationMinutes };
}

function validateServiceData(data: ServiceFormData): string | null {
  if (!data.name) return "Название обязательно";
  if (!data.slug) return "Slug обязателен";
  if (!/^[a-z0-9-]+$/.test(data.slug)) {
    return "Slug должен содержать только латиницу, цифры и дефисы";
  }
  if (data.priceMin !== null && (Number.isNaN(data.priceMin) || data.priceMin < 0)) {
    return "Цена «от» должна быть положительным числом";
  }
  if (data.priceMax !== null && (Number.isNaN(data.priceMax) || data.priceMax < 0)) {
    return "Цена «до» должна быть положительным числом";
  }
  if (
    data.priceMin !== null &&
    data.priceMax !== null &&
    data.priceMax < data.priceMin
  ) {
    return "Цена «до» не может быть меньше цены «от»";
  }
  if (
    data.durationMinutes !== null &&
    (Number.isNaN(data.durationMinutes) || data.durationMinutes < 0)
  ) {
    return "Длительность должна быть положительным числом";
  }
  return null;
}

export async function createService(
  _prevState: { error: string | null } | null,
  formData: FormData,
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const data = parseServiceFormData(formData);
  const error = validateServiceData(data);
  if (error) return { error };

  try {
    await db.service.create({ data });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { error: `Услуга со slug «${data.slug}» уже существует` };
    }
    throw err;
  }

  revalidatePath("/services");
  revalidatePath("/admin/services");
  redirect("/admin/services");
}

export async function updateService(
  serviceId: string,
  _prevState: { error: string | null } | null,
  formData: FormData,
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const data = parseServiceFormData(formData);
  const error = validateServiceData(data);
  if (error) return { error };

  try {
    await db.service.update({ where: { id: serviceId }, data });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { error: `Услуга со slug «${data.slug}» уже существует` };
    }
    throw err;
  }

  revalidatePath("/services");
  revalidatePath(`/services/${data.slug}`);
  revalidatePath("/admin/services");
  redirect("/admin/services");
}

export async function deleteService(serviceId: string): Promise<void> {
  await requireRole(["ADMIN", "MANAGER"]);
  await db.service.delete({ where: { id: serviceId } });
  revalidatePath("/services");
  revalidatePath("/admin/services");
}
