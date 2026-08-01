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
  staffNotificationEvents: AnyRow[] = [];
  crmTasks: AnyRow[] = [];
  staffNotificationReceipts: AnyRow[] = [];
  staffNotificationDeliveries: AnyRow[] = [];
  settings: AnyRow[] = [];
  telegramDestinations: AnyRow[] = [];

  /** Forces the projector's source lookup to fail like a transient DB error. */
  communicationLogFindUniqueError: Error | null = null;
  communicationLogFindUniqueCalls = 0;

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
      staffNotificationEvents: this.staffNotificationEvents.map((row) => ({ ...row })),
      crmTasks: this.crmTasks.map((row) => ({ ...row })),
      staffNotificationReceipts: this.staffNotificationReceipts.map((row) => ({ ...row })),
      staffNotificationDeliveries: this.staffNotificationDeliveries.map((row) => ({ ...row })),
    };
    try {
      return await fn(this);
    } catch (err) {
      // Roll back so a failed transaction cannot leave a half-written message.
      this.emailMessages = snapshot.emailMessages;
      this.communicationLogs = snapshot.communicationLogs;
      this.inboxMessages = snapshot.inboxMessages;
      this.staffNotificationEvents = snapshot.staffNotificationEvents;
      this.crmTasks = snapshot.crmTasks;
      this.staffNotificationReceipts = snapshot.staffNotificationReceipts;
      this.staffNotificationDeliveries = snapshot.staffNotificationDeliveries;
      throw err;
    }
  }

  async $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T> {
    const sql = query.join("?");
    if (sql.includes('FROM "StaffNotificationEvent"')) {
      const eventId = values[1];
      const dueOnly = values[2] === true;
      const now = values[3] instanceof Date ? values[3] : null;
      const event = this.staffNotificationEvents.find(
        (row) =>
          row.tenantKey === values[0] &&
          row.id === eventId &&
          ["PENDING", "RETRY"].includes(String(row.routingStatus)) &&
          (!dueOnly || !now || (row.nextRoutingAt as Date).getTime() <= now.getTime()),
      );
      return (event ? [{ ...event }] : []) as T;
    }
    if (sql.includes("pg_advisory_xact_lock")) return [{ locked: true }] as T;
    throw new Error(`FakeEmailDb.$queryRaw: unsupported query: ${sql}`);
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
      this.communicationLogFindUniqueCalls += 1;
      if (this.communicationLogFindUniqueError) throw this.communicationLogFindUniqueError;
      const id = whereField(args, "id");
      const externalId = whereField(args, "externalId");
      return (
        this.communicationLogs.find(
          (r) => (id !== undefined && r.id === id) || (externalId !== undefined && r.externalId === externalId),
        ) ?? null
      );
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
    findMany: async (): Promise<AnyRow[]> =>
      this.users.filter((user) =>
        !["CLIENT", "NONE"].includes(String(user.permissionRole ?? "CLIENT")),
      ),
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
    findUnique: async (args: Record<string, unknown>): Promise<AnyRow | null> => {
      const id = whereField(args, "id");
      return this.deals.find((deal) => deal.id === id) ?? null;
    },
  };

  crmTask = {
    createMany: async (args: Record<string, unknown>): Promise<{ count: number }> => {
      const rows = args.data as Array<Record<string, unknown>>;
      let count = 0;
      for (const data of rows) {
        const exists = this.crmTasks.some(
          (task) =>
            task.customerUserId === data.customerUserId &&
            rowEquals(task.dealId, data.dealId) &&
            task.kind === data.kind &&
            task.status === data.status,
        );
        if (exists) continue;
        this.crmTasks.push({ id: nextId("task"), ...data });
        count += 1;
      }
      return { count };
    },
    findFirst: async (args: Record<string, unknown>): Promise<AnyRow | null> => {
      const where = (args.where ?? {}) as Record<string, unknown>;
      return this.crmTasks.find((task) => matchesWhere(task, where)) ?? null;
    },
    findUnique: async (args: Record<string, unknown>): Promise<AnyRow | null> => {
      const id = whereField(args, "id");
      return this.crmTasks.find((task) => task.id === id) ?? null;
    },
    updateMany: async (args: Record<string, unknown>): Promise<{ count: number }> => {
      const where = (args.where ?? {}) as Record<string, unknown>;
      const matches = this.crmTasks.filter((task) => matchesWhere(task, where));
      for (const task of matches) applyData(task, args.data as Record<string, unknown>);
      return { count: matches.length };
    },
  };

  rolePermission = { findMany: async (): Promise<AnyRow[]> => [] };
  telegramDestination = {
    findMany: async (args: Record<string, unknown>): Promise<AnyRow[]> => {
      const where = (args.where ?? {}) as Record<string, unknown>;
      return this.telegramDestinations.filter((row) => matchesWhere(row, where));
    },
  };
  setting = {
    findMany: async (args: Record<string, unknown>): Promise<AnyRow[]> => {
      const where = (args.where ?? {}) as { key?: { in?: string[] } };
      const keys = new Set(where.key?.in ?? []);
      return this.settings.filter((row) => keys.has(String(row.key)));
    },
  };

  staffNotificationReceipt = {
    createMany: async (args: Record<string, unknown>): Promise<{ count: number }> => {
      const rows = args.data as Array<Record<string, unknown>>;
      this.staffNotificationReceipts.push(
        ...rows.map((data) => ({ id: nextId("snr"), createdAt: new Date(), ...data })),
      );
      return { count: rows.length };
    },
  };

  staffNotificationDelivery = {
    createMany: async (args: Record<string, unknown>): Promise<{ count: number }> => {
      const rows = args.data as Array<Record<string, unknown>>;
      this.staffNotificationDeliveries.push(
        ...rows.map((data) => ({ id: nextId("snd"), status: "PENDING", ...data })),
      );
      return { count: rows.length };
    },
  };

  mailIdentity = {
    findUnique: async (args: Record<string, unknown>): Promise<AnyRow | null> => {
      const address = whereField(args, "address");
      return this.mailIdentities.find((m) => m.address === address) ?? null;
    },
  };

  staffNotificationEvent = {
    upsert: async (args: Record<string, unknown>): Promise<AnyRow> => {
      const where = (args.where ?? {}) as {
        tenantKey_dedupeKey?: { tenantKey: string; dedupeKey: string };
      };
      const key = where.tenantKey_dedupeKey;
      if (!key) throw new Error("staffNotificationEvent.upsert: compound key missing");
      const existing = this.staffNotificationEvents.find(
        (row) => row.tenantKey === key.tenantKey && row.dedupeKey === key.dedupeKey,
      );
      if (existing) return existing;
      const data = args.create as Record<string, unknown>;
      const row: AnyRow = {
        id: nextId("sne"),
        createdAt: new Date(),
        routingStatus: "PENDING",
        routingAttempts: 0,
        nextRoutingAt: new Date(),
        routedAt: null,
        lastRoutingError: null,
        ...data,
      };
      this.staffNotificationEvents.push(row);
      return row;
    },
    findMany: async (args: Record<string, unknown>): Promise<AnyRow[]> => {
      const where = (args.where ?? {}) as Record<string, unknown>;
      const take = Number(args.take ?? this.staffNotificationEvents.length);
      return this.staffNotificationEvents
        .filter((event) => matchesWhere(event, where))
        .sort((left, right) => {
          const byCreated = (left.createdAt as Date).getTime() - (right.createdAt as Date).getTime();
          return byCreated || String(left.id).localeCompare(String(right.id));
        })
        .slice(0, take)
        .map((event) => ({ id: event.id }));
    },
    findUnique: async (args: Record<string, unknown>): Promise<AnyRow | null> => {
      const where = (args.where ?? {}) as Record<string, unknown>;
      const compound = where.tenantKey_id as { tenantKey: string; id: string } | undefined;
      const id = compound?.id ?? where.id;
      const tenantKey = compound?.tenantKey ?? where.tenantKey;
      return (
        this.staffNotificationEvents.find(
          (event) => event.id === id && (tenantKey === undefined || event.tenantKey === tenantKey),
        ) ?? null
      );
    },
    update: async (args: Record<string, unknown>): Promise<AnyRow> => {
      const where = (args.where ?? {}) as Record<string, unknown>;
      const compound = where.tenantKey_id as { tenantKey: string; id: string } | undefined;
      const event = this.staffNotificationEvents.find(
        (row) => row.id === compound?.id && row.tenantKey === compound.tenantKey,
      );
      if (!event) throw new Error("staffNotificationEvent.update: row not found");
      applyData(event, args.data as Record<string, unknown>);
      return event;
    },
    updateMany: async (args: Record<string, unknown>): Promise<{ count: number }> => {
      const where = (args.where ?? {}) as Record<string, unknown>;
      const matches = this.staffNotificationEvents.filter((event) => matchesWhere(event, where));
      for (const event of matches) applyData(event, args.data as Record<string, unknown>);
      return { count: matches.length };
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
    if (v !== null && typeof v === "object") {
      const operator = v as Record<string, unknown>;
      if ("not" in operator) {
        return !rowEquals(row[k], operator.not) && row[k] !== null && row[k] !== undefined;
      }
      if ("in" in operator) return (operator.in as unknown[]).some((item) => rowEquals(row[k], item));
      if ("lte" in operator) return (row[k] as Date).getTime() <= (operator.lte as Date).getTime();
    }
    return rowEquals(row[k], v);
  });
}

function applyData(row: AnyRow, data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && typeof value === "object" && "increment" in (value as Record<string, unknown>)) {
      row[key] = Number(row[key] ?? 0) + Number((value as { increment: number }).increment);
    } else {
      row[key] = value;
    }
  }
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
