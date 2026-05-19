import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Open-task count for the current admin/manager — drives the "Задачи"
 * nav badge. Counts EVERY OPEN CrmTask owned by the session user
 * regardless of kind (FOLLOW_UP, CALLBACK, PAYMENT_REMINDER, GENERIC, …)
 * so the badge matches what the user sees in the default "Мои · Все
 * открытые" filter on /admin/crm/tasks. Per-user — each manager sees
 * only their own action queue. Does NOT reset on visit; the count only
 * drops when a task is completed or cancelled (industry-standard CRM
 * badge behaviour — Pipedrive / HubSpot / Salesforce all work this way).
 *
 * Pre-fix this query filtered kind="FOLLOW_UP" only — that was the auto-
 * created reply tasks. Result: a manager with one manual task and one
 * reply task saw "1" in the badge while the list showed two rows.
 */
export async function GET(): Promise<NextResponse> {
  let session;
  try {
    session = await requireRole(["ADMIN", "MANAGER"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const count = await db.crmTask.count({
    where: { status: "OPEN", ownerUserId: session.id },
  });
  return NextResponse.json({ count });
}
