import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { TENANT_KEY } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
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
