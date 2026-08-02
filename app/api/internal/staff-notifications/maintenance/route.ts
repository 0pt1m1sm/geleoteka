import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { constantTimeSecretEqual } from "@/lib/security/constant-time";
import { loadStaffNotificationDispatchSecret } from "@/lib/staff-notifications/channels/telegram/config";
import {
  retainTelegramSendAttempts,
  type TelegramSendDiagnosticsRetentionDb,
} from "@/lib/staff-notifications/channels/telegram/diagnostics";
import {
  retainStaffNotificationEvents,
  type StaffNotificationOperationsDb,
} from "@/lib/staff-notifications/operations";
import { loadStaffNotificationRetentionDays } from "@/lib/staff-notifications/operations-config";
import {
  scanOverdueCrmTasks,
  type StaffNotificationOverdueScannerDb,
} from "@/lib/staff-notifications/overdue";
import { drainTelegramUpdatesNow } from "@/lib/staff-notifications/channels/telegram/updates-runtime";

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

  try {
    // Inbound Telegram updates ride the same external cron: polling is the
    // primary transport now, and the cron tick is its guaranteed cadence.
    // force bypasses the interactive cooldown — this tick IS the schedule.
    const updates = await drainTelegramUpdatesNow({
      force: true,
      budgetMs: 6_000,
      maxBatches: 3,
    });

    const overdue = await scanOverdueCrmTasks(
      db as unknown as StaffNotificationOverdueScannerDb,
      { limit: 100 },
    );
    const retentionDays = await loadStaffNotificationRetentionDays();
    const retention = retentionDays
      ? await Promise.all([
          retainStaffNotificationEvents(
            db as unknown as StaffNotificationOperationsDb,
            { retentionDays },
          ),
          retainTelegramSendAttempts(
            db as unknown as TelegramSendDiagnosticsRetentionDb,
            { retentionDays },
          ),
        ])
      : null;

    return NextResponse.json({
      ok: true,
      updates,
      overdue,
      retention: retention
        ? {
            configured: true,
            days: retentionDays,
            deletedEvents: retention[0].deletedEvents,
            deletedTelegramAttempts: retention[1].deletedAttempts,
            cutoff: retention[0].cutoff.toISOString(),
          }
        : { configured: false },
    });
  } catch {
    return NextResponse.json({ error: "maintenance failed" }, { status: 500 });
  }
}
