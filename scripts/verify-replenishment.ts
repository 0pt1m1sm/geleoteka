/**
 * Verifies WMS Phase 5 replenishment domain against the dev DB.
 *
 * Pure functions:
 *  - effectiveReorderPoint / effectiveReorderUpTo null fallbacks
 *  - validateReorderPolicy (the validation the setReorderPolicy action wraps)
 *
 * buildReorderReport (seeded fixtures, prefix VERIFY-REPL- for cleanup):
 *  (A) below-point, no incoming → included, suggested = upTo − net
 *  (B) exactly at point, reorderUpTo unset → included, suggested = 1 (clamp)
 *  (C) below-point but an ORDERED supplier order covers the gap → excluded
 *  (D) null columns, net below host default → included, suggested = 1
 *  (E) null columns, net above host default → excluded
 */
import "dotenv/config";
import { db } from "../lib/db";
import { TENANT_KEY, LOW_STOCK_THRESHOLD } from "../lib/wms-host";
import {
  effectiveReorderPoint,
  effectiveReorderUpTo,
  validateReorderPolicy,
  buildReorderReport,
} from "../lib/warehouse/replenishment";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

const PREFIX = "VERIFY-REPL-";
const WH = "wh_main_geleoteka";

async function makePart(
  tag: string,
  quantity: number,
  reorderPoint: number | null,
  reorderUpTo: number | null,
): Promise<string> {
  const article = `${PREFIX}${tag}`;
  const part = (await db.part.create({
    data: { slug: article.toLowerCase(), article, name: `${PREFIX}${tag}`, price: 0, isActive: true },
    select: { id: true },
  })) as { id: string };
  await db.stockItem.create({
    data: { partId: part.id, tenantKey: TENANT_KEY, warehouseId: WH, quantity, reserved: 0, reorderPoint, reorderUpTo },
  });
  return part.id;
}

async function cleanup(): Promise<void> {
  // SupplierOrderItem cascades from SupplierOrder; StockItem cascades from Part.
  const orders = (await db.supplierOrder.findMany({
    where: { orderNumber: { startsWith: PREFIX } },
    select: { id: true },
  })) as Array<{ id: string }>;
  for (const o of orders) await db.supplierOrder.delete({ where: { id: o.id } });
  await db.part.deleteMany({ where: { article: { startsWith: PREFIX } } });
  await db.user.deleteMany({ where: { email: { startsWith: PREFIX.toLowerCase() } } });
}

async function main(): Promise<void> {
  await cleanup();

  // ---- Pure functions ----
  assert(effectiveReorderPoint({ reorderPoint: 20 }, 3) === 20, "effectiveReorderPoint uses column when set");
  assert(effectiveReorderPoint({ reorderPoint: null }, 3) === 3, "effectiveReorderPoint falls back to default");
  assert(
    effectiveReorderUpTo({ reorderPoint: 20, reorderUpTo: 30 }, 3) === 30,
    "effectiveReorderUpTo uses column when set",
  );
  assert(
    effectiveReorderUpTo({ reorderPoint: 20, reorderUpTo: null }, 3) === 20,
    "effectiveReorderUpTo falls back to effective point when only point set",
  );
  assert(
    effectiveReorderUpTo({ reorderPoint: null, reorderUpTo: null }, 3) === 3,
    "effectiveReorderUpTo falls back to default when both null",
  );

  assert(validateReorderPolicy(20, 30) === null, "valid policy accepted");
  assert(validateReorderPolicy(null, null) === null, "null policy accepted (clears override)");
  assert(validateReorderPolicy(30, 20) !== null, "upTo < point rejected");
  assert(validateReorderPolicy(-1, null) !== null, "negative point rejected");
  assert(validateReorderPolicy(2.5, null) !== null, "non-integer point rejected");

  // ---- buildReorderReport fixtures ----
  const supplier = (await db.user.create({
    data: {
      email: `${PREFIX.toLowerCase()}supplier@test`,
      phone: `${PREFIX}${Date.now()}`,
      name: `${PREFIX}supplier`,
      isSupplier: true,
    },
    select: { id: true },
  })) as { id: string };

  const idA = await makePart("A-below", 15, 20, 30);
  const idB = await makePart("B-atpoint", 5, 5, null);
  const idC = await makePart("C-incoming", 15, 20, 30);
  const idD = await makePart("D-nulldefault-below", 2, null, null);
  const idE = await makePart("E-nulldefault-above", 10, null, null);

  // F: reorderable (net 0 ≤ default) but in a DIFFERENT tenant → must be excluded
  // when the report is built for TENANT_KEY (tenant-boundary enforcement).
  const partF = (await db.part.create({
    data: { slug: `${PREFIX}f-othertenant`, article: `${PREFIX}F-othertenant`, name: `${PREFIX}F`, price: 0, isActive: true },
    select: { id: true },
  })) as { id: string };
  await db.stockItem.create({
    data: { partId: partF.id, tenantKey: "other-tenant", warehouseId: WH, quantity: 0, reserved: 0, reorderPoint: null, reorderUpTo: null },
  });

  // ORDERED supplier order owing 20 units of part C → incoming covers the gap.
  await db.supplierOrder.create({
    data: {
      userId: supplier.id,
      orderNumber: `${PREFIX}PO1`,
      orderDate: new Date(),
      status: "ORDERED",
      items: { create: [{ type: "PART", partId: idC, description: `${PREFIX}C`, quantity: 20, unitCost: 1, totalCost: 20 }] },
    },
  });

  const rows = await buildReorderReport(db, TENANT_KEY, WH, LOW_STOCK_THRESHOLD);
  const byId = new Map(rows.map((r) => [r.partId, r]));

  const a = byId.get(idA);
  assert(a, "A (below-point) is in the report");
  assert(a!.suggestedQty === 15, `A suggested = 30 − 15 = 15 (got ${a!.suggestedQty})`);
  assert(a!.incoming === 0 && a!.available === 15, "A available 15, incoming 0");
  assert(a!.reorderPoint === 20 && a!.reorderUpTo === 30, "A effective point/upTo = 20/30");

  const b = byId.get(idB);
  assert(b, "B (exactly at point, upTo unset) is in the report");
  assert(b!.suggestedQty === 1, `B suggested clamped to 1 (got ${b?.suggestedQty})`);

  assert(!byId.has(idC), "C excluded — incoming 20 lifts net 15→35 above point 20");

  const d = byId.get(idD);
  assert(d, "D (null columns, net 2 ≤ default 3) is in the report");
  assert(d!.reorderPoint === LOW_STOCK_THRESHOLD, "D effective point = host default");
  assert(d!.suggestedQty === 1, `D suggested = max(1, 3 − 2) = 1 (got ${d?.suggestedQty})`);

  assert(!byId.has(idE), "E excluded — null columns, net 10 > default 3");

  assert(!byId.has(partF.id), "F excluded — reorderable but belongs to another tenant");

  await cleanup();
  console.log("PASS: replenishment domain (5 pure-fn checks + A–F report cases incl. tenant boundary)");
  process.exit(0);
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
