"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function updatePartOrderStatus(
  orderId: string,
  newStatus: string
): Promise<void> {
  await requireRole(["ADMIN", "MANAGER"]);

  await db.partOrder.update({
    where: { id: orderId },
    data: {
      status: newStatus as "PENDING" | "CONFIRMED" | "SHIPPED" | "COMPLETED" | "CANCELLED",
    },
  });

  // Notify customer if order has an associated user
  const order = await db.partOrder.findUnique({
    where: { id: orderId },
    select: { userId: true, id: true },
  });

  if (order && (order as Record<string, unknown>).userId) {
    const statusLabels: Record<string, string> = {
      PENDING: "Ожидает",
      CONFIRMED: "Подтверждён",
      SHIPPED: "Отправлен",
      COMPLETED: "Завершён",
      CANCELLED: "Отменён",
    };

    await db.notification.create({
      data: {
        userId: (order as Record<string, unknown>).userId as string,
        type: "STATUS_CHANGE",
        message: `Статус вашего заказа запчастей изменён: ${statusLabels[newStatus] ?? newStatus}`,
        metadata: { orderId: orderId },
      },
    });
  }
}
