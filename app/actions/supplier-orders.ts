"use server";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

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
  await requireRole(["ADMIN", "MANAGER"]);

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

  if (newStatus === "RECEIVED") {
    updateData.receivedAt = new Date();
  }

  await db.supplierOrder.update({
    where: { id: orderId },
    data: updateData,
  });
}

export async function deleteSupplierOrder(orderId: string): Promise<void> {
  await requireRole(["ADMIN"]);
  await db.supplierOrder.delete({ where: { id: orderId } });
}
