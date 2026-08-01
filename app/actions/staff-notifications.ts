"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { markStaffNotificationReceiptsRead } from "@/lib/staff-notifications/feed";
import { loadTelegramRuntimeConfig } from "@/lib/staff-notifications/channels/telegram/config";
import { createTelegramLinkToken } from "@/lib/staff-notifications/channels/telegram/linking";
import { requeueDeadStaffNotificationDelivery } from "@/lib/staff-notifications/operations";
import { TENANT_KEY } from "@/lib/tenant";

export interface CreateTelegramLinkState {
  ok: boolean;
  error: string | null;
  deepLink?: string;
  expiresAt?: string;
}

export async function markStaffNotificationRead(eventId: string): Promise<void> {
  const session = await requirePermission("notifications.view");
  await markStaffNotificationReceiptsRead(db, session.id, [eventId]);
  revalidatePath("/admin/notifications");
}

export async function markAllStaffNotificationsRead(): Promise<void> {
  const session = await requirePermission("notifications.view");
  await markStaffNotificationReceiptsRead(db, session.id, null);
  revalidatePath("/admin/notifications");
}

export async function createPersonalTelegramLink(
  _previous: CreateTelegramLinkState | null,
  _formData: FormData,
): Promise<CreateTelegramLinkState> {
  void _previous;
  void _formData;
  const session = await requirePermission("notifications.view");
  return createLink("PERSONAL", session.id, session.id);
}

export async function createSharedTelegramLink(
  _previous: CreateTelegramLinkState | null,
  _formData: FormData,
): Promise<CreateTelegramLinkState> {
  void _previous;
  void _formData;
  const session = await requirePermission("notifications.manage");
  return createLink("SHARED", null, session.id);
}

export async function revokePersonalTelegramLink(): Promise<void> {
  const session = await requirePermission("notifications.view");
  await revokeTelegramDestinations({ kind: "PERSONAL", userId: session.id }, session);
}

export async function revokeSharedTelegramLink(): Promise<void> {
  const session = await requirePermission("notifications.manage");
  await revokeTelegramDestinations({ kind: "SHARED", userId: null }, session);
}

export async function retryStaffNotificationDelivery(
  deliveryId: string,
): Promise<void> {
  const session = await requirePermission("notifications.manage");
  await db.$transaction(async (tx) => {
    const delivery = (await tx.staffNotificationDelivery.findFirst({
      where: {
        tenantKey: TENANT_KEY,
        id: deliveryId,
        status: "DEAD",
      },
      select: {
        id: true,
        channel: true,
        attempts: true,
        lastErrorCode: true,
      },
    })) as {
      id: string;
      channel: string;
      attempts: number;
      lastErrorCode: string | null;
    } | null;
    if (!delivery) return;

    const requeued = await requeueDeadStaffNotificationDelivery(
      tx,
      delivery.id,
    );
    if (!requeued) return;

    await recordAudit(
      {
        actor: session,
        action: "staff_notification.delivery_retry",
        targetType: "StaffNotificationDelivery",
        targetId: delivery.id,
        targetLabel: "Доставка уведомления",
        metadata: {
          channel: delivery.channel,
          previousAttempts: delivery.attempts,
          previousErrorCode: delivery.lastErrorCode,
        },
      },
      tx,
    );
  });
  revalidatePath("/admin/notifications/operations");
}

async function createLink(
  purpose: "PERSONAL" | "SHARED",
  userId: string | null,
  createdByUserId: string,
): Promise<CreateTelegramLinkState> {
  const config = await loadTelegramRuntimeConfig();
  if (!config.enabled) {
    return {
      ok: false,
      error: "Telegram выключен или настроен некорректно",
    };
  }

  const result = await createTelegramLinkToken(db, {
    purpose,
    userId,
    createdByUserId,
    botUsername: config.botUsername,
  });
  return {
    ok: true,
    error: null,
    deepLink: result.deepLink,
    expiresAt: result.expiresAt.toISOString(),
  };
}

async function revokeTelegramDestinations(
  target: { kind: "PERSONAL" | "SHARED"; userId: string | null },
  actor: Awaited<ReturnType<typeof requirePermission>>,
): Promise<void> {
  const now = new Date();
  await db.$transaction(async (tx) => {
    const rows = (await tx.telegramDestination.findMany({
      where: {
        tenantKey: TENANT_KEY,
        kind: target.kind,
        userId: target.userId,
        isActive: true,
        disabledAt: null,
      },
      select: { id: true },
    })) as Array<{ id: string }>;
    if (rows.length === 0) return;

    await tx.telegramDestination.updateMany({
      where: { tenantKey: TENANT_KEY, id: { in: rows.map((row) => row.id) } },
      data: { isActive: false, disabledAt: now },
    });
    await recordAudit(
      {
        actor,
        action: "telegram.destination_unlink",
        targetType: "TelegramDestination",
        targetId: rows[0].id,
        targetLabel: target.kind === "PERSONAL" ? "Личная привязка" : "Общий fallback",
        metadata: { kind: target.kind, count: rows.length },
      },
      tx,
    );
  });
  revalidatePath("/admin/notifications/telegram");
}
