/**
 * Verifies the resolveInboundEmail waterfall against the dev DB.
 *   - thread: In-Reply-To matches a previous CommunicationLog.externalId
 *   - customer: from-email matches User.email → attach to most-recent open deal
 *   - inbox: unknown sender → new InboxMessage with status=PENDING
 *
 * Run: `npm run verify-email-resolve`. Exits 1 on failure.
 */

import "dotenv/config";
import { db } from "../lib/db";
import { resolveInboundEmail } from "../lib/email/resolve";
import {
  type ResendInboundEnvelope,
  type ResendInboundContent,
} from "../lib/email/inbound";
import {
  generateOutboundMessageId,
  recordOutboundEmail,
} from "../lib/email/log";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

function envelope(opts: {
  messageId: string;
  emailId: string;
  from: string;
  subject?: string;
}): ResendInboundEnvelope {
  return {
    type: "email.received",
    created_at: new Date().toISOString(),
    data: {
      email_id: opts.emailId,
      created_at: new Date().toISOString(),
      from: opts.from,
      to: ["info@geleoteka.ru"],
      bcc: [],
      cc: [],
      message_id: opts.messageId,
      subject: opts.subject ?? "verify-resolve subject",
      attachments: [
        { id: "att-1", filename: "x.txt", content_type: "text/plain", content_disposition: "attachment" },
      ],
    },
  };
}

function content(opts: { headers?: Array<{ name: string; value: string }> } = {}): ResendInboundContent {
  return {
    text: "verify-resolve body",
    html: null,
    headers: opts.headers ?? [],
  };
}

async function cleanup(prefix: string): Promise<void> {
  await db.communicationLog.deleteMany({
    where: { OR: [{ externalId: { contains: prefix } }, { resendEmailId: { contains: prefix } }] },
  });
  await db.inboxMessage.deleteMany({
    where: { OR: [{ messageId: { contains: prefix } }, { resendEmailId: { contains: prefix } }] },
  });
}

async function main(): Promise<void> {
  console.log("[verify-email-resolve] starting");

  const TAG = "verify-resolve";

  // Seed cleanup of any prior run.
  await cleanup(TAG);

  // Pick the seeded client@test.ru.
  const customer = (await db.user.findFirst({
    where: { email: "client@test.ru" },
    select: { id: true },
  })) as { id: string } | null;
  assert(customer, "seed client@test.ru not found");
  const customerId = customer.id;

  // 1. Inbox fallback: from-email matches NOTHING in DB.
  {
    const env = envelope({
      messageId: `<${TAG}-1@example.test>`,
      emailId: `${TAG}-1-resend-uuid`,
      from: "stranger@example.test",
    });
    const r = await resolveInboundEmail({ envelope: env, content: content() });
    assert(r.kind === "inbox", `expected kind=inbox, got ${r.kind}`);
    const row = await db.inboxMessage.findUnique({ where: { id: r.id }, select: { fromEmail: true, status: true, attachments: true } });
    assert(row?.status === "PENDING", `expected PENDING, got ${row?.status}`);
    assert(row?.fromEmail === "stranger@example.test", "fromEmail not normalised");
    assert(Array.isArray(row?.attachments) && (row!.attachments as unknown[]).length === 1, "attachments not stored");
    console.log("  ✓ unknown sender → InboxMessage(PENDING)");
  }

  // 2. Customer match: from = client@test.ru → CommunicationLog
  {
    const env = envelope({
      messageId: `<${TAG}-2@example.test>`,
      emailId: `${TAG}-2-resend-uuid`,
      from: "Client <client@test.ru>",
    });
    const r = await resolveInboundEmail({ envelope: env, content: content() });
    assert(r.kind === "customer", `expected kind=customer, got ${r.kind}`);
    const row = await db.communicationLog.findUnique({
      where: { id: r.id },
      select: { channel: true, customerUserId: true, subject: true, attachments: true, resendEmailId: true },
    });
    assert(row?.channel === "EMAIL_INBOUND", `expected EMAIL_INBOUND, got ${row?.channel}`);
    assert(row?.customerUserId === customerId, "wrong customerUserId");
    assert(row?.resendEmailId === `${TAG}-2-resend-uuid`, "resendEmailId not stored");
    assert(Array.isArray(row?.attachments) && (row!.attachments as unknown[]).length === 1, "attachments not stored");
    console.log("  ✓ known customer → CommunicationLog(EMAIL_INBOUND)");
  }

  // 3. Thread match: pre-seed an EMAIL_OUTBOUND row, then reply with In-Reply-To.
  {
    const outId = generateOutboundMessageId();
    await recordOutboundEmail({
      customerUserId: customerId,
      subject: `${TAG} outbound`,
      body: "outgoing",
      messageId: outId,
    });
    const env = envelope({
      messageId: `<${TAG}-3-reply@example.test>`,
      emailId: `${TAG}-3-resend-uuid`,
      from: "someone-else@example.test", // not a customer — proves In-Reply-To wins
    });
    const ctx = content({ headers: [{ name: "In-Reply-To", value: outId }] });
    const r = await resolveInboundEmail({ envelope: env, content: ctx });
    assert(r.kind === "thread", `expected kind=thread, got ${r.kind}`);
    const row = await db.communicationLog.findUnique({
      where: { id: r.id },
      select: { customerUserId: true, channel: true },
    });
    assert(row?.customerUserId === customerId, "thread row attached to wrong customer");
    assert(row?.channel === "EMAIL_INBOUND", "wrong channel");
    console.log("  ✓ In-Reply-To → threaded to original CommunicationLog");
  }

  // Cleanup.
  await cleanup(TAG);
  await db.communicationLog.deleteMany({ where: { subject: `${TAG} outbound` } });

  console.log("[verify-email-resolve] PASS");
}

main()
  .catch((err) => {
    console.error("[verify-email-resolve] ERROR", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
