import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Pending InboxMessage count for the admin sidebar badge. */
export async function GET(): Promise<NextResponse> {
  try {
    await requireRole(["ADMIN", "MANAGER"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const pending = await db.inboxMessage.count({ where: { status: "PENDING" } });
  return NextResponse.json({ pending });
}
