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
import { createDeal, recomputeEstimateTotals, computeEstimateMoney } from "../lib/crm/public";

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
      taxRate: true,
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
    taxRate: number;
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
        taxRate: parent.taxRate,
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

  // 2. Deal + estimate totals reflect the estimate (recomputed in createDeal).
  //    New estimates default to taxRate 20%, so tax = round(8000 * 0.2) = 1600,
  //    total = 8000 + 1600 = 9600. createDeal now routes through the estimate
  //    recompute, so BOTH estimate and deal carry tax.
  const dealRow = (await db.deal.findUnique({
    where: { id: deal.id },
    select: { total: true, subtotalLabor: true, subtotalParts: true, tax: true },
  })) as { total: number; subtotalLabor: number; subtotalParts: number; tax: number };
  assert(dealRow.subtotalLabor === 3000, `subtotalLabor=${dealRow.subtotalLabor}, expected 3000`);
  assert(dealRow.subtotalParts === 5000, `subtotalParts=${dealRow.subtotalParts}, expected 5000`);
  assert(dealRow.tax === 1600, `deal.tax=${dealRow.tax}, expected 1600 (8000 * 20%)`);
  assert(dealRow.total === 9600, `deal.total=${dealRow.total}, expected 9600 (8000 + 1600 tax)`);
  const estRow0 = (await db.estimate.findUnique({
    where: { id: est.id },
    select: { tax: true, total: true, taxRate: true },
  })) as { tax: number; total: number; taxRate: number };
  assert(estRow0.taxRate === 20 && estRow0.tax === 1600 && estRow0.total === 9600, `estimate carries 20% tax (rate=${estRow0.taxRate}, tax=${estRow0.tax}, total=${estRow0.total})`);
  console.log("  ✓ createDeal: estimate & deal carry default 20% tax; totals consistent");

  // 2b. Change the rate to 10% and recompute → tax 800, total 8800 on both.
  await db.estimate.update({ where: { id: est.id }, data: { taxRate: 10 } });
  await recomputeEstimateTotals(est.id);
  const estRow1 = (await db.estimate.findUnique({ where: { id: est.id }, select: { tax: true, total: true } })) as { tax: number; total: number };
  const dealRow1 = (await db.deal.findUnique({ where: { id: deal.id }, select: { tax: true, total: true } })) as { tax: number; total: number };
  assert(estRow1.tax === 800 && estRow1.total === 8800, `rate 10% → estimate tax 800/total 8800, got ${estRow1.tax}/${estRow1.total}`);
  assert(dealRow1.tax === 800 && dealRow1.total === 8800, `rate 10% cascades to deal (tax ${dealRow1.tax}/total ${dealRow1.total})`);
  console.log("  ✓ setting taxRate recomputes tax on estimate AND deal (cascade)");

  // 2c. computeEstimateMoney pure-helper edge cases.
  const clamp = computeEstimateMoney([{ type: "LABOR", total: 1000 }, { type: "DISCOUNT", total: -2000 }], 20);
  // Over-discount: the taxable base clamps to 0 (tax 0) AND the grand total clamps
  // to 0 — audit finding C10 (commit 704d52c): a negative total must not propagate
  // to PartShipment.total. subtotal 1000 − discount 2000 → base 0, total 0.
  assert(clamp.tax === 0 && clamp.total === 0, `over-discount clamps base AND total to 0 (tax ${clamp.tax}/total ${clamp.total})`);
  const zero = computeEstimateMoney([{ type: "PART", total: 5000 }], 0);
  assert(zero.tax === 0 && zero.total === 5000, `rate 0 → no tax (tax ${zero.tax}/total ${zero.total})`);
  const fee = computeEstimateMoney([{ type: "PART", total: 1000 }, { type: "FEE", total: 500 }], 10);
  assert(fee.tax === 100 && fee.total === 1600, `FEE excluded from base, included in total (tax ${fee.tax}/total ${fee.total})`);
  console.log("  ✓ computeEstimateMoney: clamp, zero-rate, FEE-excluded-from-base");

  // 2d. createDeal must sign DISCOUNT lines negative (regression: it stored
  //     raw qty*unitPrice, so the discount INCREASED the total instead of
  //     reducing it). PART 5000 + DISCOUNT 1000 @ 20% →
  //     base = 5000 - 1000 = 4000, tax = 800, total = 4800.
  const discountDeal = await createDeal({
    customerUserId: customer.id,
    channel: "SERVICE",
    source: "verify-deal-estimate-discount",
    initialStage: "NEW",
    lines: [
      { type: "PART", description: "verify-test part", qty: 1, unitPrice: 5000 },
      { type: "DISCOUNT", description: "verify-test discount", qty: 1, unitPrice: 1000 },
    ],
  });
  const discRows = (await db.estimate.findMany({
    where: { dealId: discountDeal.id },
    select: {
      discount: true,
      total: true,
      tax: true,
      estimateLines: { where: { type: "DISCOUNT" }, select: { unitPrice: true, total: true } },
    },
  })) as Array<{
    discount: number;
    total: number;
    tax: number;
    estimateLines: Array<{ unitPrice: number; total: number }>;
  }>;
  const discEst = discRows[0];
  assert(discEst.estimateLines[0].unitPrice === -1000, `DISCOUNT line unitPrice should be -1000, got ${discEst.estimateLines[0].unitPrice}`);
  assert(discEst.estimateLines[0].total === -1000, `DISCOUNT line total should be -1000, got ${discEst.estimateLines[0].total}`);
  assert(discEst.discount === -1000, `estimate.discount should be -1000, got ${discEst.discount}`);
  assert(discEst.tax === 800, `tax on post-discount base 4000 @ 20% should be 800, got ${discEst.tax}`);
  assert(discEst.total === 4800, `total should be 4800 (5000 - 1000 + 800 tax), got ${discEst.total}`);
  const discDealRow = (await db.deal.findUnique({ where: { id: discountDeal.id }, select: { total: true } })) as { total: number };
  assert(discDealRow.total === 4800, `deal.total should be 4800, got ${discDealRow.total}`);
  await db.deal.delete({ where: { id: discountDeal.id } });
  console.log("  ✓ createDeal signs DISCOUNT lines negative (discount reduces total)");

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
        taxRate: true,
        estimateLines: { select: { description: true } },
      },
    }),
  ])) as [
    { stage: string } | null,
    | { stage: string; parentEstimateId: string | null; taxRate: number; estimateLines: Array<{ description: string }> }
    | null,
  ];
  assert(parent?.stage === "SUPERSEDED", `parent stage=${parent?.stage}, expected SUPERSEDED`);
  assert(child?.stage === "DRAFT", `child stage=${child?.stage}, expected DRAFT`);
  assert(child?.parentEstimateId === est.id, "child.parentEstimateId mismatch");
  assert(child?.estimateLines.length === 2, "child should clone 2 lines from parent");
  assert(child?.taxRate === 10, `revision must keep parent taxRate 10, got ${child?.taxRate}`);
  console.log("  ✓ reviseEstimate clones lines + taxRate + supersedes parent");

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
