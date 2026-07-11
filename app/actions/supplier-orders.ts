"use server";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { lookupByCode } from "@/lib/wms/public";
import { TENANT_KEY, actorId, defaultWarehouseId } from "@/lib/wms-host";
import { applyUndoReceive, isReceivingStatus, type ReceiveResult } from "@/lib/warehouse/receive";
import { applyScanReceiveOrderLine } from "@/lib/warehouse/scan-receive";
import { wmsErrorMessage } from "@/lib/warehouse/wms-error-message";
import { isWithinLandedCostBounds, validateOrderLines, costResultWithinBounds, type CustomsMode } from "@/lib/suppliers/landed-cost";
import { resolveLandedCost } from "@/lib/suppliers/resolve-landed-cost";
import { canDeleteOrder, canFullyEditOrder, isOrphanDraftPart } from "@/lib/suppliers/order-lifecycle";

const CUSTOMS_MODES: readonly CustomsMode[] = ["PERCENT_CIF", "CARGO_PER_KG"];

/** A validation failure with a user-facing message, thrown inside the order tx. */
class OrderValidationError extends Error {}

type DbItemType = "PART" | "CUSTOM" | "FEE" | "SERVICE";

interface OrderItemInput {
  // NEW_PART is UI-only: the action creates a draft Part and stores the line as PART.
  type: DbItemType | "NEW_PART";
  partId?: string | null;
  description: string;
  /** For NEW_PART: the new product's catalog article. */
  article?: string;
  quantity: number;
  unitCost: number;
}

interface CreateOrderInput {
  supplierId: string; // User.id where isSupplier=true
  orderNumber?: string;
  orderDate: string;
  items: OrderItemInput[];
  // Landed-cost inputs (structured). The client sends NO ₽ totals and NO auto
  // weight — shipping/customs/total are recomputed server-side, with the auto
  // weight derived from DB Part.weightGrams (see resolveLandedCost).
  manualWeightOverrideGrams?: number | null;
  shippingRateUsdCents?: number | null;
  usdRateKopecks?: number | null;
  customsMode?: CustomsMode;
  customsPercentBps?: number | null;
  cargoRateUsdCents?: number | null;
  /** Deprecated — expected-revenue tracking was removed from the form; kept optional, defaults 0. */
  sellingPrice?: number;
  trackingNumber?: string;
  estimatedArrival?: string;
  notes?: string;
}

interface OrderResult {
  success: boolean;
  orderId?: string;
  error?: string;
}

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

interface ResolvedOrderLine {
  type: DbItemType;
  partId: string | null;
  description: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

/** Pre-transaction validation shared by create and full-edit. Returns a
 *  user-facing error or null. */
function validateOrderInput(input: CreateOrderInput): string | null {
  if (!input.supplierId || !input.orderDate || input.items.length === 0) {
    return "Поставщик, дата и позиции обязательны";
  }
  // Validate NEW_PART lines up front (clear messages before touching the DB).
  for (const i of input.items) {
    if (i.type === "NEW_PART" && (!i.article?.trim() || !i.description?.trim())) {
      return "Новый товар: укажите артикул и название";
    }
  }
  // Server-authoritative line validation — a direct action call (bypassing the
  // form) must not persist a negative quantity / out-of-range amount.
  const lineError = validateOrderLines(input.items);
  if (lineError) return lineError;
  // Landed-cost input validation — reject negatives / out-of-range before any write.
  const customsMode: CustomsMode = input.customsMode ?? "PERCENT_CIF";
  if (!CUSTOMS_MODES.includes(customsMode)) return "Некорректный режим таможни";
  if (
    !isWithinLandedCostBounds({
      manualWeightOverrideGrams: input.manualWeightOverrideGrams,
      shippingRateUsdCents: input.shippingRateUsdCents,
      usdRateKopecks: input.usdRateKopecks,
      customsPercentBps: input.customsPercentBps,
      cargoRateUsdCents: input.cargoRateUsdCents,
    })
  ) {
    return "Некорректные параметры доставки/таможни";
  }
  return null;
}

/**
 * Resolve input lines (a NEW_PART line creates a DRAFT catalog Part — hidden in
 * the shop: isActive=false, price=0 — plus its StockItem, then stores as a PART
 * line) and the server-authoritative landed cost (auto weight derived from DB
 * Part.weightGrams, NOT from the client). Throws OrderValidationError inside
 * the caller's transaction. Shared by create and full-edit.
 */
async function resolveLinesAndCost(
  tx: TxClient,
  input: CreateOrderInput,
): Promise<{ lines: ResolvedOrderLine[]; itemsCost: number; cost: Awaited<ReturnType<typeof resolveLandedCost>> }> {
  const itemsCost = input.items.reduce((sum, i) => sum + i.unitCost * i.quantity, 0);
  const customsMode: CustomsMode = input.customsMode ?? "PERCENT_CIF";

  const lines: ResolvedOrderLine[] = [];
  for (const i of input.items) {
    let type: DbItemType = i.type === "NEW_PART" ? "PART" : i.type;
    let partId = i.partId || null;
    let description = i.description;

    if (i.type === "NEW_PART") {
      const article = i.article!.trim();
      const name = i.description.trim();
      const existing = (await tx.part.findUnique({ where: { article }, select: { id: true } })) as { id: string } | null;
      if (existing) throw new OrderValidationError(`Артикул ${article} уже есть в каталоге — выберите его из списка`);
      const slug = slugify(`${article}-${name}`).slice(0, 80);
      const part = (await tx.part.create({
        data: { slug, article, name, price: 0, isActive: false },
        select: { id: true },
      })) as { id: string };
      await tx.stockItem.create({ data: { partId: part.id, tenantKey: TENANT_KEY, warehouseId: await defaultWarehouseId(tx) } });
      type = "PART";
      partId = part.id;
      description = name;
    }

    lines.push({ type, partId, description, quantity: i.quantity, unitCost: i.unitCost, totalCost: i.unitCost * i.quantity });
  }

  const partLines = lines
    .filter((l) => l.type === "PART" && l.partId)
    .map((l) => ({ partId: l.partId as string, quantity: l.quantity }));
  const cost = await resolveLandedCost(tx, {
    partLines,
    itemsCostRub: itemsCost,
    manualWeightOverrideGrams: input.manualWeightOverrideGrams ?? null,
    shippingRateUsdCents: input.shippingRateUsdCents ?? null,
    usdRateKopecks: input.usdRateKopecks ?? null,
    customsMode,
    customsPercentBps: input.customsPercentBps ?? null,
    cargoRateUsdCents: input.cargoRateUsdCents ?? null,
  });
  // Guard the DB-derived weight + computed ₽ totals against the Int4 / weight
  // ceilings (a large catalog weight × quantity can exceed limits even after
  // the per-input bounds check passed).
  if (!costResultWithinBounds(cost)) {
    throw new OrderValidationError("Итоговая стоимость или вес вне допустимых пределов");
  }
  return { lines, itemsCost, cost };
}

/** The landed-cost + meta columns shared by create and full-edit. */
function orderDataFields(
  input: CreateOrderInput,
  itemsCost: number,
  cost: Awaited<ReturnType<typeof resolveLandedCost>>,
) {
  return {
    userId: input.supplierId,
    orderNumber: input.orderNumber || null,
    orderDate: new Date(input.orderDate),
    itemsCost,
    shippingCost: cost.shippingCost,
    customsCost: cost.customsCost,
    totalCost: cost.totalCost,
    shippingWeightGrams: cost.shippingWeightGrams,
    manualWeightOverrideGrams: input.manualWeightOverrideGrams ?? null,
    shippingRateUsdCents: input.shippingRateUsdCents ?? null,
    usdRateKopecks: input.usdRateKopecks ?? null,
    customsMode: input.customsMode ?? "PERCENT_CIF",
    customsPercentBps: input.customsPercentBps ?? null,
    cargoRateUsdCents: input.cargoRateUsdCents ?? null,
    trackingNumber: input.trackingNumber || null,
    estimatedArrival: input.estimatedArrival ? new Date(input.estimatedArrival) : null,
    notes: input.notes || null,
  };
}

/**
 * GC catalog drafts created by NEW_PART lines that just lost their last
 * reference (critic m1). Conservative: delete only untouched drafts
 * (isOrphanDraftPart) — accumulation is acceptable, a wrong delete is not.
 * Runs inside the caller's transaction; StockItem/PartTrim cascade.
 */
async function gcOrphanDraftParts(tx: TxClient, partIds: Array<string | null>): Promise<void> {
  for (const partId of partIds) {
    if (!partId) continue;
    const part = (await tx.part.findUnique({
      where: { id: partId },
      select: { isActive: true, price: true },
    })) as { isActive: boolean; price: number } | null;
    if (!part) continue;
    const [movementCount, placedAgg, otherSupplierLineCount, estimateLineCount, partLineCount, partOrderItemCount] =
      await Promise.all([
        tx.stockMovement.count({ where: { item: { partId } } }),
        tx.stockBin.aggregate({ where: { item: { partId } }, _sum: { quantity: true } }),
        tx.supplierOrderItem.count({ where: { partId } }),
        tx.estimateLine.count({ where: { partId } }),
        tx.partLine.count({ where: { partId } }),
        tx.partOrderItem.count({ where: { partId } }),
      ]);
    const orphan = isOrphanDraftPart({
      isActive: part.isActive,
      price: part.price,
      movementCount: movementCount as number,
      placedQty: ((placedAgg as { _sum: { quantity: number | null } })._sum.quantity ?? 0) as number,
      otherSupplierLineCount: otherSupplierLineCount as number,
      estimateLineCount: estimateLineCount as number,
      partLineCount: partLineCount as number,
      partOrderItemCount: partOrderItemCount as number,
    });
    if (orphan) await tx.part.delete({ where: { id: partId } });
  }
}

export async function createSupplierOrder(input: CreateOrderInput): Promise<OrderResult> {
  await requireRole(["ADMIN", "MANAGER"]);

  const inputError = validateOrderInput(input);
  if (inputError) return { success: false, error: inputError };

  try {
    const orderId = await db.$transaction(async (tx) => {
      const { lines, itemsCost, cost } = await resolveLinesAndCost(tx, input);
      const estimatedProfit = (input.sellingPrice || 0) - cost.totalCost;

      const order = (await tx.supplierOrder.create({
        data: {
          ...orderDataFields(input, itemsCost, cost),
          sellingPrice: input.sellingPrice || 0,
          estimatedProfit,
          items: { create: lines },
        },
        select: { id: true },
      })) as { id: string };
      return order.id;
    });

    return { success: true, orderId };
  } catch (err) {
    if (err instanceof OrderValidationError) return { success: false, error: err.message };
    if (err && typeof err === "object" && (err as { code?: string }).code === "P2002") {
      return { success: false, error: "Товар с таким артикулом или slug уже существует" };
    }
    console.error("Supplier order error:", err);
    return { success: false, error: "Произошла ошибка. Попробуйте позже." };
  }
}

/**
 * Full edit of a DRAFT order: wholesale line replace + complete server-side
 * landed-cost recompute, one transaction. Guards: DRAFT-only AND zero receipts
 * on every line (belt-and-suspenders — a DRAFT cannot be received since the
 * Story-2 OPEN guard, but a legacy row might carry receipts). Draft catalog
 * parts orphaned by removed NEW_PART lines are garbage-collected.
 */
export async function updateSupplierOrder(orderId: string, input: CreateOrderInput): Promise<OrderResult> {
  await requireRole(["ADMIN", "MANAGER"]);

  const inputError = validateOrderInput(input);
  if (inputError) return { success: false, error: inputError };

  try {
    await db.$transaction(async (tx) => {
      const order = (await tx.supplierOrder.findUnique({
        where: { id: orderId },
        select: {
          status: true,
          sellingPrice: true,
          items: { select: { partId: true, receivedQuantity: true } },
        },
      })) as {
        status: string;
        sellingPrice: number;
        items: Array<{ partId: string | null; receivedQuantity: number }>;
      } | null;
      if (!order) throw new OrderValidationError("Заказ не найден");
      if (!canFullyEditOrder(order.status)) throw new OrderValidationError("Редактировать можно только черновик");
      if (!order.items.every((i) => i.receivedQuantity === 0)) {
        throw new OrderValidationError("По заказу уже были приёмки — редактирование строк недоступно");
      }

      const removedPartIds = order.items.map((i) => i.partId);
      await tx.supplierOrderItem.deleteMany({ where: { orderId } });

      const { lines, itemsCost, cost } = await resolveLinesAndCost(tx, input);
      await tx.supplierOrder.update({
        where: { id: orderId },
        data: {
          ...orderDataFields(input, itemsCost, cost),
          estimatedProfit: (order.sellingPrice || 0) - cost.totalCost,
          items: { create: lines },
        },
      });

      const keptIds = new Set(lines.map((l) => l.partId).filter(Boolean));
      await gcOrphanDraftParts(tx, removedPartIds.filter((id) => !keptIds.has(id)));
    });

    return { success: true, orderId };
  } catch (err) {
    if (err instanceof OrderValidationError) return { success: false, error: err.message };
    if (err && typeof err === "object" && (err as { code?: string }).code === "P2002") {
      return { success: false, error: "Товар с таким артикулом или slug уже существует" };
    }
    console.error("Supplier order update error:", err);
    return { success: false, error: "Произошла ошибка. Попробуйте позже." };
  }
}

/**
 * Meta-only edit (orderNumber / tracking / ETA / notes) — allowed while the
 * order is alive (everything except COMPLETED/CANCELLED). Never touches lines,
 * costs or status.
 */
export async function updateSupplierOrderMeta(
  orderId: string,
  meta: { orderNumber?: string; trackingNumber?: string; estimatedArrival?: string; notes?: string }
): Promise<OrderResult> {
  await requireRole(["ADMIN", "MANAGER"]);
  try {
    // Atomic guard: the status condition lives in the WHERE (canEditOrderMeta's
    // predicate inlined), so a concurrent transition to a terminal status can't
    // slip between a read and a write (review LOW: TOCTOU).
    const res = (await db.supplierOrder.updateMany({
      where: { id: orderId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
      data: {
        orderNumber: meta.orderNumber?.trim() || null,
        trackingNumber: meta.trackingNumber?.trim() || null,
        estimatedArrival: meta.estimatedArrival ? new Date(meta.estimatedArrival) : null,
        notes: meta.notes?.trim() || null,
      },
    })) as { count: number };
    if (res.count === 0) return { success: false, error: "Заказ не найден или закрыт для изменений" };
    return { success: true, orderId };
  } catch (err) {
    console.error("Supplier order meta update error:", err);
    return { success: false, error: "Произошла ошибка. Попробуйте позже." };
  }
}

/**
 * Delete a DRAFT order (confirm-gated in the UI). Guards: DRAFT-only + zero
 * receipts on every line. Lines cascade; orphaned NEW_PART drafts are GC'd.
 */
export async function deleteSupplierOrder(orderId: string): Promise<OrderResult> {
  await requireRole(["ADMIN", "MANAGER"]);
  try {
    await db.$transaction(async (tx) => {
      const order = (await tx.supplierOrder.findUnique({
        where: { id: orderId },
        select: { status: true, items: { select: { partId: true, receivedQuantity: true } } },
      })) as { status: string; items: Array<{ partId: string | null; receivedQuantity: number }> } | null;
      if (!order) throw new OrderValidationError("Заказ не найден");
      if (!canDeleteOrder(order.status, order.items)) {
        throw new OrderValidationError("Удалить можно только черновик без приёмок");
      }
      const partIds = order.items.map((i) => i.partId);
      await tx.supplierOrder.delete({ where: { id: orderId } });
      await gcOrphanDraftParts(tx, partIds);
    });
    return { success: true };
  } catch (err) {
    if (err instanceof OrderValidationError) return { success: false, error: err.message };
    console.error("Supplier order delete error:", err);
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
 * makes a stale/replayed/concurrent submit fail closed (`{ stale: true }`).
 * Same semantics as the scanner path (applyScanReceiveOrderLine): only OPEN
 * orders are receivable (DRAFT must be placed first), and a blank cell stages
 * into ПРИЁМКА — every received unit lands in a bin. Receiving is the
 * storekeeper's job: WAREHOUSE_WORKER is allowed alongside admin/manager
 * (mirrors scanReceiveOrderLine in app/actions/warehouse.ts).
 */
export async function receiveLine(
  orderId: string,
  lineId: string,
  qty: number,
  expectedReceived: number,
  location?: string
): Promise<ReceiveResult> {
  const session = await requireRole(["ADMIN", "MANAGER", "WAREHOUSE_WORKER"]);
  if (!Number.isInteger(qty) || qty <= 0) return { error: "Количество должно быть положительным" };
  if (!Number.isInteger(expectedReceived) || expectedReceived < 0) {
    return { error: "Некорректное состояние позиции" };
  }
  try {
    return await db.$transaction((tx) =>
      applyScanReceiveOrderLine(tx, {
        orderId,
        lineId,
        qty,
        expectedReceived,
        location: location ?? "",
        actorId: actorId(session),
      })
    );
  } catch (e) {
    const msg = wmsErrorMessage(e);
    if (msg) return { error: msg };
    throw e; // genuine DB error — surface it, don't mask
  }
}

/**
 * Сторно приёмки: reverse `qty` of an erroneously received PART line —
 * receivedQuantity decrement (CAS on `expectedReceived`), stock drop via a
 * RECEIPT_REVERSAL movement and optional bin removal, one atomic transaction.
 * Deliberately NOT available to WAREHOUSE_WORKER — undo is a manager decision.
 */
export async function undoReceiveLine(
  orderId: string,
  lineId: string,
  qty: number,
  expectedReceived: number,
  location?: string
): Promise<ReceiveResult> {
  const session = await requireRole(["ADMIN", "MANAGER"]);
  if (!Number.isInteger(qty) || qty <= 0) return { error: "Количество должно быть положительным" };
  if (!Number.isInteger(expectedReceived) || expectedReceived <= 0) {
    return { error: "Некорректное состояние позиции" };
  }
  try {
    return await db.$transaction((tx) =>
      applyUndoReceive(tx, { orderId, lineId, qty, expectedReceived, location, actorId: actorId(session) })
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
  await requireRole(["ADMIN", "MANAGER", "WAREHOUSE_WORKER"]);
  const trimmed = (code ?? "").trim();
  if (!trimmed) return { error: "Пустой код" };
  if (!Number.isInteger(qty) || qty <= 0) return { error: "Количество должно быть положительным" };

  // Resolve code → itemId, mirroring app/api/stock/lookup/route.ts.
  const view = await lookupByCode(db, trimmed, await defaultWarehouseId(db), TENANT_KEY);
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

