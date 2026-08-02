import "server-only";

import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import {
  dispatchLeasedStaffNotification,
  leaseStaffNotificationDeliveries,
  type StaffNotificationDispatcherDb,
} from "@/lib/staff-notifications/dispatcher";
import { loadTelegramRuntimeConfig } from "@/lib/staff-notifications/channels/telegram/config";
import {
  projectPendingStaffNotificationEvents,
  type StaffNotificationProjectorDb,
} from "@/lib/staff-notifications/projectors/inbound-customer-message";
import {
  cancelActiveStaffNotificationDeliveries,
  cancelStaffNotificationDeliveriesBefore,
  type StaffNotificationOperationsDb,
} from "@/lib/staff-notifications/operations";

export type StaffNotificationDispatchTickResult =
  | { status: "invalid-config"; projected: unknown }
  | {
      status: "skipped";
      reason: "disabled" | "no-event-types";
      projected: unknown;
      cancelled: unknown;
    }
  | {
      status: "ok";
      projected: unknown;
      historicalCancelled: unknown;
      leased: number;
      sent: number;
      retry: number;
      dead: number;
      leaseLost: number;
    };

/**
 * Один dispatch-тик: проекция pending-событий в deliveries и отправка
 * одного ограниченного батча. Единственная бизнес-логика конвейера доставки;
 * дергается из двух мест — cron-роута (внешняя страховка, с Bearer-auth в
 * самом роуте) и фонового воркера (основная каденция ~20с, внутрипроцессно).
 */
export async function runStaffNotificationDispatchTick(): Promise<StaffNotificationDispatchTickResult> {
  const client = db as unknown as StaffNotificationDispatcherDb;
  // Routing is channel-neutral and creates the per-user feed receipts even
  // when Telegram itself is disabled. The durable event stays the source of
  // truth; every tick is a recovery path for producer-side accelerators.
  const projected = await projectPendingStaffNotificationEvents(
    db as unknown as StaffNotificationProjectorDb,
    25,
  );
  const telegram = await loadTelegramRuntimeConfig();
  const operations = db as unknown as StaffNotificationOperationsDb;
  if (!telegram.enabled && telegram.reason === "invalid-config") {
    return { status: "invalid-config", projected };
  }
  if (!telegram.enabled || telegram.enabledEventTypes.size === 0) {
    const cancelled = await cancelActiveStaffNotificationDeliveries(operations);
    return {
      status: "skipped",
      reason: telegram.enabled ? "no-event-types" : "disabled",
      projected,
      cancelled,
    };
  }

  const historicalCancelled = await cancelStaffNotificationDeliveriesBefore(
    operations,
    telegram.enabledAt,
  );

  // leaseStaffNotificationDeliveries commits its short transaction before it
  // returns; every adapter HTTP call below therefore runs outside DB locks.
  const deliveries = await leaseStaffNotificationDeliveries(client, {
    workerId: `telegram-dispatch:${randomUUID()}`,
    limit: 25,
    leaseMs: 30_000,
  });
  const counts = { sent: 0, retry: 0, dead: 0, leaseLost: 0 };
  for (const delivery of deliveries) {
    const outcome = await dispatchLeasedStaffNotification(client, delivery);
    if (outcome === "lease-lost") counts.leaseLost += 1;
    else counts[outcome] += 1;
  }
  return {
    status: "ok",
    projected,
    historicalCancelled,
    leased: deliveries.length,
    ...counts,
  };
}
