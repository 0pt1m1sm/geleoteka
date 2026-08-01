import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { constantTimeSecretEqual } from "@/lib/security/constant-time";
import { loadStaffNotificationDispatchSecret } from "@/lib/staff-notifications/channels/telegram/config";
import {
  retainStaffNotificationEvents,
  type StaffNotificationOperationsDb,
} from "@/lib/staff-notifications/operations";
import { loadStaffNotificationRetentionDays } from "@/lib/staff-notifications/operations-config";
import {
  scanOverdueCrmTasks,
  type StaffNotificationOverdueScannerDb,
} from "@/lib/staff-notifications/overdue";

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
    const overdue = await scanOverdueCrmTasks(
      db as unknown as StaffNotificationOverdueScannerDb,
      { limit: 100 },
    );
    const retentionDays = await loadStaffNotificationRetentionDays();
    const retention = retentionDays
      ? await retainStaffNotificationEvents(
          db as unknown as StaffNotificationOperationsDb,
          { retentionDays },
        )
      : null;

    return NextResponse.json({
      ok: true,
      overdue,
      retention: retention
        ? {
            configured: true,
            days: retentionDays,
            deletedEvents: retention.deletedEvents,
            cutoff: retention.cutoff.toISOString(),
          }
        : { configured: false },
    });
  } catch {
    return NextResponse.json({ error: "maintenance failed" }, { status: 500 });
  }
}
