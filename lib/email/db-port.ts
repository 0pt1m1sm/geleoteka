/**
 * Structural view of the Prisma delegates the email pipeline uses.
 *
 * The pipeline takes its client as a parameter instead of importing the `db`
 * singleton, for two reasons: the same code must run against both the base
 * client and an open `$transaction` client, and the ingest contract (dedupe,
 * atomicity, the unique-violation race) is then testable without a database.
 *
 * Results are `Record<string, unknown>` because Prisma's generated client is
 * `@ts-nocheck` in this project and loses inference through the singleton —
 * callers cast explicitly, per `.claude/rules/geleoteka-conventions.md`.
 */

type QueryArgs = Record<string, unknown>;

export type DbRow = Record<string, unknown>;

/** The delegate surface available inside a transaction. */
export interface EmailIngestTx {
  emailMessage: {
    findFirst(args: QueryArgs): Promise<DbRow | null>;
    create(args: QueryArgs): Promise<DbRow>;
  };
  communicationLog: {
    findUnique(args: QueryArgs): Promise<DbRow | null>;
    findFirst(args: QueryArgs): Promise<DbRow | null>;
    create(args: QueryArgs): Promise<DbRow>;
    update(args: QueryArgs): Promise<DbRow>;
  };
  inboxMessage: {
    create(args: QueryArgs): Promise<DbRow>;
  };
  user: {
    findFirst(args: QueryArgs): Promise<DbRow | null>;
    findUnique(args: QueryArgs): Promise<DbRow | null>;
  };
  customerContact: {
    findFirst(args: QueryArgs): Promise<DbRow | null>;
  };
  deal: {
    findFirst(args: QueryArgs): Promise<DbRow | null>;
  };
  /**
   * Registry that decides direction and the outbound author. Holds no
   * credentials; `address` is stored lower-cased and is the unique key.
   */
  mailIdentity: {
    findUnique(args: QueryArgs): Promise<DbRow | null>;
  };
  staffNotificationEvent: {
    upsert(args: QueryArgs): Promise<DbRow>;
  };
}

export interface TransactionOptions {
  maxWait?: number;
  timeout?: number;
}

/** A base client, which can additionally open its own transaction. */
export interface EmailIngestDb extends EmailIngestTx {
  $transaction<T>(
    fn: (tx: EmailIngestTx) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T>;
}

/** Postgres unique-violation guard (Prisma P2002). */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}
