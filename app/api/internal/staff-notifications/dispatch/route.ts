import { NextResponse } from "next/server";

import { constantTimeSecretEqual } from "@/lib/security/constant-time";
import { loadStaffNotificationDispatchSecret } from "@/lib/staff-notifications/channels/telegram/config";
import { runStaffNotificationDispatchTick } from "@/lib/staff-notifications/dispatch-runtime";

export const dynamic = "force-dynamic";

/**
 * Внешняя страховка dispatch-конвейера (GitHub-cron). Основная каденция —
 * фоновый воркер (instrumentation → poll-worker), который зовёт тот же
 * runStaffNotificationDispatchTick внутрипроцессно каждые ~20с.
 */
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
    const tick = await runStaffNotificationDispatchTick();
    if (tick.status === "invalid-config") {
      return NextResponse.json(
        { error: "telegram configuration invalid", projected: tick.projected },
        { status: 503 },
      );
    }
    if (tick.status === "skipped") {
      return NextResponse.json({
        skipped: true,
        reason: tick.reason,
        projected: tick.projected,
        cancelled: tick.cancelled,
      });
    }
    return NextResponse.json({
      ok: true,
      projected: tick.projected,
      historicalCancelled: tick.historicalCancelled,
      leased: tick.leased,
      sent: tick.sent,
      retry: tick.retry,
      dead: tick.dead,
      leaseLost: tick.leaseLost,
    });
  } catch {
    return NextResponse.json({ error: "dispatch failed" }, { status: 500 });
  }
}
