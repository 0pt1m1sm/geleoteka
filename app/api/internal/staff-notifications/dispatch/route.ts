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

  const telegram = await loadTelegramRuntimeConfig();
  // Story 4 has exactly one producer. Do not lease its rows merely because a
  // future event toggle was enabled; a disabled inbound switch must pause the
  // queue without consuming attempts.
  if (
    !telegram.enabled ||
    !telegram.enabledEventTypes.has("INBOUND_CUSTOMER_MESSAGE")
  ) {
    return NextResponse.json({ skipped: true, reason: "disabled" });
  }

  const client = db as unknown as StaffNotificationDispatcherDb;
  try {
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
    return NextResponse.json({ ok: true, leased: deliveries.length, ...counts });
  } catch {
    return NextResponse.json({ error: "dispatch failed" }, { status: 500 });
  }
}
