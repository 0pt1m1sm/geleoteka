import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/api-auth";
import { tenantDb } from "@/lib/tenant/scoped-db";
import { TENANT_KEY } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const db = await tenantDb();
  const auth = await requireApiPermission("notifications.view");
  if (!auth.ok) return auth.response;

  const unread = await db.staffNotificationReceipt.count({
    where: {
      tenantKey: TENANT_KEY,
      userId: auth.session.id,
      readAt: null,
    },
  });
  return NextResponse.json({ unread });
}
