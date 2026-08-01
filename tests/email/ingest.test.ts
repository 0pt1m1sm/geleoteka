import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { ingestEmail, type IngestOptions } from "@/lib/email/ingest";
import {
  buildSyntheticMessageId,
  normalizeAddress,
  normalizeMessageId,
  parseReferencesHeader,
  resolveOccurredAt,
  type ParsedEmail,
} from "@/lib/email/types";
import { FakeEmailDb } from "./fake-db";

const OCCURRED = new Date("2026-07-14T09:15:00.000Z");

function parsed(overrides: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    provider: "TIMEWEB_IMAP",
    direction: "INBOUND",
    from: { email: "customer@example.test", name: "Customer" },
    to: [{ email: "sales@geleoteka.ru" }],
    cc: [],
    bcc: [],
    subject: "Вопрос по сервису",
    bodyText: "Здравствуйте!",
    bodyHtml: null,
    rfcMessageId: "<real-1@example.test>",
    rfcMessageIdSynthetic: false,
    inReplyTo: null,
    references: [],
    occurredAt: OCCURRED,
    occurredAtEstimated: false,
    source: { mailbox: "sales@geleoteka.ru", folder: "INBOX", uidValidity: 10n, uid: 501n },
    providerLocator: {
      kind: "imap",
      mailbox: "sales@geleoteka.ru",
      folder: "INBOX",
      uidValidity: "10",
      uid: "501",
    },
    attachments: [],
    ...overrides,
  };
}

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

describe("header normalization", () => {
  it("keeps the first usable id when a header is duplicated or malformed", () => {
    expect(normalizeMessageId("<a@b>")).toBe("<a@b>");
    expect(normalizeMessageId("  <a@b>  ")).toBe("<a@b>");
    // Some MTAs concatenate a folded/duplicated header into one value.
    expect(normalizeMessageId("<a@b> <c@d>")).toBe("<a@b>");
    expect(normalizeMessageId("<a@b>,<c@d>")).toBe("<a@b>");
    // Bare (bracket-less) ids still thread, so accept and wrap them.
    expect(normalizeMessageId("a@b")).toBe("<a@b>");
    // Nothing usable.
    expect(normalizeMessageId("<>")).toBeNull();
    expect(normalizeMessageId("   ")).toBeNull();
    expect(normalizeMessageId(null)).toBeNull();
    expect(normalizeMessageId("not-an-id")).toBeNull();
  });

  it("parses References tolerantly and preserves order without duplicates", () => {
    expect(parseReferencesHeader("<a@b> <c@d>")).toEqual(["<a@b>", "<c@d>"]);
    // Comma-separated and newline-folded variants both appear in the wild.
    expect(parseReferencesHeader("<a@b>,\r\n\t<c@d>")).toEqual(["<a@b>", "<c@d>"]);
    expect(parseReferencesHeader("<a@b> <a@b> <c@d>")).toEqual(["<a@b>", "<c@d>"]);
    expect(parseReferencesHeader(null)).toEqual([]);
  });

  it("normalizes addresses to a lower-cased bare email", () => {
    expect(normalizeAddress("Acme <Hello@Example.TEST>")).toEqual({
      email: "hello@example.test",
      name: "Acme",
    });
    expect(normalizeAddress('"Quoted Name" <a@b.test>')).toEqual({
      email: "a@b.test",
      name: "Quoted Name",
    });
    expect(normalizeAddress("<bare@b.test>")).toEqual({ email: "bare@b.test" });
    expect(normalizeAddress("BARE@B.test")).toEqual({ email: "bare@b.test" });
    expect(normalizeAddress("garbage")).toBeNull();
  });
});

describe("synthetic Message-Id", () => {
  const source = {
    mailbox: "crm-archive@geleoteka.ru",
    folder: "INBOX",
    uidValidity: 42n,
    uid: 1234n,
  };

  it("is deterministic for the same source tuple", () => {
    expect(buildSyntheticMessageId("TIMEWEB_IMAP", source)).toBe(
      buildSyntheticMessageId("TIMEWEB_IMAP", source),
    );
  });

  it("differs when any component of the source tuple differs", () => {
    const base = buildSyntheticMessageId("TIMEWEB_IMAP", source);
    expect(buildSyntheticMessageId("RESEND", source)).not.toBe(base);
    expect(buildSyntheticMessageId("TIMEWEB_IMAP", { ...source, uid: 1235n })).not.toBe(base);
    expect(buildSyntheticMessageId("TIMEWEB_IMAP", { ...source, uidValidity: 43n })).not.toBe(base);
    expect(buildSyntheticMessageId("TIMEWEB_IMAP", { ...source, folder: "Sent" })).not.toBe(base);
    expect(buildSyntheticMessageId("TIMEWEB_IMAP", { ...source, mailbox: "sales@geleoteka.ru" })).not.toBe(
      base,
    );
  });

  it("cannot be confused by separator characters inside a component", () => {
    // A naive `join("|")` would collide these two tuples.
    const a = buildSyntheticMessageId("TIMEWEB_IMAP", { ...source, mailbox: "a", folder: "b|c" });
    const b = buildSyntheticMessageId("TIMEWEB_IMAP", { ...source, mailbox: "a|b", folder: "c" });
    expect(a).not.toBe(b);
  });

  it("is a syntactically valid, angle-wrapped Message-Id", () => {
    expect(buildSyntheticMessageId("TIMEWEB_IMAP", source)).toMatch(/^<[^<>@\s]+@[^<>@\s]+>$/);
  });
});

describe("occurredAt", () => {
  const syncTime = new Date("2026-07-20T00:00:00.000Z");

  it("prefers a valid Date header over the sync time", () => {
    const r = resolveOccurredAt({
      headerDate: "Tue, 14 Jul 2026 09:15:00 +0000",
      internalDate: null,
      now: syncTime,
    });
    expect(r.occurredAt.toISOString()).toBe(OCCURRED.toISOString());
    expect(r.estimated).toBe(false);
  });

  it("falls back to the IMAP internal date when the header is unparseable", () => {
    const internal = new Date("2026-07-14T10:00:00.000Z");
    const r = resolveOccurredAt({ headerDate: "not a date", internalDate: internal, now: syncTime });
    expect(r.occurredAt.toISOString()).toBe(internal.toISOString());
    // Still a real message timestamp, not a guess.
    expect(r.estimated).toBe(false);
  });

  it("flags the sync-time fallback instead of silently passing it off as the send time", () => {
    const r = resolveOccurredAt({ headerDate: null, internalDate: null, now: syncTime });
    expect(r.occurredAt.toISOString()).toBe(syncTime.toISOString());
    expect(r.estimated).toBe(true);
  });

  it("rejects an absurd Date header rather than trusting it", () => {
    const r = resolveOccurredAt({
      headerDate: "Mon, 01 Jan 1600 00:00:00 +0000",
      internalDate: null,
      now: syncTime,
    });
    expect(r.estimated).toBe(true);
    expect(r.occurredAt.toISOString()).toBe(syncTime.toISOString());
  });
});

describe("ingestEmail", () => {
  let db: FakeEmailDb;
  let projectInboundEvents: Mock<NonNullable<IngestOptions["projectInboundEvents"]>>;

  beforeEach(() => {
    db = dbWithCustomer();
    projectInboundEvents = vi.fn(async () => undefined);
  });

  function run(email: ParsedEmail) {
    return ingestEmail(email, { client: db, projectInboundEvents });
  }

  it("stores the canonical message and links it to the CRM row it created", async () => {
    const result = await run(parsed());

    expect(result.status).toBe("created");
    expect(db.emailMessages).toHaveLength(1);
    expect(db.communicationLogs).toHaveLength(1);
    expect(db.staffNotificationEvents).toHaveLength(1);

    const email = db.emailMessages[0];
    expect(email.rfcMessageId).toBe("<real-1@example.test>");
    expect(email.ingestStatus).toBe("PROCESSED");
    // occurredAt is the message's own timestamp, not "whenever the worker ran".
    expect((email.occurredAt as Date).toISOString()).toBe(OCCURRED.toISOString());
    expect(db.communicationLogs[0].emailMessageId).toBe(email.id);
  });

  it("writes the message and its CRM row inside a single transaction", async () => {
    await run(parsed());
    expect(db.transactionCount).toBe(1);
  });

  it("derives a deterministic id when the message carries none, so a re-fetch dedupes", async () => {
    const noId = parsed({
      rfcMessageId: buildSyntheticMessageId("TIMEWEB_IMAP", parsed().source),
      rfcMessageIdSynthetic: true,
    });

    const first = await run(noId);
    const second = await run(noId);

    expect(first.status).toBe("created");
    expect(second.status).toBe("duplicate");
    expect(db.emailMessages).toHaveLength(1);
    expect(db.communicationLogs).toHaveLength(1);
    expect(db.emailMessages[0].rfcMessageIdSynthetic).toBe(true);
  });

  it("treats the same UID re-read as a duplicate even when the id differs", async () => {
    await run(parsed({ rfcMessageId: "<first@example.test>" }));
    const again = await run(parsed({ rfcMessageId: "<second@example.test>" }));

    expect(again.status).toBe("duplicate");
    expect(again.reason).toBe("source-uid");
    expect(db.emailMessages).toHaveLength(1);
  });

  it("collapses one message seen through both Resend and IMAP into a single record", async () => {
    const shared = "<shared-id@example.test>";

    const viaResend = await run(
      parsed({
        provider: "RESEND",
        rfcMessageId: shared,
        source: {
          mailbox: "sales@geleoteka.ru",
          folder: "RESEND_WEBHOOK",
          uidValidity: null,
          uid: null,
        },
        providerLocator: { kind: "resend", resendEmailId: "resend-uuid-1" },
      }),
    );
    const viaImap = await run(parsed({ rfcMessageId: shared }));

    expect(viaResend.status).toBe("created");
    expect(viaImap.status).toBe("duplicate");
    expect(viaImap.reason).toBe("rfc-message-id");
    expect(db.emailMessages).toHaveLength(1);
    expect(db.communicationLogs).toHaveLength(1);
    // The duplicate retries pending projection but cannot publish a new event.
    expect(db.staffNotificationEvents).toHaveLength(1);
  });

  it("lets the unique constraint win the race when two callers both pre-check clean", async () => {
    await run(parsed());
    db.simulateLostPrecheck = true;

    const racer = await run(parsed());

    expect(racer.status).toBe("duplicate");
    expect(db.emailMessages).toHaveLength(1);
    expect(db.communicationLogs).toHaveLength(1);
    expect(db.staffNotificationEvents).toHaveLength(1);
  });

  it("threads a reply onto the original conversation via In-Reply-To", async () => {
    db.communicationLogs.push({
      id: "cl_legacy",
      externalId: "<outbound-1@geleoteka.ru>",
      customerUserId: "user_customer",
      dealId: "deal_1",
      channel: "EMAIL_OUTBOUND",
    });

    const result = await run(
      parsed({
        from: { email: "someone-else@example.test" },
        inReplyTo: "<outbound-1@geleoteka.ru>",
      }),
    );

    expect(result.status).toBe("created");
    expect(result.kind).toBe("thread");
    const created = db.communicationLogs.find((r) => r.id !== "cl_legacy");
    expect(created?.customerUserId).toBe("user_customer");
    expect(created?.dealId).toBe("deal_1");
  });

  it("falls back to References, newest first, when In-Reply-To matches nothing", async () => {
    db.communicationLogs.push({
      id: "cl_old",
      externalId: "<oldest@geleoteka.ru>",
      customerUserId: "user_customer",
      dealId: null,
      channel: "EMAIL_OUTBOUND",
    });
    db.communicationLogs.push({
      id: "cl_recent",
      externalId: "<newest@geleoteka.ru>",
      customerUserId: "user_customer",
      dealId: "deal_1",
      channel: "EMAIL_OUTBOUND",
    });

    const result = await run(
      parsed({
        from: { email: "someone-else@example.test" },
        inReplyTo: "<vanished@elsewhere.test>",
        // RFC order is oldest → newest; the newest known ancestor should win.
        references: ["<oldest@geleoteka.ru>", "<newest@geleoteka.ru>"],
      }),
    );

    expect(result.kind).toBe("thread");
    const created = db.communicationLogs.find((r) => !["cl_old", "cl_recent"].includes(String(r.id)));
    expect(created?.dealId).toBe("deal_1");
  });

  it("threads onto a legacy row that predates emailMessageId", async () => {
    // Exactly what a pre-migration Resend row looks like: no emailMessageId.
    db.communicationLogs.push({
      id: "cl_pre_migration",
      externalId: "<legacy-out@geleoteka.ru>",
      customerUserId: "user_customer",
      dealId: null,
      channel: "EMAIL_OUTBOUND",
      emailMessageId: null,
    });

    const result = await run(
      parsed({ from: { email: "stranger@example.test" }, inReplyTo: "<legacy-out@geleoteka.ru>" }),
    );

    expect(result.kind).toBe("thread");
    expect(db.inboxMessages).toHaveLength(0);
  });

  it("matches a known sender when no thread header resolves", async () => {
    const result = await run(parsed());

    expect(result.kind).toBe("customer");
    expect(db.communicationLogs[0].customerUserId).toBe("user_customer");
    expect(db.communicationLogs[0].dealId).toBe("deal_1");
    expect(db.staffNotificationEvents).toHaveLength(1);
  });

  it("parks an unknown sender in the triage inbox without inventing a task", async () => {
    const result = await run(parsed({ from: { email: "nobody@nowhere.test" } }));

    expect(result.status).toBe("unresolved");
    expect(db.inboxMessages).toHaveLength(1);
    expect(db.inboxMessages[0].status).toBe("PENDING");
    expect(db.inboxMessages[0].direction).toBe("INBOUND");
    expect(db.inboxMessages[0].resendEmailId).toBeNull();
    expect(db.inboxMessages[0].emailMessageId).toBe(db.emailMessages[0].id);
    expect(db.staffNotificationEvents).toHaveLength(0);
  });

  it("never raises a follow-up for our own outgoing mail", async () => {
    // An outbound we cannot pin to exactly one known customer (here: an unknown
    // recipient) is parked as OUTBOUND triage — attribution to a known recipient
    // is exercised in mail-resolution.test.ts. Either way, our own sent mail
    // never raises a follow-up.
    const result = await run(
      parsed({
        direction: "OUTBOUND",
        from: { email: "manager@geleoteka.ru" },
        to: [{ email: "stranger@nowhere.test" }],
        source: {
          mailbox: "crm-archive@geleoteka.ru",
          folder: "INBOX",
          uidValidity: 10n,
          uid: 900n,
        },
      }),
    );

    expect(result.status).toBe("unresolved");
    expect(db.inboxMessages[0].direction).toBe("OUTBOUND");
    expect(db.staffNotificationEvents).toHaveLength(0);
  });

  it("keeps a durable PENDING event when projection fails and retries it on replay", async () => {
    projectInboundEvents.mockRejectedValueOnce(new Error("task subsystem down"));

    await expect(run(parsed())).rejects.toThrow("task subsystem down");

    expect(db.emailMessages).toHaveLength(1);
    expect(db.communicationLogs).toHaveLength(1);
    expect(db.staffNotificationEvents).toHaveLength(1);
    expect(db.staffNotificationEvents[0].routingStatus).toBe("PENDING");

    const retry = await run(parsed());
    expect(retry.status).toBe("duplicate");
    expect(projectInboundEvents).toHaveBeenCalledTimes(2);
    expect(db.staffNotificationEvents).toHaveLength(1);
  });

  it("dead-letters an event whose CommunicationLog vanished without rejecting the next email", async () => {
    await expect(
      ingestEmail(parsed(), {
        client: db,
        projectInboundEvents: async () => {
          throw new Error("simulated projector restart");
        },
      }),
    ).rejects.toThrow("simulated projector restart");

    const poisonedEventId = String(db.staffNotificationEvents[0].id);
    db.communicationLogs = [];

    const next = await ingestEmail(
      parsed({
        rfcMessageId: "<real-2@example.test>",
        source: { ...parsed().source, uid: 502n },
        occurredAt: new Date("2026-07-14T10:15:00.000Z"),
      }),
      { client: db },
    );

    expect(next.status).toBe("created");
    expect(db.communicationLogs).toHaveLength(1);
    expect(db.staffNotificationEvents).toHaveLength(2);
    expect(db.staffNotificationEvents.find((event) => event.id === poisonedEventId)).toMatchObject({
      routingStatus: "DEAD",
      routingAttempts: 1,
      lastRoutingError: "SOURCE_MISSING",
    });
    expect(db.staffNotificationEvents.find((event) => event.id === next.staffNotificationEventId))
      .toMatchObject({ routingStatus: "ROUTED" });
  });

  it("publishes a second event for a second customer message", async () => {
    await run(parsed());
    await run(
      parsed({
        rfcMessageId: "<real-2@example.test>",
        source: { ...parsed().source, uid: 502n },
        occurredAt: new Date("2026-07-14T10:15:00.000Z"),
      }),
    );

    expect(db.communicationLogs).toHaveLength(2);
    expect(db.staffNotificationEvents).toHaveLength(2);
    expect(db.staffNotificationEvents.map((event) => event.dedupeKey)).toEqual([
      `inbound-msg:${db.communicationLogs[0].id}`,
      `inbound-msg:${db.communicationLogs[1].id}`,
    ]);
  });

  it("refuses a message with no usable id rather than guessing one", async () => {
    await expect(run(parsed({ rfcMessageId: "" }))).rejects.toThrow(/rfcMessageId/i);
    expect(db.emailMessages).toHaveLength(0);
  });
});
