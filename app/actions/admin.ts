"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function updateAppointmentStatus(
  appointmentId: string,
  newStatus: string
): Promise<void> {
  await requireRole(["ADMIN", "MANAGER"]);

  const updateData: Record<string, unknown> = { status: newStatus };
  if (newStatus === "COMPLETED") {
    updateData.completedAt = new Date();
  }

  await db.appointment.update({
    where: { id: appointmentId },
    data: updateData,
  });

  // Create status change notification + SMS
  const appointment = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: { user: { select: { id: true, phone: true } } },
  });

  if (appointment) {
    const statusLabels: Record<string, string> = {
      BOOKED: "Записан",
      ACCEPTED: "Принят",
      DIAGNOSIS: "Диагностика",
      IN_REPAIR: "В ремонте",
      QC: "Контроль качества",
      READY: "Готов",
      COMPLETED: "Завершён",
      CANCELLED: "Отменён",
    };

    const user = (appointment as Record<string, unknown>).user as { id: string; phone: string };

    await db.notification.create({
      data: {
        userId: user.id,
        type: "STATUS_CHANGE",
        message: `Статус вашего заказа изменён: ${statusLabels[newStatus] ?? newStatus}`,
        metadata: { appointmentId },
      },
    });

    // Send SMS
    const { sendStatusChange } = await import("@/lib/sms");
    await sendStatusChange(user.phone, statusLabels[newStatus] ?? newStatus);
  }
}

export async function assignMaster(
  appointmentId: string,
  masterId: string
): Promise<void> {
  await requireRole(["ADMIN", "MANAGER"]);

  await db.appointment.update({
    where: { id: appointmentId },
    data: { masterId },
  });
}

export async function createEstimate(
  _prevState: { error: string | null; success?: boolean } | null,
  formData: FormData
): Promise<{ error: string | null; success?: boolean }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const appointmentId = formData.get("appointmentId") as string;
  if (!appointmentId) return { error: "Выберите запись" };

  const descriptions = formData.getAll("description") as string[];
  const types = formData.getAll("type") as string[];
  const prices = formData.getAll("price") as string[];
  const quantities = formData.getAll("quantity") as string[];

  if (descriptions.length === 0 || descriptions.every((d) => !d.trim())) {
    return { error: "Добавьте хотя бы одну позицию" };
  }

  const items = descriptions
    .map((desc, i) => ({
      type: (types[i] as "WORK" | "PART") || "WORK",
      description: desc.trim(),
      unitPrice: parseInt(prices[i]) || 0,
      quantity: parseInt(quantities[i]) || 1,
    }))
    .filter((item) => item.description && item.unitPrice > 0);

  if (items.length === 0) return { error: "Нет валидных позиций" };

  const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  await db.estimate.create({
    data: {
      appointmentId,
      total,
      sentAt: new Date(),
      items: { create: items },
    },
  });

  // Notify client
  const appointment = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { userId: true },
  });

  if (appointment) {
    await db.notification.create({
      data: {
        userId: appointment.userId,
        type: "ESTIMATE_READY",
        message: "Смета готова к согласованию. Откройте личный кабинет для просмотра.",
        metadata: { appointmentId },
      },
    });
  }

  redirect("/admin/estimates");
}
