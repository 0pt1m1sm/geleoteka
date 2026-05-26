"use server";

// Warehouse stock actions: manual on-hand adjustment + multi-bin placement.
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { actorId, TENANT_KEY, STAGING_LOCATION } from "@/lib/wms-host";
import { resolveWarehouseId } from "@/app/actions/warehouses";
import { applyAdjustment } from "@/lib/warehouse/adjust";
import { wmsErrorMessage } from "@/lib/warehouse/wms-error-message";
import type { ReceiveResult } from "@/lib/warehouse/receive";
import {
  applyScanReceiveOrderLine,
  applyBlindReceive,
  openOrderLinesForPart,
  type OpenOrderLine,
} from "@/lib/warehouse/scan-receive";
import {
  placeStock,
  transferStock,
  removeFromBin,
  binsForItem,
  itemsInLocation,
  setLocationBlocked,
  createLocation,
  renameLocation,
  deleteLocation,
  listLocationsWithOnHand,
  type ItemPlacement,
  type WmsLocation,
} from "@/lib/wms/public";

interface PlacementResult {
  error: string | null;
  placement?: ItemPlacement;
}

/**
 * Set a part's on-hand to an absolute `newQuantity` (manual correction).
 * Admin/manager only. Writes an audited ADJUSTMENT; rolls back if the result
 * would be negative or below reserved. Returns the updated counters.
 */
export async function adjustStock(
  partId: string,
  newQuantity: number,
  note?: string,
  idempotencyKey?: string,
  wh?: string,
): Promise<{ error: string | null; quantity?: number; available?: number }> {
  const session = await requireRole(["ADMIN", "MANAGER", "WAREHOUSE_WORKER"]);

  if (!Number.isInteger(newQuantity) || newQuantity < 0) {
    return { error: "Количество должно быть целым неотрицательным числом" };
  }

  const warehouseId = await resolveWarehouseId(wh);
  try {
    const result = await db.$transaction((tx) =>
      applyAdjustment(tx, partId, newQuantity, actorId(session), note, idempotencyKey, warehouseId),
    );
    return { error: null, quantity: result.quantity, available: result.available };
  } catch (e) {
    if (e instanceof Error && e.message === "PLACED_EXCEEDS_ONHAND") {
      return { error: "Остаток нельзя сделать меньше, чем уже размещено в ячейках — скорректируйте количество в ячейке" };
    }
    if (e instanceof Error && e.message === "NEGATIVE_ON_HAND") {
      return { error: "Остаток нельзя сделать отрицательным" };
    }
    const msg = wmsErrorMessage(e); // DUPLICATE_OPERATION / IDEMPOTENCY_KEY_REUSED
    if (msg) return { error: msg };
    throw e; // unexpected (DB error etc.) — surface it, don't mask as a vague message
  }
}

/** Read a part's bin placement (bins + unplaced + reconcile flag). */
export async function getPlacement(partId: string, wh?: string): Promise<PlacementResult> {
  await requireRole(["ADMIN", "MANAGER", "WAREHOUSE_WORKER"]);
  const placement = await binsForItem(db, partId, await resolveWarehouseId(wh), TENANT_KEY);
  return { error: null, placement };
}

interface LocationItem {
  partId: string;
  name: string;
  article: string;
  quantity: number;
}

/** List all warehouse locations for the block/unblock admin surface.
 *  Cell configuration is admin/manager only (PRD §7) — NOT warehouse_worker. */
export async function listLocationsAction(
  wh?: string,
): Promise<{ locations: Array<WmsLocation & { onHand: number }> }> {
  await requireRole(["ADMIN", "MANAGER"]);
  const locations = await listLocationsWithOnHand(db, await resolveWarehouseId(wh), TENANT_KEY);
  return { locations };
}

const CELL_RE = /^[A-Z0-9-]{1,32}$/;

/** Expand a cell spec into codes: "A-1-1" → [A-1-1]; "A-1-1..A-3-4" → the
 *  cartesian product over the numeric segments that differ. Returns an error
 *  string for a malformed/oversized range. */
function expandCellSpec(spec: string): string[] | { error: string } {
  const [a, b] = spec.split("..").map((s) => s.trim().toUpperCase());
  if (!a) return { error: "Укажите код или диапазон ячеек" };
  if (!b) return [a];
  const as = a.split("-");
  const bs = b.split("-");
  if (as.length !== bs.length) return { error: "Диапазон: коды должны иметь одинаковую структуру" };
  const dims: string[][] = [];
  for (let i = 0; i < as.length; i++) {
    if (as[i] === bs[i]) {
      dims.push([as[i]]);
    } else if (/^\d+$/.test(as[i]) && /^\d+$/.test(bs[i])) {
      const lo = Math.min(Number(as[i]), Number(bs[i]));
      const hi = Math.max(Number(as[i]), Number(bs[i]));
      if (hi - lo > 500) return { error: "Слишком большой диапазон" };
      const arr: string[] = [];
      for (let n = lo; n <= hi; n++) arr.push(String(n));
      dims.push(arr);
    } else {
      return { error: `Сегмент ${i + 1}: перебор возможен только по числам` };
    }
  }
  let acc: string[] = [""];
  for (const d of dims) {
    const next: string[] = [];
    for (const p of acc) for (const v of d) next.push(p ? `${p}-${v}` : v);
    acc = next;
    if (acc.length > 1000) return { error: "Слишком много ячеек (макс. 1000)" };
  }
  return acc;
}

/** Create one or more cells (admin/manager). Accepts a single code or a range
 *  like "A-1-1..A-3-4". Idempotent — existing cells are left as-is. */
export async function createLocationsAction(
  spec: string,
  wh?: string,
): Promise<{ error: string | null; created?: number; codes?: string[] }> {
  await requireRole(["ADMIN", "MANAGER"]);
  const expanded = expandCellSpec((spec ?? "").trim());
  if (!Array.isArray(expanded)) return { error: expanded.error };
  for (const c of expanded) if (!CELL_RE.test(c)) return { error: `Некорректный код ячейки: ${c}` };
  const warehouseId = await resolveWarehouseId(wh);
  for (const c of expanded) await createLocation(db, c, warehouseId, TENANT_KEY);
  return { error: null, created: expanded.length, codes: expanded };
}

/** Rename a cell — moves its registry code AND all its bins atomically (admin/manager). */
export async function renameLocationAction(
  from: string,
  to: string,
  wh?: string,
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);
  const t = (to ?? "").trim().toUpperCase();
  if (!from?.trim() || !t) return { error: "Укажите старый и новый код" };
  if (!CELL_RE.test(t)) return { error: "Код: латиница/цифры/дефис, до 32 символов" };
  try {
    await renameLocation(db, from, t, await resolveWarehouseId(wh), TENANT_KEY);
    return { error: null };
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (m === "LOCATION_EXISTS") return { error: "Ячейка с таким кодом уже существует" };
    if (m === "LOCATION_NOT_FOUND") return { error: "Исходная ячейка не найдена" };
    if (m === "INVALID_LOCATION") return { error: "Некорректный код ячейки" };
    throw e;
  }
}

/** Delete a cell — empty cells only (admin/manager). A cell holding stock is
 *  rejected; move or block it first. */
export async function deleteLocationAction(
  code: string,
  wh?: string,
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);
  if (!code?.trim()) return { error: "Укажите ячейку" };
  try {
    await deleteLocation(db, code, await resolveWarehouseId(wh), TENANT_KEY);
    return { error: null };
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (m === "LOCATION_NOT_EMPTY") return { error: "В ячейке есть товар — сначала переместите или спишите его" };
    if (m === "LOCATION_NOT_FOUND") return { error: "Ячейка не найдена" };
    if (m === "INVALID_LOCATION") return { error: "Некорректный код ячейки" };
    throw e;
  }
}

/** Toggle a location's active/blocked flags (admin/manager only). */
export async function setLocationBlockedAction(
  code: string,
  flags: { isActive?: boolean; isBlocked?: boolean },
  wh?: string,
): Promise<{ error: string | null; location?: WmsLocation }> {
  await requireRole(["ADMIN", "MANAGER"]);
  if (!code.trim()) return { error: "Укажите ячейку" };
  const location = await setLocationBlocked(db, code, await resolveWarehouseId(wh), TENANT_KEY, flags);
  return { error: null, location };
}

/** List the items stored in a location (for the location-centric lookup). */
export async function lookupLocation(location: string, wh?: string): Promise<{ items: LocationItem[] }> {
  await requireRole(["ADMIN", "MANAGER", "WAREHOUSE_WORKER"]);
  if (!location.trim()) return { items: [] };
  const rows = await itemsInLocation(db, location, await resolveWarehouseId(wh), TENANT_KEY);
  if (rows.length === 0) return { items: [] };
  const parts = (await db.part.findMany({
    where: { id: { in: rows.map((r) => r.itemId) } },
    select: { id: true, name: true, article: true },
  })) as Array<{ id: string; name: string; article: string }>;
  const byId = new Map(parts.map((p) => [p.id, p]));
  return {
    items: rows.map((r) => ({
      partId: r.itemId,
      name: byId.get(r.itemId)?.name ?? "—",
      article: byId.get(r.itemId)?.article ?? "",
      quantity: r.quantity,
    })),
  };
}

/** Putaway: place unplaced on-hand into a location. */
export async function placeIntoBin(
  partId: string,
  location: string,
  qty: number,
  idempotencyKey?: string,
  wh?: string,
): Promise<PlacementResult> {
  const session = await requireRole(["ADMIN", "MANAGER", "WAREHOUSE_WORKER"]);
  if (!location.trim()) return { error: "Укажите ячейку" };
  if (!Number.isInteger(qty) || qty <= 0) return { error: "Количество должно быть положительным" };
  const warehouseId = await resolveWarehouseId(wh);
  try {
    await db.$transaction(async (tx) =>
      placeStock(tx, { itemId: partId, warehouseId, location, qty, actorId: actorId(session), idempotencyKey, tenantKey: TENANT_KEY }),
    );
  } catch (e) {
    const msg = wmsErrorMessage(e);
    if (msg) return { error: msg };
    throw e;
  }
  return { error: null, placement: await binsForItem(db, partId, warehouseId, TENANT_KEY) };
}

/** Move stock between two locations. */
export async function transferBetweenBins(
  partId: string,
  from: string,
  to: string,
  qty: number,
  idempotencyKey?: string,
  wh?: string,
): Promise<PlacementResult> {
  const session = await requireRole(["ADMIN", "MANAGER", "WAREHOUSE_WORKER"]);
  if (!from.trim() || !to.trim()) return { error: "Укажите обе ячейки" };
  if (!Number.isInteger(qty) || qty <= 0) return { error: "Количество должно быть положительным" };
  const warehouseId = await resolveWarehouseId(wh);
  try {
    await db.$transaction(async (tx) =>
      transferStock(tx, { itemId: partId, warehouseId, from, to, qty, actorId: actorId(session), idempotencyKey, tenantKey: TENANT_KEY }),
    );
  } catch (e) {
    const msg = wmsErrorMessage(e);
    if (msg) return { error: msg };
    throw e;
  }
  return { error: null, placement: await binsForItem(db, partId, warehouseId, TENANT_KEY) };
}

/** Scanner receiving — open, not-fully-received supplier-order PART lines for a
 *  part (the candidates the worker can receive against). */
export async function openOrderLinesForPartAction(
  partId: string,
): Promise<{ lines: OpenOrderLine[] }> {
  await requireRole(["ADMIN", "MANAGER", "WAREHOUSE_WORKER"]);
  return { lines: await openOrderLinesForPart(db, partId) };
}

/** Scanner receipt against an open supplier-order line. Raises on-hand, places
 *  into `location` (default ПРИЁМКА), advances the order. Worker-allowed. */
export async function scanReceiveOrderLine(
  orderId: string,
  lineId: string,
  qty: number,
  expectedReceived: number,
  location: string = STAGING_LOCATION,
  wh?: string,
): Promise<ReceiveResult> {
  const session = await requireRole(["ADMIN", "MANAGER", "WAREHOUSE_WORKER"]);
  if (!Number.isInteger(qty) || qty <= 0) return { error: "Количество должно быть положительным" };
  if (!Number.isInteger(expectedReceived) || expectedReceived < 0) {
    return { error: "Некорректное состояние позиции" };
  }
  const warehouseId = await resolveWarehouseId(wh);
  try {
    return await db.$transaction((tx) =>
      applyScanReceiveOrderLine(tx, { orderId, lineId, qty, expectedReceived, location, actorId: actorId(session), warehouseId }),
    );
  } catch (e) {
    const msg = wmsErrorMessage(e);
    if (msg) return { error: msg };
    throw e;
  }
}

/** Scanner blind receipt for goods with no supplier order (gray import). Raises
 *  on-hand into `location` (default ПРИЁМКА). `idempotencyKey` is required so a
 *  retry never double-counts. Worker-allowed. */
export async function blindReceive(
  partId: string,
  qty: number,
  idempotencyKey: string,
  location: string = STAGING_LOCATION,
  wh?: string,
): Promise<{ error: string | null; quantity?: number }> {
  const session = await requireRole(["ADMIN", "MANAGER", "WAREHOUSE_WORKER"]);
  if (!Number.isInteger(qty) || qty <= 0) return { error: "Количество должно быть положительным" };
  if (!idempotencyKey) return { error: "Отсутствует ключ операции" };
  const warehouseId = await resolveWarehouseId(wh);
  try {
    const r = await db.$transaction((tx) =>
      applyBlindReceive(tx, { partId, qty, location, idempotencyKey, actorId: actorId(session), warehouseId }),
    );
    return { error: null, quantity: r.quantity };
  } catch (e) {
    const msg = wmsErrorMessage(e);
    if (msg) return { error: msg };
    throw e;
  }
}

/** Return stock from a location back to unplaced. */
export async function removeFromBinAction(
  partId: string,
  location: string,
  qty: number,
  idempotencyKey?: string,
  wh?: string,
): Promise<PlacementResult> {
  const session = await requireRole(["ADMIN", "MANAGER", "WAREHOUSE_WORKER"]);
  if (!location.trim()) return { error: "Укажите ячейку" };
  if (!Number.isInteger(qty) || qty <= 0) return { error: "Количество должно быть положительным" };
  const warehouseId = await resolveWarehouseId(wh);
  try {
    await db.$transaction(async (tx) =>
      removeFromBin(tx, { itemId: partId, warehouseId, location, qty, actorId: actorId(session), idempotencyKey, tenantKey: TENANT_KEY }),
    );
  } catch (e) {
    const msg = wmsErrorMessage(e);
    if (msg) return { error: msg };
    throw e;
  }
  return { error: null, placement: await binsForItem(db, partId, warehouseId, TENANT_KEY) };
}
