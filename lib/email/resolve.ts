import type { EmailIngestTx } from "@/lib/email/db-port";
import type { EmailAttachmentMeta, ParsedEmail } from "@/lib/email/types";

export type ResolveKind = "thread" | "customer" | "inbox";

/** What the caller needs to raise a follow-up AFTER the message is committed. */
export interface FollowUpContext {
  customerUserId: string;
  customerName: string;
  dealId: string | null;
  /**
   * The message's own timestamp (Date header / IMAP internal date), NOT the sync
   * time. The follow-up SLA runs from ingestion, but the task body shows this so
   * a manager reading an overdue task after a downtime still sees when the mail
   * actually arrived.
   */
  messageOccurredAt: Date;
}

export interface ResolveResult {
  kind: ResolveKind;
  /** CommunicationLog.id for thread/customer, InboxMessage.id for inbox. */
  id: string;
  /**
   * Non-null only when a NEW inbound message landed on a known customer.
   * Scheduling is the caller's job and happens outside the transaction, so a
   * failure in the task subsystem cannot roll back the email itself. Outbound
   * mail never carries a follow-up.
   */
  followUp: FollowUpContext | null;
}

/** The customer/deal a threaded message inherits from its ancestor. */
interface ThreadOwner {
  customerUserId: string;
  dealId: string | null;
}

/**
 * Attach an inbound email to the CRM, writing exactly one row.
 *
 *   1. Thread match — `In-Reply-To`, then `References` newest-first, against
 *      `CommunicationLog.externalId` and `EmailMessage.rfcMessageId`. Inherits
 *      the matched conversation's customer/deal.
 *   2. Sender match — primary `User.email`, then a secondary `CustomerContact`
 *      EMAIL alias. Attaches to the most-recently-updated open deal.
 *   3. Neither → `InboxMessage(PENDING)` for manual triage.
 *
 * All reads and the write use the caller's client, so the whole thing composes
 * inside the ingest transaction.
 */
export async function resolveInboundEmail(input: {
  parsed: ParsedEmail;
  client: EmailIngestTx;
  emailMessageId?: string | null;
}): Promise<ResolveResult> {
  const { parsed, client } = input;
  const emailMessageId = input.emailMessageId ?? null;
  const bodyText = deriveBodyText(parsed);

  // ── 1. Thread match ────────────────────────────────────────────────────────
  const owner = await findThreadOwner(parsed, client);
  if (owner) {
    const created = (await client.communicationLog.create({
      data: {
        ...commonLogFields(parsed, bodyText, emailMessageId),
        customerUserId: owner.customerUserId,
        dealId: owner.dealId,
      },
      select: { id: true },
    })) as { id: string };

    const customer = (await client.user.findUnique({
      where: { id: owner.customerUserId },
      select: { name: true },
    })) as { name: string } | null;

    return {
      kind: "thread",
      id: created.id,
      followUp: {
        customerUserId: owner.customerUserId,
        customerName: customer?.name ?? "клиент",
        dealId: owner.dealId,
        messageOccurredAt: parsed.occurredAt,
      },
    };
  }

  // ── 2. Sender match ────────────────────────────────────────────────────────
  const customer = await matchCustomerByEmail(parsed.from.email, client);

  if (customer) {
    const dealId = await latestOpenDealId(customer.id, client);

    const created = (await client.communicationLog.create({
      data: {
        ...commonLogFields(parsed, bodyText, emailMessageId),
        customerUserId: customer.id,
        dealId,
      },
      select: { id: true },
    })) as { id: string };

    return {
      kind: "customer",
      id: created.id,
      followUp: {
        customerUserId: customer.id,
        customerName: customer.name,
        dealId,
        messageOccurredAt: parsed.occurredAt,
      },
    };
  }

  // ── 3. Unknown sender ──────────────────────────────────────────────────────
  const inbox = await createUnresolvedInboxMessage({ parsed, client, emailMessageId });
  return { kind: "inbox", id: inbox.id, followUp: null };
}

/**
 * Attach one of OUR OWN sent emails to the CRM, writing exactly one row.
 *
 *   0. Already-recorded — the app itself logged this send (`recordOutboundEmail`
 *      writes a `CommunicationLog` whose `externalId` is the Message-Id). When
 *      the archive copy of that same mail is later ingested, link it to its
 *      canonical `EmailMessage` and stop; never log it twice.
 *   1. Thread match — inherit the conversation's customer/deal, same anchors as
 *      inbound.
 *   2. Recipient match — EXACTLY ONE known customer among To/Cc (primary email
 *      or a secondary alias) → attach to their latest open deal.
 *   3. Zero or several known customers → `InboxMessage(PENDING, OUTBOUND)` for a
 *      human. Guessing here would drop one customer's message onto another
 *      customer's timeline, which is a correspondence leak, so we never do it.
 *
 * Outbound mail never raises a follow-up. The author is the manager behind the
 * From address per `MailIdentity`; a shared box (info@) has no author.
 */
export async function resolveOutboundEmail(input: {
  parsed: ParsedEmail;
  client: EmailIngestTx;
  emailMessageId?: string | null;
}): Promise<ResolveResult> {
  const { parsed, client } = input;
  const emailMessageId = input.emailMessageId ?? null;
  const bodyText = deriveBodyText(parsed);
  const authorUserId = await resolveOutboundAuthor(parsed, client);

  // ── 0. Already recorded by the app ──────────────────────────────────────────
  // externalId is unique; a hit means this exact send is already on a timeline
  // (transactional mail, or a prior link). Link the canonical email and return.
  const alreadyLogged = (await client.communicationLog.findUnique({
    where: { externalId: parsed.rfcMessageId },
    select: { id: true, emailMessageId: true },
  })) as { id: string; emailMessageId: string | null } | null;
  if (alreadyLogged) {
    if (emailMessageId && !alreadyLogged.emailMessageId) {
      await client.communicationLog.update({
        where: { id: alreadyLogged.id },
        data: { emailMessageId },
      });
    }
    return { kind: "thread", id: alreadyLogged.id, followUp: null };
  }

  // ── 1. Thread match ────────────────────────────────────────────────────────
  const owner = await findThreadOwner(parsed, client);
  if (owner) {
    const created = (await client.communicationLog.create({
      data: {
        ...commonLogFields(parsed, bodyText, emailMessageId, authorUserId),
        customerUserId: owner.customerUserId,
        dealId: owner.dealId,
      },
      select: { id: true },
    })) as { id: string };
    return { kind: "thread", id: created.id, followUp: null };
  }

  // ── 2. Recipient match — exactly one known customer ─────────────────────────
  const customerIds = await matchRecipientCustomerIds(parsed, client);
  if (customerIds.length === 1) {
    const customerId = customerIds[0];
    const dealId = await latestOpenDealId(customerId, client);
    const created = (await client.communicationLog.create({
      data: {
        ...commonLogFields(parsed, bodyText, emailMessageId, authorUserId),
        customerUserId: customerId,
        dealId,
      },
      select: { id: true },
    })) as { id: string };
    return { kind: "customer", id: created.id, followUp: null };
  }

  // ── 3. Ambiguous or unknown recipient ───────────────────────────────────────
  const inbox = await createUnresolvedInboxMessage({ parsed, client, emailMessageId });
  return { kind: "inbox", id: inbox.id, followUp: null };
}

/**
 * Resolve a thread candidate to the customer/deal it belongs to.
 *
 * Walks In-Reply-To first, then References newest → oldest. For each id it tries
 * `CommunicationLog.externalId` (the common case — every CRM email row is keyed
 * by its Message-Id), then falls back to `EmailMessage.rfcMessageId`, following
 * that canonical row to its own resolved CommunicationLog. The fallback catches
 * an ancestor stored canonically whose CRM row is keyed on a different id.
 */
async function findThreadOwner(
  parsed: ParsedEmail,
  client: EmailIngestTx,
): Promise<ThreadOwner | null> {
  for (const candidate of threadCandidates(parsed)) {
    const prior = (await client.communicationLog.findUnique({
      where: { externalId: candidate },
      select: { customerUserId: true, dealId: true },
    })) as { customerUserId: string; dealId: string | null } | null;
    // A deleted owner is not a match: keep walking the chain rather than
    // inheriting a customer whose card nobody can open.
    if (prior && (await customerIsLive(prior.customerUserId, client))) {
      return { customerUserId: prior.customerUserId, dealId: prior.dealId };
    }
    if (prior) continue;

    const email = (await client.emailMessage.findFirst({
      where: { rfcMessageId: candidate },
      select: { id: true },
    })) as { id: string } | null;
    if (!email) continue;

    const linked = (await client.communicationLog.findFirst({
      where: { emailMessageId: email.id, customerUserId: { not: undefined } },
      orderBy: { createdAt: "asc" },
      select: { customerUserId: true, dealId: true },
    })) as { customerUserId: string; dealId: string | null } | null;
    if (linked && (await customerIsLive(linked.customerUserId, client))) {
      return { customerUserId: linked.customerUserId, dealId: linked.dealId };
    }
  }
  return null;
}

/**
 * Primary `User.email`, then a secondary `CustomerContact` EMAIL alias.
 *
 * Soft-deleted customers (`deletedAt != null`) are deliberately NOT matched. A
 * deleted customer's card cannot be opened, so attaching mail to them writes a
 * row no UI can reach — the message would exist in the DB and be invisible
 * everywhere. Refusing the match sends it to the triage inbox instead, where a
 * human can re-attach it.
 */
async function matchCustomerByEmail(
  email: string,
  client: EmailIngestTx,
): Promise<{ id: string; name: string } | null> {
  const primary = (await client.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, isCustomer: true, deletedAt: null },
    select: { id: true, name: true },
  })) as { id: string; name: string } | null;
  if (primary) return primary;

  const alias = (await client.customerContact.findFirst({
    where: { type: "EMAIL", value: email },
    select: { user: { select: { id: true, name: true, isCustomer: true, deletedAt: true } } },
  })) as {
    user: { id: string; name: string; isCustomer: boolean; deletedAt: Date | null };
  } | null;
  if (!alias?.user.isCustomer) return null;
  if ((alias.user.deletedAt ?? null) !== null) return null;
  return { id: alias.user.id, name: alias.user.name };
}

/**
 * Guard for thread inheritance: an ancestor row can point at a customer who has
 * since been deleted. Inheriting that owner would smuggle the new message onto
 * an unreachable card, so a deleted (or missing) owner is not a valid target.
 */
async function customerIsLive(customerUserId: string, client: EmailIngestTx): Promise<boolean> {
  const user = (await client.user.findUnique({
    where: { id: customerUserId },
    select: { deletedAt: true },
  })) as { deletedAt: Date | null } | null;
  return user !== null && (user.deletedAt ?? null) === null;
}

/**
 * Distinct known-customer ids among the recipients (To + Cc). A recipient counts
 * when it is a customer's primary email or one of their secondary aliases. Cc is
 * included on purpose: a customer copied on the message is still part of the
 * conversation, and their presence is exactly what should force triage when a
 * second customer is also on the line.
 */
async function matchRecipientCustomerIds(
  parsed: ParsedEmail,
  client: EmailIngestTx,
): Promise<string[]> {
  const seen = new Set<string>();
  const ids = new Set<string>();
  for (const addr of [...parsed.to, ...parsed.cc]) {
    const email = addr.email;
    if (seen.has(email)) continue;
    seen.add(email);
    const customer = await matchCustomerByEmail(email, client);
    if (customer) ids.add(customer.id);
  }
  return [...ids];
}

/** The manager behind an outbound From, per `MailIdentity`; null for shared boxes. */
async function resolveOutboundAuthor(
  parsed: ParsedEmail,
  client: EmailIngestTx,
): Promise<string | null> {
  const identity = (await client.mailIdentity.findUnique({
    where: { address: parsed.from.email },
    select: { userId: true, isActive: true },
  })) as { userId: string | null; isActive: boolean } | null;
  return identity?.userId ?? null;
}

/** Most-recently-updated open deal for a customer, or null. */
async function latestOpenDealId(customerId: string, client: EmailIngestTx): Promise<string | null> {
  const openDeal = (await client.deal.findFirst({
    where: { customerUserId: customerId, stage: { notIn: ["WON", "LOST"] } },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  })) as { id: string } | null;
  return openDeal?.id ?? null;
}

/**
 * Park a message in the triage inbox. Used for unknown inbound senders and for
 * outbound mail we cannot attribute to a single customer, which is why
 * `direction` is carried through rather than hard-coded.
 */
export async function createUnresolvedInboxMessage(input: {
  parsed: ParsedEmail;
  client: EmailIngestTx;
  emailMessageId?: string | null;
}): Promise<{ id: string }> {
  const { parsed, client } = input;
  const recipient = parsed.to[0]?.email ?? parsed.source.mailbox;

  return (await client.inboxMessage.create({
    data: {
      fromEmail: parsed.from.email,
      fromName: parsed.from.name ?? null,
      toEmail: recipient,
      subject: parsed.subject,
      bodyText: parsed.bodyText,
      bodyHtml: parsed.bodyHtml,
      attachments: toLegacyAttachments(parsed.attachments),
      messageId: parsed.rfcMessageId,
      inReplyTo: parsed.inReplyTo,
      references: parsed.references,
      resendEmailId: resendEmailIdOf(parsed),
      receivedAt: parsed.occurredAt,
      direction: parsed.direction,
      emailMessageId: input.emailMessageId ?? null,
      status: "PENDING",
    },
    select: { id: true },
  })) as { id: string };
}

/** In-Reply-To first, then References newest → oldest, de-duplicated. */
function threadCandidates(parsed: ParsedEmail): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (id: string | null): void => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  push(parsed.inReplyTo);
  for (let i = parsed.references.length - 1; i >= 0; i -= 1) push(parsed.references[i]);
  return out;
}

function commonLogFields(
  parsed: ParsedEmail,
  bodyText: string,
  emailMessageId: string | null,
  authorUserId: string | null = null,
): Record<string, unknown> {
  return {
    authorUserId,
    channel: parsed.direction === "OUTBOUND" ? "EMAIL_OUTBOUND" : "EMAIL_INBOUND",
    outcome: "REPLIED",
    externalId: parsed.rfcMessageId,
    subject: parsed.subject,
    body: bodyText,
    resendEmailId: resendEmailIdOf(parsed),
    attachments: toLegacyAttachments(parsed.attachments),
    emailMessageId,
    createdAt: parsed.occurredAt,
  };
}

function resendEmailIdOf(parsed: ParsedEmail): string | null {
  return parsed.providerLocator?.kind === "resend" ? parsed.providerLocator.resendEmailId : null;
}

/**
 * CommunicationLog/InboxMessage keep the snake_case attachment shape the
 * existing timeline and inbox UI already read. The canonical camelCase form
 * lives on `EmailMessage.attachments`; the provider-neutral attachment route
 * will switch the UI over to it.
 */
function toLegacyAttachments(attachments: EmailAttachmentMeta[]): unknown {
  return attachments.map((a) => ({
    id: a.id,
    filename: a.filename,
    content_type: a.contentType,
    content_disposition: a.contentDisposition,
    ...(a.contentId ? { content_id: a.contentId } : {}),
  }));
}

/** CommunicationLog.body is plain text; fall back through html, then subject. */
function deriveBodyText(parsed: ParsedEmail): string {
  if (parsed.bodyText && parsed.bodyText.trim().length > 0) return parsed.bodyText;
  if (parsed.bodyHtml) return stripHtml(parsed.bodyHtml);
  return parsed.subject;
}

/** Minimal HTML stripper for the fallback body when only `html` arrived. */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}
