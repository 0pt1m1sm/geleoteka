import { isUniqueViolation } from "@/lib/email/db-port";
import type { IngestResult, IngestStatus } from "@/lib/email/ingest";
import {
  buildSyntheticMessageId,
  type EmailSource,
  type ParsedEmail,
} from "@/lib/email/types";

/**
 * Replay-safe IMAP sync core.
 *
 * This module never imports imapflow and never opens a socket. Everything that
 * touches the network is behind the `ImapPort` interface, and everything that
 * touches the database is behind `MailSyncDb`, so the whole loop — leasing,
 * cursor advancement, UIDVALIDITY handling, dead-lettering — is exercised in
 * tests against in-memory fakes. `lib/email/providers/timeweb-imap.ts` supplies
 * the real port; `scripts/mail-sync-worker.ts` wires it together.
 *
 * The invariants this file exists to hold (see the plan's Task 2 DoD):
 *
 *   1. A crash between fetching a UID and committing it re-reads that UID rather
 *      than skipping it — the cursor only advances past a UID once that UID
 *      reached a durable terminal state, and `ingestEmail` collapses the re-read
 *      into a duplicate.
 *   2. Two worker replicas process each source-UID at most once — a DB lease
 *      serialises them, and the EmailMessage unique keys are the backstop.
 *   3. A UIDVALIDITY change triggers a bounded rescan, not a full re-import:
 *      duplicates collapse on the RFC Message-Id inside `ingestEmail`.
 *   4. A message we can never parse becomes a durable DEAD row (locator kept for
 *      manual replay) and the cursor steps over it, so one poison message cannot
 *      wedge the source forever.
 */

export type MailboxRoleName = "INBOUND" | "OUTBOUND_ARCHIVE";

export interface MailSyncSource {
  /** The mailbox account we authenticate as, e.g. `crm-archive@{ваш домен}`. */
  mailbox: string;
  /** IMAP folder within that account, e.g. `INBOX` (Timeweb uses English names). */
  folder: string;
  role: MailboxRoleName;
}

/** A read-only handle onto one opened mailbox/folder. */
export interface ImapSourceHandle {
  /** UIDVALIDITY of the mailbox as opened — pins the meaning of every UID below. */
  readonly uidValidity: bigint;
  /** Highest UID present, for lag reporting. Null when the mailbox is empty. */
  highestUid(): Promise<bigint | null>;
  /** UIDs strictly greater than `afterUid`, ascending, capped at `limit`. */
  listUids(afterUid: bigint | null, limit: number): Promise<bigint[]>;
  /**
   * Raw RFC822 source for a UID via BODY.PEEK (never sets \Seen). Returns null
   * when the UID has vanished (expunged between listing and fetch).
   */
  fetchRaw(uid: bigint): Promise<{ source: Buffer; internalDate: Date | null } | null>;
  close(): Promise<void>;
}

export interface ImapPort {
  /** Open a mailbox/folder read-only. The caller always closes the handle. */
  open(mailbox: string, folder: string): Promise<ImapSourceHandle>;
}

/** Turns a fetched MIME message into the provider-neutral shape. */
export type MimeMapper = (
  raw: Buffer,
  ctx: { source: EmailSource; role: MailboxRoleName; internalDate: Date | null },
) => Promise<ParsedEmail>;

type DbRow = Record<string, unknown>;
type QueryArgs = Record<string, unknown>;

/**
 * The Prisma surface the sync loop needs, taken as a parameter for the same
 * reason `EmailIngestDb` is: it must run against both the real client and an
 * in-memory fake. Only cursor bookkeeping and the dead-letter write live here;
 * the actual CRM write goes through the injected `ingest` function.
 */
export interface MailSyncDb {
  mailboxSyncCursor: {
    findUnique(args: QueryArgs): Promise<DbRow | null>;
    upsert(args: QueryArgs): Promise<DbRow>;
    update(args: QueryArgs): Promise<DbRow>;
    updateMany(args: QueryArgs): Promise<{ count: number }>;
    findMany(args: QueryArgs): Promise<DbRow[]>;
  };
  emailMessage: {
    findUnique(args: QueryArgs): Promise<DbRow | null>;
    findFirst(args: QueryArgs): Promise<DbRow | null>;
    create(args: QueryArgs): Promise<DbRow>;
    delete(args: QueryArgs): Promise<DbRow>;
    count(args: QueryArgs): Promise<number>;
  };
}

export interface SyncConfig {
  sources: MailSyncSource[];
  /** UIDs fetched per source per pass. Bounds one cycle's work. Default 50. */
  batchSize?: number;
  /** How long a claimed lease is held before it can be stolen. Default 120s. */
  leaseMs?: number;
  /** Parse attempts for one UID before it is dead-lettered. Default 3. */
  maxMapAttempts?: number;
  /** Identifies this worker for the lease — hostname + pid, typically. */
  owner: string;
}

export interface SyncDeps {
  db: MailSyncDb;
  port: ImapPort;
  mapper: MimeMapper;
  /** Normally `ingestEmail`; injected so the loop is testable without a DB. */
  ingest: (parsed: ParsedEmail) => Promise<IngestResult>;
  now?: () => Date;
  /** Injected so retry backoff does not sleep for real in tests. */
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

export interface SourceSyncResult {
  mailbox: string;
  folder: string;
  role: MailboxRoleName;
  /** True when another worker held the lease; nothing was read. */
  skipped: boolean;
  processed: number;
  created: number;
  duplicates: number;
  dead: number;
  vanished: number;
  uidValidityChanged: boolean;
  lastUid: bigint | null;
  highestUid: bigint | null;
  /** highestUid − lastUid, or 0 when unknown. */
  lag: number;
  /** Redacted, single-line error when the source aborted mid-pass. */
  error: string | null;
}

export interface SyncHealth {
  mailbox: string;
  folder: string;
  role: MailboxRoleName;
  uidValidity: bigint | null;
  lastUid: bigint | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
  leaseOwner: string | null;
  leaseUntil: Date | null;
  deadLetters: number;
}

const DEFAULT_BATCH = 50;
const DEFAULT_LEASE_MS = 120_000;
const DEFAULT_MAX_MAP_ATTEMPTS = 3;
/** Retry backoff for a parse failure: 250ms, 500ms, 1s, capped. */
const BACKOFF_BASE_MS = 250;
const BACKOFF_CAP_MS = 5_000;

/** Run one bounded pass over every configured source. */
export async function runSyncOnce(
  config: SyncConfig,
  deps: SyncDeps,
): Promise<SourceSyncResult[]> {
  const results: SourceSyncResult[] = [];
  for (const source of config.sources) {
    results.push(await syncSource(source, config, deps));
  }
  return results;
}

export async function syncSource(
  source: MailSyncSource,
  config: SyncConfig,
  deps: SyncDeps,
): Promise<SourceSyncResult> {
  const now = deps.now ?? (() => new Date());
  const batchSize = config.batchSize ?? DEFAULT_BATCH;
  const leaseMs = config.leaseMs ?? DEFAULT_LEASE_MS;
  const maxMapAttempts = config.maxMapAttempts ?? DEFAULT_MAX_MAP_ATTEMPTS;

  const result: SourceSyncResult = {
    mailbox: source.mailbox,
    folder: source.folder,
    role: source.role,
    skipped: false,
    processed: 0,
    created: 0,
    duplicates: 0,
    dead: 0,
    vanished: 0,
    uidValidityChanged: false,
    lastUid: null,
    highestUid: null,
    lag: 0,
    error: null,
  };

  const leased = await acquireLease(deps.db, source, config.owner, leaseMs, now());
  if (!leased) {
    result.skipped = true;
    return result;
  }

  let handle: ImapSourceHandle | null = null;
  try {
    handle = await deps.port.open(source.mailbox, source.folder);

    const cursor = (await deps.db.mailboxSyncCursor.findUnique({
      where: cursorWhere(source),
    })) as { uidValidity: bigint | null; lastUid: bigint | null } | null;

    let lastUid = cursor?.lastUid ?? null;
    let curValidity = cursor?.uidValidity ?? null;

    // UIDVALIDITY reconciliation. First open records the server's value. A
    // *changed* value means the server renumbered the mailbox: we must not keep
    // reading from the old lastUid (it now points at a different message), and
    // we must not blindly re-import history either. So we rescan from the start
    // under the new validity and lean on the RFC Message-Id dedupe inside
    // ingestEmail to collapse everything we already hold.
    if (curValidity === null) {
      await deps.db.mailboxSyncCursor.update({
        where: cursorWhere(source),
        data: { uidValidity: handle.uidValidity },
      });
      curValidity = handle.uidValidity;
    } else if (curValidity !== handle.uidValidity) {
      result.uidValidityChanged = true;
      lastUid = null;
      await deps.db.mailboxSyncCursor.update({
        where: cursorWhere(source),
        data: { uidValidity: handle.uidValidity, lastUid: null },
      });
      curValidity = handle.uidValidity;
      deps.log?.("uidvalidity changed — rescanning", {
        mailbox: source.mailbox,
        folder: source.folder,
      });
    }

    result.highestUid = await handle.highestUid();

    const uids = await handle.listUids(lastUid, batchSize);
    for (const uid of uids) {
      const uidSource: EmailSource = {
        mailbox: source.mailbox,
        folder: source.folder,
        uidValidity: curValidity,
        uid,
      };
      const outcome = await processUid(
        handle,
        uidSource,
        source.role,
        maxMapAttempts,
        deps,
        now,
      );

      // Durable advance AFTER the UID reached a terminal state. A crash before
      // this line re-reads the UID next pass; ingestEmail dedupes it.
      await advanceCursor(deps.db, source, uid, now());
      lastUid = uid;

      result.processed += 1;
      if (outcome === "created" || outcome === "unresolved") result.created += 1;
      else if (outcome === "duplicate") result.duplicates += 1;
      else if (outcome === "dead") result.dead += 1;
      else if (outcome === "vanished") result.vanished += 1;
    }

    result.lastUid = lastUid;
    result.lag = computeLag(result.highestUid, lastUid);
    await deps.db.mailboxSyncCursor.update({
      where: cursorWhere(source),
      data: { lastSuccessAt: now(), lastError: null },
    });
  } catch (err) {
    // A source-level failure (connection dropped, DB unavailable, ingest threw)
    // aborts THIS source without advancing past the in-flight UID and without
    // dead-lettering — that would DEAD-storm good mail during an outage. The
    // cursor stays put and the next pass resumes from the same UID.
    result.error = redactError(err);
    try {
      await deps.db.mailboxSyncCursor.update({
        where: cursorWhere(source),
        data: { lastError: result.error },
      });
    } catch {
      /* diagnostics only */
    }
    deps.log?.("source aborted", { mailbox: source.mailbox, folder: source.folder });
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {
        /* best effort */
      }
    }
    // Release the lease on the way out. Between passes no lease is held, so a
    // crash simply lets it expire rather than blocking the next worker.
    try {
      await releaseLease(deps.db, source, config.owner);
    } catch {
      /* the lease expires on its own if this fails */
    }
  }

  return result;
}

type UidOutcome = IngestStatus | "dead" | "vanished";

/**
 * Take one UID from fetch to a terminal state.
 *
 * Fetch and ingest errors PROPAGATE — they are treated as source-level failures
 * (see syncSource's catch) because they are almost always transient infra
 * problems that affect every message, not this one. Only a *parse* failure is
 * message-specific and deterministic, so only that path retries a bounded number
 * of times and then dead-letters. Retrying a poison parse never helps, but the
 * bounded retry absorbs a one-off truncation before giving up.
 */
async function processUid(
  handle: ImapSourceHandle,
  source: EmailSource,
  role: MailboxRoleName,
  maxMapAttempts: number,
  deps: SyncDeps,
  now: () => Date,
): Promise<UidOutcome> {
  const sleep = deps.sleep ?? defaultSleep;
  let attempt = 0;

  for (;;) {
    attempt += 1;

    const raw = await handle.fetchRaw(source.uid as bigint); // throws → abort source
    if (raw === null) return "vanished";

    let parsed: ParsedEmail;
    try {
      parsed = await deps.mapper(raw.source, { source, role, internalDate: raw.internalDate });
    } catch (mapErr) {
      if (attempt < maxMapAttempts) {
        await sleep(backoffMs(attempt));
        continue;
      }
      await writeDead(deps.db, source, role, mapErr, now(), maxMapAttempts);
      deps.log?.("dead-lettered poison message", {
        mailbox: source.mailbox,
        folder: source.folder,
        uid: String(source.uid),
      });
      return "dead";
    }

    const res = await deps.ingest(parsed); // throws → abort source
    return res.status;
  }
}

/**
 * Claim (or renew) the source's lease atomically.
 *
 * The cursor row is upserted first so the lease has something to sit on, then a
 * single conditional `updateMany` flips the lease. In Postgres READ COMMITTED
 * two racing workers serialise on the row: the loser re-evaluates its WHERE
 * against the winner's committed lease, no longer matches, and gets count 0.
 * The `leaseOwner = owner` arm lets the same worker re-take its own lease.
 */
export async function acquireLease(
  db: MailSyncDb,
  source: MailSyncSource,
  owner: string,
  leaseMs: number,
  now: Date,
): Promise<boolean> {
  await db.mailboxSyncCursor.upsert({
    where: cursorWhere(source),
    create: { mailbox: source.mailbox, folder: source.folder, role: source.role },
    update: {},
  });

  const res = await db.mailboxSyncCursor.updateMany({
    where: {
      mailbox: source.mailbox,
      folder: source.folder,
      OR: [{ leaseOwner: null }, { leaseUntil: { lt: now } }, { leaseOwner: owner }],
    },
    data: { leaseOwner: owner, leaseUntil: new Date(now.getTime() + leaseMs) },
  });
  return res.count === 1;
}

/** Release only if we still own it, so we never clear a lease we lost. */
export async function releaseLease(
  db: MailSyncDb,
  source: MailSyncSource,
  owner: string,
): Promise<void> {
  await db.mailboxSyncCursor.updateMany({
    where: { mailbox: source.mailbox, folder: source.folder, leaseOwner: owner },
    data: { leaseOwner: null, leaseUntil: null },
  });
}

async function advanceCursor(
  db: MailSyncDb,
  source: MailSyncSource,
  uid: bigint,
  when: Date,
): Promise<void> {
  await db.mailboxSyncCursor.update({
    where: cursorWhere(source),
    data: { lastUid: uid, lastSuccessAt: when },
  });
}

/**
 * Record a message we could not parse as a durable DEAD row. It keeps the IMAP
 * locator so an operator can replay it later, and a synthetic Message-Id derived
 * from the source tuple so a re-read of the same UID recognises the DEAD row
 * instead of writing a second one.
 */
async function writeDead(
  db: MailSyncDb,
  source: EmailSource,
  role: MailboxRoleName,
  err: unknown,
  when: Date,
  attempts: number,
): Promise<void> {
  const rfcMessageId = buildSyntheticMessageId("TIMEWEB_IMAP", source);

  const existing = await db.emailMessage.findFirst({
    where: {
      OR: [
        { rfcMessageId },
        {
          provider: "TIMEWEB_IMAP",
          sourceMailbox: source.mailbox,
          sourceFolder: source.folder,
          uidValidity: source.uidValidity,
          uid: source.uid,
        },
      ],
    },
    select: { id: true },
  });
  if (existing) return;

  try {
    await db.emailMessage.create({ data: deadLetterData(source, role, err, when, attempts, rfcMessageId) });
  } catch (e) {
    // A concurrent dead-letter of the same UID lost the race; the constraint
    // already stored it, which is exactly the outcome we wanted.
    if (!isUniqueViolation(e)) throw e;
  }
}

function deadLetterData(
  source: EmailSource,
  role: MailboxRoleName,
  err: unknown,
  when: Date,
  attempts: number,
  rfcMessageId: string,
): Record<string, unknown> {
  return {
    provider: "TIMEWEB_IMAP",
    // We could not read the From, so direction cannot be decided; default to
    // INBOUND. It is irrelevant until a human replays the message anyway.
    direction: "INBOUND",
    fromEmail: "unknown@invalid",
    fromName: null,
    toEmails: [],
    ccEmails: [],
    bccEmails: [],
    subject: null,
    bodyText: null,
    bodyHtml: null,
    rfcMessageId,
    rfcMessageIdSynthetic: true,
    inReplyTo: null,
    references: [],
    occurredAt: when,
    occurredAtEstimated: true,
    sourceMailbox: source.mailbox,
    sourceFolder: source.folder,
    uidValidity: source.uidValidity,
    uid: source.uid,
    providerLocator: {
      kind: "imap",
      mailbox: source.mailbox,
      folder: source.folder,
      uidValidity: source.uidValidity === null ? null : source.uidValidity.toString(),
      uid: source.uid === null ? null : source.uid.toString(),
    },
    attachments: [],
    ingestStatus: "DEAD",
    ingestAttempts: attempts,
    ingestError: redactError(err),
    // The role is not persisted (the schema has no column for it); replay
    // recovers it from the configured sources via the stored mailbox/folder.
  };
}

/**
 * Re-drive a dead-lettered message through the normal ingest path.
 *
 * Deletes the DEAD placeholder first so `ingestEmail` — which would otherwise
 * see it as a duplicate on the source tuple — is free to create the real row.
 * Idempotent at the CRM level regardless: if the message actually parses now,
 * one CommunicationLog/InboxMessage results; if it still fails, the DEAD row is
 * rewritten. Returns null when the row is not a replayable IMAP dead letter.
 */
export async function replayDeadLetter(
  emailMessageId: string,
  config: SyncConfig,
  deps: SyncDeps,
): Promise<IngestResult | null> {
  const now = deps.now ?? (() => new Date());
  const maxMapAttempts = config.maxMapAttempts ?? DEFAULT_MAX_MAP_ATTEMPTS;

  const row = (await deps.db.emailMessage.findUnique({
    where: { id: emailMessageId },
    select: {
      ingestStatus: true,
      sourceMailbox: true,
      sourceFolder: true,
      uidValidity: true,
      uid: true,
      providerLocator: true,
    },
  })) as
    | {
        ingestStatus: string;
        sourceMailbox: string;
        sourceFolder: string;
        uidValidity: bigint | null;
        uid: bigint | null;
        providerLocator: { kind?: string } | null;
      }
    | null;

  if (!row || row.ingestStatus !== "DEAD" || row.providerLocator?.kind !== "imap") {
    return null;
  }
  if (row.uid === null) return null;

  const source: MailSyncSource = {
    mailbox: row.sourceMailbox,
    folder: row.sourceFolder,
    role: "INBOUND",
  };
  const configuredRole = config.sources.find(
    (s) => s.mailbox === source.mailbox && s.folder === source.folder,
  )?.role;
  const role: MailboxRoleName = configuredRole ?? "INBOUND";

  const handle = await deps.port.open(source.mailbox, source.folder);
  try {
    const raw = await handle.fetchRaw(row.uid);
    if (raw === null) return null;

    const uidSource: EmailSource = {
      mailbox: row.sourceMailbox,
      folder: row.sourceFolder,
      uidValidity: row.uidValidity,
      uid: row.uid,
    };

    let parsed: ParsedEmail;
    try {
      parsed = await deps.mapper(raw.source, { source: uidSource, role, internalDate: raw.internalDate });
    } catch (mapErr) {
      // Still poison — rewrite the DEAD row and report failure.
      await writeDead(deps.db, uidSource, role, mapErr, now(), maxMapAttempts);
      return null;
    }

    // Free the source tuple so ingest can create the real row.
    await deps.db.emailMessage.delete({ where: { id: emailMessageId } });
    return await deps.ingest(parsed);
  } finally {
    try {
      await handle.close();
    } catch {
      /* best effort */
    }
  }
}

/** Snapshot every cursor plus its dead-letter count — the diagnostics feed. */
export async function getSyncHealth(db: MailSyncDb): Promise<SyncHealth[]> {
  const cursors = (await db.mailboxSyncCursor.findMany({})) as Array<{
    mailbox: string;
    folder: string;
    role: MailboxRoleName;
    uidValidity: bigint | null;
    lastUid: bigint | null;
    lastSuccessAt: Date | null;
    lastError: string | null;
    leaseOwner: string | null;
    leaseUntil: Date | null;
  }>;

  const out: SyncHealth[] = [];
  for (const c of cursors) {
    const deadLetters = await db.emailMessage.count({
      where: { sourceMailbox: c.mailbox, sourceFolder: c.folder, ingestStatus: "DEAD" },
    });
    out.push({
      mailbox: c.mailbox,
      folder: c.folder,
      role: c.role,
      uidValidity: c.uidValidity,
      lastUid: c.lastUid,
      lastSuccessAt: c.lastSuccessAt,
      lastError: c.lastError,
      leaseOwner: c.leaseOwner,
      leaseUntil: c.leaseUntil,
      deadLetters,
    });
  }
  return out;
}

function cursorWhere(source: MailSyncSource): Record<string, unknown> {
  return { mailbox_folder: { mailbox: source.mailbox, folder: source.folder } };
}

function computeLag(highestUid: bigint | null, lastUid: bigint | null): number {
  if (highestUid === null) return 0;
  const last = lastUid ?? 0n;
  const diff = highestUid - last;
  return diff > 0n ? Number(diff) : 0;
}

function backoffMs(attempt: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_CAP_MS);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One line, length-capped, no stack — safe for a cursor column or a log. */
function redactError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/\s+/g, " ").trim().slice(0, 500);
}
