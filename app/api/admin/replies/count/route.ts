import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Open FOLLOW_UP task count for the current admin/manager — drives the
 * "Задачи" nav badge. Per-user, so each manager sees only their own
 * action queue. Mirrors the InboxBadge pattern (response field name
 * differs: `count` here, `pending` there).
 */
export async function GET(): Promise<NextResponse> {
  let session;
  try {
    session = await requireRole(["ADMIN", "MANAGER"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const count = await db.crmTask.count({
    where: { kind: "FOLLOW_UP", status: "OPEN", ownerUserId: session.id },
  });
  return NextResponse.json({ count });
}
