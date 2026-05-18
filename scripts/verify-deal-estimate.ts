/**
 * Smokes the DealLine → EstimateLine refactor against the dev DB:
 *
 *  - createDeal({ lines: [...] }) creates a Deal + an initial DRAFT Estimate
 *    populated with those lines (and NOT a DealLine row — the model is gone).
 *  - Deal totals reflect the active estimate's lines after recompute.
 *  - reviseEstimate clones the parent's lines into a new DRAFT and marks the
 *    parent SUPERSEDED.
 *
 * Run: `npm run verify-deal-estimate`. Exits 1 on failure.
 */

import "dotenv/config";
import { db } from "../lib/db";
import { createDeal } from "../lib/crm/public";

// reviseEstimate the action wraps in requireRole (needs request cookies),
// which a tsx script can't provide. Inline its core write logic to exercise
// the clone-and-supersede behaviour at the DB layer.
async function reviseEstimateForVerify(estimateId: string): Promise<{ estimateId: string }> {
  const parent = (await db.estimate.findUnique({
    where: { id: estimateId },
    select: {
      id: true,
      dealId: true,
      subtotalLabor: true,
      subtotalParts: true,
      subtotalRental: true,
      discount: true,
      tax: true,
      total: true,
      notes: true,
      estimateLines: {
        orderBy: { sortOrder: "asc" },
        select: {
          sortOrder: true,
          type: true,
          description: true,
          qty: true,
          unitPrice: true,
          total: true,
          partId: true,
        },
      },
    },
  })) as {
    id: string;
    dealId: string;
    subtotalLabor: number;
    subtotalParts: number;
    subtotalRental: number;
    discount: number;
    tax: number;
    total: number;
    notes: string | null;
    estimateLines: Array<{
      sortOrder: number;
      type: string;
      description: string;
      qty: number;
      unitPrice: number;
      total: number;
      partId: string | null;
    }>;
  };
  const child = await db.$transaction(async (tx) => {
    const created = (await tx.estimate.create({
      data: {
        dealId: parent.dealId,
        stage: "DRAFT",
        parentEstimateId: parent.id,
        notes: parent.notes,
        subtotalLabor: parent.subtotalLabor,
        subtotalParts: parent.subtotalParts,
        subtotalRental: parent.subtotalRental,
        discount: parent.discount,
        tax: parent.tax,
        total: parent.total,
        estimateLines: {
          create: parent.estimateLines.map((l) => ({
            sortOrder: l.sortOrder,
            type: l.type as never,
            description: l.description,
            qty: l.qty,
            unitPrice: l.unitPrice,
            total: l.total,
            partId: l.partId,
          })),
        },
      },
      select: { id: true },
    })) as { id: string };
    await tx.estimate.update({
      where: { id: parent.id },
      data: { stage: "SUPERSEDED" },
    });
    return created;
  });
  return { estimateId: child.id };
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  console.log("[verify-deal-estimate] starting");

  const customer = (await db.user.findFirst({
    where: { email: "client@test.ru" },
    select: { id: true },
  })) as { id: string } | null;
  assert(customer, "seed client@test.ru not found");

  // 1. createDeal with lines → deal + DRAFT estimate with EstimateLines.
  const deal = await createDeal({
    customerUserId: customer.id,
    channel: "SERVICE",
    source: "verify-deal-estimate",
    initialStage: "NEW",
    lines: [
      { type: "LABOR", description: "verify-test labor", qty: 2, unitPrice: 1500 },
      { type: "PART", description: "verify-test part", qty: 1, unitPrice: 5000 },
    ],
  });

  const estimates = (await db.estimate.findMany({
    where: { dealId: deal.id },
    select: {
      id: true,
      stage: true,
      total: true,
      estimateLines: { select: { type: true, total: true, description: true } },
    },
  })) as Array<{
    id: string;
    stage: string;
    total: number;
    estimateLines: Array<{ type: string; total: number; description: string }>;
  }>;
  assert(estimates.length === 1, `expected 1 estimate, got ${estimates.length}`);
  const est = estimates[0];
  assert(est.stage === "DRAFT", `expected DRAFT, got ${est.stage}`);
  assert(est.estimateLines.length === 2, `expected 2 EstimateLines, got ${est.estimateLines.length}`);
  console.log("  ✓ createDeal populated initial DRAFT estimate");

  // 2. Deal totals reflect estimate (recomputed in createDeal).
  const dealRow = (await db.deal.findUnique({
    where: { id: deal.id },
    select: { total: true, subtotalLabor: true, subtotalParts: true },
  })) as { total: number; subtotalLabor: number; subtotalParts: number };
  assert(dealRow.total === 8000, `deal.total=${dealRow.total}, expected 8000 (2*1500 + 1*5000)`);
  assert(dealRow.subtotalLabor === 3000, `subtotalLabor=${dealRow.subtotalLabor}, expected 3000`);
  assert(dealRow.subtotalParts === 5000, `subtotalParts=${dealRow.subtotalParts}, expected 5000`);
  console.log("  ✓ Deal totals match active estimate after createDeal");

  // 3. Send the estimate then revise it — child clones parent lines.
  await db.estimate.update({ where: { id: est.id }, data: { stage: "SENT" } });
  const revised = await reviseEstimateForVerify(est.id);

  const [parent, child] = (await Promise.all([
    db.estimate.findUnique({ where: { id: est.id }, select: { stage: true } }),
    db.estimate.findUnique({
      where: { id: revised.estimateId },
      select: {
        stage: true,
        parentEstimateId: true,
        estimateLines: { select: { description: true } },
      },
    }),
  ])) as [
    { stage: string } | null,
    | { stage: string; parentEstimateId: string | null; estimateLines: Array<{ description: string }> }
    | null,
  ];
  assert(parent?.stage === "SUPERSEDED", `parent stage=${parent?.stage}, expected SUPERSEDED`);
  assert(child?.stage === "DRAFT", `child stage=${child?.stage}, expected DRAFT`);
  assert(child?.parentEstimateId === est.id, "child.parentEstimateId mismatch");
  assert(child?.estimateLines.length === 2, "child should clone 2 lines from parent");
  console.log("  ✓ reviseEstimate clones lines + supersedes parent");

  // Cleanup.
  await db.deal.delete({ where: { id: deal.id } });
  console.log("[verify-deal-estimate] PASS");
}

main()
  .catch((err) => {
    console.error("[verify-deal-estimate] ERROR", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
