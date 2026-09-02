import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { tenantDb } from "@/lib/tenant/scoped-db";

export const dynamic = "force-dynamic";

/**
 * Open-task counts for the CRM sidebar. `count` remains the current user's
 * complete action queue, so it still matches "Мои · Все открытые". The new
 * `teamReplyCount` is the shared OPEN FOLLOW_UP queue, including tasks owned by
 * colleagues and tasks with ownerUserId=null. Neither count resets on visit.
 */
export async function GET(): Promise<NextResponse> {
  const db = await tenantDb();
  const auth = await requireApiPermission("crm.manage");
  if (!auth.ok) return auth.response;

  const [count, teamReplyCount] = await Promise.all([
    db.crmTask.count({
      where: { status: "OPEN", ownerUserId: auth.session.id },
    }),
    db.crmTask.count({
      where: { status: "OPEN", kind: "FOLLOW_UP" },
    }),
  ]);
  return NextResponse.json({ count, teamReplyCount });
}
