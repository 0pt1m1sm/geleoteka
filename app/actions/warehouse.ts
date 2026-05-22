"use server";

// Warehouse stock actions: manual on-hand adjustment + multi-bin placement.
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { actorId, TENANT_KEY } from "@/lib/wms-host";
import { applyAdjustment } from "@/lib/warehouse/adjust";
import {
  placeStock,
  transferStock,
  removeFromBin,
  binsForItem,
  itemsInLocation,
  WmsError,
  type ItemPlacement,
} from "@/lib/wms/public";

interface PlacementResult {
  error: string | null;
  placement?: ItemPlacement;
}

/** Map a WmsError to a Russian message; returns null for non-WmsErrors. */
function wmsErrorMessage(e: unknown): string | null {
  if (!(e instanceof WmsError)) return null;
  switch (e.code) {
    case "INSUFFICIENT_UNPLACED":
      return "Недостаточно нераспределённого остатка";
    case "INSUFFICIENT_BIN":
      return "В ячейке недостаточно остатка";
    case "SAME_LOCATION":
      return "Ячейки отправления и назначения совпадают";
    case "INVALID_QTY":
      return "Количество должно быть положительным";
    default:
      return "Не удалось выполнить операцию";
  }
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
): Promise<{ error: string | null; quantity?: number; available?: number }> {
  const session = await requireRole(["ADMIN", "MANAGER"]);

  if (!Number.isInteger(newQuantity) || newQuantity < 0) {
    return { error: "Количество должно быть целым неотрицательным числом" };
  }

  try {
    const result = await db.$transaction((tx) =>
      applyAdjustment(tx, partId, newQuantity, actorId(session), note),
    );
    return { error: null, quantity: result.quantity, available: result.available };
  } catch (e) {
    if (e instanceof Error && e.message === "NEGATIVE_ON_HAND") {
      return { error: "Остаток нельзя сделать отрицательным" };
    }
    throw e; // unexpected (DB error etc.) — surface it, don't mask as a vague message
  }
}

/** Read a part's bin placement (bins + unplaced + reconcile flag). */
export async function getPlacement(partId: string): Promise<PlacementResult> {
  await requireRole(["ADMIN", "MANAGER"]);
  const placement = await binsForItem(db, partId, TENANT_KEY);
  return { error: null, placement };
}

interface LocationItem {
  partId: string;
  name: string;
  article: string;
  quantity: number;
}

/** List the items stored in a location (for the location-centric lookup). */
export async function lookupLocation(location: string): Promise<{ items: LocationItem[] }> {
  await requireRole(["ADMIN", "MANAGER"]);
  if (!location.trim()) return { items: [] };
  const rows = await itemsInLocation(db, location, TENANT_KEY);
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
export async function placeIntoBin(partId: string, location: string, qty: number): Promise<PlacementResult> {
  const session = await requireRole(["ADMIN", "MANAGER"]);
  if (!location.trim()) return { error: "Укажите ячейку" };
  if (!Number.isInteger(qty) || qty <= 0) return { error: "Количество должно быть положительным" };
  try {
    await db.$transaction((tx) =>
      placeStock(tx, { itemId: partId, location, qty, actorId: actorId(session), tenantKey: TENANT_KEY }),
    );
  } catch (e) {
    const msg = wmsErrorMessage(e);
    if (msg) return { error: msg };
    throw e;
  }
  return { error: null, placement: await binsForItem(db, partId, TENANT_KEY) };
}

/** Move stock between two locations. */
export async function transferBetweenBins(
  partId: string,
  from: string,
  to: string,
  qty: number,
): Promise<PlacementResult> {
  const session = await requireRole(["ADMIN", "MANAGER"]);
  if (!from.trim() || !to.trim()) return { error: "Укажите обе ячейки" };
  if (!Number.isInteger(qty) || qty <= 0) return { error: "Количество должно быть положительным" };
  try {
    await db.$transaction((tx) =>
      transferStock(tx, { itemId: partId, from, to, qty, actorId: actorId(session), tenantKey: TENANT_KEY }),
    );
  } catch (e) {
    const msg = wmsErrorMessage(e);
    if (msg) return { error: msg };
    throw e;
  }
  return { error: null, placement: await binsForItem(db, partId, TENANT_KEY) };
}

/** Return stock from a location back to unplaced. */
export async function removeFromBinAction(partId: string, location: string, qty: number): Promise<PlacementResult> {
  const session = await requireRole(["ADMIN", "MANAGER"]);
  if (!location.trim()) return { error: "Укажите ячейку" };
  if (!Number.isInteger(qty) || qty <= 0) return { error: "Количество должно быть положительным" };
  try {
    await db.$transaction((tx) =>
      removeFromBin(tx, { itemId: partId, location, qty, actorId: actorId(session), tenantKey: TENANT_KEY }),
    );
  } catch (e) {
    const msg = wmsErrorMessage(e);
    if (msg) return { error: msg };
    throw e;
  }
  return { error: null, placement: await binsForItem(db, partId, TENANT_KEY) };
}
