"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

function parseFounderForm(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const sharePercent = parseInt(formData.get("sharePercent") as string);
  const sortOrder = parseInt(formData.get("sortOrder") as string) || 0;
  const isActive = formData.get("isActive") !== "off";
  return { name, email, phone, sharePercent, sortOrder, isActive };
}

export async function createFounder(
  _prevState: { error: string | null } | null,
  formData: FormData
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const data = parseFounderForm(formData);

  if (!data.name || isNaN(data.sharePercent)) {
    return { error: "Имя и доля обязательны" };
  }

  if (data.sharePercent < 0 || data.sharePercent > 100) {
    return { error: "Доля должна быть от 0 до 100" };
  }

  await db.founder.create({ data });
  redirect("/admin/founders");
}

export async function updateFounder(
  founderId: string,
  _prevState: { error: string | null } | null,
  formData: FormData
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const data = parseFounderForm(formData);

  if (!data.name || isNaN(data.sharePercent)) {
    return { error: "Имя и доля обязательны" };
  }

  if (data.sharePercent < 0 || data.sharePercent > 100) {
    return { error: "Доля должна быть от 0 до 100" };
  }

  await db.founder.update({ where: { id: founderId }, data });
  redirect("/admin/founders");
}

export async function deleteFounder(founderId: string): Promise<void> {
  await requireRole(["ADMIN"]);
  // Soft delete to preserve contribution history
  await db.founder.update({
    where: { id: founderId },
    data: { isActive: false },
  });
}
