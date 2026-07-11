"use server";

// Scan-to-pick actions (WMS Phase 4 — отбор). Thin wrappers over lib/warehouse/pick;
// picking is WAREHOUSE_WORKER-allowed (same as scan/putaway/count). Every pick
// attempt writes exactly one ScanEvent (success/rejected) for the audit.
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { actorId, TENANT_KEY } from "@/lib/wms-host";
import { resolveWarehouseId } from "@/app/actions/warehouses";
import { revalidatePath } from "next/cache";
import { wmsErrorMessage } from "@/lib/warehouse/wms-error-message";
import { WmsError, parseScanCode, lookupByCode, recordScanEvent } from "@/lib/wms/public";
import { openPickLinesForOrder, pickedLinesForOrder, applyPickLine, PickError, type OpenPickLine } from "@/lib/warehouse/pick";
import type { DoneConsumeLine } from "@/lib/warehouse/scan-consume";

const PICK_ROLES = ["ADMIN", "MANAGER", "WAREHOUSE_WORKER"];

/** Already-picked lines of an RO — the recap under the pick sheet. */
export async function getPickedLines(repairOrderId: string): Promise<DoneConsumeLine[]> {
  await requireRole(PICK_ROLES);
  return pickedLinesForOrder(db, repairOrderId);
}

/** Resolve a scanned item code (typed WMS:PART:, barcode/gtin, or article) to a
 *  host partId. Mirrors stocktake's resolveItemCode. */
async function resolveItemCode(raw: string, warehouseId: string): Promise<string | null> {
  const parsed = parseScanCode(raw);
  const code = parsed.type === "PART" || parsed.type === "RAW" ? parsed.id : null;
  if (!code) return null;
  const view = await lookupByCode(db, code, warehouseId, TENANT_KEY);
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

export interface PickOrderSummary {
  repairOrderId: string;
  roNumber: string | null;
  customerName: string;
  vehicle: string;
  openCount: number;
}

/** Repair orders (non-terminal) that still have un-picked APPROVED-estimate PART lines.
 *  N+1 by design: openPickLinesForOrder runs per RO. Acceptable at admin scale (a
 *  handful of active ROs). If active-order volume grows, batch the consumed-movement
 *  lookup across all RO ids and resolve estimate lines with a single join. */
export async function listOrdersNeedingPicking(): Promise<PickOrderSummary[]> {
  await requireRole(PICK_ROLES);
  const ros = (await db.repairOrder.findMany({
    where: { status: { in: ["SCHEDULED", "IN_PROGRESS", "READY"] } },
    select: {
      id: true,
      roNumber: true,
      user: { select: { name: true } },
      vehicle: { select: { make: true, model: true } },
    },
    orderBy: { dateTime: "asc" },
  })) as Array<{
    id: string;
    roNumber: string | null;
    user: { name: string } | null;
    vehicle: { make: string; model: string } | null;
  }>;

  const out: PickOrderSummary[] = [];
  for (const ro of ros) {
    const open = await openPickLinesForOrder(db, ro.id);
    if (open.length === 0) continue;
    out.push({
      repairOrderId: ro.id,
      roNumber: ro.roNumber,
      customerName: ro.user?.name ?? "—",
      vehicle: ro.vehicle ? `${ro.vehicle.make} ${ro.vehicle.model}` : "—",
      openCount: open.length,
    });
  }
  return out;
}

/** Open (un-picked) lines for one repair order — drives the pick sheet. */
export async function getOpenPickLines(repairOrderId: string, wh?: string): Promise<OpenPickLine[]> {
  await requireRole(PICK_ROLES);
  return openPickLinesForOrder(db, repairOrderId, await resolveWarehouseId(wh));
}

export interface PickResult {
  error: string | null;
  requiredQty?: number;
}

/**
 * Pick one open line: the worker scanned a bin and a part for the selected line.
 * Validates the part matches the line (WRONG_ITEM) and the bin holds the full
 * required qty (INSUFFICIENT_BIN), then consumes it bin-aware. Writes exactly one
 * ScanEvent for the attempt (the part scan is the audited code).
 */
export async function pickRepairOrderLine(
  repairOrderId: string,
  lineId: string,
  rawPartCode: string,
  rawLocationCode: string,
  wh?: string,
): Promise<PickResult> {
  const session = await requireRole(PICK_ROLES);
  const warehouseId = await resolveWarehouseId(wh);
  const parsedPart = parseScanCode(rawPartCode);

  const audit = (result: "SUCCESS" | "REJECTED" | "ERROR", errorCode: string | null): Promise<void> =>
    recordScanEvent(db, {
      userId: session.id,
      action: "pick",
      rawCode: parsedPart.raw,
      parsedObjectType: parsedPart.type,
      parsedObjectId: "id" in parsedPart ? parsedPart.id : null,
      result,
      errorCode,
      tenantKey: TENANT_KEY,
    });

  const partId = await resolveItemCode(rawPartCode, warehouseId);
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
      applyPickLine(tx, { repairOrderId, lineId, partId, location, actorId: actorId(session), warehouseId }),
    );
    await audit("SUCCESS", null);
    revalidatePath(`/admin/warehouse/picking/${repairOrderId}`);
    revalidatePath("/admin/warehouse/picking");
    return { error: null, requiredQty: res.requiredQty };
  } catch (e) {
    if (e instanceof PickError) {
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
