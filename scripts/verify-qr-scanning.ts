/**
 * Verifies the Phase 2.5 QR-scanning foundation against the dev DB and pure
 * helpers:
 *  - typed QR parser/formatter (Task 2) — pure
 *  - StockLocation registry + LOCATION_BLOCKED enforcement (Task 3)
 *  - ScanEvent recording + generalized idempotency_key guard (Task 4)
 *  - scan-router resolveScan routing + one-ScanEvent-per-branch (Task 5)
 *
 * Runs on throwaway VERIFY-QR-* entities so cleanup is a single cascade delete.
 */
import "dotenv/config";
import { db } from "../lib/db";
import {
  parseScanCode,
  formatScanCode,
  placeStock,
  transferStock,
  binsForItem,
  setLocationBlocked,
  getLocation,
  recordMovement,
  recordScanEvent,
  WmsError,
} from "../lib/wms/public";

const TENANT = "geleoteka";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

async function makeThrowawayPart(qty: number): Promise<string> {
  const part = (await db.part.create({
    data: {
      slug: `verify-qr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      article: `VERIFY-QR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: "verify-qr part",
      price: 100,
      stockItem: { create: { quantity: qty, tenantKey: TENANT } },
    },
    select: { id: true },
  })) as { id: string };
  return part.id;
}

async function verifyLocations(): Promise<void> {
  await db.stockLocation.deleteMany({ where: { code: { startsWith: "QRLOC-" } } });
  const partId = await makeThrowawayPart(100);

  // place into a pre-blocked location → LOCATION_BLOCKED, no bin written.
  await db.stockLocation.create({
    data: { code: "QRLOC-BLOCKED", tenantKey: TENANT, isActive: true, isBlocked: true },
  });
  let blockedThrew = false;
  try {
    await placeStock(db, { itemId: partId, location: "QRLOC-BLOCKED", qty: 5, tenantKey: TENANT });
  } catch (e) {
    blockedThrew = e instanceof WmsError && e.code === "LOCATION_BLOCKED";
  }
  const afterBlocked = await binsForItem(db, partId, TENANT);
  assert(blockedThrew, "place into blocked location must throw LOCATION_BLOCKED");
  assert(afterBlocked.placed === 0, "rejected place into blocked writes no bin");
  console.log("  ✓ placeStock into a blocked location is rejected (LOCATION_BLOCKED), no bin written");

  // place into a never-seen location → auto-creates active StockLocation + succeeds.
  await placeStock(db, { itemId: partId, location: "qrloc-fresh", qty: 5, tenantKey: TENANT });
  const fresh = await getLocation(db, "QRLOC-FRESH", TENANT);
  const afterFresh = await binsForItem(db, partId, TENANT);
  assert(fresh && fresh.isActive && !fresh.isBlocked, "fresh location auto-created active+unblocked");
  assert(afterFresh.bins.some((b) => b.location === "QRLOC-FRESH" && b.quantity === 5), "fresh place succeeded");
  console.log("  ✓ placeStock into a never-seen location auto-creates an active StockLocation and succeeds");

  // transfer OUT of a now-blocked location is allowed (evacuate); INTO a blocked one is not.
  await placeStock(db, { itemId: partId, location: "QRLOC-EVAC", qty: 10, tenantKey: TENANT });
  await setLocationBlocked(db, "QRLOC-EVAC", TENANT, { isBlocked: true });
  await transferStock(db, { itemId: partId, from: "QRLOC-EVAC", to: "QRLOC-DEST", qty: 3, tenantKey: TENANT });
  const afterEvac = await binsForItem(db, partId, TENANT);
  assert(afterEvac.bins.some((b) => b.location === "QRLOC-DEST" && b.quantity === 3), "transfer out of blocked source allowed");
  console.log("  ✓ transferStock OUT of a blocked source is allowed (evacuation)");

  let toBlockedThrew = false;
  try {
    await transferStock(db, { itemId: partId, from: "QRLOC-FRESH", to: "QRLOC-BLOCKED", qty: 1, tenantKey: TENANT });
  } catch (e) {
    toBlockedThrew = e instanceof WmsError && e.code === "LOCATION_BLOCKED";
  }
  assert(toBlockedThrew, "transfer INTO a blocked destination must throw LOCATION_BLOCKED");
  console.log("  ✓ transferStock INTO a blocked destination is rejected (LOCATION_BLOCKED)");

  // cleanup
  await db.part.deleteMany({ where: { id: partId } });
  await db.stockLocation.deleteMany({ where: { code: { startsWith: "QRLOC-" } } });
}

async function verifyScanEventAndIdempotency(): Promise<void> {
  await db.stockLocation.deleteMany({ where: { code: { startsWith: "QRIDEM-" } } });

  // --- recordScanEvent: every scan logged, incl. failures ---
  const rawCode = `WMS:LOC:QRIDEM-${Date.now()}`;
  await recordScanEvent(db, {
    action: "scan",
    rawCode,
    parsedObjectType: "LOC",
    parsedObjectId: "QRIDEM-BLK",
    result: "REJECTED",
    errorCode: "LOCATION_BLOCKED",
    tenantKey: TENANT,
    userId: null,
  });
  const se = (await db.scanEvent.findFirst({ where: { rawCode } })) as
    | { result: string; errorCode: string | null; parsedObjectType: string | null }
    | null;
  assert(se && se.result === "REJECTED" && se.errorCode === "LOCATION_BLOCKED" && se.parsedObjectType === "LOC",
    `recordScanEvent must persist a queryable rejected row, got ${JSON.stringify(se)}`);
  await db.scanEvent.deleteMany({ where: { rawCode } });
  console.log("  ✓ recordScanEvent persists a queryable row for a REJECTED scan (failures audited)");

  // --- placement idempotency: same key applies once ---
  const partId = await makeThrowawayPart(100);
  const K1 = `QRIDEM-K1-${Date.now()}`;
  await placeStock(db, { itemId: partId, location: "QRIDEM-A", qty: 5, idempotencyKey: K1, tenantKey: TENANT });
  let dupThrew = false;
  try {
    await placeStock(db, { itemId: partId, location: "QRIDEM-A", qty: 5, idempotencyKey: K1, tenantKey: TENANT });
  } catch (e) {
    dupThrew = e instanceof WmsError && e.code === "DUPLICATE_OPERATION";
  }
  const afterDup = await binsForItem(db, partId, TENANT);
  assert(dupThrew, "second keyed placeStock must throw DUPLICATE_OPERATION");
  assert(afterDup.bins.find((b) => b.location === "QRIDEM-A")?.quantity === 5, "duplicate key must not double-apply (still 5)");
  console.log("  ✓ keyed placeStock applies once; repeat with same key → DUPLICATE_OPERATION, bin unchanged");

  // --- rollback proof: rejection does not burn the key ---
  await db.stockLocation.create({ data: { code: "QRIDEM-BLK", tenantKey: TENANT, isActive: true, isBlocked: true } });
  const K2 = `QRIDEM-K2-${Date.now()}`;
  let blkThrew = false;
  try {
    await placeStock(db, { itemId: partId, location: "QRIDEM-BLK", qty: 3, idempotencyKey: K2, tenantKey: TENANT });
  } catch (e) {
    blkThrew = e instanceof WmsError && e.code === "LOCATION_BLOCKED";
  }
  const burnedRows = await db.stockBinMovement.count({ where: { tenantKey: TENANT, idempotencyKey: K2 } });
  assert(blkThrew, "keyed place into blocked location throws LOCATION_BLOCKED");
  assert(burnedRows === 0, "a rejected keyed place must leave ZERO bin-movement rows with that key (claim rolled back / not inserted)");
  // retry the SAME key into a usable location → succeeds (key was not burned).
  await placeStock(db, { itemId: partId, location: "QRIDEM-OK", qty: 3, idempotencyKey: K2, tenantKey: TENANT });
  const afterRetry = await binsForItem(db, partId, TENANT);
  assert(afterRetry.bins.find((b) => b.location === "QRIDEM-OK")?.quantity === 3, "retry with same key succeeds after rejection");
  console.log("  ✓ a rejected keyed write does not burn the key — retry with the same key succeeds");

  // --- recordMovement idempotency: same payload no-op; reused key different payload → reuse error ---
  const K3 = `QRIDEM-K3-${Date.now()}`;
  const r1 = await recordMovement(db, {
    item: { itemId: partId }, reason: "RESERVATION", qty: 4,
    source: { type: "VerifyQr", id: `res-${K3}` }, idempotencyKey: K3, tenantKey: TENANT,
  });
  assert(r1.applied === true, "first keyed recordMovement applies");
  const r2 = await recordMovement(db, {
    item: { itemId: partId }, reason: "RESERVATION", qty: 4,
    source: { type: "VerifyQr", id: `res-${K3}` }, idempotencyKey: K3, tenantKey: TENANT,
  });
  assert(r2.applied === false, "repeat keyed recordMovement with identical payload → applied:false");

  let reuseThrew = false;
  try {
    await recordMovement(db, {
      item: { itemId: partId }, reason: "RELEASE", qty: 2,
      source: { type: "VerifyQr", id: `different-${K3}` }, idempotencyKey: K3, tenantKey: TENANT,
    });
  } catch (e) {
    reuseThrew = e instanceof WmsError && e.code === "IDEMPOTENCY_KEY_REUSED";
  }
  assert(reuseThrew, "reusing a key for a DIFFERENT payload must throw IDEMPOTENCY_KEY_REUSED (not a silent dedupe)");
  console.log("  ✓ recordMovement: same-payload key → no-op; reused key w/ different payload → IDEMPOTENCY_KEY_REUSED");

  // cleanup
  await db.part.deleteMany({ where: { id: partId } });
  await db.stockLocation.deleteMany({ where: { code: { startsWith: "QRIDEM-" } } });
}

function verifyParser(): void {
  // typed codes
  const part = parseScanCode("WMS:PART:ABC123");
  assert(part.type === "PART" && part.id === "ABC123", `PART parse, got ${JSON.stringify(part)}`);

  // LOC id normalized upper/trim (matches placement location normalization)
  const loc = parseScanCode("WMS:LOC:b-9-9");
  assert(loc.type === "LOC" && loc.id === "B-9-9", `LOC parse+normalize, got ${JSON.stringify(loc)}`);

  const order = parseScanCode("WMS:ORDER:SO-1001");
  assert(order.type === "ORDER" && order.id === "SO-1001", `ORDER parse, got ${JSON.stringify(order)}`);

  const box = parseScanCode("WMS:BOX:PKG-7");
  assert(box.type === "BOX" && box.id === "PKG-7", `BOX parse, got ${JSON.stringify(box)}`);

  // case-insensitive type, surrounding whitespace trimmed
  const lc = parseScanCode("  wms:part:Xy  ");
  assert(lc.type === "PART" && lc.id === "Xy", `case-insensitive+trim, got ${JSON.stringify(lc)}`);

  // legacy un-prefixed payload → RAW (backward-compat for already-printed labels)
  const raw = parseScanCode("PLAINBARCODE");
  assert(raw.type === "RAW" && raw.id === "PLAINBARCODE", `RAW passthrough, got ${JSON.stringify(raw)}`);

  // malformed WMS: prefix → UNKNOWN
  const unknown = parseScanCode("WMS:WAT:x");
  assert(unknown.type === "UNKNOWN", `malformed → UNKNOWN, got ${JSON.stringify(unknown)}`);
  const noId = parseScanCode("WMS:PART:");
  assert(noId.type === "UNKNOWN", `empty id → UNKNOWN, got ${JSON.stringify(noId)}`);

  // formatter + round-trip
  assert(formatScanCode("PART", "ABC123") === "WMS:PART:ABC123", "formatScanCode PART");
  const round = parseScanCode(formatScanCode("PART", "ABC123"));
  assert(round.type === "PART" && round.id === "ABC123", "format→parse round-trip");

  console.log("  ✓ parseScanCode/formatScanCode: typed/legacy/malformed + LOC normalization + round-trip");
}

async function verifyScanRouter(): Promise<void> {
  const { resolveScan } = await import("../lib/warehouse/scan-router");
  await db.stockLocation.deleteMany({ where: { code: { startsWith: "QRSR-" } } });
  // case-insensitive: LOC raw codes are lowercase (WMS:LOC:qrsr-…), PART are upper.
  await db.scanEvent.deleteMany({ where: { rawCode: { contains: "QRSR", mode: "insensitive" } } });

  const article = `VERIFY-QR-SR-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const barcode = `BC-${article}`;
  const part = (await db.part.create({
    data: {
      slug: `verify-qr-sr-${Date.now()}`,
      article,
      name: "verify-qr scan-router part",
      price: 100,
      stockItem: { create: { quantity: 7, tenantKey: TENANT, barcode } },
    },
    select: { id: true },
  })) as { id: string };

  const articleResolver = async (code: string): Promise<string | null> => {
    const p = (await db.part.findFirst({ where: { article: code, isActive: true }, select: { id: true } })) as { id: string } | null;
    return p?.id ?? null;
  };
  const ctx = { userId: null as string | null, action: "scan", articleResolver };

  async function scanCount(rawLike: string): Promise<number> {
    return db.scanEvent.count({ where: { rawCode: rawLike } });
  }

  // PART by barcode → SUCCESS card + exactly one ScanEvent (SUCCESS)
  const partRaw = formatScanCode("PART", barcode);
  const r1 = await resolveScan(db, parseScanCode(partRaw), TENANT, ctx);
  assert(r1.status === 200 && r1.data.kind === "part" && r1.data.itemId === part.id, `PART resolve, got ${JSON.stringify(r1)}`);
  const c1 = await scanCount(partRaw);
  const ev1 = (await db.scanEvent.findFirst({ where: { rawCode: partRaw } })) as { result: string } | null;
  assert(c1 === 1 && ev1?.result === "SUCCESS", `PART scan writes exactly one SUCCESS ScanEvent, got count=${c1}`);
  console.log("  ✓ resolveScan PART → part card + exactly one SUCCESS ScanEvent");

  // RAW (legacy un-prefixed) resolves by article fallback
  const rawArticle = await resolveScan(db, parseScanCode(article), TENANT, ctx);
  assert(rawArticle.status === 200 && rawArticle.data.kind === "part" && rawArticle.data.itemId === part.id, "RAW article fallback resolves");
  console.log("  ✓ resolveScan RAW (legacy) resolves via host article fallback");

  // unknown code → UNKNOWN_CODE 404, exactly one REJECTED ScanEvent
  const missRaw = "WMS:PART:QRSR-NOPE";
  const rMiss = await resolveScan(db, parseScanCode(missRaw), TENANT, ctx);
  assert(rMiss.status === 404 && rMiss.errorCode === "UNKNOWN_CODE", `miss → UNKNOWN_CODE 404, got ${JSON.stringify(rMiss)}`);
  const evMiss = (await db.scanEvent.findFirst({ where: { rawCode: missRaw }, orderBy: { createdAt: "desc" } })) as { result: string; errorCode: string | null } | null;
  assert((await scanCount(missRaw)) === 1 && evMiss?.result === "REJECTED" && evMiss?.errorCode === "UNKNOWN_CODE", "miss logs one REJECTED ScanEvent");
  console.log("  ✓ resolveScan unresolved PART → UNKNOWN_CODE (404) + one REJECTED ScanEvent");

  // LOC card — active location → SUCCESS
  await db.stockLocation.create({ data: { code: "QRSR-OK", tenantKey: TENANT, isActive: true, isBlocked: false } });
  const okRaw = formatScanCode("LOC", "qrsr-ok");
  const rOk = await resolveScan(db, parseScanCode(okRaw), TENANT, ctx);
  const evOk = (await db.scanEvent.findFirst({ where: { rawCode: okRaw }, orderBy: { createdAt: "desc" } })) as { result: string } | null;
  assert(rOk.status === 200 && rOk.data.kind === "location" && rOk.data.code === "QRSR-OK", `active LOC card, got ${JSON.stringify(rOk)}`);
  assert(evOk?.result === "SUCCESS", "active LOC scan logs SUCCESS");
  console.log("  ✓ resolveScan LOC (active) → location card + SUCCESS ScanEvent");

  // LOC card — BLOCKED location → 200 card with blocked flag, but audited REJECTED/LOCATION_BLOCKED (Truth 1)
  await db.stockLocation.create({ data: { code: "QRSR-L1", tenantKey: TENANT, isActive: true, isBlocked: true } });
  const locRaw = formatScanCode("LOC", "qrsr-l1");
  const rLoc = await resolveScan(db, parseScanCode(locRaw), TENANT, ctx);
  const evLoc = (await db.scanEvent.findFirst({ where: { rawCode: locRaw }, orderBy: { createdAt: "desc" } })) as { result: string; errorCode: string | null } | null;
  assert(rLoc.status === 200 && rLoc.data.kind === "location" && rLoc.data.code === "QRSR-L1" && rLoc.data.isBlocked === true, `LOC card, got ${JSON.stringify(rLoc)}`);
  assert(evLoc?.result === "REJECTED" && evLoc?.errorCode === "LOCATION_BLOCKED", `blocked LOC scan must audit REJECTED/LOCATION_BLOCKED, got ${JSON.stringify(evLoc)}`);
  console.log("  ✓ resolveScan LOC (blocked) → card with blocked flag + REJECTED/LOCATION_BLOCKED ScanEvent (Truth 1)");

  // ORDER/BOX recognized-but-unsupported → WRONG_OBJECT_TYPE 422
  const rOrder = await resolveScan(db, parseScanCode("WMS:ORDER:QRSR-SO1"), TENANT, ctx);
  assert(rOrder.status === 422 && rOrder.errorCode === "WRONG_OBJECT_TYPE", `ORDER → WRONG_OBJECT_TYPE, got ${JSON.stringify(rOrder)}`);
  console.log("  ✓ resolveScan ORDER/BOX → WRONG_OBJECT_TYPE (422), logged");

  // malformed → UNKNOWN_CODE 400
  const rUnknown = await resolveScan(db, parseScanCode("WMS:WAT:x"), TENANT, ctx);
  assert(rUnknown.status === 400 && rUnknown.errorCode === "UNKNOWN_CODE", `malformed → UNKNOWN_CODE 400, got ${JSON.stringify(rUnknown)}`);
  console.log("  ✓ resolveScan malformed code → UNKNOWN_CODE (400), logged");

  // unexpected resolution error → ERROR ScanEvent + 500 (not an unaudited crash)
  const errRaw = "WMS:PART:QRSR-BOOM";
  const boomCtx = {
    userId: null as string | null,
    action: "scan",
    articleResolver: async (): Promise<string | null> => {
      throw new Error("resolver boom");
    },
  };
  const rErr = await resolveScan(db, parseScanCode(errRaw), TENANT, boomCtx);
  const evErr = (await db.scanEvent.findFirst({ where: { rawCode: errRaw } })) as { result: string } | null;
  assert(rErr.status === 500 && rErr.errorCode === "INTERNAL", `unexpected throw → 500 INTERNAL, got ${JSON.stringify(rErr)}`);
  assert(evErr?.result === "ERROR", "unexpected resolution error must be audited as result=ERROR");
  console.log("  ✓ resolveScan unexpected error → ERROR ScanEvent + 500 (audited, not a silent crash)");

  // cleanup
  await db.part.deleteMany({ where: { id: part.id } });
  await db.stockLocation.deleteMany({ where: { code: { startsWith: "QRSR-" } } });
  await db.scanEvent.deleteMany({ where: { rawCode: { contains: "QRSR", mode: "insensitive" } } });
  await db.scanEvent.deleteMany({ where: { rawCode: { in: [partRaw, article] } } });
}

async function main(): Promise<void> {
  console.log("[verify-qr-scanning] starting");

  verifyParser();
  await verifyLocations();
  await verifyScanEventAndIdempotency();
  await verifyScanRouter();

  console.log("[verify-qr-scanning] PASS");
}

main()
  .catch((err) => {
    console.error("[verify-qr-scanning] ERROR", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
