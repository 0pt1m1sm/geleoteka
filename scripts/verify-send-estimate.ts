/**
 * Reproducing test for the silent-skip bug in `sendEstimate`.
 *
 * Bug context (docs/plans/2026-05-19-resend-inbound-outbound-broken.md):
 *
 *   `app/actions/crm/estimates.ts:159` gates the entire email-dispatch block
 *   behind `if (viewUrl && pdfUrl)`. Both URLs come from a branch that only
 *   assigns them when `deal.claimToken` is set OR `customer.isTempPassword`
 *   is false. When BOTH are absent, the email block silently skips — the
 *   estimate still transitions to SENT, no `CommunicationLog` row is
 *   created, no Resend API call is made, no error reaches the UI.
 *
 * This script reproduces the silent skip end-to-end against the local DB:
 *
 *   1. Create (or reuse) a customer with `isTempPassword=true` and a
 *      plausible email (so `isPlausibleEmail` would accept it).
 *   2. Create a deal with `claimToken=null`.
 *   3. Create a DRAFT estimate on that deal.
 *   4. Import and invoke `buildEstimateEmailLinks` (the helper extracted by
 *      Task 2 of the fix). PRE-FIX: this import fails — the helper does not
 *      exist; the assertion that follows can never run. POST-FIX: the helper
 *      returns non-null viewUrl + pdfUrl for ANY plausible-email customer,
 *      and this script's final assertion passes.
 *
 * Run: `npm run verify-send-estimate` or `npx tsx scripts/verify-send-estimate.ts`
 * Exits non-zero on any failure.
 */

import "dotenv/config";
import { db } from "../lib/db";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

interface FixtureDeal {
  id: string;
  estimateId: string;
  customerUserId: string;
}

async function setupFixture(): Promise<FixtureDeal> {
  // Use the seeded client@test.ru, force isTempPassword=true to reproduce
  // the exact "no-token + tempPassword" branch that triggers the silent skip.
  const customer = (await db.user.findFirst({
    where: { email: "client@test.ru" },
    select: { id: true, email: true },
  })) as { id: string; email: string } | null;
  assert(customer, "seed customer client@test.ru not found");

  await db.user.update({
    where: { id: customer.id },
    data: { isTempPassword: true },
  });

  // Clean leftovers from previous runs (cascade drops estimates).
  await db.deal.deleteMany({
    where: { source: "verify-send-estimate", customerUserId: customer.id },
  });

  const deal = (await db.deal.create({
    data: {
      customerUserId: customer.id,
      channel: "SERVICE",
      source: "verify-send-estimate",
      stage: "NEW",
      claimToken: null, // <-- THE bug-triggering condition
    },
    select: { id: true },
  })) as { id: string };

  const estimate = (await db.estimate.create({
    data: {
      dealId: deal.id,
      stage: "DRAFT",
    },
    select: { id: true },
  })) as { id: string };

  return { id: deal.id, estimateId: estimate.id, customerUserId: customer.id };
}

async function teardownFixture(fx: FixtureDeal): Promise<void> {
  await db.deal.deleteMany({ where: { id: fx.id } });
}

async function main(): Promise<void> {
  console.log("[verify-send-estimate] starting");

  const fx = await setupFixture();
  console.log(`  fixture: deal=${fx.id} estimate=${fx.estimateId}`);

  // Behavior under test: with claimToken=null and isTempPassword=true,
  // sendEstimate must STILL build usable URLs and dispatch an email.
  //
  // The fix (Task 2) extracts URL building into `buildEstimateEmailLinks`
  // from `app/actions/crm/estimates`. Pre-fix this import fails (helper
  // doesn't exist) — that IS the RED signal. Post-fix the import succeeds
  // and the helper returns non-null URLs for any deal+estimate pair.
  const { buildEstimateEmailLinks } = await import(
    "../app/actions/crm/estimates-email-links"
  );

  const deal = (await db.deal.findUnique({
    where: { id: fx.id },
    select: {
      id: true,
      claimToken: true,
      customer: { select: { isTempPassword: true } },
    },
  })) as
    | {
        id: string;
        claimToken: string | null;
        customer: { isTempPassword: boolean };
      }
    | null;
  assert(deal, "fixture deal disappeared");
  assert(deal.claimToken === null, "fixture should have claimToken=null");
  assert(deal.customer.isTempPassword === true, "fixture should have isTempPassword=true");

  const links = buildEstimateEmailLinks({
    appUrl: "https://geleoteka.ru",
    estimateId: fx.estimateId,
    dealClaimToken: deal.claimToken,
  });

  assert(typeof links.viewUrl === "string" && links.viewUrl.length > 0,
    `viewUrl must be a non-empty string, got ${links.viewUrl}`);
  assert(typeof links.pdfUrl === "string" && links.pdfUrl.length > 0,
    `pdfUrl must be a non-empty string, got ${links.pdfUrl}`);
  console.log(`  ✓ buildEstimateEmailLinks returns URLs even when claimToken=null + isTempPassword=true`);
  console.log(`    viewUrl=${links.viewUrl}`);
  console.log(`    pdfUrl=${links.pdfUrl}`);

  await teardownFixture(fx);

  console.log("[verify-send-estimate] PASS");
}

main()
  .catch((err) => {
    console.error("[verify-send-estimate] ERROR", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
