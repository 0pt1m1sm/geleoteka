"use server";

// Scan-to-pack / отгрузка actions (WMS Phase 4b — упаковка). Thin wrappers over
// lib/warehouse/pack; packing is WAREHOUSE_WORKER-allowed (same as scan/pick).
// Every pack/box/ship scan writes exactly one ScanEvent for the audit.
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { actorId, TENANT_KEY } from "@/lib/wms-host";
import { revalidatePath } from "next/cache";
import { wmsErrorMessage } from "@/lib/warehouse/wms-error-message";
import { WmsError, parseScanCode, lookupByCode, recordScanEvent } from "@/lib/wms/public";
import {
  openPackLinesForOrder,
  applyPackLine,
  isFullyPacked,
  packProgress,
  PackError,
  type OpenPackLine,
} from "@/lib/warehouse/pack";

const PACK_ROLES = ["ADMIN", "MANAGER", "WAREHOUSE_WORKER"];

/** Resolve a scanned item code (typed WMS:PART:, barcode/gtin, or article) to a
 *  host partId. Mirrors picking's resolveItemCode. */
async function resolveItemCode(raw: string): Promise<string | null> {
  const parsed = parseScanCode(raw);
  const code = parsed.type === "PART" || parsed.type === "RAW" ? parsed.id : null;
  if (!code) return null;
  const view = await lookupByCode(db, code, TENANT_KEY);
  if (view?.itemId) return view.itemId;
  const byArticle = (await db.part.findFirst({
    where: { article: code },
    select: { id: true },
  })) as { id: string } | null;
  return byArticle?.id ?? null;
}

/** Resolve a scanned location code (typed WMS:LOC: or raw text) to a cell code. */
function resolveLocationCode(raw: string): string | null {
  const parsed = parseScanCode(raw);
  if (parsed.type === "LOC" || parsed.type === "RAW") return parsed.id;
  return null;
}

export interface PackOrderSummary {
  orderId: string;
  orderNumber: string | null;
  contactName: string;
  packed: number;
  required: number;
}

/** Customer part-orders awaiting fulfillment (PROCESSING), with pack progress.
 *  packProgress runs per order (2 reads each) — parallelised across the active
 *  PROCESSING queue. */
export async function listOrdersNeedingPacking(): Promise<PackOrderSummary[]> {
  await requireRole(PACK_ROLES);
  const orders = (await db.partShipment.findMany({
    where: { status: "PROCESSING" },
    select: { id: true, orderNumber: true, contactName: true },
    orderBy: { createdAt: "asc" },
  })) as Array<{ id: string; orderNumber: string | null; contactName: string }>;

  return Promise.all(
    orders.map(async (o) => {
      const prog = await packProgress(db, o.id);
      return {
        orderId: o.id,
        orderNumber: o.orderNumber,
        contactName: o.contactName,
        packed: prog.packed,
        required: prog.required,
      };
    }),
  );
}

/** Pack progress for one order — drives the /admin/orders cross-link. */
export async function getPackProgress(orderId: string): Promise<{ packed: number; required: number }> {
  await requireRole(PACK_ROLES);
  return packProgress(db, orderId);
}

/** Open (un-packed) lines for one order — drives the pack sheet. */
export async function getOpenPackLines(orderId: string): Promise<OpenPackLine[]> {
  await requireRole(PACK_ROLES);
  return openPackLinesForOrder(db, orderId);
}

export interface PackResult {
  error: string | null;
  requiredQty?: number;
}

/**
 * Pack one open line: the worker scanned a bin and a part for the selected line.
 * Validates the part matches the line (WRONG_ITEM) and the bin holds the full
 * required qty (INSUFFICIENT_BIN), then consumes it bin-aware. Writes exactly one
 * ScanEvent for the attempt (the part scan is the audited code).
 */
export async function packOrderLine(
  orderId: string,
  lineKey: string,
  rawPartCode: string,
  rawLocationCode: string,
): Promise<PackResult> {
  const session = await requireRole(PACK_ROLES);
  const parsedPart = parseScanCode(rawPartCode);

  const audit = (result: "SUCCESS" | "REJECTED" | "ERROR", errorCode: string | null): Promise<void> =>
    recordScanEvent(db, {
      userId: session.id,
      action: "pack",
      rawCode: parsedPart.raw,
      parsedObjectType: parsedPart.type,
      parsedObjectId: "id" in parsedPart ? parsedPart.id : null,
      result,
      errorCode,
      tenantKey: TENANT_KEY,
    });

  const partId = await resolveItemCode(rawPartCode);
  if (!partId) {
    await audit("REJECTED", "UNKNOWN_CODE");
    return { error: "Запчасть не распознана" };
  }
  const location = resolveLocationCode(rawLocationCode);
  if (!location) {
    await audit("REJECTED", "UNKNOWN_CODE");
    return { error: "Укажите ячейку" };
  }

  try {
    const res = await db.$transaction((tx) =>
      applyPackLine(tx, { orderId, lineKey, partId, location, actorId: actorId(session) }),
    );
    await audit("SUCCESS", null);
    revalidatePath(`/admin/warehouse/packing/${orderId}`);
    revalidatePath("/admin/warehouse/packing");
    revalidatePath("/admin/orders");
    return { error: null, requiredQty: res.requiredQty };
  } catch (e) {
    if (e instanceof PackError) {
      await audit("REJECTED", e.code);
      return { error: e.message };
    }
    const mapped = e instanceof WmsError ? wmsErrorMessage(e) : null;
    if (e instanceof WmsError && mapped) {
      await audit("REJECTED", e.code);
      return { error: mapped };
    }
    await audit("ERROR", "INTERNAL");
    throw e;
  }
}

/** Record a parcel (box) scan for the audit. Single-box model: there is no
 *  stored box→line mapping, so this only writes a ScanEvent (the "scan parcel"
 *  step of the pack flow). */
export async function recordPackBoxScan(orderId: string, rawBoxCode: string): Promise<{ error: string | null }> {
  const session = await requireRole(PACK_ROLES);
  const parsed = parseScanCode(rawBoxCode);
  const id = "id" in parsed ? parsed.id : null;
  if (!id) {
    await recordScanEvent(db, {
      userId: session.id,
      action: "pack",
      rawCode: parsed.raw,
      parsedObjectType: parsed.type,
      parsedObjectId: null,
      result: "REJECTED",
      errorCode: "UNKNOWN_CODE",
      tenantKey: TENANT_KEY,
    });
    return { error: "Короб не распознан" };
  }
  await recordScanEvent(db, {
    userId: session.id,
    action: "pack",
    rawCode: parsed.raw,
    parsedObjectType: "BOX",
    parsedObjectId: id,
    result: "SUCCESS",
    errorCode: null,
    tenantKey: TENANT_KEY,
  });
  return { error: null };
}

const NOT_PACKED = "NOT_PACKED";

/**
 * Confirm shipment: advance PROCESSING → SHIPPED once every required line is
 * packed. The full-packed gate is re-checked INSIDE the transaction (TOCTOU-safe)
 * before writing the status. No consume here — the gate guarantees all lines are
 * already consumed (retail at sale, CRM at pack), so the dispatch backstop would
 * be a no-op. Notifies the customer like updatePartOrderStatus.
 */
export async function shipPackedOrder(orderId: string): Promise<{ error: string | null }> {
  await requireRole(PACK_ROLES);

  // Cheap pre-check for a friendly message in the common "still open" case.
  if (!(await isFullyPacked(db, orderId))) {
    return { error: "Не все позиции упакованы" };
  }

  try {
    await db.$transaction(async (tx) => {
      if (!(await isFullyPacked(tx, orderId))) throw new Error(NOT_PACKED);
      const cur = (await tx.partShipment.findUnique({
        where: { id: orderId },
        select: { status: true },
      })) as { status: string } | null;
      if (!cur || cur.status !== "PROCESSING") throw new Error(NOT_PACKED);
      await tx.partShipment.update({ where: { id: orderId }, data: { status: "SHIPPED" } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === NOT_PACKED) {
      return { error: "Не все позиции упакованы" };
    }
    throw e;
  }

  // Notify the customer (mirror updatePartOrderStatus's SHIPPED notification).
  const order = (await db.partShipment.findUnique({
    where: { id: orderId },
    select: { userId: true },
  })) as { userId: string | null } | null;
  if (order?.userId) {
    await db.notification.create({
      data: {
        userId: order.userId,
        type: "STATUS_CHANGE",
        message: "Статус вашего заказа запчастей изменён: Отправлен",
        metadata: { orderId },
      },
    });
  }

  revalidatePath(`/admin/warehouse/packing/${orderId}`);
  revalidatePath("/admin/warehouse/packing");
  revalidatePath("/admin/orders");
  return { error: null };
}
