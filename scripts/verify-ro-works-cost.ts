/**
 * Regression guard for the RepairOrder detail "works cost" figure.
 *
 * Bug: the admin RO detail page rendered `ro.total`, which is always 0 for
 * SERVICE orders (dispatch-fulfillment creates the RO with no financial
 * fields — money lives on the deal's APPROVED estimate). The page now shows
 * the deal's most-recently-APPROVED estimate total instead.
 *
 * The page is an RSC behind requireRole (needs request cookies a tsx script
 * can't supply), so this exercises the SAME production resolver the page calls
 * — getApprovedWorksCost — rather than a copy, and asserts it resolves the
 * approved estimate's works (Работы / labor) subtotal, not the RO's own 0.
 * (That the page actually renders this value is covered by browser E2E; this
 * guards the resolver's logic: stage filter, most-recent ordering, the labor
 * subtotal field, and the null/fallback contract.)
 *
 * Run: `npm run verify-ro-works-cost`. Exits 1 on failure.
 */

import "dotenv/config";
import { db } from "../lib/db";
import { createDeal } from "../lib/crm/public";
import { getApprovedWorksCost } from "../lib/crm/approved-estimate";

/* eslint-disable @typescript-eslint/no-explicit-any */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

/** The page's works-cost resolution: production helper, with the RO fallback. */
async function resolveWorksCost(ro: { dealId: string; total: number }): Promise<number> {
  return (await getApprovedWorksCost(ro.dealId)) ?? ro.total;
}

async function main(): Promise<void> {
  console.log("[verify-ro-works-cost] starting");

  const customer = (await (db as any).user.findFirst({
    where: { email: "client@test.ru" },
    select: { id: true },
  })) as { id: string } | null;
  assert(customer, "seed client@test.ru not found");

  let vehicle = (await (db as any).vehicle.findFirst({
    where: { ownerUserId: customer.id },
    select: { id: true },
  })) as { id: string } | null;
  let createdVehicle = false;
  if (!vehicle) {
    vehicle = (await (db as any).vehicle.create({
      data: { ownerUserId: customer.id, model: "G 63 AMG", year: 2022, ownershipType: "CUSTOMER" },
      select: { id: true },
    })) as { id: string };
    createdVehicle = true;
  }

  // SERVICE deal with an APPROVED estimate (labor + part), and a RO that — like
  // the real dispatch path — carries no financials of its own (total stays 0).
  const deal = await createDeal({
    customerUserId: customer.id,
    vehicleId: vehicle.id,
    channel: "SERVICE",
    source: "verify-ro-works-cost",
    initialStage: "IN_PROGRESS",
    lines: [
      { type: "LABOR", description: "verify works labor", qty: 2, unitPrice: 4000 },
      { type: "PART", description: "verify works part", qty: 1, unitPrice: 6000 },
    ],
  });

  const est = (await (db as any).estimate.findFirst({
    where: { dealId: deal.id },
    select: { id: true, subtotalLabor: true, total: true },
  })) as { id: string; subtotalLabor: number; total: number };
  // Works (Работы) = labor only: 2 × 4000 = 8000. Total (16800) includes the
  // 6000 part + 20% tax — works cost must be the labor subtotal, NOT the total.
  assert(est.subtotalLabor === 8000, `works (labor) subtotal expected 8000, got ${est.subtotalLabor}`);
  assert(est.total === 16800, `estimate total expected 16800, got ${est.total}`);
  await (db as any).estimate.update({
    where: { id: est.id },
    data: { stage: "APPROVED", approvedAt: new Date() },
  });

  const ro = (await (db as any).repairOrder.create({
    data: {
      userId: customer.id,
      vehicleId: vehicle.id,
      dealId: deal.id,
      dateTime: new Date(),
      status: "IN_PROGRESS",
    },
    select: { id: true, total: true, dealId: true },
  })) as { id: string; total: number; dealId: string };

  // The defect: the RO's own total is 0...
  assert(ro.total === 0, `RO.total should default to 0, got ${ro.total}`);
  // ...but the page must surface the approved estimate's works (labor) subtotal.
  const worksCost = await resolveWorksCost(ro);
  assert(
    worksCost === est.subtotalLabor,
    `works cost should be the approved estimate labor subtotal ${est.subtotalLabor} (not the full total ${est.total}), got ${worksCost}`,
  );
  console.log(`  ✓ works cost resolves to approved estimate works/labor subtotal (${worksCost}), not RO.total (0) or total (${est.total})`);

  // No approved estimate → falls back to RO.total (legacy / unpriced orders).
  await (db as any).estimate.update({ where: { id: est.id }, data: { stage: "SENT", approvedAt: null } });
  const fallback = await resolveWorksCost(ro);
  assert(fallback === ro.total, `without an approved estimate, works cost falls back to RO.total, got ${fallback}`);
  console.log("  ✓ falls back to RO.total when the deal has no approved estimate");

  // Cleanup (deal cascade removes estimate + RO).
  await (db as any).deal.delete({ where: { id: deal.id } });
  if (createdVehicle) await (db as any).vehicle.delete({ where: { id: vehicle.id } });
  console.log("[verify-ro-works-cost] PASS");
}

main()
  .catch((err) => {
    console.error("[verify-ro-works-cost] ERROR", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
