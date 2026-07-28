import { ensureFollowUpTask } from "@/lib/crm/auto-task";
import { db } from "@/lib/db";
import { isUniqueViolation, type EmailIngestDb } from "@/lib/email/db-port";
import {
  resolveInboundEmail,
  resolveOutboundEmail,
  type FollowUpContext,
  type ResolveKind,
} from "@/lib/email/resolve";
import type { ParsedEmail } from "@/lib/email/types";

export type { EmailIngestDb, EmailIngestTx } from "@/lib/email/db-port";

/**
 * The one door into the CRM for email, whatever carried it.
 *
 * Both the legacy Resend webhook and the Timeweb IMAP worker map their payload
 * onto `ParsedEmail` and call this. Everything that makes replay safe lives
 * here rather than in either adapter, so the two cannot drift:
 *
 *   - **Idempotent** on the RFC Message-Id AND on the source tuple
 *     `(provider, mailbox, folder, uidValidity, uid)`. The first catches the
 *     same message arriving over both transports during cutover; the second
 *     catches the same UID being re-read after a worker restart, even if the
 *     message carries no stable id of its own.
 *   - **Atomic.** The `EmailMessage` and the CRM row it produces are written in
 *     one transaction. Any network work — fetching the body from Resend,
 *     reading a UID over IMAP — has already happened by the time we get here.
 *   - **Best-effort follow-up.** The task is raised only after the message is
 *     durably stored, and only for genuinely new, known, inbound mail.
 */

export type IngestStatus =
  /** Stored and attached to a customer or thread. */
  | "created"
  /** Stored, but nobody could be matched — it is waiting in the triage inbox. */
  | "unresolved"
  /** Already ingested; nothing was written. */
  | "duplicate";

export type DuplicateReason =
  /** Same RFC Message-Id — typically the same mail seen over both transports. */
  | "rfc-message-id"
  /** Same source UID re-read, e.g. after a restart mid-batch. */
  | "source-uid"
  /** Pre-check was clean but the insert lost a race; the constraint decided. */
  | "concurrent-insert";

export interface IngestResult {
  status: IngestStatus;
  /** How the CRM row was matched; null for duplicates, which write nothing. */
  kind: ResolveKind | null;
  reason: DuplicateReason | null;
  /** `EmailMessage.id`, or the id of the row that already held this message. */
  emailMessageId: string | null;
  /** `CommunicationLog.id` or `InboxMessage.id`. */
  id: string | null;
  /** Whether a follow-up task was actually raised — see `ensureFollowUp`. */
  followUpScheduled: boolean;
}

export interface IngestOptions {
  /** Defaults to the Prisma singleton; tests inject an in-memory fake. */
  client?: EmailIngestDb;
  /** Defaults to the real CRM task upsert. */
  ensureFollowUp?: (input: FollowUpContext) => Promise<unknown>;
}

export async function ingestEmail(
  parsed: ParsedEmail,
  options: IngestOptions = {},
): Promise<IngestResult> {
  const client = options.client ?? (db as unknown as EmailIngestDb);
  const ensureFollowUp = options.ensureFollowUp ?? ensureFollowUpTask;

  // A blank id means the mapper failed to derive even a synthetic one. Inventing
  // something here would defeat every dedupe guarantee below, so refuse loudly:
  // the message stays in the mailbox and the worker can retry after a fix.
  if (!parsed.rfcMessageId || parsed.rfcMessageId.trim().length === 0) {
    throw new Error(
      "ingestEmail: parsed.rfcMessageId is empty — the adapter must supply a real or synthetic Message-Id",
    );
  }

  const existing = await findExisting(client, parsed);
  if (existing) {
    return {
      status: "duplicate",
      kind: null,
      reason:
        existing.rfcMessageId === parsed.rfcMessageId ? "rfc-message-id" : "source-uid",
      emailMessageId: existing.id,
      id: null,
      followUpScheduled: false,
    };
  }

  let outcome: { kind: ResolveKind; id: string; emailMessageId: string; followUp: FollowUpContext | null };
  try {
    outcome = await client.$transaction(async (tx) => {
      const email = (await tx.emailMessage.create({
        data: emailMessageData(parsed),
        select: { id: true },
      })) as { id: string };

      // Direction is trusted from the mapper (it decided it from MailIdentity,
      // never from the folder the copy sits in). Our own sent mail resolves by
      // recipient rather than sender; an outbound we cannot pin to exactly one
      // customer is parked for manual linking, because a wrong customer on an
      // outgoing message leaks correspondence and is worse than an unlinked one.
      const resolved =
        parsed.direction === "OUTBOUND"
          ? await resolveOutboundEmail({ parsed, client: tx, emailMessageId: email.id })
          : await resolveInboundEmail({ parsed, client: tx, emailMessageId: email.id });
      return {
        kind: resolved.kind,
        id: resolved.id,
        emailMessageId: email.id,
        followUp: resolved.followUp,
      };
    });
  } catch (err) {
    // The pre-check was clean but a concurrent ingest got there first. The
    // unique constraint is the real arbiter; treat this exactly like the
    // duplicate we would have detected a moment earlier.
    if (isUniqueViolation(err)) {
      return {
        status: "duplicate",
        kind: null,
        reason: "concurrent-insert",
        emailMessageId: null,
        id: null,
        followUpScheduled: false,
      };
    }
    throw err;
  }

  // Outside the transaction, and deliberately so: a failure in the task
  // subsystem must never roll back a message we have already accepted. The
  // mail is the record of truth; the task is a convenience on top of it.
  let followUpScheduled = false;
  if (outcome.followUp) {
    try {
      await ensureFollowUp(outcome.followUp);
      followUpScheduled = true;
    } catch (err) {
      console.error("[EMAIL INGEST] ensureFollowUpTask failed (email kept)", err);
    }
  }

  return {
    status: outcome.kind === "inbox" ? "unresolved" : "created",
    kind: outcome.kind,
    reason: null,
    emailMessageId: outcome.emailMessageId,
    id: outcome.id,
    followUpScheduled,
  };
}

/**
 * Look for a message we already hold, by either dedupe key.
 *
 * The source-tuple clause is included only when there is a real UID. Resend
 * webhooks have none, and a `(provider, mailbox, folder, NULL, NULL)` query
 * would match every previous webhook row — turning the first genuine message
 * into a false duplicate. Postgres treats NULLs in a unique index as distinct,
 * so the constraint itself already behaves correctly; this mirrors it.
 */
async function findExisting(
  client: EmailIngestDb,
  parsed: ParsedEmail,
): Promise<{ id: string; rfcMessageId: string } | null> {
  const or: Array<Record<string, unknown>> = [{ rfcMessageId: parsed.rfcMessageId }];
  if (parsed.source.uid !== null) {
    or.push({
      provider: parsed.provider,
      sourceMailbox: parsed.source.mailbox,
      sourceFolder: parsed.source.folder,
      uidValidity: parsed.source.uidValidity,
      uid: parsed.source.uid,
    });
  }

  return (await client.emailMessage.findFirst({
    where: { OR: or },
    select: { id: true, rfcMessageId: true },
  })) as { id: string; rfcMessageId: string } | null;
}

function emailMessageData(parsed: ParsedEmail): Record<string, unknown> {
  return {
    provider: parsed.provider,
    direction: parsed.direction,
    fromEmail: parsed.from.email,
    fromName: parsed.from.name ?? null,
    toEmails: parsed.to.map((a) => a.email),
    ccEmails: parsed.cc.map((a) => a.email),
    bccEmails: parsed.bcc.map((a) => a.email),
    subject: parsed.subject,
    bodyText: parsed.bodyText,
    bodyHtml: parsed.bodyHtml,
    rfcMessageId: parsed.rfcMessageId,
    rfcMessageIdSynthetic: parsed.rfcMessageIdSynthetic,
    inReplyTo: parsed.inReplyTo,
    references: parsed.references,
    occurredAt: parsed.occurredAt,
    occurredAtEstimated: parsed.occurredAtEstimated,
    sourceMailbox: parsed.source.mailbox,
    sourceFolder: parsed.source.folder,
    uidValidity: parsed.source.uidValidity,
    uid: parsed.source.uid,
    // Prisma rejects an explicit `null` on a nullable Json column (it wants
    // DbNull); omitting the key lets the column default to NULL instead.
    providerLocator: parsed.providerLocator ?? undefined,
    attachments: parsed.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      contentType: a.contentType,
      contentDisposition: a.contentDisposition,
      contentId: a.contentId ?? null,
      size: a.size ?? null,
    })),
    // The row and its CRM counterpart commit together, so a half-ingested
    // message is never observable — PENDING would only ever describe a state
    // that got rolled back.
    ingestStatus: "PROCESSED",
    ingestAttempts: 1,
  };
}
