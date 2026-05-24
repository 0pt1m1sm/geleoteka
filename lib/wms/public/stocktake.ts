/**
 * Stocktake / инвентаризация core (Phase 3). Host-agnostic, tenant-scoped.
 *
 * A count session snapshots the in-scope StockBins as count lines; the worker
 * records counted quantities; a manager reviews and posts the variances. Posting
 * is BINS-ARE-TRUTH: per part one ADJUSTMENT (Σ counted−system over counted
 * cells) plus each counted bin reconciled to its counted qty. Nothing is written
 * until `postCountSession`, which is the single transaction boundary AND the
 * idempotency guard (REVIEW→POSTED status flip). See the plan
 * docs/plans/2026-05-24-warehouse-stocktake.md "Context for Implementer".
 *
 * `itemId` throughout is the host partId (the same identity placeStock /
 * recordMovement accept), NOT the internal StockItem.id.
 */
import { WmsError } from "./errors";
import { assertLocationUsable } from "./locations";
import { recordMovement } from "./record-movement";
import { placeStock, removeFromBin, binsForItem } from "./placement";
import type { DbClientPort } from "../internal/repository";

const DEFAULT_TENANT = "default";

export type StockCountScope = "ZONE" | "LOCATION" | "FULL" | "PART";
export type StockCountStatus = "OPEN" | "REVIEW" | "POSTED" | "CANCELLED";
export type StockCountClassification = "FOUND" | "MISSING" | "UNEXPECTED" | "UNKNOWN";

/** A client able to open an interactive transaction (the base PrismaClient). */
type TxCapable = { $transaction: <T>(fn: (tx: DbClientPort) => Promise<T>) => Promise<T> };
function txCapable(client: DbClientPort): boolean {
  return typeof (client as { $transaction?: unknown }).$transaction === "function";
}

function normalizeLocation(location: string): string {
  return location.trim().toUpperCase();
}

/** Composite key for a (cell, part) placement. Recovery of the parts is via a
 *  side keyMeta map (never by parsing this string), so the separator only needs
 *  to make the key unique — it is not security- or correctness-load-bearing. */
function cellKey(location: string, itemId: string): string {
  return `${location} ${itemId}`;
}

/** Guard that count mutations only touch an OPEN session — once finalized to
 *  REVIEW the lines are frozen, so a stale client (or a worker hitting the action
 *  directly) cannot alter what the manager is about to post. */
async function assertSessionOpen(client: DbClientPort, sessionId: string): Promise<void> {
  const session = (await (client as DbClientPort).stockCountSession.findUnique({
    where: { id: sessionId },
    select: { status: true },
  })) as { status: StockCountStatus } | null;
  if (!session) throw new Error("SESSION_NOT_FOUND");
  if (session.status !== "OPEN") throw new Error("SESSION_NOT_OPEN");
}

export interface CreateCountSessionInput {
  scope: StockCountScope;
  scopeValue?: string | null;
  /** Normalized-or-not cell codes (LOCATION scope). */
  locations?: string[];
  /** Host partIds (PART scope). */
  partIds?: string[];
  actorId?: string;
  tenantKey?: string;
}

export interface CountLine {
  id: string;
  sessionId: string;
  itemId: string | null;
  rawCode: string | null;
  location: string;
  systemQty: number;
  countedQty: number | null;
  classification: StockCountClassification | null;
  postedDelta: number | null;
}

export interface CountSession {
  id: string;
  status: StockCountStatus;
  scope: StockCountScope;
  scopeValue: string | null;
  scopeLocations: string[];
  scopePartIds: string[];
  note: string | null;
  createdByUserId: string | null;
  postedByUserId: string | null;
  postedAt: Date | null;
  tenantKey: string;
  createdAt: Date;
}

export interface PostResult {
  applied: boolean;
  status: StockCountStatus;
}

/** Per-part review projection, computed from LIVE stock at render time. */
export interface PartVariance {
  itemId: string;
  netAdjustment: number;
  onHandBefore: number;
  onHandAfter: number;
  unplacedBefore: number;
  unplacedAfter: number;
  reconcileNeeded: boolean;
}

// ── Internal Prisma delegate shims (the generated client is @ts-nocheck; through
// the typed DbClientPort the model delegates exist but some overloads are loose,
// so we narrow the few calls we make). ─────────────────────────────────────────
interface BinRow {
  location: string;
  quantity: number;
  item: { partId: string };
}

async function liveBinsForScope(
  client: DbClientPort,
  scope: StockCountScope,
  scopeLocations: string[],
  scopePartIds: string[],
  tenantKey: string,
): Promise<BinRow[]> {
  const findMany = (client as DbClientPort).stockBin.findMany as unknown as (
    args: unknown,
  ) => Promise<BinRow[]>;
  const where: Record<string, unknown> = { tenantKey };
  if (scope === "LOCATION" || scope === "ZONE") {
    where.location = { in: scopeLocations };
  } else if (scope === "PART") {
    where.item = { partId: { in: scopePartIds } };
  }
  // FULL: tenant only.
  return findMany({ where, select: { location: true, quantity: true, item: { select: { partId: true } } } });
}

/** Resolve + create a session, snapshotting in-scope StockBins as count lines. */
export async function createCountSession(
  client: DbClientPort,
  input: CreateCountSessionInput,
): Promise<CountSession> {
  const tenantKey = input.tenantKey ?? DEFAULT_TENANT;
  const scope = input.scope;

  let scopeLocations: string[] = [];
  const scopePartIds: string[] = scope === "PART" ? [...new Set(input.partIds ?? [])] : [];

  if (scope === "LOCATION") {
    scopeLocations = [...new Set((input.locations ?? []).map(normalizeLocation))].filter(Boolean);
  } else if (scope === "ZONE") {
    const zone = (input.scopeValue ?? "").trim();
    const locFind = (client as DbClientPort).stockLocation.findMany as unknown as (
      args: unknown,
    ) => Promise<Array<{ code: string }>>;
    const locs = await locFind({ where: { tenantKey, zone }, select: { code: true } });
    scopeLocations = [...new Set(locs.map((l) => normalizeLocation(l.code)))];
  }

  const run = async (tx: DbClientPort): Promise<CountSession> => {
    const created = (await (tx as DbClientPort).stockCountSession.create({
      data: {
        scope,
        scopeValue: input.scopeValue ?? null,
        scopeLocations,
        scopePartIds,
        status: "OPEN",
        createdByUserId: input.actorId ?? null,
        tenantKey,
      },
    })) as unknown as CountSession;

    const bins = await liveBinsForScope(tx, scope, scopeLocations, scopePartIds, tenantKey);
    if (bins.length > 0) {
      const createMany = (tx as DbClientPort).stockCountLine.createMany as unknown as (
        args: unknown,
      ) => Promise<unknown>;
      await createMany({
        data: bins.map((b) => ({
          sessionId: created.id,
          itemId: b.item.partId,
          location: b.location,
          systemQty: b.quantity,
          tenantKey,
        })),
      });
    }
    return created;
  };

  return txCapable(client) ? (client as unknown as TxCapable).$transaction(run) : run(client);
}

/** Record a counted quantity for a (part, cell). FOUND if a snapshot line exists,
 *  UNEXPECTED if not. Last write wins. */
export async function recordCount(
  client: DbClientPort,
  input: { sessionId: string; itemId: string; location: string; countedQty: number; tenantKey?: string },
): Promise<CountLine> {
  const tenantKey = input.tenantKey ?? DEFAULT_TENANT;
  const location = normalizeLocation(input.location);
  if (!Number.isInteger(input.countedQty) || input.countedQty < 0) {
    throw WmsError.invalidQty("ADJUSTMENT");
  }
  await assertSessionOpen(client, input.sessionId);
  const lineFind = (client as DbClientPort).stockCountLine.findFirst as unknown as (
    args: unknown,
  ) => Promise<CountLine | null>;
  const existing = await lineFind({
    where: { sessionId: input.sessionId, itemId: input.itemId, location, tenantKey },
  });
  if (existing) {
    const update = (client as DbClientPort).stockCountLine.update as unknown as (
      args: unknown,
    ) => Promise<CountLine>;
    return update({
      where: { id: existing.id },
      data: {
        countedQty: input.countedQty,
        classification: existing.systemQty > 0 ? "FOUND" : "UNEXPECTED",
      },
    });
  }
  const create = (client as DbClientPort).stockCountLine.create as unknown as (
    args: unknown,
  ) => Promise<CountLine>;
  return create({
    data: {
      sessionId: input.sessionId,
      itemId: input.itemId,
      location,
      systemQty: 0,
      countedQty: input.countedQty,
      classification: "UNEXPECTED",
      tenantKey,
    },
  });
}

/** Record a scan that resolved to no part — saved for catalog follow-up, posts nothing. */
export async function recordUnknownScan(
  client: DbClientPort,
  input: { sessionId: string; location: string; rawCode: string; tenantKey?: string },
): Promise<CountLine> {
  const tenantKey = input.tenantKey ?? DEFAULT_TENANT;
  await assertSessionOpen(client, input.sessionId);
  const create = (client as DbClientPort).stockCountLine.create as unknown as (
    args: unknown,
  ) => Promise<CountLine>;
  return create({
    data: {
      sessionId: input.sessionId,
      itemId: null,
      rawCode: input.rawCode,
      location: normalizeLocation(input.location),
      systemQty: 0,
      classification: "UNKNOWN",
      tenantKey,
    },
  });
}

/** OPEN→REVIEW: any uncounted snapshot line (real bin not scanned) becomes MISSING. */
export async function finalizeSession(client: DbClientPort, sessionId: string): Promise<CountSession> {
  const run = async (tx: DbClientPort): Promise<CountSession> => {
    const session = (await (tx as DbClientPort).stockCountSession.findUnique({
      where: { id: sessionId },
    })) as unknown as CountSession | null;
    if (!session) throw new Error("SESSION_NOT_FOUND");
    if (session.status !== "OPEN") throw new Error("SESSION_NOT_OPEN");

    // Uncounted snapshot lines (have a system bin, never scanned) → MISSING.
    const updateMany = (tx as DbClientPort).stockCountLine.updateMany as unknown as (
      args: unknown,
    ) => Promise<unknown>;
    await updateMany({
      where: { sessionId, countedQty: null, itemId: { not: null } },
      data: { countedQty: 0, classification: "MISSING" },
    });

    return (await (tx as DbClientPort).stockCountSession.update({
      where: { id: sessionId },
      data: { status: "REVIEW" },
    })) as unknown as CountSession;
  };
  return txCapable(client) ? (client as unknown as TxCapable).$transaction(run) : run(client);
}

/** Lines that carry a real posting effect (exclude UNKNOWN + uncounted). */
function postableLines(lines: CountLine[]): Array<CountLine & { itemId: string; countedQty: number }> {
  return lines.filter(
    (l): l is CountLine & { itemId: string; countedQty: number } =>
      l.itemId != null && l.countedQty != null && l.classification !== "UNKNOWN",
  );
}

/**
 * REVIEW→POSTED. One transaction: status guard → full-scope drift check →
 * per-part reconcile/blocked guards → removes→adjust→places → status flip.
 * Idempotent: an already-POSTED session returns a no-op.
 */
export async function postCountSession(
  client: DbClientPort,
  input: { sessionId: string; actorId?: string; tenantKey?: string },
): Promise<PostResult> {
  const tenantKey = input.tenantKey ?? DEFAULT_TENANT;
  const { sessionId, actorId } = input;

  const run = async (tx: DbClientPort): Promise<PostResult> => {
    // 1. Status guard / idempotency.
    const session = (await (tx as DbClientPort).stockCountSession.findUnique({
      where: { id: sessionId },
    })) as unknown as CountSession | null;
    if (!session) throw new Error("SESSION_NOT_FOUND");
    if (session.status === "POSTED") return { applied: false, status: "POSTED" };
    if (session.status !== "REVIEW") throw new Error("SESSION_NOT_REVIEW");

    const lineFind = (tx as DbClientPort).stockCountLine.findMany as unknown as (
      args: unknown,
    ) => Promise<CountLine[]>;
    const lines = await lineFind({ where: { sessionId } });

    // 2. Full-scope drift check — compare LIVE scoped bins to the snapshot.
    const liveBins = await liveBinsForScope(
      tx,
      session.scope,
      session.scopeLocations,
      session.scopePartIds,
      tenantKey,
    );
    const liveMap = new Map<string, number>();
    const keyMeta = new Map<string, { location: string; itemId: string }>();
    for (const b of liveBins) {
      const k = cellKey(b.location, b.item.partId);
      liveMap.set(k, b.quantity);
      keyMeta.set(k, { location: b.location, itemId: b.item.partId });
    }
    const snapMap = new Map<string, number>();
    for (const l of lines) {
      if (l.itemId != null) {
        const k = cellKey(l.location, l.itemId);
        snapMap.set(k, l.systemQty);
        if (!keyMeta.has(k)) keyMeta.set(k, { location: l.location, itemId: l.itemId });
      }
    }
    const drift: Array<{ location: string; itemId: string | null }> = [];
    const keys = new Set<string>();
    for (const [k, q] of liveMap) if (q !== 0) keys.add(k);
    for (const [k, q] of snapMap) if (q !== 0) keys.add(k);
    for (const k of keys) {
      const live = liveMap.get(k) ?? 0;
      const snap = snapMap.get(k) ?? 0;
      if (live !== snap) {
        const meta = keyMeta.get(k);
        drift.push({ location: meta?.location ?? k, itemId: meta?.itemId ?? null });
      }
    }
    if (drift.length > 0) throw WmsError.countDrift(drift);

    // Group postable lines by part.
    const byPart = new Map<string, Array<CountLine & { itemId: string; countedQty: number }>>();
    for (const l of postableLines(lines)) {
      const arr = byPart.get(l.itemId) ?? [];
      arr.push(l);
      byPart.set(l.itemId, arr);
    }

    // 3 + 4. Pre-write guards: per-part reconcile + all PLACE-target cells usable.
    const partNet = new Map<string, number>();
    for (const [partId, plines] of byPart) {
      const net = plines.reduce((s, l) => s + (l.countedQty - l.systemQty), 0);
      partNet.set(partId, net);

      const placement = await binsForItem(tx, partId, tenantKey);
      const si = (await (tx as DbClientPort).stockItem.findUnique({
        where: { partId },
        select: { reserved: true },
      })) as { reserved: number } | null;
      const reserved = si?.reserved ?? 0;
      const after = placement.quantity + net;
      if (placement.reconcileNeeded || after < 0 || after < reserved) {
        throw WmsError.reconcileBlocked(partId);
      }
    }
    // Blocked-location pre-check for every PLACE target (surplus / UNEXPECTED).
    for (const [, plines] of byPart) {
      for (const l of plines) {
        if (l.countedQty - l.systemQty > 0) {
          try {
            await assertLocationUsable(tx, l.location, tenantKey);
          } catch (e) {
            if (e instanceof WmsError && e.code === "LOCATION_BLOCKED") {
              throw new WmsError(e.code, e.message, { location: l.location });
            }
            throw e;
          }
        }
      }
    }

    // 5. Apply per part: decreases → ADJUSTMENT → increases.
    for (const [partId, plines] of byPart) {
      for (const l of plines) {
        const delta = l.countedQty - l.systemQty;
        if (delta < 0) {
          await removeFromBin(tx, { itemId: partId, location: l.location, qty: -delta, actorId, tenantKey });
        }
      }
      const net = partNet.get(partId) ?? 0;
      if (net !== 0) {
        await recordMovement(tx, {
          item: { itemId: partId },
          reason: "ADJUSTMENT",
          qty: net,
          source: { type: "StockCount", id: `${sessionId}:${partId}` },
          actorId,
          tenantKey,
        });
      }
      for (const l of plines) {
        const delta = l.countedQty - l.systemQty;
        if (delta > 0) {
          await placeStock(tx, { itemId: partId, location: l.location, qty: delta, actorId, tenantKey });
        }
      }
      // Record per-line posted delta.
      const updateLine = (tx as DbClientPort).stockCountLine.update as unknown as (
        args: unknown,
      ) => Promise<unknown>;
      for (const l of plines) {
        await updateLine({ where: { id: l.id }, data: { postedDelta: l.countedQty - l.systemQty } });
      }
    }

    // 6. Flip status last.
    await (tx as DbClientPort).stockCountSession.update({
      where: { id: sessionId },
      data: { status: "POSTED", postedAt: new Date(), postedByUserId: actorId ?? null },
    });
    return { applied: true, status: "POSTED" };
  };

  return txCapable(client) ? (client as unknown as TxCapable).$transaction(run) : run(client);
}

/**
 * REVIEW → OPEN so the worker can re-count (the drift-recovery path). This
 * RE-SNAPSHOTS the in-scope live bins: a bare status flip would leave each
 * line's `systemQty` frozen at the original snapshot, so the next post's drift
 * check would still compare live against stale values and never clear. Refreshes
 * `systemQty` to the current live qty for every in-scope (cell, part), resets the
 * count on any cell whose system value changed (forcing a recount), zeroes lines
 * whose bin vanished, and materializes new lines for bins that appeared.
 */
export async function reopenSession(client: DbClientPort, sessionId: string): Promise<CountSession> {
  const run = async (tx: DbClientPort): Promise<CountSession> => {
    const session = (await (tx as DbClientPort).stockCountSession.findUnique({
      where: { id: sessionId },
    })) as unknown as CountSession | null;
    if (!session) throw new Error("SESSION_NOT_FOUND");
    if (session.status !== "REVIEW") throw new Error("SESSION_NOT_REVIEW");

    const tenantKey = session.tenantKey ?? DEFAULT_TENANT;
    const liveBins = await liveBinsForScope(
      tx,
      session.scope,
      session.scopeLocations,
      session.scopePartIds,
      tenantKey,
    );
    const liveMap = new Map<string, number>();
    const liveMeta = new Map<string, { location: string; itemId: string }>();
    for (const b of liveBins) {
      const k = cellKey(b.location, b.item.partId);
      liveMap.set(k, b.quantity);
      liveMeta.set(k, { location: b.location, itemId: b.item.partId });
    }

    const lineFind = (tx as DbClientPort).stockCountLine.findMany as unknown as (
      args: unknown,
    ) => Promise<CountLine[]>;
    const lines = await lineFind({ where: { sessionId } });

    const updateLine = (tx as DbClientPort).stockCountLine.update as unknown as (args: unknown) => Promise<unknown>;
    const seen = new Set<string>();
    for (const l of lines) {
      if (l.itemId == null) continue; // leave UNKNOWN lines as-is
      const k = cellKey(l.location, l.itemId);
      seen.add(k);
      const liveQty = liveMap.get(k) ?? 0; // 0 = bin vanished
      if (liveQty !== l.systemQty) {
        // Cell changed since the snapshot → refresh system value, force a recount.
        await updateLine({
          where: { id: l.id },
          data: { systemQty: liveQty, countedQty: null, classification: null, postedDelta: null },
        });
      }
    }
    // New in-scope bins that have no line yet → materialize them.
    const create = (tx as DbClientPort).stockCountLine.create as unknown as (args: unknown) => Promise<unknown>;
    for (const [k, meta] of liveMeta) {
      if (seen.has(k)) continue;
      await create({
        data: {
          sessionId,
          itemId: meta.itemId,
          location: meta.location,
          systemQty: liveMap.get(k) ?? 0,
          tenantKey: session.tenantKey,
        },
      });
    }

    return (await (tx as DbClientPort).stockCountSession.update({
      where: { id: sessionId },
      data: { status: "OPEN" },
    })) as unknown as CountSession;
  };
  return txCapable(client) ? (client as unknown as TxCapable).$transaction(run) : run(client);
}

/** OPEN/REVIEW → CANCELLED. Nothing applied. */
export async function cancelSession(client: DbClientPort, sessionId: string): Promise<CountSession> {
  const session = (await (client as DbClientPort).stockCountSession.findUnique({
    where: { id: sessionId },
  })) as unknown as CountSession | null;
  if (!session) throw new Error("SESSION_NOT_FOUND");
  if (session.status === "POSTED") throw new Error("SESSION_ALREADY_POSTED");
  return (await (client as DbClientPort).stockCountSession.update({
    where: { id: sessionId },
    data: { status: "CANCELLED" },
  })) as unknown as CountSession;
}

/** Read a session with its lines. */
export async function getCountSession(
  client: DbClientPort,
  sessionId: string,
): Promise<(CountSession & { lines: CountLine[] }) | null> {
  return (await (client as DbClientPort).stockCountSession.findUnique({
    where: { id: sessionId },
    include: { lines: { orderBy: { location: "asc" } } },
  })) as unknown as (CountSession & { lines: CountLine[] }) | null;
}

/** Recent sessions for the tenant (no lines). */
export async function listCountSessions(
  client: DbClientPort,
  tenantKey?: string,
  limit = 50,
): Promise<CountSession[]> {
  const findMany = (client as DbClientPort).stockCountSession.findMany as unknown as (
    args: unknown,
  ) => Promise<CountSession[]>;
  return findMany({
    where: { tenantKey: tenantKey ?? DEFAULT_TENANT },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Per-part variance projection for the review screen, computed from LIVE
 * StockItem/bin state (NOT the snapshot) so a concurrent out-of-scope receive is
 * reflected. `onHandAfter` = live on-hand + net variance.
 */
export async function sessionVariance(
  client: DbClientPort,
  sessionId: string,
  tenantKey?: string,
): Promise<PartVariance[]> {
  const tenant = tenantKey ?? DEFAULT_TENANT;
  const lineFind = (client as DbClientPort).stockCountLine.findMany as unknown as (
    args: unknown,
  ) => Promise<CountLine[]>;
  const lines = await lineFind({ where: { sessionId } });

  const netByPart = new Map<string, number>();
  for (const l of postableLines(lines)) {
    netByPart.set(l.itemId, (netByPart.get(l.itemId) ?? 0) + (l.countedQty - l.systemQty));
  }

  const out: PartVariance[] = [];
  for (const [itemId, net] of netByPart) {
    const placement = await binsForItem(client, itemId, tenant);
    const onHandAfter = placement.quantity + net;
    // Posting reconciles each counted bin to its counted qty, so Σbins changes by
    // the SAME net delta as on-hand: placedAfter = placed + net. (For a consistent
    // part this leaves unplaced unchanged — bins-are-truth raises on-hand AND
    // places the surplus into the cell.) Projecting against the pre-post placed
    // total would mis-state unplaced and mislead the reviewer.
    const placedAfter = placement.placed + net;
    out.push({
      itemId,
      netAdjustment: net,
      onHandBefore: placement.quantity,
      onHandAfter,
      unplacedBefore: placement.unplaced,
      unplacedAfter: Math.max(0, onHandAfter - placedAfter),
      reconcileNeeded: placement.reconcileNeeded,
    });
  }
  return out;
}
