"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant/scoped-db";
import { resetEmailVerificationOnChange } from "@/lib/email-verification/core";
import { isChecked } from "@/lib/forms";

interface SupplierFormData {
  name: string;
  email: string;
  phone: string;
  contactName: string | null;
  country: string | null;
  notes: string | null;
  isActive: boolean;
}

function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message.includes("Unique constraint")) return true;
  return "code" in err && (err as { code?: string }).code === "P2002";
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
  const isActive = isChecked(formData, "isActive");
  return { name, email, phone, contactName, country, notes, isActive };
}

export async function createSupplier(
  _prevState: { error: string | null } | null,
  formData: FormData
): Promise<{ error: string | null }> {
  // Через шов изоляции: арендатор проставляется в данные и в условие.
  const db = await tenantDb();
  await requireRole(["ADMIN", "MANAGER"]);

  const data = parseSupplierForm(formData);
  if (!data.name) return { error: "Название поставщика обязательно" };

  try {
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
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { error: "Пользователь с таким email или телефоном уже существует" };
    }
    throw err;
  }
  redirect("/admin/suppliers");
}

export async function updateSupplier(
  supplierUserId: string,
  _prevState: { error: string | null } | null,
  formData: FormData
): Promise<{ error: string | null }> {
  // Через шов изоляции: арендатор проставляется в данные и в условие.
  const db = await tenantDb();
  await requireRole(["ADMIN", "MANAGER"]);

  const data = parseSupplierForm(formData);
  if (!data.name) return { error: "Название поставщика обязательно" };

  const current = (await db.user.findUnique({
    where: { id: supplierUserId },
    select: { email: true },
  })) as { email: string } | null;
  if (!current) return { error: "Поставщик не найден" };

  try {
    await db.user.update({
      where: { id: supplierUserId },
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        ...resetEmailVerificationOnChange(current.email, data.email),
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
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { error: "Пользователь с таким email или телефоном уже существует" };
    }
    throw err;
  }
  redirect("/admin/suppliers");
}

/**
 * Убрать поставщика.
 *
 * Раньше это всегда было мягким скрытием (isActive=false), и запись оставалась
 * навсегда — тестового поставщика убрать было нечем. Теперь по факту связей:
 *
 *  • есть заказы — только скрываем. Заказ поставщику это учётный документ, а
 *    `SupplierOrder.userId` объявлен RESTRICT: база и не дала бы удалить, и
 *    правильно — иначе история закупок осталась бы без имени;
 *  • заказов нет — удаляем запись целиком. Профиль уходит каскадом.
 *
 * Возвращаем, что именно произошло: интерфейс обязан сказать правду, а не
 * рапортовать «удалено» о скрытии.
 */
export async function deleteSupplier(
  supplierUserId: string,
): Promise<{ error: string | null; removed?: "deleted" | "hidden" }> {
  // Через шов изоляции: арендатор проставляется в данные и в условие.
  const db = await tenantDb();
  await requireRole(["ADMIN"]);

  const orders = (await db.supplierOrder.count({
    where: { userId: supplierUserId },
  })) as number;

  if (orders > 0) {
    await db.supplierProfile.update({
      where: { userId: supplierUserId },
      data: { isActive: false },
    });
    return { error: null, removed: "hidden" };
  }

  await db.user.delete({ where: { id: supplierUserId } });
  return { error: null, removed: "deleted" };
}
