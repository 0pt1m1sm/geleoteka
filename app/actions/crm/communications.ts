"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseOccurredAt } from "@/lib/crm/occurred-at";
import { bumpLastTouch } from "@/lib/crm/public";

interface CommResult {
  error: string | null;
  id?: string;
}

export async function logCommunication(
  _prev: CommResult | null,
  formData: FormData,
): Promise<CommResult> {
  const session = await requireRole(["ADMIN", "MANAGER"]);

  const customerUserId = ((formData.get("customerUserId") as string | null) ?? "").trim();
  if (!customerUserId) return { error: "Не передан клиент" };

  const channel = ((formData.get("channel") as string | null) ?? "").trim();
  if (!channel) return { error: "Выберите канал" };

  const outcome = ((formData.get("outcome") as string | null) ?? "N_A").trim();
  const body = ((formData.get("body") as string | null) ?? "").trim() || null;
  const dealIdRaw = ((formData.get("dealId") as string | null) ?? "").trim();
  const dealId = dealIdRaw || null;
  const durationRaw = ((formData.get("durationSec") as string | null) ?? "").trim();
  const durationSec = durationRaw ? Number.parseInt(durationRaw, 10) : null;

  // Optional backdating: form sends `occurredAt` as a datetime-local string
  // (YYYY-MM-DDTHH:mm, local time). parseOccurredAt clamps future to now and
  // rejects garbage; empty leaves createdAt unset so Prisma's default fires.
  const parsedOccurredAt = parseOccurredAt(formData.get("occurredAt") as string | null);
  if (!parsedOccurredAt.ok) return { error: parsedOccurredAt.error };
  const createdAt = parsedOccurredAt.value;

  const log = (await db.communicationLog.create({
    data: {
      customerUserId,
      authorUserId: session.id,
      dealId,
      channel: channel as never,
      outcome: outcome as never,
      body,
      durationSec: durationSec && !Number.isNaN(durationSec) ? durationSec : null,
      ...(createdAt ? { createdAt } : {}),
    },
    select: { id: true },
  })) as { id: string };

  await bumpLastTouch(customerUserId);

  revalidatePath(`/admin/customers/${customerUserId}`);
  if (dealId) revalidatePath(`/admin/crm/deals/${dealId}`);
  return { error: null, id: log.id };
}

/**
 * Mark every unread inbound email for `customerUserId` as read by stamping
 * `CommunicationLog.readAt = now()`. Called from Customer 360 and Deal pages
 * during server-side render so opening either page clears the timeline's
 * "unread" visual treatment.
 *
 * Read state is per-message UI styling only — does NOT drive the nav badge
 * (which counts OPEN FOLLOW_UP tasks owned by the current user). This
 * separation prevents one manager's page view from clearing another manager's
 * action queue.
 *
 * `requireRole` is safe in RSC context — it reads from headers/cookies which
 * Next.js exposes during Server Component render. Callers MUST wrap with
 * `.catch(() => {})` so a transient DB failure or unauthenticated render
 * never breaks the page; auth enforcement is still preserved because the
 * action becomes a no-op when `requireRole` throws.
 */
export async function markRepliesRead(customerUserId: string): Promise<void> {
  await requireRole(["ADMIN", "MANAGER"]);

  // Cheap pre-check so we skip the write when there's nothing to flip. Hits
  // @@index([customerUserId, channel, readAt]) added in migration
  // 20260518231504_inbound_reply_task_and_badge.
  const unread = await db.communicationLog.count({
    where: { customerUserId, channel: "EMAIL_INBOUND", readAt: null },
  });
  if (unread === 0) return;

  await db.communicationLog.updateMany({
    where: { customerUserId, channel: "EMAIL_INBOUND", readAt: null },
    data: { readAt: new Date() },
  });
}

/**
 * Edit the `createdAt` (occurred-at) of a previously-logged communication.
 * Used when the manager realises they backdated wrong or logged in real time
 * but the actual call was earlier. Future dates clamped to now.
 */
export async function updateCommunicationDate(
  id: string,
  occurredAtIso: string,
): Promise<CommResult> {
  await requireRole(["ADMIN", "MANAGER"]);

  const parsed = parseOccurredAt(occurredAtIso);
  if (!parsed.ok) return { error: parsed.error };
  if (!parsed.value) return { error: "Укажите дату" };
  const newCreatedAt = parsed.value;

  const existing = (await db.communicationLog.findUnique({
    where: { id },
    select: { customerUserId: true, dealId: true },
  })) as { customerUserId: string; dealId: string | null } | null;
  if (!existing) return { error: "Запись не найдена" };

  await db.communicationLog.update({
    where: { id },
    data: { createdAt: newCreatedAt },
  });

  revalidatePath(`/admin/customers/${existing.customerUserId}`);
  if (existing.dealId) revalidatePath(`/admin/crm/deals/${existing.dealId}`);
  return { error: null, id };
}

export async function deleteCommunication(id: string): Promise<void> {
  await requireRole(["ADMIN", "MANAGER"]);
  const existing = (await db.communicationLog.findUnique({
    where: { id },
    select: { customerUserId: true, dealId: true },
  })) as { customerUserId: string; dealId: string | null } | null;
  if (!existing) return;
  await db.communicationLog.delete({ where: { id } });
  revalidatePath(`/admin/customers/${existing.customerUserId}`);
  if (existing.dealId) revalidatePath(`/admin/crm/deals/${existing.dealId}`);
}
