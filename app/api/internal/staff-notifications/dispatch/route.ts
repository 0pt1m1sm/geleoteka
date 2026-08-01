import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { constantTimeSecretEqual } from "@/lib/security/constant-time";
import {
  dispatchLeasedStaffNotification,
  leaseStaffNotificationDeliveries,
  type StaffNotificationDispatcherDb,
} from "@/lib/staff-notifications/dispatcher";
import {
  loadStaffNotificationDispatchSecret,
  loadTelegramRuntimeConfig,
} from "@/lib/staff-notifications/channels/telegram/config";
import {
  projectPendingStaffNotificationEvents,
  type StaffNotificationProjectorDb,
} from "@/lib/staff-notifications/projectors/inbound-customer-message";
import {
  cancelActiveStaffNotificationDeliveries,
  cancelStaffNotificationDeliveriesBefore,
  type StaffNotificationOperationsDb,
} from "@/lib/staff-notifications/operations";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const secret = await loadStaffNotificationDispatchSecret();
  if (!secret) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const presented = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!presented || !constantTimeSecretEqual(presented, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const client = db as unknown as StaffNotificationDispatcherDb;
  try {
    // Routing is channel-neutral and creates the per-user feed receipts even
    // when Telegram itself is disabled. The durable event stays the source of
    // truth; this cron pass is the recovery path for producer-side accelerators.
    const projected = await projectPendingStaffNotificationEvents(
      db as unknown as StaffNotificationProjectorDb,
      25,
    );
    const telegram = await loadTelegramRuntimeConfig();
    const operations = db as unknown as StaffNotificationOperationsDb;
    if (!telegram.enabled && telegram.reason === "invalid-config") {
      return NextResponse.json(
        { error: "telegram configuration invalid", projected },
        { status: 503 },
      );
    }
    if (!telegram.enabled || telegram.enabledEventTypes.size === 0) {
      const cancelled = await cancelActiveStaffNotificationDeliveries(operations);
      return NextResponse.json({
        skipped: true,
        reason: telegram.enabled ? "no-event-types" : "disabled",
        projected,
        cancelled,
      });
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
    return NextResponse.json({
      ok: true,
      projected,
      historicalCancelled,
      leased: deliveries.length,
      ...counts,
    });
  } catch {
    return NextResponse.json({ error: "dispatch failed" }, { status: 500 });
  }
}
