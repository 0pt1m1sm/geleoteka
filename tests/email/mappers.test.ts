import { describe, expect, it, vi } from "vitest";

import { ingestEmail } from "@/lib/email/ingest";
import {
  resendEnvelopeToParsedEmail,
  type ResendInboundContent,
  type ResendInboundEnvelope,
} from "@/lib/email/inbound";
import {
  buildSyntheticMessageId,
  normalizeAddress,
  normalizeAddressList,
  normalizeMessageId,
  parseReferencesHeader,
  resolveOccurredAt,
  RESEND_SOURCE_FOLDER,
  type ParsedEmail,
} from "@/lib/email/types";
import { FakeEmailDb } from "./fake-db";

/**
 * Legacy Resend mapper compatibility. The public Resend receiver is retired;
 * these fixtures remain to pin provider-neutral normalization and dedupe for
 * the offline ingest/resolve verification scripts.
 */

const MESSAGE_ID = "<same-message@example.test>";
const SENT_AT = "Tue, 14 Jul 2026 09:15:00 +0000";

/** The headers both transports observe for the same underlying message. */
const SHARED_HEADERS: Array<{ name: string; value: string }> = [
  { name: "Message-Id", value: MESSAGE_ID },
  { name: "From", value: "Customer <Customer@Example.TEST>" },
  { name: "To", value: "sales@geleoteka.ru" },
  { name: "Subject", value: "Вопрос по сервису" },
  { name: "Date", value: SENT_AT },
  { name: "In-Reply-To", value: "<outbound-1@geleoteka.ru>" },
  { name: "References", value: "<root@geleoteka.ru> <outbound-1@geleoteka.ru>" },
];

function header(name: string): string | null {
  const found = SHARED_HEADERS.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return found?.value ?? null;
}

function resendEnvelope(overrides: Partial<ResendInboundEnvelope["data"]> = {}): ResendInboundEnvelope {
  return {
    type: "email.received",
    created_at: "2026-07-14T09:15:30.000Z",
    data: {
      email_id: "resend-uuid-1",
      created_at: "2026-07-14T09:15:30.000Z",
      from: "Customer <Customer@Example.TEST>",
      to: ["sales@geleoteka.ru"],
      bcc: [],
      cc: [],
      message_id: MESSAGE_ID,
      subject: "Вопрос по сервису",
      attachments: [],
      ...overrides,
    },
  };
}

function resendContent(
  headers: Array<{ name: string; value: string }> = SHARED_HEADERS,
): ResendInboundContent {
  return { text: "Здравствуйте!", html: null, headers };
}

/**
 * Stand-in for the Timeweb IMAP mapper that Task 2 will add. It is deliberately
 * built only from the shared normalization helpers in `lib/email/types`, so if
 * the real mapper reuses them — as it must — this stays representative.
 */
function imapMessageToParsedEmail(input: {
  headers: Array<{ name: string; value: string }>;
  text: string | null;
  html: string | null;
  mailbox: string;
  folder: string;
  uidValidity: bigint;
  uid: bigint;
  internalDate: Date;
}): ParsedEmail {
  const get = (name: string): string | null =>
    input.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;

  const source = {
    mailbox: input.mailbox,
    folder: input.folder,
    uidValidity: input.uidValidity,
    uid: input.uid,
  };
  const rfcMessageId = normalizeMessageId(get("Message-Id"));
  const occurred = resolveOccurredAt({
    headerDate: get("Date"),
    internalDate: input.internalDate,
  });

  return {
    provider: "TIMEWEB_IMAP",
    direction: "INBOUND",
    from: normalizeAddress(get("From")) ?? { email: "unknown@invalid" },
    to: normalizeAddressList([get("To") ?? ""]),
    cc: normalizeAddressList([]),
    bcc: [],
    subject: get("Subject") ?? "",
    bodyText: input.text,
    bodyHtml: input.html,
    rfcMessageId: rfcMessageId ?? buildSyntheticMessageId("TIMEWEB_IMAP", source),
    rfcMessageIdSynthetic: rfcMessageId === null,
    inReplyTo: normalizeMessageId(get("In-Reply-To")),
    references: parseReferencesHeader(get("References")),
    occurredAt: occurred.occurredAt,
    occurredAtEstimated: occurred.estimated,
    source,
    providerLocator: {
      kind: "imap",
      mailbox: input.mailbox,
      folder: input.folder,
      uidValidity: input.uidValidity.toString(),
      uid: input.uid.toString(),
    },
    attachments: [],
  };
}

function sameMessageOverImap(): ParsedEmail {
  return imapMessageToParsedEmail({
    headers: SHARED_HEADERS,
    text: "Здравствуйте!",
    html: null,
    mailbox: "sales@geleoteka.ru",
    folder: "INBOX",
    uidValidity: 10n,
    uid: 501n,
    internalDate: new Date("2026-07-14T09:15:40.000Z"),
  });
}

describe("legacy Resend envelope → ParsedEmail", () => {
  it("maps the envelope and fetched content onto the provider-neutral shape", () => {
    const parsed = resendEnvelopeToParsedEmail({
      envelope: resendEnvelope(),
      content: resendContent(),
    });

    expect(parsed.provider).toBe("RESEND");
    // The receiving webhook only ever fires for mail addressed to us.
    expect(parsed.direction).toBe("INBOUND");
    expect(parsed.from).toEqual({ email: "customer@example.test", name: "Customer" });
    expect(parsed.to).toEqual([{ email: "sales@geleoteka.ru" }]);
    expect(parsed.rfcMessageId).toBe(MESSAGE_ID);
    expect(parsed.rfcMessageIdSynthetic).toBe(false);
    expect(parsed.inReplyTo).toBe("<outbound-1@geleoteka.ru>");
    expect(parsed.references).toEqual(["<root@geleoteka.ru>", "<outbound-1@geleoteka.ru>"]);
    // The Date header wins over Resend's own receive timestamp.
    expect(parsed.occurredAt.toISOString()).toBe("2026-07-14T09:15:00.000Z");
    expect(parsed.occurredAtEstimated).toBe(false);
    expect(parsed.source.folder).toBe(RESEND_SOURCE_FOLDER);
    expect(parsed.source.uid).toBeNull();
    expect(parsed.providerLocator).toEqual({ kind: "resend", resendEmailId: "resend-uuid-1" });
  });

  it("falls back to the envelope message_id when the fetched headers carry none", () => {
    const parsed = resendEnvelopeToParsedEmail({
      envelope: resendEnvelope(),
      content: resendContent([{ name: "Subject", value: "Вопрос по сервису" }]),
    });

    expect(parsed.rfcMessageId).toBe(MESSAGE_ID);
    expect(parsed.rfcMessageIdSynthetic).toBe(false);
  });

  it("carries attachment metadata across without losing the content id", () => {
    const parsed = resendEnvelopeToParsedEmail({
      envelope: resendEnvelope({
        attachments: [
          {
            id: "att-1",
            filename: "смета.pdf",
            content_type: "application/pdf",
            content_disposition: "attachment",
            content_id: "cid-1",
          },
        ],
      }),
      content: resendContent(),
    });

    expect(parsed.attachments).toEqual([
      {
        id: "att-1",
        filename: "смета.pdf",
        contentType: "application/pdf",
        contentDisposition: "attachment",
        contentId: "cid-1",
      },
    ]);
  });

  it("gives two id-less webhook messages DIFFERENT synthetic ids", () => {
    // Every Resend webhook shares one source tuple — provider, recipient and a
    // folder marker, with no UID. Deriving the synthetic id from that alone
    // would make each id-less message look like a replay of the previous one
    // and silently drop it, so the Resend locator has to take part.
    const first = resendEnvelopeToParsedEmail({
      envelope: resendEnvelope({ message_id: "", email_id: "resend-uuid-A" }),
      content: resendContent([{ name: "Subject", value: "A" }]),
    });
    const second = resendEnvelopeToParsedEmail({
      envelope: resendEnvelope({ message_id: "", email_id: "resend-uuid-B" }),
      content: resendContent([{ name: "Subject", value: "B" }]),
    });

    expect(first.rfcMessageIdSynthetic).toBe(true);
    expect(second.rfcMessageIdSynthetic).toBe(true);
    expect(first.rfcMessageId).not.toBe(second.rfcMessageId);
  });

  it("derives the same synthetic id when the same webhook is redelivered", () => {
    const build = () =>
      resendEnvelopeToParsedEmail({
        envelope: resendEnvelope({ message_id: "not-a-message-id", email_id: "resend-uuid-A" }),
        content: resendContent([{ name: "Subject", value: "A" }]),
      });

    expect(build().rfcMessageId).toBe(build().rfcMessageId);
  });
});

describe("legacy cross-provider dedupe contract", () => {
  function dbWithCustomer(): FakeEmailDb {
    const db = new FakeEmailDb();
    db.users.push({
      id: "user_customer",
      email: "customer@example.test",
      name: "Иван Клиент",
      isCustomer: true,
    });
    db.deals.push({ id: "deal_1", customerUserId: "user_customer", stage: "QUALIFIED" });
    return db;
  }

  it("produces one CRM row for a message that arrives over BOTH transports", async () => {
    const db = dbWithCustomer();
    const projectInboundEvents = vi.fn(async () => undefined);

    const viaResend = await ingestEmail(
      resendEnvelopeToParsedEmail({ envelope: resendEnvelope(), content: resendContent() }),
      { client: db, projectInboundEvents },
    );
    const viaImap = await ingestEmail(sameMessageOverImap(), { client: db, projectInboundEvents });

    expect(viaResend.status).toBe("created");
    expect(viaImap.status).toBe("duplicate");
    expect(viaImap.reason).toBe("rfc-message-id");
    expect(db.emailMessages).toHaveLength(1);
    expect(db.communicationLogs).toHaveLength(1);
    expect(db.inboxMessages).toHaveLength(0);
    expect(db.staffNotificationEvents).toHaveLength(1);
  });

  it("collapses them in the other arrival order too", async () => {
    const db = dbWithCustomer();
    const projectInboundEvents = vi.fn(async () => undefined);

    const viaImap = await ingestEmail(sameMessageOverImap(), { client: db, projectInboundEvents });
    const viaResend = await ingestEmail(
      resendEnvelopeToParsedEmail({ envelope: resendEnvelope(), content: resendContent() }),
      { client: db, projectInboundEvents },
    );

    expect(viaImap.status).toBe("created");
    expect(viaResend.status).toBe("duplicate");
    expect(db.emailMessages).toHaveLength(1);
    expect(db.staffNotificationEvents).toHaveLength(1);
  });

  it("agrees on the threading headers regardless of transport", () => {
    const fromResend = resendEnvelopeToParsedEmail({
      envelope: resendEnvelope(),
      content: resendContent(),
    });
    const fromImap = sameMessageOverImap();

    expect(fromResend.rfcMessageId).toBe(fromImap.rfcMessageId);
    expect(fromResend.inReplyTo).toBe(fromImap.inReplyTo);
    expect(fromResend.references).toEqual(fromImap.references);
    expect(fromResend.from).toEqual(fromImap.from);
    expect(fromResend.occurredAt.toISOString()).toBe(fromImap.occurredAt.toISOString());
    // Sanity: the fixture really does carry the headers we claim to compare.
    expect(header("Message-Id")).toBe(MESSAGE_ID);
  });
});
