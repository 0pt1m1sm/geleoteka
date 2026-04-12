"use server";

import { redirect } from "next/navigation";
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
  supplierId: string;
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

/**
 * Distribute totalCost across active founders using their sharePercent.
 * Uses floor for all-but-last to avoid rounding errors — last founder gets remainder.
 * Returns array of { founderId, amount, sharePercent }.
 */
function distributeCost(
  totalCost: number,
  founders: Array<{ id: string; sharePercent: number }>
): Array<{ founderId: string; amount: number; sharePercent: number }> {
  if (founders.length === 0 || totalCost === 0) return [];

  const result = founders.map((f) => ({
    founderId: f.id,
    amount: Math.floor((totalCost * f.sharePercent) / 100),
    sharePercent: f.sharePercent,
  }));

  // Give remainder to last founder
  const distributed = result.reduce((sum, r) => sum + r.amount, 0);
  const remainder = totalCost - distributed;
  if (remainder !== 0 && result.length > 0) {
    result[result.length - 1].amount += remainder;
  }

  return result;
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

    // Get active founders for cost split
    const founders = await db.founder.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, sharePercent: true },
    });

    const contributions = distributeCost(totalCost, founders);

    const order = await db.$transaction(async (tx) => {
      const created = await tx.supplierOrder.create({
        data: {
          supplierId: input.supplierId,
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
          contributions: {
            create: contributions.map((c) => ({
              founderId: c.founderId,
              amount: c.amount,
              sharePercent: c.sharePercent,
            })),
          },
        },
      });

      return created;
    });

    return { success: true, orderId: (order as Record<string, unknown>).id as string };
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

export async function markContributionPaid(
  contributionId: string,
  isPaid: boolean
): Promise<void> {
  await requireRole(["ADMIN", "MANAGER"]);

  await db.founderContribution.update({
    where: { id: contributionId },
    data: {
      isPaid,
      paidAt: isPaid ? new Date() : null,
    },
  });
}

export async function deleteSupplierOrder(orderId: string): Promise<void> {
  await requireRole(["ADMIN"]);
  await db.supplierOrder.delete({ where: { id: orderId } });
}
