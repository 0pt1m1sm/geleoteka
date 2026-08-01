"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import {
  generateOutboundMessageId,
  recordOutboundEmail,
  markOutboundEmailFailed,
  markOutboundEmailSent,
  isPlausibleEmail,
} from "@/lib/email";
import { sendEmail } from "@/lib/email/send";
import { completeFollowUpAfterReply } from "@/lib/crm/follow-up-reply";
import { publishInboundCustomerMessage } from "@/lib/staff-notifications/inbound-customer-message";
import {
  projectInboundCustomerMessageEvent,
  type InboundCustomerMessageProjectorDb,
} from "@/lib/staff-notifications/projectors/inbound-customer-message";

interface InboxActionResult {
  error: string | null;
  communicationLogId?: string;
}

/**
 * Move an InboxMessage onto a customer's timeline. Race-safe:
 *   - the CommunicationLog create uses the InboxMessage.messageId as
 *     externalId, so a second linker hits P2002 (unique violation).
 *   - the InboxMessage update uses `where: { id, status: 'PENDING' }` so a
 *     concurrent status flip surfaces as count=0.
 * Either signal returns the same human-readable error.
 */
export async function linkInboxMessageToCustomer(
  inboxMessageId: string,
  customerUserId: string,
  dealId: string | null,
): Promise<InboxActionResult> {
  const session = await requireRole(["ADMIN", "MANAGER"]);

  // When the manager didn't explicitly pick a deal, attach to the customer's
  // most-recently-updated open deal — same heuristic the inbound resolution
  // pipeline applies for from-email matches. Without this, all inbox-linked
  // emails would land on the customer page only, never on the deal timeline.
  let resolvedDealId = dealId;
  if (!resolvedDealId) {
    const openDeal = (await db.deal.findFirst({
      where: { customerUserId, stage: { notIn: ["WON", "LOST"] } },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    })) as { id: string } | null;
    resolvedDealId = openDeal?.id ?? null;
  }

  const customer = (await db.user.findUnique({
    where: { id: customerUserId },
    select: { email: true, name: true },
  })) as { email: string; name: string } | null;
  if (!customer) return { error: "Клиент не найден" };

  const msg = (await db.inboxMessage.findUnique({
    where: { id: inboxMessageId },
    select: {
      messageId: true,
      subject: true,
      bodyText: true,
      bodyHtml: true,
      attachments: true,
      resendEmailId: true,
      status: true,
      fromEmail: true,
      direction: true,
      emailMessageId: true,
      receivedAt: true,
    },
  })) as
    | {
        messageId: string;
        subject: string;
        bodyText: string | null;
        bodyHtml: string | null;
        attachments: unknown;
        resendEmailId: string | null;
        status: string;
        fromEmail: string;
        direction: string;
        emailMessageId: string | null;
        receivedAt: Date;
      }
    | null;
  if (!msg) return { error: "Сообщение не найдено" };
  if (msg.status !== "PENDING") {
    return { error: "Уже привязано другим менеджером — обновите страницу" };
  }

  // Direction decides the timeline channel. For an OUTBOUND message the sender
  // is us, so the alias heuristic below (which registers the FROM address as the
  // customer's secondary email) is only meaningful for inbound.
  const isOutbound = msg.direction === "OUTBOUND";
  const channel = isOutbound ? "EMAIL_OUTBOUND" : "EMAIL_INBOUND";

  // Decide whether to register the sender address as a secondary contact so
  // future inbound from it auto-matches this customer. Skip for outbound (the
  // sender is us), and skip if it's already the customer's primary email or
  // already an alias (on anyone).
  const senderEmail = msg.fromEmail.trim().toLowerCase();
  let shouldAddAlias = false;
  if (!isOutbound && senderEmail) {
    const isPrimary = customer.email.toLowerCase() === senderEmail;
    const existingAlias = isPrimary
      ? true
      : (await db.customerContact.findUnique({
          where: { type_value: { type: "EMAIL", value: senderEmail } },
          select: { id: true },
        })) !== null;
    shouldAddAlias = !isPrimary && !existingAlias;
  }

  let result: { logId: string; eventId: string | null };
  try {
    result = await db.$transaction(async (tx) => {
      const log = (await tx.communicationLog.create({
        data: {
          customerUserId,
          dealId: resolvedDealId,
          authorUserId: null,
          channel: channel as never,
          outcome: "REPLIED",
          externalId: msg.messageId,
          subject: msg.subject,
          body: msg.bodyText ?? "",
          resendEmailId: msg.resendEmailId,
          // Preserve the canonical link so the timeline row and its provider-
          // neutral EmailMessage stay joined after a manual triage.
          emailMessageId: msg.emailMessageId,
          attachments: msg.attachments as never,
          createdAt: msg.receivedAt,
        },
        select: { id: true },
      })) as { id: string };

      const flip = (await tx.inboxMessage.updateMany({
        where: { id: inboxMessageId, status: "PENDING" },
        data: {
          status: "ASSIGNED",
          assignedToUserId: session.id,
          linkedCommunicationLogId: log.id,
        },
      })) as { count: number };

      if (flip.count === 0) {
        // Optimistic concurrency lost. Roll the transaction back.
        throw new Error("RACE");
      }

      // Register sender as a secondary email so future inbound auto-matches.
      if (shouldAddAlias) {
        await tx.customerContact.create({
          data: { userId: customerUserId, type: "EMAIL", value: senderEmail },
        });
      }
      const event = !isOutbound
        ? await publishInboundCustomerMessage(tx, {
            communicationLogId: log.id,
            customerUserId,
            customerName: customer.name,
            dealId: resolvedDealId,
            channel: "EMAIL_INBOUND",
            occurredAt: msg.receivedAt,
          })
        : null;
      return { logId: log.id, eventId: event?.id ?? null };
    });
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "P2002" || (err instanceof Error && err.message === "RACE")) {
      return { error: "Уже привязано другим менеджером — обновите страницу" };
    }
    console.error("[INBOX] linkInboxMessageToCustomer", err);
    return { error: "Не удалось привязать. Попробуйте ещё раз." };
  }

  // The event is already committed. If projection fails, let the action fail
  // visibly; the event remains PENDING and a later ingest pass retries it.
  if (result.eventId) {
    await projectInboundCustomerMessageEvent(
      db as unknown as InboundCustomerMessageProjectorDb,
      result.eventId,
    );
  }
  revalidatePath("/admin/crm/inbox");
  revalidatePath(`/admin/customers/${customerUserId}`);
  if (resolvedDealId) revalidatePath(`/admin/crm/deals/${resolvedDealId}`);
  return { error: null, communicationLogId: result.logId };
}

export async function markInboxMessageSpam(
  inboxMessageId: string,
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);
  try {
    await db.inboxMessage.update({
      where: { id: inboxMessageId },
      data: { status: "SPAM" },
    });
  } catch (err) {
    console.error("[INBOX] markInboxMessageSpam", err);
    return { error: "Не удалось обновить статус" };
  }
  revalidatePath("/admin/crm/inbox");
  revalidatePath(`/admin/crm/inbox/${inboxMessageId}`);
  return { error: null };
}

export async function archiveInboxMessage(
  inboxMessageId: string,
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);
  try {
    await db.inboxMessage.update({
      where: { id: inboxMessageId },
      data: { status: "ARCHIVED" },
    });
  } catch (err) {
    console.error("[INBOX] archiveInboxMessage", err);
    return { error: "Не удалось обновить статус" };
  }
  revalidatePath("/admin/crm/inbox");
  revalidatePath(`/admin/crm/inbox/${inboxMessageId}`);
  return { error: null };
}

interface SendEmailReplyInput {
  customerUserId: string;
  dealId: string | null;
  body: string;
}

/**
 * Send a manager-authored email reply that threads onto the most recent
 * EMAIL_INBOUND CommunicationLog row for this customer + (optional) deal.
 * Re-queries the parent at submit time so a stale form state can't
 * thread to an older message than what's currently in the timeline.
 */
export async function sendEmailReply(
  _prev: { error: string | null; communicationLogId?: string } | null,
  formData: FormData,
): Promise<{ error: string | null; communicationLogId?: string }> {
  const session = await requireRole(["ADMIN", "MANAGER"]);

  const input: SendEmailReplyInput = {
    customerUserId: ((formData.get("customerUserId") as string | null) ?? "").trim(),
    dealId: ((formData.get("dealId") as string | null) ?? "").trim() || null,
    body: ((formData.get("body") as string | null) ?? "").trim(),
  };
  if (!input.customerUserId) return { error: "Не передан клиент" };
  if (!input.body) return { error: "Пустое тело письма" };

  const customer = (await db.user.findUnique({
    where: { id: input.customerUserId },
    select: { email: true, name: true },
  })) as { email: string; name: string } | null;
  if (!customer) return { error: "Клиент не найден" };
  if (!isPlausibleEmail(customer.email)) {
    return { error: "У клиента нет валидного email" };
  }

  // Find the parent inbound row to thread onto. Re-queried at submit time.
  const parent = (await db.communicationLog.findFirst({
    where: {
      customerUserId: input.customerUserId,
      ...(input.dealId ? { dealId: input.dealId } : {}),
      channel: "EMAIL_INBOUND",
      externalId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, externalId: true, subject: true },
  })) as { id: string; externalId: string | null; subject: string | null } | null;

  const messageId = generateOutboundMessageId();
  const priorSubject = parent?.subject?.replace(/^\s*Re:\s*/i, "") ?? "Сообщение от Geleoteka";
  const subject = `Re: ${priorSubject}`;
  const signed = `${input.body}\n\n— ${session.name}, Geleoteka`;
  const html = signed
    .split("\n\n")
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");

  await recordOutboundEmail({
    customerUserId: input.customerUserId,
    dealId: input.dealId,
    authorUserId: session.id,
    subject,
    body: signed,
    messageId,
  });

  const result = await sendEmail({
    to: customer.email,
    subject,
    html,
    text: signed,
    messageId,
    inReplyTo: parent?.externalId ?? undefined,
    references: parent?.externalId ? [parent.externalId] : undefined,
  });
  if (!result.success) {
    await markOutboundEmailFailed(messageId, result.error);
    return { error: `Не удалось отправить: ${result.error}` };
  }
  await markOutboundEmailSent(messageId);

  if (parent) {
    await completeFollowUpAfterReply(db, {
      customerUserId: input.customerUserId,
      inboundCommunicationLogId: parent.id,
    });
  }

  revalidatePath(`/admin/customers/${input.customerUserId}`);
  if (input.dealId) revalidatePath(`/admin/crm/deals/${input.dealId}`);
  return { error: null };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * В корзину и обратно.
 *
 * Ровно то же, что архив, но по смыслу: архив — «разобрано и сохранено»,
 * корзина — «это мусор». Строки не удаляются: ящик остаётся перепиской
 * сервиса, а вернуть ошибочно убранное письмо должно быть можно.
 */
export async function deleteInboxMessage(
  inboxMessageId: string,
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);
  try {
    await db.inboxMessage.update({
      where: { id: inboxMessageId },
      data: { status: "DELETED" },
    });
  } catch (err) {
    console.error("[INBOX] deleteInboxMessage", err);
    return { error: "Не удалось обновить статус" };
  }
  revalidatePath("/admin/crm/inbox");
  revalidatePath(`/admin/crm/inbox/${inboxMessageId}`);
  return { error: null };
}

/** Вернуть письмо в очередь разбора. */
export async function restoreInboxMessage(
  inboxMessageId: string,
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);
  try {
    await db.inboxMessage.update({
      where: { id: inboxMessageId },
      data: { status: "PENDING" },
    });
  } catch (err) {
    console.error("[INBOX] restoreInboxMessage", err);
    return { error: "Не удалось обновить статус" };
  }
  revalidatePath("/admin/crm/inbox");
  revalidatePath(`/admin/crm/inbox/${inboxMessageId}`);
  return { error: null };
}
