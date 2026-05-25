import { db } from "@/lib/db";
import { defaultWarehouseId } from "@/lib/wms-host";
import {
  lookupByCode,
  availableStock,
  getLocation,
  itemsInLocation,
  recordScanEvent,
  type ParsedScanCode,
} from "@/lib/wms/public";
import { packProgress } from "@/lib/warehouse/pack";

type DbClient = typeof db;

export interface PartCard {
  kind: "part";
  itemId: string;
  name: string;
  article: string;
  barcode: string | null;
  quantity: number;
  available: number;
  /** Catalog/shop state. false = deactivated in the shop but still in stock. */
  isActive: boolean;
}

export interface LocationCard {
  kind: "location";
  code: string;
  isActive: boolean;
  isBlocked: boolean;
  items: Array<{ itemId: string; name: string; article: string; quantity: number }>;
}

export interface OrderCard {
  kind: "order";
  orderId: string;
  orderNumber: string | null;
  status: string;
  requiredCount: number;
  packedCount: number;
}

export interface BoxCard {
  kind: "box";
  code: string;
}

export type ScanCard = PartCard | LocationCard | OrderCard | BoxCard;

export type ScanOutcome =
  | { status: 200; data: ScanCard }
  | { status: 400 | 404 | 422 | 500; errorCode: string; message: string };

export interface ScanContext {
  userId: string | null;
  /** Operation context for the audit, e.g. "scan". */
  action: string;
  deviceId?: string | null;
  sessionId?: string | null;
  /** Host catalog fallback: resolve an article string to a partId (the core
   *  resolves barcode/gtin only — article is host catalog identity). */
  articleResolver: (code: string) => Promise<string | null>;
  /** Active warehouse to scope stock/location reads to. Omitted → tenant default. */
  warehouseId?: string;
}

/**
 * Resolve a parsed scan to a part/location card, ROUTING by object type, and
 * write exactly ONE ScanEvent for the attempt (success/rejected/error). This is
 * the single audit writer — the HTTP route must NOT log. Application-level
 * failures (unknown code, wrong type, blocked) are audited; only an
 * infrastructure failure where the ScanEvent write itself cannot run is
 * un-auditable (best-effort, by definition).
 */
export async function resolveScan(
  client: DbClient,
  parsed: ParsedScanCode,
  tenantKey: string,
  ctx: ScanContext,
): Promise<ScanOutcome> {
  const log = (
    result: "SUCCESS" | "REJECTED" | "ERROR",
    errorCode: string | null,
  ): Promise<void> =>
    recordScanEvent(client, {
      userId: ctx.userId,
      deviceId: ctx.deviceId ?? null,
      sessionId: ctx.sessionId ?? null,
      action: ctx.action,
      rawCode: parsed.raw,
      parsedObjectType: parsed.type,
      parsedObjectId: "id" in parsed ? parsed.id : null,
      result,
      errorCode,
      tenantKey,
    });

  try {
    switch (parsed.type) {
      case "PART":
      case "RAW": {
        const card = await resolvePart(client, parsed.id, tenantKey, ctx.articleResolver, ctx.warehouseId);
        if (!card) {
          await log("REJECTED", "UNKNOWN_CODE");
          return { status: 404, errorCode: "UNKNOWN_CODE", message: "Не найдено" };
        }
        await log("SUCCESS", null);
        return { status: 200, data: card };
      }
      case "LOC": {
        const card = await resolveLocation(client, parsed.id, tenantKey, ctx.warehouseId);
        // A scan of a blocked/inactive location is audited as REJECTED with
        // LOCATION_BLOCKED (Goal Verification Truth 1) — the card is still
        // returned (200) so the UI shows the blocked badge, but the audit trail
        // records that an unusable location was scanned.
        if (card.isBlocked || !card.isActive) {
          await log("REJECTED", "LOCATION_BLOCKED");
        } else {
          await log("SUCCESS", null);
        }
        return { status: 200, data: card };
      }
      case "ORDER": {
        const card = await resolveOrder(client, parsed.id);
        if (!card) {
          await log("REJECTED", "UNKNOWN_CODE");
          return { status: 404, errorCode: "UNKNOWN_CODE", message: "Заказ не найден" };
        }
        await log("SUCCESS", null);
        return { status: 200, data: card };
      }
      case "BOX": {
        // Boxes are not registered entities — echo the code so the pack flow can
        // group by it; the scan is audited as a successful parcel scan.
        await log("SUCCESS", null);
        return { status: 200, data: { kind: "box", code: parsed.id } };
      }
      default: {
        await log("REJECTED", "UNKNOWN_CODE");
        return { status: 400, errorCode: "UNKNOWN_CODE", message: "Нераспознанный код" };
      }
    }
  } catch (err) {
    // Application-level resolution failure — audit as ERROR (best-effort: if the
    // DB itself is down the ScanEvent write below also fails and the scan is
    // un-auditable, which is acceptable by definition).
    try {
      await log("ERROR", "INTERNAL");
    } catch {
      // swallow — do not mask the original error with an audit-write failure
    }
    const message = err instanceof Error ? err.message : "Ошибка обработки скана";
    return { status: 500, errorCode: "INTERNAL", message };
  }
}

async function resolvePart(
  client: DbClient,
  code: string,
  tenantKey: string,
  articleResolver: (code: string) => Promise<string | null>,
  warehouseId?: string,
): Promise<PartCard | null> {
  // 1) core: barcode / gtin. 2) host fallback: article (catalog identity).
  warehouseId ??= await defaultWarehouseId(client);
  const view = await lookupByCode(client, code, warehouseId, tenantKey);
  const itemId = view?.itemId ?? (await articleResolver(code));
  if (!itemId) return null;

  const part = (await client.part.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      name: true,
      article: true,
      isActive: true,
      stockItems: { where: { warehouseId }, select: { quantity: true, reserved: true, barcode: true } },
    },
  })) as {
    id: string;
    name: string;
    article: string;
    isActive: boolean;
    stockItems: Array<{ quantity: number; reserved: number; barcode: string | null }>;
  } | null;
  if (!part) return null;

  const si = part.stockItems[0] ?? null;
  return {
    kind: "part",
    itemId: part.id,
    name: part.name,
    article: part.article,
    barcode: si?.barcode ?? null,
    quantity: si?.quantity ?? 0,
    available: si ? availableStock(si) : 0,
    isActive: part.isActive,
  };
}

async function resolveOrder(client: DbClient, code: string): Promise<OrderCard | null> {
  // A scanned ORDER payload carries the human-readable order number (printed on
  // the label); fall back to the cuid id for robustness.
  const order = (await client.partShipment.findFirst({
    where: { OR: [{ orderNumber: code }, { id: code }] },
    select: { id: true, orderNumber: true, status: true },
  })) as { id: string; orderNumber: string | null; status: string } | null;
  if (!order) return null;

  const prog = await packProgress(client, order.id);
  return {
    kind: "order",
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    requiredCount: prog.required,
    packedCount: prog.packed,
  };
}

async function resolveLocation(client: DbClient, code: string, tenantKey: string, warehouseId?: string): Promise<LocationCard> {
  warehouseId ??= await defaultWarehouseId(client);
  const loc = await getLocation(client, code, warehouseId, tenantKey);
  const rows = await itemsInLocation(client, code, warehouseId, tenantKey);
  const parts = (await client.part.findMany({
    where: { id: { in: rows.map((r) => r.itemId) } },
    select: { id: true, name: true, article: true },
  })) as Array<{ id: string; name: string; article: string }>;
  const byId = new Map(parts.map((p) => [p.id, p]));

  return {
    kind: "location",
    code: loc?.code ?? code.trim().toUpperCase(),
    // an unregistered location is implicitly usable (active, unblocked)
    isActive: loc?.isActive ?? true,
    isBlocked: loc?.isBlocked ?? false,
    items: rows.map((r) => ({
      itemId: r.itemId,
      name: byId.get(r.itemId)?.name ?? "—",
      article: byId.get(r.itemId)?.article ?? "",
      quantity: r.quantity,
    })),
  };
}
