"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getModelGenerationsMap } from "@/lib/vehicle-catalog";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

/**
 * Validates that every entry in `compatibleModels` includes a generation.
 * The picker on /parts hard-filters by `compatibleModels: { has: "<Model> <Gen>" }`
 * so bare model names ("G-Class") never match. Reject them at the write boundary
 * to prevent admins from silently breaking parts visibility.
 */
async function validateCompatibleModels(values: string[]): Promise<string | null> {
  const map = await getModelGenerationsMap();
  for (const v of values) {
    if (!v.includes(" ")) {
      const known = Boolean(map[v]);
      if (known) {
        const gens = map[v].slice(0, 3).map((g) => `${v} ${g}`).join(", ");
        return `Каждая запись в "Совместимые модели" должна содержать поколение, например "${gens}". Нашли "${v}".`;
      }
      // Unknown bare token — reject too
      return `Запись "${v}" в "Совместимые модели" должна быть в формате "Модель Поколение", например "G-Class W463".`;
    }
  }
  return null;
}

export async function createPart(
  _prevState: { error: string | null } | null,
  formData: FormData
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const article = (formData.get("article") as string)?.trim();
  const name = (formData.get("name") as string)?.trim();
  const price = parseInt(formData.get("price") as string);
  const quantity = parseInt(formData.get("quantity") as string) || 0;
  const isOEM = formData.get("isOEM") === "on";
  const categoryId = (formData.get("categoryId") as string) || null;
  const description = (formData.get("description") as string)?.trim() || null;
  const compareAtPrice = parseInt(formData.get("compareAtPrice") as string) || null;
  const compatibleModels = (formData.get("compatibleModels") as string)
    ?.split(",")
    .map((m) => m.trim())
    .filter(Boolean) || [];

  if (!article || !name || isNaN(price)) {
    return { error: "Артикул, название и цена обязательны" };
  }

  const compatErr = await validateCompatibleModels(compatibleModels);
  if (compatErr) return { error: compatErr };

  const existing = await db.part.findUnique({ where: { article } });
  if (existing) {
    return { error: "Запчасть с таким артикулом уже существует" };
  }

  const slug = slugify(`${article}-${name}`).slice(0, 80);

  await db.part.create({
    data: {
      slug,
      article,
      name,
      description,
      price,
      compareAtPrice,
      quantity,
      isOEM,
      categoryId: categoryId || null,
      compatibleModels,
      photos: [],
    },
  });

  redirect("/admin/parts");
}

export async function updatePart(
  partId: string,
  _prevState: { error: string | null } | null,
  formData: FormData
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const name = (formData.get("name") as string)?.trim();
  const price = parseInt(formData.get("price") as string);
  const quantity = parseInt(formData.get("quantity") as string) || 0;
  const isOEM = formData.get("isOEM") === "on";
  const categoryId = (formData.get("categoryId") as string) || null;
  const description = (formData.get("description") as string)?.trim() || null;
  const compareAtPrice = parseInt(formData.get("compareAtPrice") as string) || null;
  const isActive = formData.get("isActive") !== "off";
  const compatibleModels = (formData.get("compatibleModels") as string)
    ?.split(",")
    .map((m) => m.trim())
    .filter(Boolean) || [];

  if (!name || isNaN(price)) {
    return { error: "Название и цена обязательны" };
  }

  const compatErr = await validateCompatibleModels(compatibleModels);
  if (compatErr) return { error: compatErr };

  await db.part.update({
    where: { id: partId },
    data: { name, description, price, compareAtPrice, quantity, isOEM, categoryId: categoryId || null, compatibleModels, isActive },
  });

  redirect("/admin/parts");
}

export async function deletePart(partId: string): Promise<void> {
  await requireRole(["ADMIN", "MANAGER"]);
  await db.part.delete({ where: { id: partId } });
}
