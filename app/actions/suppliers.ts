"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

interface SupplierFormData {
  name: string;
  email: string;
  phone: string;
  contactName: string | null;
  country: string | null;
  notes: string | null;
  isActive: boolean;
}

function parseSupplierForm(formData: FormData): SupplierFormData {
  const name = (formData.get("name") as string)?.trim();
  const rawEmail = (formData.get("email") as string)?.trim();
  const rawPhone = (formData.get("phone") as string)?.trim();
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 30) || "supplier";
  const email = rawEmail || `${slug}-${Date.now()}@geleoteka.local`;
  const phone = rawPhone || `+0000${Date.now()}`.slice(0, 18);
  const contactName = (formData.get("contactName") as string)?.trim() || null;
  const country = (formData.get("country") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;
  const isActive = formData.get("isActive") !== "off";
  return { name, email, phone, contactName, country, notes, isActive };
}

export async function createSupplier(
  _prevState: { error: string | null } | null,
  formData: FormData
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const data = parseSupplierForm(formData);
  if (!data.name) return { error: "Название поставщика обязательно" };

  await db.user.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      passwordHash: null,
      permissionRole: "NONE",
      isCustomer: false,
      isSupplier: true,
      supplierProfile: {
        create: {
          contactName: data.contactName,
          country: data.country,
          notes: data.notes,
          isActive: data.isActive,
        },
      },
    },
  });
  redirect("/admin/suppliers");
}

export async function updateSupplier(
  supplierUserId: string,
  _prevState: { error: string | null } | null,
  formData: FormData
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const data = parseSupplierForm(formData);
  if (!data.name) return { error: "Название поставщика обязательно" };

  await db.user.update({
    where: { id: supplierUserId },
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      supplierProfile: {
        update: {
          contactName: data.contactName,
          country: data.country,
          notes: data.notes,
          isActive: data.isActive,
        },
      },
    },
  });
  redirect("/admin/suppliers");
}

export async function deleteSupplier(supplierUserId: string): Promise<void> {
  await requireRole(["ADMIN"]);
  await db.supplierProfile.update({
    where: { userId: supplierUserId },
    data: { isActive: false },
  });
}
