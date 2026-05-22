"use server";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordMovement } from "@/lib/wms/public";
import { TENANT_KEY, actorId } from "@/lib/wms-host";

interface OrderItemInput {
  type: "PART" | "CUSTOM" | "FEE" | "SERVICE";
  partId?: string | null;
  description: string;
  quantity: number;
  unitCost: number;
}

interface CreateOrderInput {
  supplierId: string; // User.id where isSupplier=true
  orderNumber?: string;
  orderDate: string;
  items: OrderItemInput[];
  shippingCost: number;
  customsCost: number;
  sellingPrice: number;
  trackingNumber?: string;
  estimatedArrival?: string;
  notes?: string;
}

interface OrderResult {
  success: boolean;
  orderId?: string;
  error?: string;
}

export async function createSupplierOrder(input: CreateOrderInput): Promise<OrderResult> {
  await requireRole(["ADMIN", "MANAGER"]);

  if (!input.supplierId || !input.orderDate || input.items.length === 0) {
    return { success: false, error: "Поставщик, дата и позиции обязательны" };
  }

  try {
    const itemsCost = input.items.reduce((sum, i) => sum + i.unitCost * i.quantity, 0);
    const totalCost = itemsCost + (input.shippingCost || 0) + (input.customsCost || 0);
    const estimatedProfit = (input.sellingPrice || 0) - totalCost;

    const order = await db.supplierOrder.create({
      data: {
        userId: input.supplierId,
        orderNumber: input.orderNumber || null,
        orderDate: new Date(input.orderDate),
        itemsCost,
        shippingCost: input.shippingCost || 0,
        customsCost: input.customsCost || 0,
        totalCost,
        sellingPrice: input.sellingPrice || 0,
        estimatedProfit,
        trackingNumber: input.trackingNumber || null,
        estimatedArrival: input.estimatedArrival ? new Date(input.estimatedArrival) : null,
        notes: input.notes || null,
        items: {
          create: input.items.map((i) => ({
            type: i.type,
            partId: i.partId || null,
            description: i.description,
            quantity: i.quantity,
            unitCost: i.unitCost,
            totalCost: i.unitCost * i.quantity,
          })),
        },
      },
    });

    return { success: true, orderId: order.id };
  } catch (err) {
    console.error("Supplier order error:", err);
    return { success: false, error: "Произошла ошибка. Попробуйте позже." };
  }
}

export async function updateSupplierOrderStatus(
  orderId: string,
  newStatus: string
): Promise<void> {
  const session = await requireRole(["ADMIN", "MANAGER"]);

  const updateData: Record<string, unknown> = {
    status: newStatus as
      | "DRAFT"
      | "ORDERED"
      | "IN_TRANSIT"
      | "CUSTOMS"
      | "RECEIVED"
      | "COMPLETED"
      | "CANCELLED",
  };

  // Only fire stock RECEIPTs when transitioning INTO RECEIVED from another
  // status — re-saving RECEIVED is a no-op (also guarded by recordMovement's
  // idempotency key, so a double-fire never double-counts).
  const current = (await db.supplierOrder.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      items: {
        where: { type: "PART", partId: { not: null } },
        select: { id: true, partId: true, quantity: true },
      },
    },
  })) as {
    status: string;
    items: Array<{ id: string; partId: string | null; quantity: number }>;
  } | null;
  if (!current) return;

  const enteringReceived = newStatus === "RECEIVED" && current.status !== "RECEIVED";
  if (newStatus === "RECEIVED") {
    updateData.receivedAt = new Date();
  }

  await db.$transaction(async (tx) => {
    await tx.supplierOrder.update({ where: { id: orderId }, data: updateData });

    if (enteringReceived) {
      for (const item of current.items) {
        if (!item.partId) continue;
        await recordMovement(tx, {
          item: { itemId: item.partId },
          reason: "RECEIPT",
          qty: item.quantity,
          source: { type: "SupplierOrder", id: `${orderId}:${item.id}` },
          actorId: actorId(session),
          tenantKey: TENANT_KEY,
        });
      }
    }
  });
}

