import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { ingestEmail, type IngestOptions } from "@/lib/email/ingest";
import { resolveOutboundEmail } from "@/lib/email/resolve";
import type { EmailIngestTx } from "@/lib/email/db-port";
import type { ParsedEmail } from "@/lib/email/types";
import { FakeEmailDb } from "./fake-db";

/**
 * Story 3 — CRM resolution of BOTH directions.
 *
 * Story 1 stored our own sent mail but parked every OUTBOUND copy in triage;
 * Story 2 decided direction from `MailIdentity`. This file pins the resolution
 * itself: a manager's phone email attaches to its customer with an author and
 * raises no task, a client's reply threads back and raises exactly one, and an
 * outbound we cannot attribute to a single customer is never guessed at.
 */

const CUSTOMER_EMAIL = "customer@example.test";
const MANAGER_EMAIL = "manager@geleoteka.ru";
const INFO_EMAIL = "sales@geleoteka.ru";
/** Weeks before the sync run — proves occurredAt is the message's, not "now". */
const OCCURRED = new Date("2026-06-01T09:15:00.000Z");

function parsed(overrides: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    provider: "TIMEWEB_IMAP",
    direction: "INBOUND",
    from: { email: CUSTOMER_EMAIL, name: "Customer" },
    to: [{ email: INFO_EMAIL }],
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
    source: { mailbox: INFO_EMAIL, folder: "INBOX", uidValidity: 10n, uid: 501n },
    providerLocator: {
      kind: "imap",
      mailbox: INFO_EMAIL,
      folder: "INBOX",
      uidValidity: "10",
      uid: "501",
    },
    attachments: [],
    ...overrides,
  };
}

/** A DB seeded with one customer who owns one open deal, plus a manager. */
function seedDb(): FakeEmailDb {
  const db = new FakeEmailDb();
  db.users.push({
    id: "user_customer",
    email: CUSTOMER_EMAIL,
    name: "Иван Клиент",
    isCustomer: true,
  });
  db.users.push({ id: "user_manager", email: MANAGER_EMAIL, name: "Пётр Менеджер", isCustomer: false });
  db.deals.push({ id: "deal_1", customerUserId: "user_customer", stage: "QUALIFIED" });
  db.mailIdentities.push({
    id: "mi_manager",
    address: MANAGER_EMAIL,
    type: "MANAGER",
    userId: "user_manager",
    isActive: true,
  });
  db.mailIdentities.push({
    id: "mi_info",
    address: INFO_EMAIL,
    type: "SHARED",
    userId: null,
    isActive: true,
  });
  return db;
}

describe("resolution — outbound (manager mail)", () => {
  let db: FakeEmailDb;
  let projectInboundEvents: Mock<NonNullable<IngestOptions["projectInboundEvents"]>>;

  beforeEach(() => {
    db = seedDb();
    projectInboundEvents = vi.fn(async () => undefined);
  });

  function run(email: ParsedEmail) {
    return ingestEmail(email, { client: db, projectInboundEvents });
  }

  // Scenario 2 (DoD): a new manager email from a phone lands as EMAIL_OUTBOUND
  // with the manager as author, attached to the single known recipient, and
  // never raises a follow-up.
  it("attaches a manager's outbound to the one known recipient, with author, no task", async () => {
    const result = await run(
      parsed({
        direction: "OUTBOUND",
        from: { email: MANAGER_EMAIL, name: "Пётр Менеджер" },
        to: [{ email: CUSTOMER_EMAIL }],
        rfcMessageId: "<mgr-out-1@geleoteka.ru>",
        source: { mailbox: "crm-archive@geleoteka.ru", folder: "INBOX", uidValidity: 7n, uid: 1n },
      }),
    );

    expect(result.status).toBe("created");
    expect(result.kind).toBe("customer");
    expect(db.communicationLogs).toHaveLength(1);
    const log = db.communicationLogs[0];
    expect(log.channel).toBe("EMAIL_OUTBOUND");
    expect(log.customerUserId).toBe("user_customer");
    expect(log.dealId).toBe("deal_1");
    expect(log.authorUserId).toBe("user_manager");
    expect(log.emailMessageId).toBe(db.emailMessages[0].id);
    expect(db.inboxMessages).toHaveLength(0);
    expect(projectInboundEvents).not.toHaveBeenCalled();
  });

  // Author of a shared-box send has no unambiguous manager → authorUserId stays
  // null, but the message still attaches to the recipient.
  it("leaves author null for a shared-box (info@) outbound", async () => {
    const result = await run(
      parsed({
        direction: "OUTBOUND",
        from: { email: INFO_EMAIL, name: "Geleoteka" },
        to: [{ email: CUSTOMER_EMAIL }],
        rfcMessageId: "<info-out-1@geleoteka.ru>",
        source: { mailbox: "crm-archive@geleoteka.ru", folder: "INBOX", uidValidity: 7n, uid: 2n },
      }),
    );

    expect(result.kind).toBe("customer");
    expect(db.communicationLogs[0].channel).toBe("EMAIL_OUTBOUND");
    expect(db.communicationLogs[0].authorUserId).toBeNull();
    expect(projectInboundEvents).not.toHaveBeenCalled();
  });

  // Scenario 4 (DoD): more than one customer among the recipients is genuinely
  // ambiguous — sending it to the wrong customer's timeline would leak another
  // customer's correspondence, so it is parked as OUTBOUND for a human, no task.
  it("parks a multi-customer outbound as OUTBOUND triage rather than guessing", async () => {
    db.users.push({ id: "user_customer_2", email: "second@example.test", name: "Second", isCustomer: true });

    const result = await run(
      parsed({
        direction: "OUTBOUND",
        from: { email: MANAGER_EMAIL },
        to: [{ email: CUSTOMER_EMAIL }, { email: "second@example.test" }],
        rfcMessageId: "<mgr-multi@geleoteka.ru>",
        source: { mailbox: "crm-archive@geleoteka.ru", folder: "INBOX", uidValidity: 7n, uid: 3n },
      }),
    );

    expect(result.status).toBe("unresolved");
    expect(result.kind).toBe("inbox");
    expect(db.communicationLogs).toHaveLength(0);
    expect(db.inboxMessages).toHaveLength(1);
    expect(db.inboxMessages[0].direction).toBe("OUTBOUND");
    expect(db.inboxMessages[0].status).toBe("PENDING");
    expect(projectInboundEvents).not.toHaveBeenCalled();
  });

  it("parks an outbound to no known customer as OUTBOUND triage", async () => {
    const result = await run(
      parsed({
        direction: "OUTBOUND",
        from: { email: MANAGER_EMAIL },
        to: [{ email: "stranger@nowhere.test" }],
        rfcMessageId: "<mgr-unknown@geleoteka.ru>",
        source: { mailbox: "crm-archive@geleoteka.ru", folder: "INBOX", uidValidity: 7n, uid: 4n },
      }),
    );

    expect(result.kind).toBe("inbox");
    expect(db.inboxMessages[0].direction).toBe("OUTBOUND");
    // No alias is invented for the recipient of an unattributed outbound.
    expect(db.customerContacts).toHaveLength(0);
    expect(projectInboundEvents).not.toHaveBeenCalled();
  });

  // A recipient reachable only through a secondary CustomerContact still counts
  // as exactly one known customer.
  it("matches an outbound recipient via a secondary email alias", async () => {
    db.customerContacts.push({
      id: "cc_1",
      userId: "user_customer",
      type: "EMAIL",
      value: "alias@example.test",
    });

    const result = await run(
      parsed({
        direction: "OUTBOUND",
        from: { email: MANAGER_EMAIL },
        to: [{ email: "alias@example.test" }],
        rfcMessageId: "<mgr-alias@geleoteka.ru>",
        source: { mailbox: "crm-archive@geleoteka.ru", folder: "INBOX", uidValidity: 7n, uid: 5n },
      }),
    );

    expect(result.kind).toBe("customer");
    expect(db.communicationLogs[0].customerUserId).toBe("user_customer");
  });
});

describe("resolution — cross-provider threading", () => {
  let db: FakeEmailDb;
  let projectInboundEvents: Mock<NonNullable<IngestOptions["projectInboundEvents"]>>;

  beforeEach(() => {
    db = seedDb();
    projectInboundEvents = vi.fn(async () => undefined);
  });

  function run(email: ParsedEmail) {
    return ingestEmail(email, { client: db, projectInboundEvents });
  }

  // Scenario 1 (DoD): a transactional send recorded (by the app) as an
  // EMAIL_OUTBOUND CommunicationLog. The customer replies; the reply reaches us
  // over IMAP (a different transport). In-Reply-To carries the transactional
  // Message-Id, so the reply threads onto the same customer and deal.
  it("threads a reply onto the transactional Message-Id it answers", async () => {
    db.communicationLogs.push({
      id: "cl_txn",
      externalId: "<estimate-42@geleoteka.ru>",
      customerUserId: "user_customer",
      dealId: "deal_1",
      channel: "EMAIL_OUTBOUND",
    });

    const result = await run(
      parsed({
        from: { email: "reply-address@gmail.com" }, // not a known sender — proves thread wins
        inReplyTo: "<estimate-42@geleoteka.ru>",
        rfcMessageId: "<reply-1@gmail.com>",
      }),
    );

    expect(result.status).toBe("created");
    expect(result.kind).toBe("thread");
    const created = db.communicationLogs.find((r) => r.id !== "cl_txn");
    expect(created?.channel).toBe("EMAIL_INBOUND");
    expect(created?.customerUserId).toBe("user_customer");
    expect(created?.dealId).toBe("deal_1");
    expect(projectInboundEvents).toHaveBeenCalledTimes(1);
  });

  // The thread anchor also resolves through EmailMessage.rfcMessageId when the
  // ancestor is a canonical EmailMessage whose CRM row we can follow.
  it("threads via EmailMessage.rfcMessageId when there is no matching externalId", async () => {
    db.emailMessages.push({
      id: "em_prior",
      rfcMessageId: "<prior-canonical@geleoteka.ru>",
      direction: "OUTBOUND",
      provider: "TIMEWEB_IMAP",
      sourceMailbox: "crm-archive@geleoteka.ru",
      sourceFolder: "INBOX",
      uidValidity: 7n,
      uid: 99n,
    });
    db.communicationLogs.push({
      id: "cl_prior",
      externalId: "<some-other-external@geleoteka.ru>", // deliberately != rfcMessageId
      emailMessageId: "em_prior",
      customerUserId: "user_customer",
      dealId: "deal_1",
      channel: "EMAIL_OUTBOUND",
    });

    const result = await run(
      parsed({
        from: { email: "reply-address@gmail.com" },
        inReplyTo: "<prior-canonical@geleoteka.ru>",
        rfcMessageId: "<reply-2@gmail.com>",
      }),
    );

    expect(result.kind).toBe("thread");
    const created = db.communicationLogs.find((r) => r.id !== "cl_prior");
    expect(created?.customerUserId).toBe("user_customer");
    expect(created?.dealId).toBe("deal_1");
  });

  // Scenario 3 (DoD): the manager's own outbound, then the customer's reply to
  // it. The reply must thread back and raise exactly one follow-up.
  it("full round trip: manager outbound (no task) then customer reply (one task)", async () => {
    const outbound = await run(
      parsed({
        direction: "OUTBOUND",
        from: { email: MANAGER_EMAIL },
        to: [{ email: CUSTOMER_EMAIL }],
        rfcMessageId: "<mgr-thread@geleoteka.ru>",
        source: { mailbox: "crm-archive@geleoteka.ru", folder: "INBOX", uidValidity: 7n, uid: 10n },
      }),
    );
    expect(outbound.kind).toBe("customer");
    expect(projectInboundEvents).not.toHaveBeenCalled();

    const reply = await run(
      parsed({
        from: { email: CUSTOMER_EMAIL },
        inReplyTo: "<mgr-thread@geleoteka.ru>",
        rfcMessageId: "<cust-reply@example.test>",
        source: { mailbox: INFO_EMAIL, folder: "INBOX", uidValidity: 10n, uid: 20n },
      }),
    );

    expect(reply.kind).toBe("thread");
    const inbound = db.communicationLogs.find((r) => r.channel === "EMAIL_INBOUND");
    expect(inbound?.customerUserId).toBe("user_customer");
    expect(inbound?.dealId).toBe("deal_1");
    expect(projectInboundEvents).toHaveBeenCalledTimes(1);
  });
});

describe("follow-up dueAt policy", () => {
  // Scenario 5 (DoD): the follow-up SLA runs from the moment of ingestion, but
  // the CRM must still show the message's real date. The resolver therefore
  // hands the message's occurredAt to the task layer; the task layer decides the
  // dueAt from "now" (asserted in verify-auto-task against the real DB).
  it("passes the message's actual date to the follow-up, not the sync time", async () => {
    const db = seedDb();
    const projectInboundEvents = vi.fn(async () => undefined);

    await ingestEmail(
      parsed({ from: { email: CUSTOMER_EMAIL }, rfcMessageId: "<dated@example.test>" }),
      { client: db, projectInboundEvents },
    );

    expect(projectInboundEvents).toHaveBeenCalledTimes(1);
    expect(db.staffNotificationEvents[0].channel).toBe("EMAIL_INBOUND");
    expect((db.staffNotificationEvents[0].occurredAt as Date).toISOString()).toBe(OCCURRED.toISOString());
  });
});

describe("manual-link idempotency (canonical dedup)", () => {
  // Scenario 6 (DoD): re-processing the same unresolved message — whichever
  // direction — must not create a second CRM row. The server action's manual
  // link leans on the same canonical dedup keys the ingest does.
  let db: FakeEmailDb;

  beforeEach(() => {
    db = seedDb();
  });

  function run(email: ParsedEmail) {
    return ingestEmail(email, { client: db, projectInboundEvents: vi.fn(async () => undefined) });
  }

  it("collapses a re-read outbound to one InboxMessage", async () => {
    const p = parsed({
      direction: "OUTBOUND",
      from: { email: MANAGER_EMAIL },
      to: [{ email: "stranger@nowhere.test" }],
      rfcMessageId: "<dup-out@geleoteka.ru>",
      source: { mailbox: "crm-archive@geleoteka.ru", folder: "INBOX", uidValidity: 7n, uid: 30n },
    });

    const first = await run(p);
    const second = await run(p);

    expect(first.status).toBe("unresolved");
    expect(second.status).toBe("duplicate");
    expect(db.inboxMessages).toHaveLength(1);
  });

  it("collapses a re-read unknown inbound to one InboxMessage", async () => {
    const p = parsed({ from: { email: "who@nowhere.test" }, rfcMessageId: "<dup-in@nowhere.test>" });

    const first = await run(p);
    const second = await run(p);

    expect(first.status).toBe("unresolved");
    expect(second.status).toBe("duplicate");
    expect(db.inboxMessages).toHaveLength(1);
  });

  // A manager's transactional send that the app already recorded as a
  // CommunicationLog must not be logged a second time when its archive copy is
  // later ingested — the externalId is the same, and the row is just linked to
  // its canonical EmailMessage.
  it("does not double-log an outbound the app already recorded", async () => {
    db.communicationLogs.push({
      id: "cl_already",
      externalId: "<already-sent@geleoteka.ru>",
      customerUserId: "user_customer",
      dealId: "deal_1",
      channel: "EMAIL_OUTBOUND",
      emailMessageId: null,
    });

    const result = await resolveOutboundEmail({
      parsed: parsed({
        direction: "OUTBOUND",
        from: { email: MANAGER_EMAIL },
        to: [{ email: CUSTOMER_EMAIL }],
        rfcMessageId: "<already-sent@geleoteka.ru>",
      }),
      client: db as unknown as EmailIngestTx,
      emailMessageId: "em_canonical",
    });

    expect(result.kind).toBe("thread");
    expect(result.id).toBe("cl_already");
    expect(db.communicationLogs).toHaveLength(1);
    // The pre-existing row gets linked to its canonical EmailMessage.
    expect(db.communicationLogs[0].emailMessageId).toBe("em_canonical");
  });
});

/**
 * Story 0 — mail addressed to a SOFT-DELETED customer must stay visible.
 *
 * Found in production 2026-07-30: `User.deletedAt` was not consulted anywhere in
 * resolution, so a message resolving onto a deleted customer was written as a
 * `CommunicationLog` on a customer card nobody can open — and it never reached
 * the triage inbox, which only lists `InboxMessage`. The mail existed in the DB
 * and was invisible in every UI.
 *
 * The rule pinned here: a deleted customer is NOT a match. Such mail parks in
 * triage, where a human can re-attach it, and raises no follow-up task.
 */
describe("resolution — soft-deleted customers stay visible", () => {
  const DELETED_EMAIL = "gone@example.test";
  const DELETED_ALIAS = "gone-alias@example.test";
  let db: FakeEmailDb;
  let projectInboundEvents: Mock<NonNullable<IngestOptions["projectInboundEvents"]>>;

  beforeEach(() => {
    db = seedDb();
    db.users.push({
      id: "user_deleted",
      email: DELETED_EMAIL,
      name: "Удалённый Клиент",
      isCustomer: true,
      deletedAt: new Date("2026-07-01T00:00:00.000Z"),
    });
    db.customerContacts.push({
      id: "cc_deleted",
      type: "EMAIL",
      value: DELETED_ALIAS,
      userId: "user_deleted",
    });
    db.deals.push({ id: "deal_deleted", customerUserId: "user_deleted", stage: "QUALIFIED" });
    projectInboundEvents = vi.fn(async () => undefined);
  });

  function run(email: ParsedEmail) {
    return ingestEmail(email, { client: db, projectInboundEvents });
  }

  it("parks inbound from a deleted customer's primary email in triage", async () => {
    const result = await run(
      parsed({ from: { email: DELETED_EMAIL }, rfcMessageId: "<del-1@example.test>" }),
    );

    expect(result.kind).toBe("inbox");
    expect(result.status).toBe("unresolved");
    expect(db.inboxMessages).toHaveLength(1);
    expect(db.communicationLogs).toHaveLength(0);
    expect(projectInboundEvents).toHaveBeenCalledOnce();
  });

  it("parks inbound arriving on a deleted customer's alias in triage", async () => {
    const result = await run(
      parsed({ from: { email: DELETED_ALIAS }, rfcMessageId: "<del-2@example.test>" }),
    );

    expect(result.kind).toBe("inbox");
    expect(db.communicationLogs).toHaveLength(0);
    expect(projectInboundEvents).toHaveBeenCalledOnce();
  });

  // The nastiest variant: the thread anchor still points at the deleted
  // customer, so threading would smuggle the message onto the dead card.
  it("parks a reply whose thread owner was deleted", async () => {
    db.communicationLogs.push({
      id: "cl_dead_thread",
      externalId: "<txn-to-deleted@geleoteka.ru>",
      customerUserId: "user_deleted",
      dealId: "deal_deleted",
      channel: "EMAIL_OUTBOUND",
    });

    const result = await run(
      parsed({
        from: { email: "someone@gmail.com" },
        inReplyTo: "<txn-to-deleted@geleoteka.ru>",
        rfcMessageId: "<del-3@gmail.com>",
      }),
    );

    expect(result.kind).toBe("inbox");
    // Only the pre-seeded anchor remains — no new hidden row was written.
    expect(db.communicationLogs).toHaveLength(1);
    expect(projectInboundEvents).toHaveBeenCalledOnce();
  });

  it("parks our own outbound addressed to a deleted customer", async () => {
    const result = await run(
      parsed({
        direction: "OUTBOUND",
        from: { email: MANAGER_EMAIL },
        to: [{ email: DELETED_EMAIL }],
        rfcMessageId: "<del-out@geleoteka.ru>",
        source: { mailbox: "crm-archive@geleoteka.ru", folder: "INBOX", uidValidity: 7n, uid: 77n },
      }),
    );

    expect(result.kind).toBe("inbox");
    expect(db.inboxMessages).toHaveLength(1);
    expect(db.inboxMessages[0].direction).toBe("OUTBOUND");
    expect(db.communicationLogs).toHaveLength(0);
  });

  // Regression guard: the fix must not make LIVE customers stop resolving.
  it("still attaches mail from a live customer", async () => {
    const result = await run(
      parsed({ from: { email: CUSTOMER_EMAIL }, rfcMessageId: "<live-1@example.test>" }),
    );

    expect(result.kind).toBe("customer");
    expect(db.communicationLogs).toHaveLength(1);
    expect(db.communicationLogs[0].customerUserId).toBe("user_customer");
    expect(projectInboundEvents).toHaveBeenCalledTimes(1);
  });
});
