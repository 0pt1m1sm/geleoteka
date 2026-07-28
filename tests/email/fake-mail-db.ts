/**
 * In-memory `MailSyncDb` for the sync tests, layered on top of `FakeEmailDb` so
 * the ingest path and the sync path share ONE `emailMessages` store. That
 * sharing is the point: a dead-letter row and an ingested row compete for the
 * same unique keys, which is what proves replay safety end to end.
 *
 * Models the cursor's `@@unique([mailbox, folder])` and the atomic lease claim
 * (a conditional `updateMany` that either flips the lease or reports 0 rows).
 */
import type { MailSyncDb } from "@/lib/email/sync";
import { FakeEmailDb } from "./fake-db";

interface CursorRow {
  id: string;
  mailbox: string;
  folder: string;
  role: string;
  uidValidity: bigint | null;
  lastUid: bigint | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
  leaseOwner: string | null;
  leaseUntil: Date | null;
  // Satisfies MailSyncDb's `Record<string, unknown>` return shape.
  [key: string]: unknown;
}

type EmailMessageDelegate = FakeEmailDb["emailMessage"] & {
  findUnique(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  delete(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  count(args: Record<string, unknown>): Promise<number>;
};

let cursorSeq = 0;

export class FakeMailDb extends FakeEmailDb implements MailSyncDb {
  cursors: CursorRow[] = [];

  // Retype (not re-initialize) the inherited delegate: the constructor augments
  // the parent's object at runtime with the extra methods the sync port needs.
  declare emailMessage: EmailMessageDelegate;

  /**
   * Fires once, immediately before the cursor is advanced past a UID (the
   * `lastUid` write), then clears. Lets a test simulate a crash in exactly the
   * window between ingest committing and the cursor moving.
   */
  failCursorAdvanceOnce: (() => void) | null = null;

  constructor() {
    super();
    // Augment the parent's emailMessage delegate with the extra methods the
    // sync port needs, keeping the parent's shared `emailMessages` store.
    Object.assign(this.emailMessage, {
      findUnique: async (args: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
        const id = (args.where as { id?: string })?.id;
        return this.emailMessages.find((r) => r.id === id) ?? null;
      },
      delete: async (args: Record<string, unknown>): Promise<Record<string, unknown>> => {
        const id = (args.where as { id?: string })?.id;
        const idx = this.emailMessages.findIndex((r) => r.id === id);
        if (idx === -1) throw new Error("record not found");
        const [removed] = this.emailMessages.splice(idx, 1);
        return removed;
      },
      count: async (args: Record<string, unknown>): Promise<number> => {
        const where = (args.where ?? {}) as Record<string, unknown>;
        return this.emailMessages.filter((r) =>
          Object.entries(where).every(([k, v]) => r[k] === v),
        ).length;
      },
    });
  }

  private find(mailbox: string, folder: string): CursorRow | null {
    return this.cursors.find((c) => c.mailbox === mailbox && c.folder === folder) ?? null;
  }

  mailboxSyncCursor = {
    findUnique: async (args: Record<string, unknown>): Promise<CursorRow | null> => {
      const { mailbox, folder } = compoundKey(args);
      return this.find(mailbox, folder);
    },

    upsert: async (args: Record<string, unknown>): Promise<CursorRow> => {
      const { mailbox, folder } = compoundKey(args);
      const existing = this.find(mailbox, folder);
      if (existing) {
        Object.assign(existing, (args.update as Record<string, unknown>) ?? {});
        return existing;
      }
      const create = (args.create ?? {}) as Record<string, unknown>;
      cursorSeq += 1;
      const row: CursorRow = {
        id: `cur_${cursorSeq}`,
        mailbox,
        folder,
        role: (create.role as string) ?? "INBOUND",
        uidValidity: (create.uidValidity as bigint | null) ?? null,
        lastUid: (create.lastUid as bigint | null) ?? null,
        lastSuccessAt: (create.lastSuccessAt as Date | null) ?? null,
        lastError: (create.lastError as string | null) ?? null,
        leaseOwner: (create.leaseOwner as string | null) ?? null,
        leaseUntil: (create.leaseUntil as Date | null) ?? null,
      };
      this.cursors.push(row);
      return row;
    },

    update: async (args: Record<string, unknown>): Promise<CursorRow> => {
      const { mailbox, folder } = compoundKey(args);
      const row = this.find(mailbox, folder);
      if (!row) throw new Error("cursor not found");
      const data = (args.data ?? {}) as Record<string, unknown>;
      // The advance write is the one that sets a concrete lastUid; fire the
      // crash fault only there so cursor bootstrapping is not disrupted.
      if (this.failCursorAdvanceOnce && "lastUid" in data && data.lastUid !== null) {
        const fault = this.failCursorAdvanceOnce;
        this.failCursorAdvanceOnce = null;
        fault();
      }
      Object.assign(row, data);
      return row;
    },

    updateMany: async (args: Record<string, unknown>): Promise<{ count: number }> => {
      const where = (args.where ?? {}) as Record<string, unknown>;
      const row = this.find(where.mailbox as string, where.folder as string);
      if (!row) return { count: 0 };
      if (!matchesLease(row, where)) return { count: 0 };
      Object.assign(row, (args.data as Record<string, unknown>) ?? {});
      return { count: 1 };
    },

    findMany: async (): Promise<CursorRow[]> => [...this.cursors],
  };
}

function compoundKey(args: Record<string, unknown>): { mailbox: string; folder: string } {
  const where = (args.where ?? {}) as Record<string, unknown>;
  const key = (where.mailbox_folder ?? {}) as { mailbox: string; folder: string };
  return { mailbox: key.mailbox, folder: key.folder };
}

/**
 * Evaluate the lease WHERE clause the same way Postgres would: mailbox/folder
 * match plus, when present, at least one OR arm satisfied; plus, for release, a
 * bare `leaseOwner` equality.
 */
function matchesLease(row: CursorRow, where: Record<string, unknown>): boolean {
  if ("leaseOwner" in where && !("OR" in where)) {
    return row.leaseOwner === where.leaseOwner;
  }
  const or = where.OR as Array<Record<string, unknown>> | undefined;
  if (!or) return true;
  return or.some((clause) => {
    if ("leaseOwner" in clause) return row.leaseOwner === clause.leaseOwner;
    if ("leaseUntil" in clause) {
      const cmp = clause.leaseUntil as { lt?: Date };
      return row.leaseUntil !== null && cmp.lt !== undefined && row.leaseUntil < cmp.lt;
    }
    return false;
  });
}
