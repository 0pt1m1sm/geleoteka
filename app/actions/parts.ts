"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
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
