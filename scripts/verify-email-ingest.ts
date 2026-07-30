/**
 * Verifies the provider-neutral ingest contract against the dev DB.
 *
 *   - known customer  → EmailMessage + CommunicationLog(EMAIL_INBOUND) + FOLLOW_UP
 *   - unknown sender  → InboxMessage(PENDING), no task
 *   - outbound copy   → CommunicationLog(EMAIL_OUTBOUND), never a task
 *   - same Message-Id → one row, whichever transport delivered it first
 *   - same source UID → one row, even when the id differs (synthetic re-read)
 *
 * The auto-task assertions live here rather than in verify-email-resolve because
 * `resolveInboundEmail` only decides and writes the CRM row — raising the
 * follow-up is `ingestEmail`'s best-effort step, so this is the layer that owns
 * that behaviour end to end.
 *
 * Run: `npm run verify-email-ingest`. Exits 1 on failure.
 */

import "dotenv/config";
import { db } from "../lib/db";
import { ingestEmail } from "../lib/email/ingest";
import { resendEnvelopeToParsedEmail } from "../lib/email/inbound";
import {
  buildSyntheticMessageId,
  RESEND_SOURCE_FOLDER,
  type ParsedEmail,
} from "../lib/email/types";

const TAG = "verify-ingest";
const CUSTOMER_EMAIL = "client@test.ru";
const INBOX_ADDRESS = "sales@geleoteka.ru";
const OCCURRED = new Date("2026-07-15T08:30:00.000Z");

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

function parsed(overrides: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    provider: "TIMEWEB_IMAP",
    direction: "INBOUND",
    from: { email: CUSTOMER_EMAIL, name: "Client" },
    to: [{ email: INBOX_ADDRESS }],
    cc: [],
    bcc: [],
    subject: `${TAG} subject`,
    bodyText: "body",
    bodyHtml: null,
    rfcMessageId: `<${TAG}-1@example.test>`,
    rfcMessageIdSynthetic: false,
    inReplyTo: null,
    references: [],
    occurredAt: OCCURRED,
    occurredAtEstimated: false,
    source: { mailbox: INBOX_ADDRESS, folder: "INBOX", uidValidity: 42n, uid: 1n },
    providerLocator: {
      kind: "imap",
      mailbox: INBOX_ADDRESS,
      folder: "INBOX",
      uidValidity: "42",
      uid: "1",
    },
    attachments: [],
    ...overrides,
  };
}

async function cleanup(): Promise<void> {
  await db.crmTask.deleteMany({
    where: { kind: "FOLLOW_UP", title: { startsWith: "Ответить клиенту:" } },
  });
  await db.communicationLog.deleteMany({ where: { externalId: { contains: TAG } } });
  await db.inboxMessage.deleteMany({ where: { messageId: { contains: TAG } } });
  await db.emailMessage.deleteMany({ where: { rfcMessageId: { contains: TAG } } });
}

async function openFollowUpCount(customerUserId: string): Promise<number> {
  return db.crmTask.count({
    where: { customerUserId, kind: "FOLLOW_UP", status: "OPEN" },
  });
}

async function main(): Promise<void> {
  console.log("[verify-email-ingest] starting");
  await cleanup();

  const customer = (await db.user.findFirst({
    where: { email: CUSTOMER_EMAIL },
    select: { id: true },
  })) as { id: string } | null;
  assert(customer, `seed ${CUSTOMER_EMAIL} not found`);
  const customerId = customer.id;

  // 1. Known customer inbound: canonical row, CRM row, and the follow-up task.
  {
    const r = await ingestEmail(parsed());
    assert(r.status === "created", `expected created, got ${r.status}`);
    assert(r.kind === "customer", `expected kind=customer, got ${r.kind}`);
    assert(r.emailMessageId, "no EmailMessage id returned");

    const email = (await db.emailMessage.findUnique({
      where: { id: r.emailMessageId! },
      select: { direction: true, occurredAt: true, ingestStatus: true, rfcMessageIdSynthetic: true },
    })) as {
      direction: string;
      occurredAt: Date;
      ingestStatus: string;
      rfcMessageIdSynthetic: boolean;
    } | null;
    assert(email?.direction === "INBOUND", `expected INBOUND, got ${email?.direction}`);
    assert(email?.ingestStatus === "PROCESSED", `expected PROCESSED, got ${email?.ingestStatus}`);
    assert(
      email!.occurredAt.getTime() === OCCURRED.getTime(),
      "occurredAt must come from the message, not from the sync run",
    );
    assert(email!.rfcMessageIdSynthetic === false, "real Message-Id flagged as synthetic");

    const log = (await db.communicationLog.findUnique({
      where: { id: r.id! },
      select: { channel: true, customerUserId: true, emailMessageId: true },
    })) as {
      channel: string;
      customerUserId: string;
      emailMessageId: string | null;
    } | null;
    assert(log?.channel === "EMAIL_INBOUND", `expected EMAIL_INBOUND, got ${log?.channel}`);
    assert(log?.customerUserId === customerId, "attached to the wrong customer");
    assert(log?.emailMessageId === r.emailMessageId, "CRM row not linked to EmailMessage");
    console.log("  ✓ known customer → EmailMessage + CommunicationLog(EMAIL_INBOUND)");

    const task = (await db.crmTask.findFirst({
      where: { customerUserId: customerId, kind: "FOLLOW_UP", status: "OPEN" },
      select: { title: true },
    })) as { title: string } | null;
    assert(task, "expected an OPEN FOLLOW_UP task after known-customer inbound");
    assert(task.title.startsWith("Ответить клиенту:"), `unexpected title: ${task.title}`);
    console.log("  ✓ auto-task raised (FOLLOW_UP, OPEN)");
  }

  // 2. Replaying the very same message writes nothing and raises no second task.
  {
    const before = await openFollowUpCount(customerId);
    const r = await ingestEmail(parsed());
    assert(r.status === "duplicate", `expected duplicate, got ${r.status}`);
    assert(r.reason === "rfc-message-id", `expected reason=rfc-message-id, got ${r.reason}`);

    const logs = await db.communicationLog.count({
      where: { externalId: `<${TAG}-1@example.test>` },
    });
    assert(logs === 1, `duplicate created ${logs} CRM rows`);
    assert((await openFollowUpCount(customerId)) === before, "duplicate raised a second task");
    console.log("  ✓ same Message-Id replay → duplicate, nothing written");
  }

  // 3. Same source UID re-read under a different id (a synthetic-id re-read)
  //    must still collapse — otherwise a cursor rewind duplicates the mailbox.
  {
    const r = await ingestEmail(
      parsed({ rfcMessageId: `<${TAG}-1-different@example.test>` }),
    );
    assert(r.status === "duplicate", `expected duplicate, got ${r.status}`);
    assert(r.reason === "source-uid", `expected reason=source-uid, got ${r.reason}`);
    console.log("  ✓ same source UID re-read → duplicate");
  }

  // 4. Cross-provider: the reply Resend delivered by webhook and the copy the
  //    IMAP worker later reads carry one Message-Id and must collapse to one row.
  {
    const sharedId = `<${TAG}-cross@example.test>`;
    const viaImap = await ingestEmail(
      parsed({
        rfcMessageId: sharedId,
        source: { mailbox: INBOX_ADDRESS, folder: "INBOX", uidValidity: 42n, uid: 2n },
      }),
    );
    assert(viaImap.status === "created", `expected created, got ${viaImap.status}`);

    const viaResend = await ingestEmail(
      resendEnvelopeToParsedEmail({
        envelope: {
          type: "email.received",
          created_at: new Date().toISOString(),
          data: {
            email_id: `${TAG}-cross-uuid`,
            created_at: new Date().toISOString(),
            from: CUSTOMER_EMAIL,
            to: [INBOX_ADDRESS],
            cc: [],
            bcc: [],
            message_id: sharedId,
            subject: `${TAG} cross-provider`,
            attachments: [],
          },
        },
        content: { text: "body", html: null, headers: [] },
      }),
    );
    assert(viaResend.status === "duplicate", `expected duplicate, got ${viaResend.status}`);
    assert(
      viaResend.reason === "rfc-message-id",
      `expected reason=rfc-message-id, got ${viaResend.reason}`,
    );

    const rows = await db.emailMessage.count({ where: { rfcMessageId: sharedId } });
    assert(rows === 1, `cross-provider delivery created ${rows} EmailMessage rows`);
    console.log("  ✓ same mail over both transports → one row");
  }

  // 5. Unknown sender lands in triage and must NOT create work for anyone.
  {
    const before = await openFollowUpCount(customerId);
    const r = await ingestEmail(
      parsed({
        from: { email: "stranger@example.test" },
        rfcMessageId: `<${TAG}-unknown@example.test>`,
        source: { mailbox: INBOX_ADDRESS, folder: "INBOX", uidValidity: 42n, uid: 3n },
      }),
    );
    assert(r.status === "unresolved", `expected unresolved, got ${r.status}`);
    assert(r.kind === "inbox", `expected kind=inbox, got ${r.kind}`);

    const row = (await db.inboxMessage.findUnique({
      where: { id: r.id! },
      select: { status: true, fromEmail: true, resendEmailId: true, emailMessageId: true },
    })) as {
      status: string;
      fromEmail: string;
      resendEmailId: string | null;
      emailMessageId: string | null;
    } | null;
    assert(row?.status === "PENDING", `expected PENDING, got ${row?.status}`);
    assert(row?.fromEmail === "stranger@example.test", "fromEmail not normalised");
    assert(row?.resendEmailId === null, "IMAP-sourced triage row must not invent a Resend id");
    assert(row?.emailMessageId === r.emailMessageId, "triage row not linked to EmailMessage");
    assert(
      (await openFollowUpCount(customerId)) === before,
      "unresolved mail must not raise a follow-up",
    );
    console.log("  ✓ unknown sender → InboxMessage(PENDING), no task");
  }

  // 6. Story 3: the manager's own outgoing copy is now ATTRIBUTED by recipient.
  //    An archive copy addressed to exactly one known customer lands on that
  //    customer's timeline as EMAIL_OUTBOUND — stored, linked, and still raising
  //    no follow-up (only inbound does). `info@` is a shared box, so the author
  //    is left null.
  {
    const before = await openFollowUpCount(customerId);
    const r = await ingestEmail(
      parsed({
        direction: "OUTBOUND",
        from: { email: INBOX_ADDRESS, name: "Geleoteka" },
        to: [{ email: CUSTOMER_EMAIL }],
        rfcMessageId: `<${TAG}-outbound@example.test>`,
        source: { mailbox: "crm-archive@geleoteka.ru", folder: "INBOX", uidValidity: 7n, uid: 1n },
      }),
    );
    assert(r.status === "created", `expected created, got ${r.status}`);
    assert(r.kind === "customer", `expected kind=customer, got ${r.kind}`);
    assert(r.emailMessageId, "outgoing copy was not stored at all");

    const email = (await db.emailMessage.findUnique({
      where: { id: r.emailMessageId! },
      select: { direction: true, sourceMailbox: true },
    })) as { direction: string; sourceMailbox: string | null } | null;
    assert(email?.direction === "OUTBOUND", `expected OUTBOUND, got ${email?.direction}`);
    assert(
      email?.sourceMailbox === "crm-archive@geleoteka.ru",
      `archive origin not recorded, got ${email?.sourceMailbox}`,
    );

    const log = (await db.communicationLog.findUnique({
      where: { id: r.id! },
      select: {
        channel: true,
        customerUserId: true,
        emailMessageId: true,
        authorUserId: true,
      },
    })) as {
      channel: string;
      customerUserId: string;
      emailMessageId: string | null;
      authorUserId: string | null;
    } | null;
    assert(log?.channel === "EMAIL_OUTBOUND", `expected EMAIL_OUTBOUND, got ${log?.channel}`);
    assert(log?.customerUserId === customerId, "outbound not attached to the known recipient");
    assert(log?.emailMessageId === r.emailMessageId, "outbound CRM row not linked to EmailMessage");
    assert(log?.authorUserId === null, "shared info@ send must have no author");
    assert(
      (await openFollowUpCount(customerId)) === before,
      "an outgoing copy must never raise a follow-up",
    );
    console.log("  ✓ outbound to the single known recipient → EMAIL_OUTBOUND on customer, no task");
  }

  // 6b. An outbound we cannot pin to exactly one known customer is parked as
  //     OUTBOUND triage for manual linking — never guessed onto a timeline.
  {
    const before = await openFollowUpCount(customerId);
    const r = await ingestEmail(
      parsed({
        direction: "OUTBOUND",
        from: { email: INBOX_ADDRESS, name: "Geleoteka" },
        to: [{ email: "who-knows@stranger.test" }],
        rfcMessageId: `<${TAG}-outbound-unknown@example.test>`,
        source: { mailbox: "crm-archive@geleoteka.ru", folder: "INBOX", uidValidity: 7n, uid: 2n },
      }),
    );
    assert(r.status === "unresolved", `expected unresolved, got ${r.status}`);
    assert(r.kind === "inbox", `expected kind=inbox, got ${r.kind}`);

    const row = (await db.inboxMessage.findUnique({
      where: { id: r.id! },
      select: { status: true, direction: true, emailMessageId: true },
    })) as { status: string; direction: string; emailMessageId: string | null } | null;
    assert(row?.status === "PENDING", `expected PENDING, got ${row?.status}`);
    assert(row?.direction === "OUTBOUND", `expected OUTBOUND, got ${row?.direction}`);
    assert(row?.emailMessageId === r.emailMessageId, "triage row not linked to EmailMessage");
    assert(
      (await openFollowUpCount(customerId)) === before,
      "unattributed outbound must never raise a follow-up",
    );
    console.log("  ✓ outbound to unknown recipient → InboxMessage(PENDING, OUTBOUND), no task");
  }

  // 7. A message with no usable id gets a synthetic one derived from its source,
  //    so the next poll of that UID recognises it instead of re-importing.
  {
    const syntheticSource = {
      mailbox: INBOX_ADDRESS,
      folder: "INBOX",
      uidValidity: 42n,
      uid: 9n,
    };
    const synthetic = buildSyntheticMessageId("TIMEWEB_IMAP", syntheticSource);
    const again = buildSyntheticMessageId("TIMEWEB_IMAP", { ...syntheticSource });
    assert(synthetic === again, "synthetic Message-Id is not deterministic");
    assert(synthetic.includes(TAG) === false, "sanity: synthetic id should not embed the tag");

    const first = await ingestEmail(
      parsed({ rfcMessageId: synthetic, rfcMessageIdSynthetic: true, source: syntheticSource }),
    );
    assert(first.status === "created", `expected created, got ${first.status}`);
    const second = await ingestEmail(
      parsed({ rfcMessageId: synthetic, rfcMessageIdSynthetic: true, source: syntheticSource }),
    );
    assert(second.status === "duplicate", `expected duplicate, got ${second.status}`);
    await db.emailMessage.deleteMany({ where: { rfcMessageId: synthetic } });
    await db.communicationLog.deleteMany({ where: { externalId: synthetic } });
    console.log("  ✓ synthetic Message-Id is deterministic and dedupes");
  }

  // 8. Webhook deliveries are tagged as such, so the attachment proxy can keep
  //    routing legacy Resend rows to Resend.
  {
    const r = await ingestEmail(
      resendEnvelopeToParsedEmail({
        envelope: {
          type: "email.received",
          created_at: new Date().toISOString(),
          data: {
            email_id: `${TAG}-legacy-uuid`,
            created_at: new Date().toISOString(),
            from: CUSTOMER_EMAIL,
            to: [INBOX_ADDRESS],
            cc: [],
            bcc: [],
            message_id: `<${TAG}-legacy@example.test>`,
            subject: `${TAG} legacy`,
            attachments: [
              {
                id: "att-1",
                filename: "x.txt",
                content_type: "text/plain",
                content_disposition: "attachment",
              },
            ],
          },
        },
        content: { text: "body", html: null, headers: [] },
      }),
    );
    assert(r.status === "created", `expected created, got ${r.status}`);

    const email = (await db.emailMessage.findUnique({
      where: { id: r.emailMessageId! },
      select: { provider: true, sourceFolder: true, attachments: true },
    })) as { provider: string; sourceFolder: string; attachments: unknown } | null;
    assert(email?.provider === "RESEND", `expected RESEND, got ${email?.provider}`);
    assert(
      email?.sourceFolder === RESEND_SOURCE_FOLDER,
      `expected ${RESEND_SOURCE_FOLDER}, got ${email?.sourceFolder}`,
    );
    assert(
      Array.isArray(email?.attachments) && (email!.attachments as unknown[]).length === 1,
      "attachment metadata not carried through",
    );
    console.log("  ✓ Resend webhook delivery keeps its provider locator");
  }

  await cleanup();
  console.log("[verify-email-ingest] PASS");
}

main()
  .catch((err) => {
    console.error("[verify-email-ingest] ERROR", err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
