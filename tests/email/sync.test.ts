import { describe, expect, it, vi } from "vitest";

import { ingestEmail } from "@/lib/email/ingest";
import { mapMimeToParsedEmail } from "@/lib/email/providers/timeweb-imap";
import {
  acquireLease,
  getSyncHealth,
  releaseLease,
  replayDeadLetter,
  syncSource,
  type MailSyncSource,
  type MimeMapper,
  type SyncConfig,
  type SyncDeps,
} from "@/lib/email/sync";
import { buildRawEmail, FakeImapPort, POISON_MARKER } from "./fake-imap";
import { FakeMailDb } from "./fake-mail-db";

/**
 * The replay-safe sync loop against in-memory fakes — no socket, no database.
 *
 * The mapper here is the REAL mailparser-backed mapper, wrapped only to reject a
 * sentinel buffer so the poison path is deterministic; ingest is the REAL
 * `ingestEmail` over the shared fake store, so these exercise fetch → map →
 * ingest → cursor exactly as production does. Each `it` maps to one line of the
 * plan's Task 2 Definition of Done.
 */

const NOW = new Date("2026-07-20T10:00:00.000Z");
const OURS = new Set(["info@geleoteka.ru", "manager@geleoteka.ru"]);
const INBOUND: MailSyncSource = { mailbox: "info@geleoteka.ru", folder: "INBOX", role: "INBOUND" };

function customerMessage(messageId: string): Buffer {
  return buildRawEmail({
    messageId,
    from: "Иван Клиент <client@test.ru>",
    to: "info@geleoteka.ru",
    subject: "Вопрос",
    date: "Tue, 14 Jul 2026 09:15:00 +0000",
    text: "Здравствуйте.",
  });
}

interface Harness {
  db: FakeMailDb;
  port: FakeImapPort;
  ensureFollowUp: ReturnType<typeof vi.fn>;
  ingestOrder: string[];
  deps: SyncDeps;
  config: (owner?: string) => SyncConfig;
}

function harness(): Harness {
  const db = new FakeMailDb();
  db.users.push({ id: "user_c", email: "client@test.ru", name: "Иван Клиент", isCustomer: true });

  const port = new FakeImapPort();
  const ensureFollowUp = vi.fn(async () => ({ taskId: "t", created: true }));
  const ingestOrder: string[] = [];

  const isOurAddress = (email: string): boolean => OURS.has(email.toLowerCase());
  const mapper: MimeMapper = async (raw, ctx) => {
    if (raw.toString("utf8", 0, POISON_MARKER.length) === POISON_MARKER) {
      throw new Error("poison MIME");
    }
    return mapMimeToParsedEmail(raw, {
      source: ctx.source,
      role: ctx.role,
      internalDate: ctx.internalDate,
      isOurAddress,
    });
  };

  const deps: SyncDeps = {
    db,
    port,
    mapper,
    ingest: async (parsed) => {
      ingestOrder.push(parsed.rfcMessageId);
      return ingestEmail(parsed, { client: db, ensureFollowUp });
    },
    now: () => NOW,
    sleep: async () => {},
  };

  const config = (owner = "worker-A"): SyncConfig => ({
    sources: [INBOUND],
    owner,
    batchSize: 100,
    leaseMs: 120_000,
    maxMapAttempts: 2,
  });

  return { db, port, ensureFollowUp, ingestOrder, deps, config };
}

describe("syncSource — replay safety", () => {
  it("DoD 1: a crash between fetch and cursor-commit processes the UID exactly once", async () => {
    const h = harness();
    h.port.box("info@geleoteka.ru", "INBOX").append(customerMessage("<m1@example.test>"));

    // Crash in the window after ingest commits, before the cursor advances.
    h.db.failCursorAdvanceOnce = () => {
      throw new Error("simulated crash before cursor advance");
    };
    const first = await syncSource(INBOUND, h.config(), h.deps);
    expect(first.error).toContain("simulated crash");
    // The message WAS ingested; only the cursor failed to move.
    expect(h.db.emailMessages).toHaveLength(1);
    expect(h.db.communicationLogs).toHaveLength(1);
    expect(cursor(h).lastUid).toBeNull();

    // Restart: the same UID is re-read and collapses to a duplicate.
    const second = await syncSource(INBOUND, h.config(), h.deps);
    expect(second.duplicates).toBe(1);
    expect(h.db.emailMessages).toHaveLength(1);
    expect(h.db.communicationLogs).toHaveLength(1);
    expect(cursor(h).lastUid).toBe(1n);
    // The follow-up was raised once, on the genuine first ingest only.
    expect(h.ensureFollowUp).toHaveBeenCalledTimes(1);
  });

  it("DoD 2: two workers process each source-UID at most once (lease)", async () => {
    const h = harness();
    const box = h.port.box("info@geleoteka.ru", "INBOX");
    box.append(customerMessage("<a@example.test>"));
    box.append(customerMessage("<b@example.test>"));

    // Worker A holds the lease; worker B must find nothing to do.
    const held = await acquireLease(h.db, INBOUND, "worker-A", 120_000, NOW);
    expect(held).toBe(true);

    const b = await syncSource(INBOUND, h.config("worker-B"), h.deps);
    expect(b.skipped).toBe(true);
    expect(b.processed).toBe(0);
    expect(h.db.emailMessages).toHaveLength(0);

    // A releases; A runs and imports both.
    await releaseLease(h.db, INBOUND, "worker-A");
    const a = await syncSource(INBOUND, h.config("worker-A"), h.deps);
    expect(a.created).toBe(2);
    expect(h.db.emailMessages).toHaveLength(2);

    // A back-to-back second worker finds the cursor already past both UIDs.
    const bAgain = await syncSource(INBOUND, h.config("worker-B"), h.deps);
    expect(bAgain.processed).toBe(0);
    expect(h.db.emailMessages).toHaveLength(2);
  });

  it("DoD 3: a UIDVALIDITY change rescans without duplicating CRM rows", async () => {
    const h = harness();
    const box = h.port.box("info@geleoteka.ru", "INBOX", 10n);
    box.append(customerMessage("<u1@example.test>"));
    box.append(customerMessage("<u2@example.test>"));

    const first = await syncSource(INBOUND, h.config(), h.deps);
    expect(first.created).toBe(2);
    expect(cursor(h).uidValidity).toBe(10n);
    expect(cursor(h).lastUid).toBe(2n);

    // Server renumbers the mailbox: same messages, new UIDVALIDITY, UIDs reset.
    box.bumpUidValidity(20n);
    const second = await syncSource(INBOUND, h.config(), h.deps);
    expect(second.uidValidityChanged).toBe(true);
    expect(second.duplicates).toBe(2);
    expect(second.created).toBe(0);
    // No history re-imported — dedupe on rfcMessageId collapsed the rescan.
    expect(h.db.emailMessages).toHaveLength(2);
    expect(h.db.communicationLogs).toHaveLength(2);
    expect(cursor(h).uidValidity).toBe(20n);
    expect(cursor(h).lastUid).toBe(2n);
  });

  it("DoD 4: a poison message becomes DEAD, the cursor continues, and replay recovers it", async () => {
    const h = harness();
    const box = h.port.box("info@geleoteka.ru", "INBOX");
    box.append(customerMessage("<good1@example.test>")); // uid 1
    const poisonUid = box.append(Buffer.from(`${POISON_MARKER} broken`, "utf8")); // uid 2
    box.append(customerMessage("<good3@example.test>")); // uid 3

    const res = await syncSource(INBOUND, h.config(), h.deps);
    expect(res.created).toBe(2);
    expect(res.dead).toBe(1);
    expect(cursor(h).lastUid).toBe(3n);

    // Exactly one DEAD row, and the good mail still produced its CRM rows.
    const dead = h.db.emailMessages.filter((r) => r.ingestStatus === "DEAD");
    expect(dead).toHaveLength(1);
    expect(h.db.communicationLogs).toHaveLength(2);

    const health = await getSyncHealth(h.db);
    expect(health[0].deadLetters).toBe(1);
    expect(health[0].lastUid).toBe(3n);

    // Replay while still poison: reports failure, DEAD row preserved.
    const stillDead = await replayDeadLetter(dead[0].id as string, h.config(), h.deps);
    expect(stillDead).toBeNull();
    expect(h.db.emailMessages.filter((r) => r.ingestStatus === "DEAD")).toHaveLength(1);

    // The operator fixes the source (or it was a transient truncation); replay
    // now succeeds and the DEAD placeholder is replaced by a real row.
    box.messages.find((m) => m.uid === poisonUid)!.source = customerMessage("<recovered@example.test>");
    const recovered = await replayDeadLetter(dead[0].id as string, h.config(), h.deps);
    expect(recovered?.status).toBe("created");
    expect(h.db.emailMessages.filter((r) => r.ingestStatus === "DEAD")).toHaveLength(0);
    expect(h.db.communicationLogs).toHaveLength(3);
  });

  it("DoD 5: outage drill — 10 queued messages import in order once the worker runs", async () => {
    const h = harness();
    const box = h.port.box("info@geleoteka.ru", "INBOX");
    for (let i = 1; i <= 10; i += 1) box.append(customerMessage(`<drill-${i}@example.test>`));

    const res = await syncSource(INBOUND, h.config(), h.deps);
    expect(res.created).toBe(10);
    expect(h.db.emailMessages).toHaveLength(10);
    expect(h.db.communicationLogs).toHaveLength(10);
    expect(cursor(h).lastUid).toBe(10n);

    // Imported strictly in ascending UID order.
    expect(h.ingestOrder).toEqual(
      Array.from({ length: 10 }, (_, i) => `<drill-${i + 1}@example.test>`),
    );
  });

  it("steps over a UID that vanished between listing and fetch", async () => {
    const h = harness();
    const box = h.port.box("info@geleoteka.ru", "INBOX");
    box.append(customerMessage("<keep@example.test>")); // uid 1
    const goneUid = box.append(customerMessage("<gone@example.test>")); // uid 2
    box.append(customerMessage("<after@example.test>")); // uid 3
    // Listed in this pass, but expunged before we get to fetch it.
    box.expungeAfterList(goneUid);

    const res = await syncSource(INBOUND, h.config(), h.deps);
    expect(res.vanished).toBe(1);
    expect(res.created).toBe(2);
    expect(cursor(h).lastUid).toBe(3n);
    expect(h.db.emailMessages).toHaveLength(2);
  });
});

function cursor(h: Harness): {
  uidValidity: bigint | null;
  lastUid: bigint | null;
} {
  const row = h.db.cursors.find((c) => c.mailbox === INBOUND.mailbox && c.folder === INBOUND.folder);
  if (!row) throw new Error("cursor row missing");
  return row;
}
