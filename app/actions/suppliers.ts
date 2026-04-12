"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

function parseSupplierForm(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  const contactName = (formData.get("contactName") as string)?.trim() || null;
  const email = (formData.get("email") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const country = (formData.get("country") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;
  const isActive = formData.get("isActive") !== "off";
  return { name, contactName, email, phone, country, notes, isActive };
}

export async function createSupplier(
  _prevState: { error: string | null } | null,
  formData: FormData
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const data = parseSupplierForm(formData);
  if (!data.name) return { error: "Название поставщика обязательно" };

  await db.supplier.create({ data });
  redirect("/admin/suppliers");
}

export async function updateSupplier(
  supplierId: string,
  _prevState: { error: string | null } | null,
  formData: FormData
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const data = parseSupplierForm(formData);
  if (!data.name) return { error: "Название поставщика обязательно" };

  await db.supplier.update({ where: { id: supplierId }, data });
  redirect("/admin/suppliers");
}

export async function deleteSupplier(supplierId: string): Promise<void> {
  await requireRole(["ADMIN"]);
  await db.supplier.update({
    where: { id: supplierId },
    data: { isActive: false },
  });
}
