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
import { resolveInboundEmail, resolveOutboundEmail } from "../lib/email/resolve";
import {
  resendEnvelopeToParsedEmail,
  type ResendInboundEnvelope,
  type ResendInboundContent,
} from "../lib/email/inbound";
import { type EmailIngestTx } from "../lib/email/db-port";
import { type ParsedEmail } from "../lib/email/types";
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
      to: ["sales@geleoteka.ru"],
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

/**
 * The waterfall now takes a provider-neutral `ParsedEmail` plus the client it
 * should write through, so the Resend envelope is mapped first — exactly as the
 * webhook route does before handing off to `ingestEmail`.
 */
function resolve(env: ResendInboundEnvelope, ctx: ResendInboundContent) {
  return resolveInboundEmail({
    parsed: resendEnvelopeToParsedEmail({ envelope: env, content: ctx }),
    client: db as unknown as EmailIngestTx,
  });
}

/** Build an OUTBOUND ParsedEmail — the archive copy of one of our own sends. */
function outboundParsed(opts: {
  messageId: string;
  from: string;
  to: string[];
  uid: bigint;
}): ParsedEmail {
  return {
    provider: "TIMEWEB_IMAP",
    direction: "OUTBOUND",
    from: { email: opts.from },
    to: opts.to.map((email) => ({ email })),
    cc: [],
    bcc: [],
    subject: "verify-resolve outbound",
    bodyText: "outgoing body",
    bodyHtml: null,
    rfcMessageId: opts.messageId,
    rfcMessageIdSynthetic: false,
    inReplyTo: null,
    references: [],
    occurredAt: new Date(),
    occurredAtEstimated: false,
    source: { mailbox: "crm-archive@geleoteka.ru", folder: "INBOX", uidValidity: 77n, uid: opts.uid },
    providerLocator: {
      kind: "imap",
      mailbox: "crm-archive@geleoteka.ru",
      folder: "INBOX",
      uidValidity: "77",
      uid: opts.uid.toString(),
    },
    attachments: [],
  };
}

function resolveOutbound(parsed: ParsedEmail) {
  return resolveOutboundEmail({ parsed, client: db as unknown as EmailIngestTx });
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
  // Pre-cleanup of auto-tasks the inbound flow may have left from a prior abort.
  await db.crmTask.deleteMany({
    where: { kind: "FOLLOW_UP", title: { startsWith: "Ответить клиенту:" } },
  });

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
    const r = await resolve(env, content());
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
    const r = await resolve(env, content());
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

    // The auto-task assertion moved to verify-email-ingest: raising the
    // follow-up is `ingestEmail`'s best-effort step, so resolving a message no
    // longer has that side effect. Coverage was not dropped — it got stricter
    // there (it also pins down that duplicates and outgoing copies raise none).
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
    const r = await resolve(env, ctx);
    assert(r.kind === "thread", `expected kind=thread, got ${r.kind}`);
    const row = await db.communicationLog.findUnique({
      where: { id: r.id },
      select: { customerUserId: true, channel: true },
    });
    assert(row?.customerUserId === customerId, "thread row attached to wrong customer");
    assert(row?.channel === "EMAIL_INBOUND", "wrong channel");
    console.log("  ✓ In-Reply-To → threaded to original CommunicationLog");
  }

  // ── Outbound resolution (Story 3) ──────────────────────────────────────────
  const MANAGER_ADDR = `${TAG}-manager@geleoteka.ru`;
  await db.mailIdentity.deleteMany({ where: { address: MANAGER_ADDR } });
  const admin = (await db.user.findFirst({
    where: { email: "admin@geleoteka.ru" },
    select: { id: true },
  })) as { id: string } | null;
  assert(admin, "seed admin@geleoteka.ru not found");
  await db.mailIdentity.create({
    data: { address: MANAGER_ADDR, type: "MANAGER", userId: admin.id, isActive: true },
  });

  // 4. Outbound to exactly one known customer → EMAIL_OUTBOUND with the manager
  //    (from MailIdentity) as author, attached to the customer. No follow-up.
  {
    const r = await resolveOutbound(
      outboundParsed({
        messageId: `<${TAG}-out-1@geleoteka.ru>`,
        from: MANAGER_ADDR,
        to: ["client@test.ru"],
        uid: 1n,
      }),
    );
    assert(r.kind === "customer", `expected kind=customer, got ${r.kind}`);
    assert(r.followUp === null, "outbound must never carry a follow-up");
    const row = (await db.communicationLog.findUnique({
      where: { id: r.id },
      select: { channel: true, customerUserId: true, authorUserId: true },
    })) as { channel: string; customerUserId: string; authorUserId: string | null } | null;
    assert(row?.channel === "EMAIL_OUTBOUND", `expected EMAIL_OUTBOUND, got ${row?.channel}`);
    assert(row?.customerUserId === customerId, "outbound attached to wrong customer");
    assert(row?.authorUserId === admin.id, `expected author=${admin.id}, got ${row?.authorUserId}`);
    console.log("  ✓ outbound to one known recipient → EMAIL_OUTBOUND with manager author");
  }

  // 5. Outbound to an unknown recipient → parked as OUTBOUND for manual linking.
  {
    const r = await resolveOutbound(
      outboundParsed({
        messageId: `<${TAG}-out-2@geleoteka.ru>`,
        from: MANAGER_ADDR,
        to: ["nobody@stranger.test"],
        uid: 2n,
      }),
    );
    assert(r.kind === "inbox", `expected kind=inbox, got ${r.kind}`);
    const row = (await db.inboxMessage.findUnique({
      where: { id: r.id },
      select: { direction: true, status: true },
    })) as { direction: string; status: string } | null;
    assert(row?.direction === "OUTBOUND", `expected OUTBOUND, got ${row?.direction}`);
    assert(row?.status === "PENDING", `expected PENDING, got ${row?.status}`);
    console.log("  ✓ outbound to unknown recipient → InboxMessage(PENDING, OUTBOUND)");
  }

  // Cleanup.
  await db.mailIdentity.deleteMany({ where: { address: MANAGER_ADDR } });
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
