"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

const CAPTION_MAX = 200;

/** Attach a work photo to a RepairOrder with optional caption. ADMIN/MANAGER only. */
export async function addRepairOrderPhoto(input: {
  repairOrderId: string;
  url: string;
  caption?: string;
}): Promise<{ ok: true; photoId: string } | { ok: false; error: string }> {
  const session = await requireRole(["ADMIN", "MANAGER"]);

  const url = input.url.trim();
  if (!url) return { ok: false, error: "URL фото обязателен" };
  const caption = (input.caption ?? "").trim();
  if (caption.length > CAPTION_MAX) {
    return { ok: false, error: `Подпись не длиннее ${CAPTION_MAX} символов` };
  }

  const ro = (await db.repairOrder.findUnique({
    where: { id: input.repairOrderId },
    select: { id: true },
  })) as { id: string } | null;
  if (!ro) return { ok: false, error: "Заказ-наряд не найден" };

  const created = (await db.repairOrderPhoto.create({
    data: {
      repairOrderId: input.repairOrderId,
      url,
      caption: caption || null,
      uploadedById: session.id,
    },
    select: { id: true },
  })) as { id: string };

  revalidatePath(`/admin/repair-orders/${input.repairOrderId}`);
  revalidatePath(`/cabinet/tracking`);
  return { ok: true, photoId: created.id };
}

/** Update only the caption of an existing photo. ADMIN/MANAGER only. */
export async function updateRepairOrderPhotoCaption(
  photoId: string,
  caption: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const trimmed = caption.trim();
  if (trimmed.length > CAPTION_MAX) {
    return { ok: false, error: `Подпись не длиннее ${CAPTION_MAX} символов` };
  }

  const photo = (await db.repairOrderPhoto.findUnique({
    where: { id: photoId },
    select: { repairOrderId: true },
  })) as { repairOrderId: string } | null;
  if (!photo) return { ok: false, error: "Фото не найдено" };

  await db.repairOrderPhoto.update({
    where: { id: photoId },
    data: { caption: trimmed || null },
  });
  revalidatePath(`/admin/repair-orders/${photo.repairOrderId}`);
  revalidatePath(`/cabinet/tracking`);
  return { ok: true };
}

/** Delete a work photo. ADMIN/MANAGER only. */
export async function deleteRepairOrderPhoto(
  photoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const photo = (await db.repairOrderPhoto.findUnique({
    where: { id: photoId },
    select: { repairOrderId: true },
  })) as { repairOrderId: string } | null;
  if (!photo) return { ok: false, error: "Фото не найдено" };

  await db.repairOrderPhoto.delete({ where: { id: photoId } });
  revalidatePath(`/admin/repair-orders/${photo.repairOrderId}`);
  revalidatePath(`/cabinet/tracking`);
  return { ok: true };
}
