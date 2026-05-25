"use server";

// Stocktake / инвентаризация actions: count sessions, scan-driven counting, and
// the manager review→post gate. Thin wrappers over lib/wms/public/stocktake;
// counting is WAREHOUSE_WORKER-allowed, posting is ADMIN/MANAGER only.
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { actorId, TENANT_KEY, defaultWarehouseId } from "@/lib/wms-host";
import { resolveWarehouseId } from "@/app/actions/warehouses";
import { wmsErrorMessage } from "@/lib/warehouse/wms-error-message";
import { WmsError, parseScanCode, lookupByCode } from "@/lib/wms/public";
import {
  createCountSession,
  recordCount,
  recordUnknownScan,
  finalizeSession,
  postCountSession,
  reopenSession,
  cancelSession,
  getCountSession,
  listCountSessions,
  sessionVariance,
  type StockCountScope,
  type CountSession,
  type CountLine,
  type PartVariance,
} from "@/lib/wms/public/stocktake";

const COUNT_ROLES = ["ADMIN", "MANAGER", "WAREHOUSE_WORKER"];
const POST_ROLES = ["ADMIN", "MANAGER"];
// Upper bound on a counted quantity. Guards against a garbage/test value (e.g.
// 9999999999) that passes the integer check but overflows Postgres Int
// (max 2_147_483_647) when posting drives StockItem.quantity/bins past it —
// which previously surfaced as a 500. 1M is far beyond any real per-cell count.
const MAX_COUNT_QTY = 1_000_000;

/** Resolve a scanned item code (typed WMS:PART:, barcode/gtin, or article) to a
 *  host partId. Mirrors app/api/warehouse/scan/route.ts resolution. */
async function resolveItemCode(raw: string): Promise<string | null> {
  const parsed = parseScanCode(raw);
  const code = parsed.type === "PART" || parsed.type === "RAW" ? parsed.id : null;
  if (!code) return null;
  const view = await lookupByCode(db, code, await defaultWarehouseId(db), TENANT_KEY);
  if (view?.itemId) return view.itemId;
  const byArticle = (await db.part.findFirst({
    where: { article: code },
    select: { id: true },
  })) as { id: string } | null;
  return byArticle?.id ?? null;
}

/** Resolve PART-scope scopeValue (a category slug OR comma-separated articles) to partIds. */
async function resolvePartScope(scopeValue: string): Promise<string[]> {
  const value = scopeValue.trim();
  if (!value) return [];
  const category = (await db.partCategory.findUnique({
    where: { slug: value },
    select: { id: true },
  })) as { id: string } | null;
  if (category) {
    const parts = (await db.part.findMany({
      where: { categoryId: category.id },
      select: { id: true },
    })) as Array<{ id: string }>;
    return parts.map((p) => p.id);
  }
  const articles = value
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  if (articles.length === 0) return [];
  const parts = (await db.part.findMany({
    where: { article: { in: articles } },
    select: { id: true },
  })) as Array<{ id: string }>;
  return parts.map((p) => p.id);
}

/** Create a count session for the given scope; materializes count lines. */
export async function createCountSessionAction(
  scope: StockCountScope,
  scopeValue: string,
  wh?: string,
): Promise<{ error: string | null; sessionId?: string }> {
  const session = await requireRole(COUNT_ROLES);
  const value = (scopeValue ?? "").trim();
  let locations: string[] = [];
  let partIds: string[] = [];
  if (scope === "LOCATION") {
    locations = value.split(",").map((c) => c.trim()).filter(Boolean);
    if (locations.length === 0) return { error: "Укажите хотя бы одну ячейку" };
  } else if (scope === "ZONE") {
    if (!value) return { error: "Укажите зону" };
  } else if (scope === "PART") {
    partIds = await resolvePartScope(value);
    if (partIds.length === 0) return { error: "Не найдено позиций для пересчёта" };
  }
  try {
    const created = await createCountSession(db, {
      scope,
      warehouseId: await resolveWarehouseId(wh),
      scopeValue: value || null,
      locations,
      partIds,
      actorId: actorId(session),
      tenantKey: TENANT_KEY,
    });
    return { error: null, sessionId: created.id };
  } catch (e) {
    if (e instanceof Error && e.message === "EMPTY_ZONE") {
      return { error: `В зоне «${value}» не найдено ячеек` };
    }
    throw e;
  }
}

/** Record a counted quantity for a scanned item in a cell. Unresolvable code → UNKNOWN line. */
export async function recordCountAction(
  sessionId: string,
  rawItemCode: string,
  location: string,
  countedQty: number,
): Promise<{ error: string | null; unknown?: boolean }> {
  await requireRole(COUNT_ROLES);
  if (!location.trim()) return { error: "Укажите ячейку" };
  if (!Number.isInteger(countedQty) || countedQty < 0 || countedQty > MAX_COUNT_QTY) {
    return { error: "Количество должно быть целым от 0 до 1 000 000" };
  }
  const partId = await resolveItemCode(rawItemCode);
  try {
    if (!partId) {
      await recordUnknownScan(db, { sessionId, location, rawCode: rawItemCode, tenantKey: TENANT_KEY });
      return { error: null, unknown: true };
    }
    await recordCount(db, { sessionId, itemId: partId, location, countedQty, tenantKey: TENANT_KEY });
    return { error: null };
  } catch (e) {
    if (e instanceof Error && e.message === "SESSION_NOT_OPEN") return { error: "Сессия закрыта для подсчёта" };
    throw e;
  }
}

/** Record a counted quantity for a KNOWN part in a cell (informed per-line entry,
 *  where the partId is already on the count sheet — no code resolution needed). */
export async function recordCountByPartAction(
  sessionId: string,
  partId: string,
  location: string,
  countedQty: number,
): Promise<{ error: string | null }> {
  await requireRole(COUNT_ROLES);
  if (!location.trim()) return { error: "Укажите ячейку" };
  if (!Number.isInteger(countedQty) || countedQty < 0 || countedQty > MAX_COUNT_QTY) {
    return { error: "Количество должно быть целым от 0 до 1 000 000" };
  }
  try {
    await recordCount(db, { sessionId, itemId: partId, location, countedQty, tenantKey: TENANT_KEY });
    return { error: null };
  } catch (e) {
    if (e instanceof Error && e.message === "SESSION_NOT_OPEN") return { error: "Сессия закрыта для подсчёта" };
    throw e;
  }
}

/** OPEN → REVIEW. Uncounted snapshot lines become MISSING. */
export async function finalizeSessionAction(sessionId: string): Promise<{ error: string | null }> {
  await requireRole(COUNT_ROLES);
  try {
    await finalizeSession(db, sessionId);
    return { error: null };
  } catch (e) {
    const msg = wmsErrorMessage(e);
    if (msg) return { error: msg };
    if (e instanceof Error && e.message === "SESSION_NOT_OPEN") return { error: "Сессия не в статусе подсчёта" };
    console.error("[finalizeSessionAction] unexpected error", { sessionId, error: e });
    return { error: "Не удалось завершить пересчёт — внутренняя ошибка. Сообщите администратору." };
  }
}

/** REVIEW → POSTED (ADMIN/MANAGER). Returns a structured block on each guard. */
export async function postCountSessionAction(sessionId: string): Promise<{
  error: string | null;
  drift?: Array<{ location: string; itemId: string | null }>;
  reconcilePartId?: string;
  blockedLocation?: string;
}> {
  const session = await requireRole(POST_ROLES);
  try {
    await postCountSession(db, { sessionId, actorId: actorId(session), tenantKey: TENANT_KEY });
    return { error: null };
  } catch (e) {
    if (e instanceof WmsError) {
      const msg = wmsErrorMessage(e) ?? "Не удалось провести пересчёт";
      if (e.code === "COUNT_DRIFT") return { error: msg, drift: e.details?.drift ?? [] };
      if (e.code === "RECONCILE_BLOCKED") return { error: msg, reconcilePartId: e.details?.partId };
      if (e.code === "LOCATION_BLOCKED") return { error: msg, blockedLocation: e.details?.location };
      return { error: msg };
    }
    if (e instanceof Error && e.message === "SESSION_NOT_REVIEW") return { error: "Сессия не готова к проводке" };
    // Never let an unexpected error 500 the whole page — log it (Railway) and
    // return a graceful message so the reviewer keeps a usable screen.
    console.error("[postCountSessionAction] unexpected error", { sessionId, error: e });
    return { error: "Не удалось провести пересчёт — внутренняя ошибка. Сообщите администратору." };
  }
}

/** REVIEW → OPEN so the worker can re-count (drift recovery). */
export async function reopenSessionAction(sessionId: string): Promise<{ error: string | null }> {
  await requireRole(COUNT_ROLES);
  try {
    await reopenSession(db, sessionId);
    return { error: null };
  } catch (e) {
    if (e instanceof Error && e.message === "SESSION_NOT_REVIEW") return { error: "Сессия не в статусе проверки" };
    throw e;
  }
}

/** OPEN/REVIEW → CANCELLED. */
export async function cancelSessionAction(sessionId: string): Promise<{ error: string | null }> {
  await requireRole(COUNT_ROLES);
  try {
    await cancelSession(db, sessionId);
    return { error: null };
  } catch (e) {
    if (e instanceof Error && e.message === "SESSION_ALREADY_POSTED") return { error: "Сессия уже проведена" };
    throw e;
  }
}

/** Read a session with its lines + the live per-part variance projection. */
export async function getCountSessionAction(
  sessionId: string,
): Promise<{ session: (CountSession & { lines: CountLine[] }) | null; variance: PartVariance[] }> {
  await requireRole(COUNT_ROLES);
  const session = await getCountSession(db, sessionId);
  if (!session) return { session: null, variance: [] };
  // Variance is a projection for display — never let it 500 the whole session
  // page on load. Degrade to empty + log so the reviewer can still see lines
  // and cancel/act on the session.
  let variance: PartVariance[] = [];
  try {
    variance = await sessionVariance(db, sessionId, TENANT_KEY);
  } catch (e) {
    console.error("[getCountSessionAction] variance projection failed", { sessionId, error: e });
  }
  return { session, variance };
}

/** List recent sessions for the tenant. */
export async function listCountSessionsAction(): Promise<{ sessions: CountSession[] }> {
  await requireRole(COUNT_ROLES);
  const sessions = await listCountSessions(db, TENANT_KEY);
  return { sessions };
}
