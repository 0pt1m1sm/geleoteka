"use server";

import { revalidatePath } from "next/cache";

import { requirePermission, rolePermissions } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { markStaffNotificationReceiptsRead } from "@/lib/staff-notifications/feed";
import { loadTelegramRuntimeConfig } from "@/lib/staff-notifications/channels/telegram/config";
import { createTelegramLinkToken } from "@/lib/staff-notifications/channels/telegram/linking";
import { requeueDeadStaffNotificationDelivery } from "@/lib/staff-notifications/operations";
import { staffNotificationTypesForPermissions } from "@/lib/staff-notifications/preferences";
import {
  isStaffNotificationType,
  isTelegramDeliveryScope,
  type TelegramDeliveryScope,
} from "@/lib/staff-notifications/types";
import { TENANT_KEY } from "@/lib/tenant";

export interface CreateTelegramLinkState {
  ok: boolean;
  error: string | null;
  deepLink?: string;
  manualCommand?: string;
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

/**
 * Saves only explicit opt-outs for categories currently allowed by the
 * employee's role. Checked boxes delete opt-outs; unchecked boxes create them.
 * There is no persisted "grant" state, so this action cannot widen rights.
 */
export async function updateOwnStaffNotificationOptOuts(
  formData: FormData,
): Promise<void> {
  const session = await requirePermission("notifications.view");
  const permissions =
    session.permissionRole === "ADMIN"
      ? new Set<string>(PERMISSIONS)
      : await rolePermissions(session.permissionRole);
  const availableTypes = staffNotificationTypesForPermissions(permissions);
  const submittedEnabled = new Set(
    formData.getAll("enabledEventType").filter(isStaffNotificationType),
  );
  const disabledTypes = availableTypes.filter(
    (type) => !submittedEnabled.has(type),
  );

  await db.$transaction(async (tx) => {
    if (availableTypes.length > 0) {
      await tx.staffNotificationOptOut.deleteMany({
        where: {
          tenantKey: TENANT_KEY,
          userId: session.id,
          eventType: { in: availableTypes },
        },
      });
    }
    if (disabledTypes.length > 0) {
      await tx.staffNotificationOptOut.createMany({
        data: disabledTypes.map((eventType) => ({
          tenantKey: TENANT_KEY,
          userId: session.id,
          eventType,
        })),
        skipDuplicates: true,
      });
    }
  });
  revalidatePath("/profile");
}

export async function revokeSharedTelegramLink(): Promise<void> {
  const session = await requirePermission("notifications.manage");
  await revokeTelegramDestinations({ kind: "SHARED", userId: null }, session);
}

export async function setSharedTelegramDeliveryScope(
  destinationId: string,
  formData: FormData,
): Promise<void> {
  const session = await requirePermission("notifications.manage");
  const rawScope = formData.get("deliveryScope");
  if (!destinationId.trim() || !isTelegramDeliveryScope(rawScope)) {
    throw new Error("Некорректный объём уведомлений");
  }

  await db.$transaction(async (tx) => {
    const destination = (await tx.telegramDestination.findFirst({
      where: {
        tenantKey: TENANT_KEY,
        id: destinationId,
        kind: "SHARED",
        userId: null,
        isActive: true,
        disabledAt: null,
      },
      select: { id: true, deliveryScope: true },
    })) as { id: string; deliveryScope: string } | null;
    if (!destination || destination.deliveryScope === rawScope) return;

    const updated = await tx.telegramDestination.updateMany({
      where: {
        tenantKey: TENANT_KEY,
        id: destination.id,
        kind: "SHARED",
        isActive: true,
        disabledAt: null,
      },
      data: { deliveryScope: rawScope satisfies TelegramDeliveryScope },
    });
    if (updated.count !== 1) return;

    await recordAudit(
      {
        actor: session,
        action: "telegram.destination_scope_change",
        targetType: "TelegramDestination",
        targetId: destination.id,
        targetLabel: "Общий получатель",
        metadata: {
          previousScope: destination.deliveryScope,
          deliveryScope: rawScope,
        },
      },
      tx,
    );
  });
  revalidatePath("/admin/notifications/telegram");
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
    manualCommand: result.manualCommand,
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
        targetLabel: target.kind === "PERSONAL" ? "Личная привязка" : "Общий получатель",
        metadata: { kind: target.kind, count: rows.length },
      },
      tx,
    );
  });
  revalidatePath("/admin/notifications/telegram");
  if (target.kind === "PERSONAL") revalidatePath("/profile");
}
