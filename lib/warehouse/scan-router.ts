import { db } from "@/lib/db";
import {
  lookupByCode,
  availableStock,
  getLocation,
  itemsInLocation,
  recordScanEvent,
  type ParsedScanCode,
} from "@/lib/wms/public";

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

export type ScanCard = PartCard | LocationCard;

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
        const card = await resolvePart(client, parsed.id, tenantKey, ctx.articleResolver);
        if (!card) {
          await log("REJECTED", "UNKNOWN_CODE");
          return { status: 404, errorCode: "UNKNOWN_CODE", message: "Не найдено" };
        }
        await log("SUCCESS", null);
        return { status: 200, data: card };
      }
      case "LOC": {
        const card = await resolveLocation(client, parsed.id, tenantKey);
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
      case "ORDER":
      case "BOX": {
        await log("REJECTED", "WRONG_OBJECT_TYPE");
        return {
          status: 422,
          errorCode: "WRONG_OBJECT_TYPE",
          message: "Этот тип кода пока не поддерживается",
        };
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
): Promise<PartCard | null> {
  // 1) core: barcode / gtin. 2) host fallback: article (catalog identity).
  const view = await lookupByCode(client, code, tenantKey);
  const itemId = view?.itemId ?? (await articleResolver(code));
  if (!itemId) return null;

  const part = (await client.part.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      name: true,
      article: true,
      isActive: true,
      stockItem: { select: { quantity: true, reserved: true, barcode: true } },
    },
  })) as {
    id: string;
    name: string;
    article: string;
    isActive: boolean;
    stockItem: { quantity: number; reserved: number; barcode: string | null } | null;
  } | null;
  if (!part) return null;

  const si = part.stockItem;
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

async function resolveLocation(client: DbClient, code: string, tenantKey: string): Promise<LocationCard> {
  const loc = await getLocation(client, code, tenantKey);
  const rows = await itemsInLocation(client, code, tenantKey);
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
