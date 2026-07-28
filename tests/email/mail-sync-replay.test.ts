import { describe, it, expect } from "vitest";

import { ingestEmail } from "@/lib/email/ingest";
import { createMimeMapper } from "@/lib/email/providers/timeweb-imap";
import {
  replayDeadLetter,
  runSyncOnce,
  type MailSyncDb,
  type MimeMapper,
  type SyncConfig,
  type SyncDeps,
} from "@/lib/email/sync";
import { FakeMailDb } from "./fake-mail-db";
import { buildRawEmail, FakeImapPort, POISON_MARKER } from "./fake-imap";

const BOX = "crm-archive@geleoteka.test";

/**
 * These exercise the exact core the ADMIN replay action calls (`replayDeadLetter`
 * + the shared `ingestEmail`). The action itself only adds an auth gate on top —
 * covered separately in mail-sync-action.test.ts — so proving idempotency here
 * proves it for the action: one DEAD row, replayed, yields exactly one CRM row
 * and one follow-up, and a second replay adds neither.
 */
function wire() {
  const db = new FakeMailDb();
  db.users.push({ id: "cust1", email: "client@test.ru", name: "Иван", isCustomer: true });

  let followUpCalls = 0;
  const ensureFollowUp = async (): Promise<void> => {
    followUpCalls += 1;
  };

  const baseMapper = createMimeMapper({ isOurAddress: () => false });
  const mapper: MimeMapper = async (raw, ctx) => {
    if (raw.toString("utf8", 0, POISON_MARKER.length) === POISON_MARKER) {
      throw new Error("poison MIME");
    }
    return baseMapper(raw, ctx);
  };

  const port = new FakeImapPort();
  const deps: SyncDeps = {
    db: db as unknown as MailSyncDb,
    port,
    mapper,
    ingest: (parsed) => ingestEmail(parsed, { client: db, ensureFollowUp }),
    sleep: async () => {},
  };
  const config: SyncConfig = {
    sources: [{ mailbox: BOX, folder: "INBOX", role: "INBOUND" }],
    owner: "replay-test#1",
    batchSize: 100,
    maxMapAttempts: 2,
  };

  return { db, port, deps, config, followUpCalls: () => followUpCalls };
}

describe("replayDeadLetter — idempotent recovery", () => {
  it("replaying a fixed DEAD message creates exactly one CRM row and one task", async () => {
    const { db, port, deps, config, followUpCalls } = wire();
    const box = port.box(BOX, "INBOX", 1n);
    const uid = box.append(Buffer.from(`${POISON_MARKER} unreadable`, "utf8"));

    // First pass dead-letters the poison message.
    await runSyncOnce(config, deps);
    const deadRows = db.emailMessages.filter((r) => r.ingestStatus === "DEAD");
    expect(deadRows).toHaveLength(1);
    expect(db.communicationLogs).toHaveLength(0);
    expect(followUpCalls()).toBe(0);
    const deadId = deadRows[0].id as string;

    // Repair the source and replay.
    box.messages.find((m) => m.uid === uid)!.source = buildRawEmail({
      messageId: "<replay-recovered-1@example.test>",
      from: "Иван Клиент <client@test.ru>",
      to: BOX,
      subject: "Вопрос",
      text: "Здравствуйте.",
    });

    const first = await replayDeadLetter(deadId, config, deps);
    expect(first?.status).toBe("created");
    expect(db.communicationLogs).toHaveLength(1);
    expect(db.emailMessages.filter((r) => r.ingestStatus === "DEAD")).toHaveLength(0);
    expect(followUpCalls()).toBe(1);

    // Replaying the SAME dead id again: the placeholder is gone → null, and no
    // second CommunicationLog / follow-up appears.
    const second = await replayDeadLetter(deadId, config, deps);
    expect(second).toBeNull();
    expect(db.communicationLogs).toHaveLength(1);
    expect(followUpCalls()).toBe(1);
  });

  it("replay of a still-broken message keeps a single DEAD row and no CRM row", async () => {
    const { db, port, deps, config, followUpCalls } = wire();
    const box = port.box(BOX, "INBOX", 1n);
    box.append(Buffer.from(`${POISON_MARKER} still broken`, "utf8"));

    await runSyncOnce(config, deps);
    const deadId = db.emailMessages.find((r) => r.ingestStatus === "DEAD")!.id as string;

    const result = await replayDeadLetter(deadId, config, deps);
    expect(result).toBeNull();
    // Still exactly one DEAD row, no timeline row, no task.
    expect(db.emailMessages.filter((r) => r.ingestStatus === "DEAD")).toHaveLength(1);
    expect(db.communicationLogs).toHaveLength(0);
    expect(followUpCalls()).toBe(0);
  });
});
