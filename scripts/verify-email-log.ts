/**
 * Verifies `lib/email/log.ts` against the dev DB.
 *
 *   - generateOutboundMessageId() returns a fresh id matching the contract
 *   - recordOutboundEmail() inserts an EMAIL_OUTBOUND CommunicationLog row
 *     with subject/externalId populated and outcome=N_A (initial "unconfirmed"
 *     state — flipped to ACCEPTED only after a transport takes custody).
 *   - Calling recordOutboundEmail() twice with the same messageId is idempotent
 *     (second call returns null, no duplicate row, no thrown P2002)
 *   - markOutboundEmailSent() flips outcome from N_A to ACCEPTED (a transport
 *     accepting the message is NOT proof of inbox delivery).
 *   - markOutboundEmailFailed() flips a DEFINITE reject to FAILED, but leaves an
 *     AMBIGUOUS timeout (TRANSPORT_UNKNOWN_PREFIX) in N_A so nobody blind-resends.
 *
 * Run: `npm run verify-email-log` (added in package.json scripts in Task 2)
 *      or directly: `npx tsx scripts/verify-email-log.ts`
 *
 * Exits non-zero on any failure.
 */

import "dotenv/config";
import { db } from "../lib/db";
import {
  generateOutboundMessageId,
  recordOutboundEmail,
  markOutboundEmailFailed,
  markOutboundEmailSent,
} from "../lib/email/log";
import { TRANSPORT_UNKNOWN_PREFIX } from "../lib/email/transport";

const MESSAGE_ID_RE = /^<[0-9a-f]{24}@geleoteka\.ru>$/;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  console.log("[verify-email-log] starting");

  // 1. Message-Id format and uniqueness.
  const a = generateOutboundMessageId();
  const b = generateOutboundMessageId();
  assert(MESSAGE_ID_RE.test(a), `messageId ${a} doesn't match contract`);
  assert(MESSAGE_ID_RE.test(b), `messageId ${b} doesn't match contract`);
  assert(a !== b, "generateOutboundMessageId produced duplicate");
  console.log("  ✓ generateOutboundMessageId");

  // Pick an existing customer to attach rows to (seeded — client@test.ru).
  const customer = (await db.user.findFirst({
    where: { email: "client@test.ru" },
    select: { id: true },
  })) as { id: string } | null;
  assert(customer, "seed customer client@test.ru not found");

  const messageId = generateOutboundMessageId();
  const customerId = customer.id;

  // Cleanup any previous run.
  await db.communicationLog.deleteMany({ where: { externalId: messageId } });

  // 2. recordOutboundEmail inserts a row.
  const id1 = await recordOutboundEmail({
    customerUserId: customerId,
    subject: "verify-email-log subject",
    body: "verify-email-log body",
    messageId,
  });
  assert(typeof id1 === "string", `recordOutboundEmail should return id, got ${id1}`);

  const row = (await db.communicationLog.findUnique({
    where: { externalId: messageId },
    select: {
      channel: true,
      outcome: true,
      subject: true,
      body: true,
      customerUserId: true,
    },
  })) as
    | { channel: string; outcome: string; subject: string | null; body: string | null; customerUserId: string }
    | null;
  assert(row, "row not found after recordOutboundEmail");
  assert(row.channel === "EMAIL_OUTBOUND", `channel=${row.channel}, expected EMAIL_OUTBOUND`);
  assert(row.outcome === "N_A", `outcome=${row.outcome}, expected N_A (initial — flipped on confirmed send)`);
  assert(row.subject === "verify-email-log subject", `subject mismatch: ${row.subject}`);
  assert(row.body === "verify-email-log body", `body mismatch: ${row.body}`);
  assert(row.customerUserId === customerId, "customerUserId mismatch");
  console.log("  ✓ recordOutboundEmail inserts row (N_A initial state)");

  // 3. Idempotent on duplicate messageId.
  const id2 = await recordOutboundEmail({
    customerUserId: customerId,
    subject: "ignored",
    body: "ignored",
    messageId,
  });
  assert(id2 === null, `duplicate recordOutboundEmail should return null, got ${id2}`);
  const dupCount = await db.communicationLog.count({ where: { externalId: messageId } });
  assert(dupCount === 1, `expected 1 row, got ${dupCount}`);
  console.log("  ✓ duplicate messageId is no-op");

  // 4. markOutboundEmailSent flips N_A → ACCEPTED (custody, not delivery).
  await markOutboundEmailSent(messageId);
  const sent = (await db.communicationLog.findUnique({
    where: { externalId: messageId },
    select: { outcome: true },
  })) as { outcome: string } | null;
  assert(sent?.outcome === "ACCEPTED", `expected ACCEPTED after markSent, got ${sent?.outcome}`);
  console.log("  ✓ markOutboundEmailSent flips to ACCEPTED");

  // 5. markOutboundEmailFailed flips a DEFINITE reject to FAILED.
  await markOutboundEmailFailed(messageId, "test failure");
  const failed = (await db.communicationLog.findUnique({
    where: { externalId: messageId },
    select: { outcome: true, body: true },
  })) as { outcome: string; body: string | null } | null;
  assert(failed?.outcome === "FAILED", `expected FAILED, got ${failed?.outcome}`);
  assert(failed?.body?.includes("[FAILED:") ?? false, "FAILED note not appended to body");
  console.log("  ✓ markOutboundEmailFailed (definite reject → FAILED)");

  // 5b. An AMBIGUOUS timeout must NOT be marked FAILED — it stays unconfirmed
  //     (N_A) with an [UNKNOWN: …] note, so nobody blind-resends a message that
  //     may already have gone out. Use a fresh row seeded back to N_A.
  const unknownMessageId = generateOutboundMessageId();
  await db.communicationLog.deleteMany({ where: { externalId: unknownMessageId } });
  await recordOutboundEmail({
    customerUserId: customerId,
    subject: "verify unknown",
    body: "verify unknown body",
    messageId: unknownMessageId,
  });
  await markOutboundEmailFailed(unknownMessageId, `${TRANSPORT_UNKNOWN_PREFIX} socket timeout`);
  const unknown = (await db.communicationLog.findUnique({
    where: { externalId: unknownMessageId },
    select: { outcome: true, body: true },
  })) as { outcome: string; body: string | null } | null;
  assert(unknown?.outcome === "N_A", `expected N_A for unknown timeout, got ${unknown?.outcome}`);
  assert(unknown?.body?.includes("[UNKNOWN:") ?? false, "UNKNOWN note not appended to body");
  console.log("  ✓ markOutboundEmailFailed (ambiguous timeout → stays N_A, [UNKNOWN])");
  await db.communicationLog.deleteMany({ where: { externalId: unknownMessageId } });

  // 6. markOutboundEmailFailed / Sent on missing row is a no-op (does not throw).
  await markOutboundEmailFailed("<missing@geleoteka.ru>", "noop");
  await markOutboundEmailSent("<missing@geleoteka.ru>");
  console.log("  ✓ markOutbound* no-op on missing");

  // Cleanup.
  await db.communicationLog.deleteMany({ where: { externalId: messageId } });

  console.log("[verify-email-log] PASS");
}

main()
  .catch((err) => {
    console.error("[verify-email-log] ERROR", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
