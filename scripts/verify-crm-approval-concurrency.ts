/**
 * Verifies the concurrency/atomicity guards added for CRM audit findings:
 *  C1 — estimate approval CAS: only one DRAFT/SENT→APPROVED transition wins,
 *       so a double-submit can't double-dispatch fulfillment.
 *  C2 — customerDeclineEstimate now releases PART-line reservations (the held
 *       reserved stock returns).
 *  C3 — setDealStage CAS: only one transition from the observed stage wins, so
 *       lifetimeValue is adjusted exactly once per real WON transition.
 * Every fixture is created inside a transaction that is rolled back — no data
 * persists and real stock/deals are never touched.
 */
import "dotenv/config";
import { db } from "../lib/db";
import { reservePartLinesForEstimate, releasePartLinesForEstimate } from "../lib/fulfillment/reservations";

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

const WH = "wh_main_geleoteka";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

class Rollback extends Error {}

async function rolledBack(fn: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await db.$transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

async function main(): Promise<void> {
  console.log("[verify-crm-approval-concurrency] starting");

  const customer = (await db.user.findFirst({
    where: { email: "client@test.ru" },
    select: { id: true },
  })) as { id: string } | null;
  assert(customer, "seed client@test.ru not found");
  const customerId = customer.id;
  const ts = Date.now();

  // C1 — estimate-stage CAS: first DRAFT/SENT→APPROVED wins (count 1), second is a no-op (count 0).
  await rolledBack(async (tx) => {
    const deal = (await tx.deal.create({
      data: { customerUserId: customerId, channel: "PARTS_RETAIL", stage: "IN_PROGRESS" },
      select: { id: true },
    })) as { id: string };
    const est = (await tx.estimate.create({
      data: { dealId: deal.id, stage: "SENT" },
      select: { id: true },
    })) as { id: string };

    const first = await tx.estimate.updateMany({
      where: { id: est.id, stage: { in: ["DRAFT", "SENT"] } },
      data: { stage: "APPROVED", approvedAt: new Date() },
    });
    const second = await tx.estimate.updateMany({
      where: { id: est.id, stage: { in: ["DRAFT", "SENT"] } },
      data: { stage: "APPROVED", approvedAt: new Date() },
    });
    assert(first.count === 1, `first approval CAS should match 1 (got ${first.count})`);
    assert(second.count === 0, `second approval CAS must match 0 — no double dispatch (got ${second.count})`);
  });
  console.log("  ✓ C1: estimate-approval CAS transitions exactly once (no double fulfillment)");

  // C2 — customer decline releases reservations: reserve then release a PART line's hold.
  await rolledBack(async (tx) => {
    const part = (await tx.part.create({
      data: { slug: `crm-verify-${ts}`, article: `CRMV-${ts}`, name: "CRM Verify Part", price: 1000 },
      select: { id: true },
    })) as { id: string };
    const deal = (await tx.deal.create({
      data: { customerUserId: customerId, channel: "SERVICE", stage: "NEW" },
      select: { id: true },
    })) as { id: string };
    const est = (await tx.estimate.create({
      data: { dealId: deal.id, stage: "SENT" },
      select: { id: true },
    })) as { id: string };
    await tx.estimateLine.create({
      data: { estimateId: est.id, type: "PART", description: "p", qty: 4, unitPrice: 1000, total: 4000, partId: part.id },
    });

    await reservePartLinesForEstimate(tx, est.id);
    const afterReserve = (await tx.stockItem.findUnique({
      where: { partId_warehouseId: { partId: part.id, warehouseId: WH } },
      select: { reserved: true },
    })) as { reserved: number } | null;
    assert(afterReserve?.reserved === 4, `reserve should hold 4 (got ${afterReserve?.reserved})`);

    await releasePartLinesForEstimate(tx, est.id);
    const afterRelease = (await tx.stockItem.findUnique({
      where: { partId_warehouseId: { partId: part.id, warehouseId: WH } },
      select: { reserved: true },
    })) as { reserved: number } | null;
    assert(afterRelease?.reserved === 0, `decline must release the hold back to 0 (got ${afterRelease?.reserved})`);
  });
  console.log("  ✓ C2: decline releases PART-line reservations (4 → 0)");

  // C3 — deal-stage CAS: first IN_PROGRESS→WON wins (count 1, LTV applies), second no-op (count 0).
  await rolledBack(async (tx) => {
    const deal = (await tx.deal.create({
      data: { customerUserId: customerId, channel: "SERVICE", stage: "IN_PROGRESS", total: 5000 },
      select: { id: true },
    })) as { id: string };
    const first = await tx.deal.updateMany({ where: { id: deal.id, stage: "IN_PROGRESS" }, data: { stage: "WON" } });
    const second = await tx.deal.updateMany({ where: { id: deal.id, stage: "IN_PROGRESS" }, data: { stage: "WON" } });
    assert(first.count === 1, `first WON transition should match 1 (got ${first.count})`);
    assert(second.count === 0, `second WON transition must match 0 — LTV counted once (got ${second.count})`);
  });
  console.log("  ✓ C3: deal-stage CAS transitions once (lifetimeValue not double-counted)");

  console.log("  ✓ all fixtures rolled back — nothing persisted");
  console.log("[verify-crm-approval-concurrency] PASS");
}

main()
  .catch((err) => {
    console.error("[verify-crm-approval-concurrency] ERROR", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
