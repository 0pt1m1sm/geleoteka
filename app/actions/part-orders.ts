"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { normalizePhone } from "@/lib/utils";

interface OrderInput {
  items: { partId: string; quantity: number }[];
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  notes: string;
}

interface OrderResult {
  success: boolean;
  orderId?: string;
  error?: string;
}

export async function createPartOrder(input: OrderInput): Promise<OrderResult> {
  const { items, contactName, contactPhone, contactEmail, notes } = input;

  if (!items.length || !contactName || !contactPhone || !contactEmail) {
    return { success: false, error: "Заполните все обязательные поля" };
  }

  try {
    const session = await getSession();

    // Fetch parts to get prices and check stock
    const partIds = items.map((i) => i.partId);
    const parts = await db.part.findMany({ where: { id: { in: partIds } } });

    const partMap = new Map(parts.map((p: Record<string, unknown>) => [p.id as string, p]));

    let total = 0;
    const orderItems: Array<{ partId: string; quantity: number; unitPrice: number }> = [];

    for (const item of items) {
      const part = partMap.get(item.partId);
      if (!part) return { success: false, error: `Запчасть не найдена` };

      const price = part.price as number;
      const stock = part.quantity as number;

      if (stock < item.quantity) {
        return { success: false, error: `${part.name as string}: недостаточно на складе (${stock} шт.)` };
      }

      total += price * item.quantity;
      orderItems.push({ partId: item.partId, quantity: item.quantity, unitPrice: price });
    }

    // Create order + decrement stock in transaction
    const order = await db.$transaction(async (tx) => {
      const created = await tx.partOrder.create({
        data: {
          userId: session?.id ?? null,
          total,
          contactName,
          contactPhone: normalizePhone(contactPhone),
          contactEmail,
          notes: notes || null,
          items: { create: orderItems },
        },
      });

      // Decrement stock
      for (const item of orderItems) {
        await tx.part.update({
          where: { id: item.partId },
          data: { quantity: { decrement: item.quantity } },
        });
      }

      return created;
    });

    return { success: true, orderId: (order as Record<string, unknown>).id as string };
  } catch (err) {
    console.error("Part order error:", err);
    return { success: false, error: "Произошла ошибка. Попробуйте позже." };
  }
}
