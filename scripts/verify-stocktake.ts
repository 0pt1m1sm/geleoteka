/**
 * Verifies the stocktake core (lib/wms/public/stocktake.ts) against the dev DB.
 * Scenarios mirror the plan's verify list (a)–(h):
 *  (a) create-by-location persists scope + snapshots lines from StockBin
 *  (b) FOUND-match / FOUND-variance / UNEXPECTED / MISSING classification
 *  (c) post on a consistent part: Σ(counted−system) ADJUSTMENT per part, bins set
 *      to counted, Σbins ≤ quantity afterwards
 *  (d) drift — a CHANGED existing bin AND a NEW in-scope bin both block the post
 *  (e) unknown scan → flagged line, posts nothing
 *  (f) retry — a second post of a POSTED session is a clean no-op
 *  (g) pre-existing drift (Σbins > quantity) → RECONCILE_BLOCKED, no writes
 *  (h) blocked PLACE-target cell → fail fast naming the cell, session stays REVIEW
 *
 * Fixtures use VERIFY-ST- prefixes (parts, locations, session scopeValue) so
 * cleanup is a prefix delete + cascade.
 */
import "dotenv/config";
import { db } from "../lib/db";
import { WmsError, placeStock, setLocationBlocked } from "../lib/wms/public";
import {
  createCountSession,
  recordCount,
  recordUnknownScan,
  finalizeSession,
  postCountSession,
  reopenSession,
  sessionVariance,
} from "../lib/wms/public/stocktake";
import { TENANT_KEY } from "../lib/wms-host";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

async function assertThrowsCode(fn: () => Promise<unknown>, code: string, msg: string): Promise<WmsError> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof WmsError && e.code === code) return e;
    console.error(`FAIL: ${msg} — expected WmsError ${code}, got:`, e);
    process.exit(1);
  }
  console.error(`FAIL: ${msg} — expected throw ${code}, but it resolved`);
  process.exit(1);
}

async function onHand(partId: string): Promise<number> {
  const si = (await db.stockItem.findUnique({ where: { partId }, select: { quantity: true } })) as
    | { quantity: number }
    | null;
  return si?.quantity ?? 0;
}

async function binQty(partId: string, location: string): Promise<number> {
  const bin = (await db.stockBin.findFirst({
    where: { item: { partId }, location: location.toUpperCase(), tenantKey: TENANT_KEY },
    select: { quantity: true },
  })) as { quantity: number } | null;
  return bin?.quantity ?? 0;
}

async function sumBins(partId: string): Promise<number> {
  const rows = (await db.stockBin.findMany({
    where: { item: { partId }, tenantKey: TENANT_KEY },
    select: { quantity: true },
  })) as Array<{ quantity: number }>;
  return rows.reduce((s, b) => s + b.quantity, 0);
}

async function cleanup(): Promise<void> {
  await db.stockCountSession.deleteMany({ where: { scopeValue: { startsWith: "VERIFY-ST" } } });
  await db.part.deleteMany({ where: { article: { startsWith: "VERIFY-ST-" } } });
  await db.stockLocation.deleteMany({ where: { code: { startsWith: "VERIFY-ST-" } } });
}

let partSeq = 0;
/** Create a part with a StockItem at `qty` on-hand (unplaced). */
async function makePart(qty: number): Promise<string> {
  partSeq += 1;
  const suffix = `${Date.now()}-${partSeq}`;
  const p = (await db.part.create({
    data: {
      slug: `verify-st-${suffix}`,
      article: `VERIFY-ST-${suffix}`,
      name: `verify stocktake ${suffix}`,
      price: 100,
      stockItem: { create: { quantity: qty, tenantKey: TENANT_KEY } },
    },
    select: { id: true },
  })) as { id: string };
  return p.id;
}

async function main(): Promise<void> {
  console.log("[verify-stocktake] starting");
  await cleanup();

  // Per-scenario unique cells: scope queries are location-keyed across the whole
  // tenant, so sharing cell codes across scenarios would pull earlier scenarios'
  // leftover bins into a session's snapshot. Isolate each scenario's cells.

  // ── (a) create-by-location persists scope + snapshots lines ──────────────
  {
    const CELL_A = "VERIFY-ST-AA";
    const p1 = await makePart(10);
    await placeStock(db, { itemId: p1, location: CELL_A, qty: 4, tenantKey: TENANT_KEY });
    const session = await createCountSession(db, {
      scope: "LOCATION",
      scopeValue: "VERIFY-ST-a",
      locations: [CELL_A],
      tenantKey: TENANT_KEY,
    });
    assert(session.status === "OPEN", "(a) session OPEN");
    assert(session.scopeLocations.includes(CELL_A), "(a) scopeLocations persisted");
    const lines = (await db.stockCountLine.findMany({ where: { sessionId: session.id } })) as Array<{
      itemId: string | null;
      location: string;
      systemQty: number;
    }>;
    assert(lines.length === 1, "(a) one snapshot line");
    assert(lines[0].itemId === p1 && lines[0].location === CELL_A && lines[0].systemQty === 4, "(a) line snapshot qty");
    console.log("(a) PASS — create persists scope + snapshots lines");
  }

  // ── (b) classification FOUND / UNEXPECTED / MISSING ──────────────────────
  {
    const CELL_A = "VERIFY-ST-BA";
    const CELL_B = "VERIFY-ST-BB";
    const p1 = await makePart(10);
    const p2 = await makePart(5);
    const p3 = await makePart(2);
    await placeStock(db, { itemId: p1, location: CELL_A, qty: 4, tenantKey: TENANT_KEY });
    await placeStock(db, { itemId: p1, location: CELL_B, qty: 3, tenantKey: TENANT_KEY });
    await placeStock(db, { itemId: p2, location: CELL_A, qty: 5, tenantKey: TENANT_KEY });

    const s = await createCountSession(db, {
      scope: "LOCATION",
      scopeValue: "VERIFY-ST-b",
      locations: [CELL_A, CELL_B],
      tenantKey: TENANT_KEY,
    });
    await recordCount(db, { sessionId: s.id, itemId: p1, location: CELL_A, countedQty: 4, tenantKey: TENANT_KEY });
    await recordCount(db, { sessionId: s.id, itemId: p2, location: CELL_A, countedQty: 5, tenantKey: TENANT_KEY });
    // p1@B left uncounted → MISSING after finalize. p3@A is UNEXPECTED.
    await recordCount(db, { sessionId: s.id, itemId: p3, location: CELL_A, countedQty: 2, tenantKey: TENANT_KEY });
    await finalizeSession(db, s.id);

    const lines = (await db.stockCountLine.findMany({ where: { sessionId: s.id } })) as Array<{
      itemId: string | null;
      location: string;
      classification: string | null;
    }>;
    const cls = (item: string, loc: string): string | null =>
      lines.find((l) => l.itemId === item && l.location === loc)?.classification ?? null;
    assert(cls(p1, CELL_A) === "FOUND", "(b) p1@A FOUND");
    assert(cls(p2, CELL_A) === "FOUND", "(b) p2@A FOUND");
    assert(cls(p3, CELL_A) === "UNEXPECTED", "(b) p3@A UNEXPECTED");
    assert(cls(p1, CELL_B) === "MISSING", "(b) p1@B MISSING");
    console.log("(b) PASS — FOUND / UNEXPECTED / MISSING classification");
  }

  // ── (c) post applies Σ ADJUSTMENT, bins = counted, Σbins ≤ quantity ───────
  {
    const CELL_A = "VERIFY-ST-CA";
    const CELL_B = "VERIFY-ST-CB";
    const p1 = await makePart(10);
    const p2 = await makePart(0); // unexpected part (no bins, no on-hand)
    await placeStock(db, { itemId: p1, location: CELL_A, qty: 4, tenantKey: TENANT_KEY });
    await placeStock(db, { itemId: p1, location: CELL_B, qty: 3, tenantKey: TENANT_KEY });

    const s = await createCountSession(db, {
      scope: "LOCATION",
      scopeValue: "VERIFY-ST-c",
      locations: [CELL_A, CELL_B],
      tenantKey: TENANT_KEY,
    });
    await recordCount(db, { sessionId: s.id, itemId: p1, location: CELL_A, countedQty: 6, tenantKey: TENANT_KEY }); // +2
    await recordCount(db, { sessionId: s.id, itemId: p1, location: CELL_B, countedQty: 3, tenantKey: TENANT_KEY }); // 0
    await recordCount(db, { sessionId: s.id, itemId: p2, location: CELL_A, countedQty: 5, tenantKey: TENANT_KEY }); // +5 unexpected
    await finalizeSession(db, s.id);
    const res = await postCountSession(db, { sessionId: s.id, tenantKey: TENANT_KEY });

    assert(res.applied && res.status === "POSTED", "(c) post applied");
    assert((await onHand(p1)) === 12, "(c) p1 on-hand 10→12 (net +2)");
    assert((await binQty(p1, CELL_A)) === 6, "(c) p1@A bin = 6");
    assert((await binQty(p1, CELL_B)) === 3, "(c) p1@B bin = 3");
    assert((await sumBins(p1)) <= (await onHand(p1)), "(c) p1 Σbins ≤ quantity");
    assert((await onHand(p2)) === 5, "(c) p2 on-hand 0→5 (unexpected)");
    assert((await binQty(p2, CELL_A)) === 5, "(c) p2@A bin = 5");
    const mv = (await db.stockMovement.findFirst({
      where: { reason: "ADJUSTMENT", sourceType: "StockCount", sourceId: `${s.id}:${p1}` },
      select: { quantityDelta: true },
    })) as { quantityDelta: number } | null;
    assert(mv && mv.quantityDelta === 2, "(c) ADJUSTMENT movement +2 sourced to session:part");
    console.log("(c) PASS — bins-are-truth post + ADJUSTMENT ledger");
  }

  // ── (d) drift blocks the post — changed bin AND new in-scope bin ─────────
  {
    const CELL_A = "VERIFY-ST-DA";
    const CELL_B = "VERIFY-ST-DB";
    // Variant A: a counted line's live bin changed.
    const p1 = await makePart(10);
    await placeStock(db, { itemId: p1, location: CELL_A, qty: 4, tenantKey: TENANT_KEY });
    const sA = await createCountSession(db, {
      scope: "LOCATION",
      scopeValue: "VERIFY-ST-dA",
      locations: [CELL_A],
      tenantKey: TENANT_KEY,
    });
    await recordCount(db, { sessionId: sA.id, itemId: p1, location: CELL_A, countedQty: 4, tenantKey: TENANT_KEY });
    await finalizeSession(db, sA.id);
    // Mutate the live bin behind the session's back.
    await db.stockBin.updateMany({
      where: { item: { partId: p1 }, location: CELL_A, tenantKey: TENANT_KEY },
      data: { quantity: 7 },
    });
    await assertThrowsCode(
      () => postCountSession(db, { sessionId: sA.id, tenantKey: TENANT_KEY }),
      "COUNT_DRIFT",
      "(d-A) changed bin → COUNT_DRIFT",
    );
    const sAafter = (await db.stockCountSession.findUnique({ where: { id: sA.id }, select: { status: true } })) as {
      status: string;
    };
    assert(sAafter.status === "REVIEW", "(d-A) session stays REVIEW after drift");

    // Variant B: a NEW bin (different part) appears in an in-scope cell.
    const p2 = await makePart(8);
    await placeStock(db, { itemId: p2, location: CELL_B, qty: 4, tenantKey: TENANT_KEY });
    const p3 = await makePart(3); // will be placed into B AFTER snapshot
    const sB = await createCountSession(db, {
      scope: "LOCATION",
      scopeValue: "VERIFY-ST-dB",
      locations: [CELL_B],
      tenantKey: TENANT_KEY,
    });
    await recordCount(db, { sessionId: sB.id, itemId: p2, location: CELL_B, countedQty: 4, tenantKey: TENANT_KEY });
    await finalizeSession(db, sB.id);
    await placeStock(db, { itemId: p3, location: CELL_B, qty: 3, tenantKey: TENANT_KEY }); // new bin, no line
    await assertThrowsCode(
      () => postCountSession(db, { sessionId: sB.id, tenantKey: TENANT_KEY }),
      "COUNT_DRIFT",
      "(d-B) new in-scope bin → COUNT_DRIFT",
    );
    assert((await onHand(p2)) === 8, "(d-B) no writes on drift");
    console.log("(d) PASS — drift (changed + new bin) blocks the post");
  }

  // ── (e) unknown scan flagged, posts nothing ─────────────────────────────
  {
    const CELL_A = "VERIFY-ST-EA";
    const p1 = await makePart(10);
    await placeStock(db, { itemId: p1, location: CELL_A, qty: 4, tenantKey: TENANT_KEY });
    const s = await createCountSession(db, {
      scope: "LOCATION",
      scopeValue: "VERIFY-ST-e",
      locations: [CELL_A],
      tenantKey: TENANT_KEY,
    });
    await recordUnknownScan(db, { sessionId: s.id, location: CELL_A, rawCode: "VERIFY-ST-NOPART", tenantKey: TENANT_KEY });
    await recordCount(db, { sessionId: s.id, itemId: p1, location: CELL_A, countedQty: 4, tenantKey: TENANT_KEY });
    await finalizeSession(db, s.id);
    const res = await postCountSession(db, { sessionId: s.id, tenantKey: TENANT_KEY });
    assert(res.applied, "(e) post applied");
    const unknown = (await db.stockCountLine.findFirst({
      where: { sessionId: s.id, classification: "UNKNOWN" },
      select: { rawCode: true, postedDelta: true, itemId: true },
    })) as { rawCode: string | null; postedDelta: number | null; itemId: string | null } | null;
    assert(unknown && unknown.rawCode === "VERIFY-ST-NOPART", "(e) UNKNOWN line saved with raw code");
    assert(unknown!.postedDelta === null && unknown!.itemId === null, "(e) UNKNOWN posts nothing");
    assert((await binQty(p1, CELL_A)) === 4 && (await onHand(p1)) === 10, "(e) counted=system → no change");
    console.log("(e) PASS — unknown scan flagged, posts nothing");
  }

  // ── (f) retry — second post is a clean no-op ─────────────────────────────
  {
    const CELL_A = "VERIFY-ST-FA";
    const p1 = await makePart(10);
    await placeStock(db, { itemId: p1, location: CELL_A, qty: 4, tenantKey: TENANT_KEY });
    const s = await createCountSession(db, {
      scope: "LOCATION",
      scopeValue: "VERIFY-ST-f",
      locations: [CELL_A],
      tenantKey: TENANT_KEY,
    });
    await recordCount(db, { sessionId: s.id, itemId: p1, location: CELL_A, countedQty: 6, tenantKey: TENANT_KEY }); // +2
    await finalizeSession(db, s.id);
    const r1 = await postCountSession(db, { sessionId: s.id, tenantKey: TENANT_KEY });
    assert(r1.applied && (await onHand(p1)) === 12, "(f) first post applied (+2)");
    const r2 = await postCountSession(db, { sessionId: s.id, tenantKey: TENANT_KEY });
    assert(!r2.applied && r2.status === "POSTED", "(f) second post is no-op");
    assert((await onHand(p1)) === 12, "(f) retry did not double-apply");
    const mvCount = await db.stockMovement.count({
      where: { reason: "ADJUSTMENT", sourceType: "StockCount", sourceId: `${s.id}:${p1}` },
    });
    assert(mvCount === 1, "(f) exactly one ADJUSTMENT movement after retry");
    console.log("(f) PASS — post retry is idempotent");
  }

  // ── (g) pre-existing drift (Σbins > quantity) → RECONCILE_BLOCKED ─────────
  {
    const CELL_A = "VERIFY-ST-GA";
    const p1 = await makePart(8);
    await placeStock(db, { itemId: p1, location: CELL_A, qty: 8, tenantKey: TENANT_KEY }); // Σbins=8=qty
    // Simulate consumption that did not deduct the bin: drop on-hand to 5.
    await db.stockItem.update({ where: { partId: p1 }, data: { quantity: 5 } }); // now Σbins 8 > qty 5
    const s = await createCountSession(db, {
      scope: "LOCATION",
      scopeValue: "VERIFY-ST-g",
      locations: [CELL_A],
      tenantKey: TENANT_KEY,
    });
    await recordCount(db, { sessionId: s.id, itemId: p1, location: CELL_A, countedQty: 8, tenantKey: TENANT_KEY }); // net 0
    await finalizeSession(db, s.id);
    await assertThrowsCode(
      () => postCountSession(db, { sessionId: s.id, tenantKey: TENANT_KEY }),
      "RECONCILE_BLOCKED",
      "(g) pre-existing drift → RECONCILE_BLOCKED",
    );
    assert((await onHand(p1)) === 5 && (await binQty(p1, CELL_A)) === 8, "(g) no writes on reconcile block");
    console.log("(g) PASS — pre-existing drift blocks the post");
  }

  // ── (h) blocked PLACE-target cell → fail fast naming the cell ─────────────
  {
    const CELL_A = "VERIFY-ST-HA";
    const CELL_BLOCK = "VERIFY-ST-HBLK";
    const p1 = await makePart(10);
    await placeStock(db, { itemId: p1, location: CELL_A, qty: 4, tenantKey: TENANT_KEY });
    await setLocationBlocked(db, CELL_BLOCK, TENANT_KEY, { isBlocked: true }); // block the target
    const s = await createCountSession(db, {
      scope: "LOCATION",
      scopeValue: "VERIFY-ST-h",
      locations: [CELL_A],
      tenantKey: TENANT_KEY,
    });
    // Count an UNEXPECTED item into the blocked cell (a PLACE target on post).
    await recordCount(db, { sessionId: s.id, itemId: p1, location: CELL_BLOCK, countedQty: 3, tenantKey: TENANT_KEY });
    await finalizeSession(db, s.id);
    const err = await assertThrowsCode(
      () => postCountSession(db, { sessionId: s.id, tenantKey: TENANT_KEY }),
      "LOCATION_BLOCKED",
      "(h) blocked PLACE target → LOCATION_BLOCKED",
    );
    assert(err.details?.location === CELL_BLOCK, "(h) error names the blocked cell");
    const sAfter = (await db.stockCountSession.findUnique({ where: { id: s.id }, select: { status: true } })) as {
      status: string;
    };
    assert(sAfter.status === "REVIEW", "(h) session stays REVIEW");
    assert((await onHand(p1)) === 10, "(h) no writes on blocked-location fail-fast");
    console.log("(h) PASS — blocked PLACE-target fails fast, session stays REVIEW");
  }

  // ── (i) count mutations are frozen once the session leaves OPEN ──────────
  {
    const CELL_A = "VERIFY-ST-IA";
    const p1 = await makePart(10);
    await placeStock(db, { itemId: p1, location: CELL_A, qty: 4, tenantKey: TENANT_KEY });
    const s = await createCountSession(db, {
      scope: "LOCATION",
      scopeValue: "VERIFY-ST-i",
      locations: [CELL_A],
      tenantKey: TENANT_KEY,
    });
    await recordCount(db, { sessionId: s.id, itemId: p1, location: CELL_A, countedQty: 4, tenantKey: TENANT_KEY });
    await finalizeSession(db, s.id); // → REVIEW
    let threw = false;
    try {
      await recordCount(db, { sessionId: s.id, itemId: p1, location: CELL_A, countedQty: 99, tenantKey: TENANT_KEY });
    } catch (e) {
      threw = e instanceof Error && e.message === "SESSION_NOT_OPEN";
    }
    assert(threw, "(i) recordCount on a REVIEW session is rejected (SESSION_NOT_OPEN)");
    console.log("(i) PASS — count lines frozen after finalize");
  }

  // ── (j) review projection: unplaced invariant under bins-are-truth ───────
  {
    const CELL_A = "VERIFY-ST-JA";
    const p1 = await makePart(10);
    await placeStock(db, { itemId: p1, location: CELL_A, qty: 7, tenantKey: TENANT_KEY }); // placed 7, unplaced 3
    const s = await createCountSession(db, {
      scope: "LOCATION",
      scopeValue: "VERIFY-ST-j",
      locations: [CELL_A],
      tenantKey: TENANT_KEY,
    });
    await recordCount(db, { sessionId: s.id, itemId: p1, location: CELL_A, countedQty: 9, tenantKey: TENANT_KEY }); // +2 surplus
    await finalizeSession(db, s.id);
    const variance = await sessionVariance(db, s.id, TENANT_KEY);
    const v = variance.find((x) => x.itemId === p1)!;
    assert(v.netAdjustment === 2, "(j) net +2");
    assert(v.onHandBefore === 10 && v.onHandAfter === 12, "(j) on-hand 10→12");
    // Surplus is placed into the bin AND raises on-hand → unplaced unchanged (3→3).
    assert(v.unplacedBefore === 3 && v.unplacedAfter === 3, "(j) unplaced invariant 3→3 (not 3→5)");
    console.log("(j) PASS — review projection unplaced invariant correct");
  }

  // ── (k) reopen re-snapshots so drift recovery actually clears ────────────
  {
    const CELL_A = "VERIFY-ST-KA";
    const p1 = await makePart(10);
    await placeStock(db, { itemId: p1, location: CELL_A, qty: 4, tenantKey: TENANT_KEY });
    const s = await createCountSession(db, {
      scope: "LOCATION",
      scopeValue: "VERIFY-ST-k",
      locations: [CELL_A],
      tenantKey: TENANT_KEY,
    });
    await recordCount(db, { sessionId: s.id, itemId: p1, location: CELL_A, countedQty: 4, tenantKey: TENANT_KEY });
    await finalizeSession(db, s.id);
    // Drift the cell, then attempt post → blocked.
    await db.stockBin.updateMany({
      where: { item: { partId: p1 }, location: CELL_A, tenantKey: TENANT_KEY },
      data: { quantity: 7 },
    });
    await assertThrowsCode(
      () => postCountSession(db, { sessionId: s.id, tenantKey: TENANT_KEY }),
      "COUNT_DRIFT",
      "(k) drift blocks post",
    );
    // Reopen → re-snapshots systemQty to the live 7 and resets the changed line's count.
    await reopenSession(db, s.id);
    const refreshed = (await db.stockCountLine.findFirst({
      where: { sessionId: s.id, itemId: p1, location: CELL_A },
      select: { systemQty: true, countedQty: true },
    })) as { systemQty: number; countedQty: number | null };
    assert(refreshed.systemQty === 7 && refreshed.countedQty === null, "(k) reopen refreshed systemQty→7, reset count");
    // Re-count to the live value, finalize, post → now succeeds (drift cleared).
    await recordCount(db, { sessionId: s.id, itemId: p1, location: CELL_A, countedQty: 7, tenantKey: TENANT_KEY });
    await finalizeSession(db, s.id);
    const res = await postCountSession(db, { sessionId: s.id, tenantKey: TENANT_KEY });
    assert(res.applied && (await binQty(p1, CELL_A)) === 7, "(k) post succeeds after re-snapshot; bin = 7");
    console.log("(k) PASS — reopen re-snapshots, drift recovery clears");
  }

  await cleanup();
  console.log("[verify-stocktake] ALL PASS");
  process.exit(0);
}

main().catch((e) => {
  console.error("[verify-stocktake] ERROR", e);
  process.exit(1);
});
