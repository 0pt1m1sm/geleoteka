/**
 * In-memory stand-in for the slice of Prisma the email ingest touches.
 *
 * It exists to make the ingest contract testable without a database: the
 * behaviours under test — cross-provider dedupe, the unique-violation race,
 * "one message produces exactly one row" — are all about unique constraints and
 * transaction boundaries, so the fake enforces those and nothing else.
 *
 * Uniques modelled (each raises a Prisma-shaped P2002):
 *   EmailMessage.rfcMessageId, EmailMessage(provider, mailbox, folder, uidValidity, uid),
 *   CommunicationLog.externalId, InboxMessage.messageId
 */

import type { EmailIngestDb, EmailIngestTx } from "@/lib/email/ingest";

export class PrismaUniqueViolation extends Error {
  code = "P2002";
  constructor(target: string) {
    super(`Unique constraint failed on the fields: (${target})`);
    this.name = "PrismaClientKnownRequestError";
  }
}

interface AnyRow {
  id: string;
  [key: string]: unknown;
}

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq}`;
}

/** Reads a `where` clause field, tolerating Prisma's nested compound-key form. */
function whereField(args: Record<string, unknown>, field: string): unknown {
  const where = (args.where ?? {}) as Record<string, unknown>;
  return where[field];
}

export class FakeEmailDb implements EmailIngestDb {
  emailMessages: AnyRow[] = [];
  communicationLogs: AnyRow[] = [];
  inboxMessages: AnyRow[] = [];
  users: AnyRow[] = [];
  customerContacts: AnyRow[] = [];
  deals: AnyRow[] = [];
  mailIdentities: AnyRow[] = [];

  /** Number of transactions opened — proves the write path is atomic, not N writes. */
  transactionCount = 0;

  /**
   * Makes the next EmailMessage pre-check miss even though a matching row
   * exists, reproducing the race where two workers both look before either
   * inserts. The insert must then be the thing that stops the duplicate.
   */
  simulateLostPrecheck = false;

  async $transaction<T>(fn: (tx: EmailIngestTx) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    const snapshot = {
      emailMessages: [...this.emailMessages],
      communicationLogs: [...this.communicationLogs],
      inboxMessages: [...this.inboxMessages],
    };
    try {
      return await fn(this);
    } catch (err) {
      // Roll back so a failed transaction cannot leave a half-written message.
      this.emailMessages = snapshot.emailMessages;
      this.communicationLogs = snapshot.communicationLogs;
      this.inboxMessages = snapshot.inboxMessages;
      throw err;
    }
  }

  emailMessage = {
    findFirst: async (args: Record<string, unknown>): Promise<AnyRow | null> => {
      if (this.simulateLostPrecheck) {
        this.simulateLostPrecheck = false;
        return null;
      }
      const where = (args.where ?? {}) as Record<string, unknown>;
      const or = where.OR as Array<Record<string, unknown>> | undefined;
      if (or) {
        for (const clause of or) {
          const found = this.emailMessages.find((row) =>
            Object.entries(clause).every(([k, v]) => rowEquals(row[k], v)),
          );
          if (found) return found;
        }
        return null;
      }
      // Flat where, e.g. the thread lookup by rfcMessageId.
      return this.emailMessages.find((row) => matchesWhere(row, where)) ?? null;
    },
    create: async (args: Record<string, unknown>): Promise<AnyRow> => {
      const data = args.data as Record<string, unknown>;
      if (this.emailMessages.some((r) => r.rfcMessageId === data.rfcMessageId)) {
        throw new PrismaUniqueViolation("rfcMessageId");
      }
      const hasUid = data.uid !== null && data.uid !== undefined;
      if (
        hasUid &&
        this.emailMessages.some(
          (r) =>
            r.provider === data.provider &&
            r.sourceMailbox === data.sourceMailbox &&
            r.sourceFolder === data.sourceFolder &&
            rowEquals(r.uidValidity, data.uidValidity) &&
            rowEquals(r.uid, data.uid),
        )
      ) {
        throw new PrismaUniqueViolation("provider,sourceMailbox,sourceFolder,uidValidity,uid");
      }
      const row: AnyRow = { id: nextId("em"), ...data };
      this.emailMessages.push(row);
      return row;
    },
  };

  communicationLog = {
    findUnique: async (args: Record<string, unknown>): Promise<AnyRow | null> => {
      const externalId = whereField(args, "externalId");
      return this.communicationLogs.find((r) => r.externalId === externalId) ?? null;
    },
    findFirst: async (args: Record<string, unknown>): Promise<AnyRow | null> => {
      const where = (args.where ?? {}) as Record<string, unknown>;
      return this.communicationLogs.find((r) => matchesWhere(r, where)) ?? null;
    },
    create: async (args: Record<string, unknown>): Promise<AnyRow> => {
      const data = args.data as Record<string, unknown>;
      if (
        data.externalId !== null &&
        data.externalId !== undefined &&
        this.communicationLogs.some((r) => r.externalId === data.externalId)
      ) {
        throw new PrismaUniqueViolation("externalId");
      }
      const row: AnyRow = { id: nextId("cl"), ...data };
      this.communicationLogs.push(row);
      return row;
    },
    update: async (args: Record<string, unknown>): Promise<AnyRow> => {
      const id = whereField(args, "id");
      const row = this.communicationLogs.find((r) => r.id === id);
      if (!row) throw new Error("communicationLog.update: row not found");
      Object.assign(row, (args.data as Record<string, unknown>) ?? {});
      return row;
    },
  };

  inboxMessage = {
    create: async (args: Record<string, unknown>): Promise<AnyRow> => {
      const data = args.data as Record<string, unknown>;
      if (this.inboxMessages.some((r) => r.messageId === data.messageId)) {
        throw new PrismaUniqueViolation("messageId");
      }
      const row: AnyRow = { id: nextId("im"), ...data };
      this.inboxMessages.push(row);
      return row;
    },
  };

  user = {
    findFirst: async (args: Record<string, unknown>): Promise<AnyRow | null> => {
      const where = (args.where ?? {}) as Record<string, unknown>;
      const emailClause = where.email as { equals?: string } | string | undefined;
      const wanted =
        typeof emailClause === "string" ? emailClause : emailClause?.equals ?? undefined;
      if (wanted === undefined) return null;
      return (
        this.users.find(
          (u) =>
            String(u.email).toLowerCase() === wanted.toLowerCase() &&
            (where.isCustomer === undefined || u.isCustomer === where.isCustomer) &&
            // Soft-delete filter: `deletedAt: null` must exclude deleted rows, or
            // the resolver's guard would be untestable here.
            (where.deletedAt === undefined ||
              rowEquals(u.deletedAt ?? null, where.deletedAt)),
        ) ?? null
      );
    },
    findUnique: async (args: Record<string, unknown>): Promise<AnyRow | null> => {
      const id = whereField(args, "id");
      return this.users.find((u) => u.id === id) ?? null;
    },
  };

  customerContact = {
    findFirst: async (args: Record<string, unknown>): Promise<AnyRow | null> => {
      const where = (args.where ?? {}) as Record<string, unknown>;
      const found = this.customerContacts.find(
        (c) => c.type === where.type && c.value === where.value,
      );
      if (!found) return null;
      const user = this.users.find((u) => u.id === found.userId);
      return user ? ({ ...found, user } as AnyRow) : null;
    },
  };

  deal = {
    findFirst: async (args: Record<string, unknown>): Promise<AnyRow | null> => {
      const where = (args.where ?? {}) as Record<string, unknown>;
      const closed = ["WON", "LOST"];
      return (
        this.deals.find(
          (d) => d.customerUserId === where.customerUserId && !closed.includes(String(d.stage)),
        ) ?? null
      );
    },
  };

  mailIdentity = {
    findUnique: async (args: Record<string, unknown>): Promise<AnyRow | null> => {
      const address = whereField(args, "address");
      return this.mailIdentities.find((m) => m.address === address) ?? null;
    },
  };
}

/**
 * Evaluate a flat Prisma `where` the way the resolver needs it: scalar equality
 * plus the one operator form it uses, `{ not: x }`. Object clauses other than
 * `not` are ignored, which is enough for these tests.
 */
function matchesWhere(row: AnyRow, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v !== null && typeof v === "object" && "not" in (v as Record<string, unknown>)) {
      const not = (v as { not: unknown }).not;
      return !rowEquals(row[k], not) && row[k] !== null && row[k] !== undefined;
    }
    return rowEquals(row[k], v);
  });
}

/** bigint/number/string-tolerant equality — the fake stores whatever it is given. */
function rowEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) {
    return (a ?? null) === (b ?? null);
  }
  if (typeof a === "bigint" || typeof b === "bigint") return String(a) === String(b);
  return false;
}
