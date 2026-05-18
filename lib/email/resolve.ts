import { db } from "@/lib/db";
import {
  extractHeader,
  parseFromAddress,
  parseReferences,
  type ResendInboundContent,
  type ResendInboundEnvelope,
} from "@/lib/email/inbound";

type ResolveKind = "thread" | "customer" | "inbox";

export interface ResolveResult {
  kind: ResolveKind;
  id: string;
}

/**
 * Three-step waterfall:
 *   1. `In-Reply-To` header matches an existing `CommunicationLog.externalId`
 *      → attach reply to the same customer/deal.
 *   2. `from` email matches a known customer (case-insensitive)
 *      → attach to their most-recently-updated open deal (or customer-only).
 *   3. Otherwise → create a new `InboxMessage` for manager triage.
 *
 * Writes exactly one row. Returns the kind + new row id.
 */
export async function resolveInboundEmail(input: {
  envelope: ResendInboundEnvelope;
  content: ResendInboundContent;
}): Promise<ResolveResult> {
  const { envelope, content } = input;
  const messageId = envelope.data.message_id;
  const subject = envelope.data.subject;
  const bodyText =
    content.text ??
    (content.html ? stripHtml(content.html) : envelope.data.subject);

  // Step 1: In-Reply-To match.
  const inReplyTo = extractHeader(content.headers, "In-Reply-To");
  if (inReplyTo) {
    const prior = (await db.communicationLog.findUnique({
      where: { externalId: inReplyTo },
      select: { customerUserId: true, dealId: true },
    })) as { customerUserId: string; dealId: string | null } | null;
    if (prior) {
      const created = (await db.communicationLog.create({
        data: {
          customerUserId: prior.customerUserId,
          dealId: prior.dealId,
          authorUserId: null,
          channel: "EMAIL_INBOUND",
          outcome: "REPLIED",
          externalId: messageId,
          subject,
          body: bodyText,
          resendEmailId: envelope.data.email_id,
          attachments: envelope.data.attachments as never,
        },
        select: { id: true },
      })) as { id: string };
      return { kind: "thread", id: created.id };
    }
  }

  // Step 2: Sender email match.
  const { email: senderEmail } = parseFromAddress(envelope.data.from);
  const customer = (await db.user.findFirst({
    where: { email: { equals: senderEmail, mode: "insensitive" }, isCustomer: true },
    select: { id: true },
  })) as { id: string } | null;
  if (customer) {
    const openDeal = (await db.deal.findFirst({
      where: { customerUserId: customer.id, stage: { notIn: ["WON", "LOST"] } },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    })) as { id: string } | null;
    const created = (await db.communicationLog.create({
      data: {
        customerUserId: customer.id,
        dealId: openDeal?.id ?? null,
        authorUserId: null,
        channel: "EMAIL_INBOUND",
        outcome: "REPLIED",
        externalId: messageId,
        subject,
        body: bodyText,
        resendEmailId: envelope.data.email_id,
        attachments: envelope.data.attachments as never,
      },
      select: { id: true },
    })) as { id: string };
    return { kind: "customer", id: created.id };
  }

  // Step 3: Unknown sender → InboxMessage.
  const from = parseFromAddress(envelope.data.from);
  const toEmail =
    envelope.data.to.find((t) => t.toLowerCase().includes("info@geleoteka.ru")) ??
    envelope.data.to[0] ??
    "info@geleoteka.ru";
  const created = (await db.inboxMessage.create({
    data: {
      fromEmail: from.email,
      fromName: from.name ?? null,
      toEmail: parseFromAddress(toEmail).email,
      subject,
      bodyText: content.text,
      bodyHtml: content.html,
      attachments: envelope.data.attachments as never,
      messageId,
      inReplyTo,
      references: parseReferences(extractHeader(content.headers, "References")),
      resendEmailId: envelope.data.email_id,
      status: "PENDING",
    },
    select: { id: true },
  })) as { id: string };
  return { kind: "inbox", id: created.id };
}

/** Minimal HTML stripper for the fallback body when only `html` arrived. */
function stripHtml(html: string): string {
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
