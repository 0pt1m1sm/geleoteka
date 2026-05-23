"use server";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { lookupByCode } from "@/lib/wms/public";
import { TENANT_KEY, actorId } from "@/lib/wms-host";
import { applyReceive, isReceivingStatus, type ReceiveResult } from "@/lib/warehouse/receive";
import { wmsErrorMessage } from "@/lib/warehouse/wms-error-message";

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

  // RECEIVED / PARTIALLY_RECEIVED are owned exclusively by receiving (receiveLine):
  // they are set automatically as lines are received and must NOT be settable by
  // hand — scan-receive is the only path that raises stock.
  if (isReceivingStatus(newStatus)) return;

  await db.supplierOrder.update({
    where: { id: orderId },
    data: {
      status: newStatus as
        | "DRAFT"
        | "ORDERED"
        | "IN_TRANSIT"
        | "CUSTOMS"
        | "COMPLETED"
        | "CANCELLED",
    },
  });
}

/**
 * Receive `qty` of a PART line incrementally. `expectedReceived` is the
 * `receivedQuantity` the caller last saw — the optimistic-concurrency token that
 * makes a stale/replayed/concurrent submit fail closed (`{ stale: true }`). With
 * a non-blank `location` the received delta is also put away into that bin,
 * atomically with the RECEIPT. Admin/manager only.
 */
export async function receiveLine(
  orderId: string,
  lineId: string,
  qty: number,
  expectedReceived: number,
  location?: string
): Promise<ReceiveResult> {
  const session = await requireRole(["ADMIN", "MANAGER"]);
  if (!Number.isInteger(qty) || qty <= 0) return { error: "Количество должно быть положительным" };
  if (!Number.isInteger(expectedReceived) || expectedReceived < 0) {
    return { error: "Некорректное состояние позиции" };
  }
  try {
    return await db.$transaction((tx) =>
      applyReceive(tx, { orderId, lineId, qty, expectedReceived, location, actorId: actorId(session) })
    );
  } catch (e) {
    const msg = wmsErrorMessage(e);
    if (msg) return { error: msg };
    throw e; // genuine DB error — surface it, don't mask
  }
}

/**
 * Resolve a scanned code (barcode/gtin via the WMS core, else article via the
 * host catalog) to a PART line on this order, then receive `qty` of it. Passes
 * the line's current `receivedQuantity` as `expectedReceived`.
 */
export async function scanReceiveLine(
  orderId: string,
  code: string,
  qty: number = 1,
  location?: string
): Promise<ReceiveResult & { matchedLineId?: string }> {
  await requireRole(["ADMIN", "MANAGER"]);
  const trimmed = (code ?? "").trim();
  if (!trimmed) return { error: "Пустой код" };
  if (!Number.isInteger(qty) || qty <= 0) return { error: "Количество должно быть положительным" };

  // Resolve code → itemId, mirroring app/api/stock/lookup/route.ts.
  const view = await lookupByCode(db, trimmed, TENANT_KEY);
  let itemId = view?.itemId ?? null;
  if (!itemId) {
    const byArticle = (await db.part.findFirst({
      where: { article: trimmed, isActive: true },
      select: { id: true },
    })) as { id: string } | null;
    itemId = byArticle?.id ?? null;
  }
  if (!itemId) return { error: "Код не найден" };

  const lines = (await db.supplierOrderItem.findMany({
    where: { orderId, type: "PART", partId: itemId },
    select: { id: true, quantity: true, receivedQuantity: true },
  })) as Array<{ id: string; quantity: number; receivedQuantity: number }>;
  if (lines.length === 0) return { error: "Эта позиция не в заказе" };

  const target = lines.find((l) => l.receivedQuantity < l.quantity) ?? lines[0];
  const res = await receiveLine(orderId, target.id, qty, target.receivedQuantity, location);
  return { ...res, matchedLineId: target.id };
}

