/**
 * Verifies the Timeweb IMAP sync end to end WITHOUT a live IMAP server.
 *
 * It drives the real sync loop (`runSyncOnce`), the real MIME mapper, the real
 * `ingestEmail`, and the real Prisma schema (cursors, leases, dead-letter rows)
 * — everything except the socket, which is a deterministic in-memory fake port.
 * This is the honest green gate the plan asks for: it proves the DB integration
 * (compound cursor key, atomic lease, DEAD insert, UIDVALIDITY rescan) against
 * the actual schema, and it never touches production credentials.
 *
 * If `TIMEWEB_IMAP_PASSWORD` is set we STILL do not connect anywhere — a live
 * end-to-end check against real mailboxes is an operator step in Task 6, and we
 * say so rather than pretend it happened.
 *
 * Run: `npm run verify-timeweb-imap`. Exits 1 on failure.
 */
import "dotenv/config";

import { db } from "../lib/db";
import { ingestEmail } from "../lib/email/ingest";
import {
  createMailIdentityLookup,
  createMimeMapper,
} from "../lib/email/providers/timeweb-imap";
import {
  getSyncHealth,
  replayDeadLetter,
  runSyncOnce,
  type MailSyncDb,
  type MailSyncSource,
  type MimeMapper,
  type SyncConfig,
  type SyncDeps,
} from "../lib/email/sync";
import { buildRawEmail, FakeImapPort, POISON_MARKER } from "../tests/email/fake-imap";

const TAG = "verify-timeweb-imap";
const CUSTOMER_EMAIL = "client@test.ru";

const BOX_A = "verify-imap-a@geleoteka.test"; // dedupe + outage + uidvalidity
const BOX_B = "verify-imap-b@geleoteka.test"; // poison + replay
const BOX_ARCHIVE = "verify-imap-archive@geleoteka.test"; // outbound direction
const OUR_SENDER = "verify-imap-sender@geleoteka.test";

const SRC_A: MailSyncSource = { mailbox: BOX_A, folder: "INBOX", role: "INBOUND" };
const SRC_B: MailSyncSource = { mailbox: BOX_B, folder: "INBOX", role: "INBOUND" };
const SRC_ARCHIVE: MailSyncSource = { mailbox: BOX_ARCHIVE, folder: "INBOX", role: "OUTBOUND_ARCHIVE" };

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

/** JSON.stringify that survives the BigInt UID fields on a sync result. */
function j(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

function fromCustomer(id: string, subject = "Вопрос"): Buffer {
  return buildRawEmail({
    messageId: `<${TAG}-${id}@example.test>`,
    from: "Иван Клиент <client@test.ru>",
    to: BOX_A,
    subject,
    date: "Tue, 14 Jul 2026 09:15:00 +0000",
    text: "Здравствуйте.",
  });
}

async function cleanup(): Promise<void> {
  await db.crmTask.deleteMany({
    where: { kind: "FOLLOW_UP", title: { startsWith: "Ответить клиенту:" } },
  });
  await db.communicationLog.deleteMany({ where: { externalId: { contains: TAG } } });
  await db.inboxMessage.deleteMany({ where: { messageId: { contains: TAG } } });
  await db.emailMessage.deleteMany({
    where: { sourceMailbox: { in: [BOX_A, BOX_B, BOX_ARCHIVE] } },
  });
  await db.mailboxSyncCursor.deleteMany({
    where: { mailbox: { in: [BOX_A, BOX_B, BOX_ARCHIVE] } },
  });
  await db.mailIdentity.deleteMany({ where: { address: OUR_SENDER } });
}

async function commLogCount(): Promise<number> {
  return db.communicationLog.count({ where: { externalId: { contains: TAG } } });
}

async function main(): Promise<void> {
  console.log(`[${TAG}] starting (deterministic fake IMAP — no live server)`);
  await cleanup();

  const customer = (await db.user.findFirst({
    where: { email: CUSTOMER_EMAIL },
    select: { id: true },
  })) as { id: string } | null;
  assert(customer, `seed ${CUSTOMER_EMAIL} not found — run prisma db seed`);

  // Register our own address so the archive source can classify direction.
  await db.mailIdentity.create({
    data: { address: OUR_SENDER, type: "SHARED", isActive: true },
  });

  const port = new FakeImapPort();
  const isOurAddress = createMailIdentityLookup();
  const baseMapper = createMimeMapper({ isOurAddress });
  const mapper: MimeMapper = async (raw, ctx) => {
    if (raw.toString("utf8", 0, POISON_MARKER.length) === POISON_MARKER) {
      throw new Error("poison MIME");
    }
    return baseMapper(raw, ctx);
  };

  const deps: SyncDeps = {
    db: db as unknown as MailSyncDb,
    port,
    mapper,
    ingest: (parsed) => ingestEmail(parsed),
    sleep: async () => {},
  };
  const config: SyncConfig = {
    sources: [SRC_A, SRC_B, SRC_ARCHIVE],
    owner: `${TAG}#${process.pid}`,
    batchSize: 100,
    maxMapAttempts: 2,
  };

  // ── Seed the fake mailboxes ────────────────────────────────────────────────
  const boxA = port.box(BOX_A, "INBOX", 10n);
  boxA.append(fromCustomer("a1"));
  boxA.append(fromCustomer("a2"));

  const boxB = port.box(BOX_B, "INBOX");
  boxB.append(fromCustomer("b1")); // uid 1 — good
  const poisonUid = boxB.append(Buffer.from(`${POISON_MARKER} broken`, "utf8")); // uid 2
  boxB.append(fromCustomer("b3")); // uid 3 — good

  const boxArchive = port.box(BOX_ARCHIVE, "INBOX");
  boxArchive.append(
    buildRawEmail({
      messageId: `<${TAG}-out1@example.test>`,
      from: `Geleoteka <${OUR_SENDER}>`,
      to: CUSTOMER_EMAIL,
      subject: "Ответ",
    }),
  );

  // ── 1. First pass ──────────────────────────────────────────────────────────
  {
    const results = await runSyncOnce(config, deps);
    const a = results.find((r) => r.mailbox === BOX_A)!;
    const b = results.find((r) => r.mailbox === BOX_B)!;
    const arc = results.find((r) => r.mailbox === BOX_ARCHIVE)!;

    assert(a.created === 2 && a.dead === 0, `box A first pass wrong: ${j(a)}`);
    assert(b.created === 2 && b.dead === 1, `box B first pass wrong: ${j(b)}`);
    assert(arc.processed === 1, `archive first pass wrong: ${j(arc)}`);
    console.log("  ✓ first pass: A created 2, B created 2 + 1 DEAD, archive processed 1");

    const outbound = (await db.emailMessage.findFirst({
      where: { rfcMessageId: `<${TAG}-out1@example.test>` },
      select: { direction: true },
    })) as { direction: string } | null;
    assert(outbound?.direction === "OUTBOUND", `archive From ours → OUTBOUND, got ${outbound?.direction}`);
    console.log("  ✓ archive message classified OUTBOUND by MailIdentity, not folder");
  }

  // ── 2. Re-run: everything already held → duplicates, nothing new ────────────
  {
    const before = await commLogCount();
    const results = await runSyncOnce(config, deps);
    const totalCreated = results.reduce((n, r) => n + r.created, 0);
    assert(totalCreated === 0, `re-run created ${totalCreated} rows; expected 0`);
    assert((await commLogCount()) === before, "re-run wrote a new CommunicationLog");
    console.log("  ✓ idempotent re-run: no new rows");
  }

  // ── 3. UIDVALIDITY change on box A → rescan, still no duplicates ────────────
  {
    const before = await commLogCount();
    boxA.bumpUidValidity(20n);
    const results = await runSyncOnce(config, deps);
    const a = results.find((r) => r.mailbox === BOX_A)!;
    assert(a.uidValidityChanged === true, "box A should report a UIDVALIDITY change");
    assert(a.created === 0 && a.duplicates === 2, `rescan wrong: ${j(a)}`);
    assert((await commLogCount()) === before, "UIDVALIDITY rescan duplicated a CRM row");
    console.log("  ✓ UIDVALIDITY change: rescan deduped, no duplicate CRM rows");
  }

  // ── 4. Outage backlog: two new messages arrive, next pass imports both ──────
  {
    const before = await commLogCount();
    boxA.append(fromCustomer("a3"));
    boxA.append(fromCustomer("a4"));
    const results = await runSyncOnce(config, deps);
    const a = results.find((r) => r.mailbox === BOX_A)!;
    assert(a.created === 2, `outage backlog import wrong: ${j(a)}`);
    assert((await commLogCount()) === before + 2, "backlog did not add exactly 2 CRM rows");
    console.log("  ✓ outage backlog: 2 queued messages imported on next pass");
  }

  // ── 5. Dead-letter is durable and replayable ───────────────────────────────
  {
    const health = await getSyncHealth(deps.db as MailSyncDb);
    const bHealth = health.find((h) => h.mailbox === BOX_B)!;
    assert(bHealth.deadLetters === 1, `expected 1 dead letter for B, got ${bHealth.deadLetters}`);

    const dead = (await db.emailMessage.findFirst({
      where: { sourceMailbox: BOX_B, ingestStatus: "DEAD" },
      select: { id: true },
    })) as { id: string } | null;
    assert(dead, "no DEAD row found for box B");

    // Still poison → replay reports failure, DEAD row preserved.
    const stillDead = await replayDeadLetter(dead!.id, config, deps);
    assert(stillDead === null, "replay of still-poison message should return null");

    // Fix the source, replay → the DEAD placeholder becomes a real row.
    boxB.messages.find((m) => m.uid === poisonUid)!.source = fromCustomer("b-recovered");
    const recovered = await replayDeadLetter(dead!.id, config, deps);
    assert(recovered?.status === "created", `replay should create, got ${recovered?.status}`);

    const remaining = await db.emailMessage.count({
      where: { sourceMailbox: BOX_B, ingestStatus: "DEAD" },
    });
    assert(remaining === 0, `DEAD row not cleared after successful replay (${remaining} left)`);
    console.log("  ✓ dead-letter durable, cursor continued, manual replay recovered it");
  }

  // ── Honest note about live coverage ─────────────────────────────────────────
  if ((process.env.TIMEWEB_IMAP_PASSWORD ?? "").length > 0) {
    console.log(
      `[${TAG}] NOTE: TIMEWEB_IMAP_PASSWORD is set, but this gate never connects to a real server. ` +
        "A live end-to-end IMAP check against real mailboxes remains a manual Task 6 step.",
    );
  } else {
    console.log(
      `[${TAG}] NOTE: no TIMEWEB_IMAP_PASSWORD — live IMAP not exercised (by design). ` +
        "Live verification is a manual Task 6 step.",
    );
  }

  await cleanup();
  console.log(`[${TAG}] PASS`);
}

main()
  .catch((err) => {
    console.error(`[${TAG}] ERROR`, err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
