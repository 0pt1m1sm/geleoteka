import { NextResponse } from "next/server";

import { tenantDb } from "@/lib/tenant/scoped-db";
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
  const db = await tenantDb();
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
    // 25с: через замедленный РКН канал один вызов живёт ~5с, а самолечение
    // 409 — это до четырёх последовательных вызовов (getUpdates →
    // getWebhookInfo → deleteWebhook → getUpdates). Бюджет 6с не давал ему
    // завершиться никогда. curl в workflow ждёт до 40с — запас есть.
    const updates = await drainTelegramUpdatesNow({
      force: true,
      budgetMs: 25_000,
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

    // Health-contract: провал опроса обязан красить cron-тик (workflow
    // проверяет только HTTP-код), но не отменяет уже выполненную работу —
    // overdue и retention отработали выше. skipped-*/channel-disabled —
    // штатные исходы, не сбой. budget-exhausted без единого обработанного
    // апдейта — тоже мёртвый канал (409/таймауты съели весь бюджет);
    // с прогрессом — просто большой backlog, дожуётся следующими тиками.
    const pollFailed =
      updates.status === "failed" ||
      (updates.status === "budget-exhausted" && updates.processed === 0);
    return NextResponse.json(
      {
        ok: !pollFailed,
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
      },
      { status: pollFailed ? 503 : 200 },
    );
  } catch {
    return NextResponse.json({ error: "maintenance failed" }, { status: 500 });
  }
}
