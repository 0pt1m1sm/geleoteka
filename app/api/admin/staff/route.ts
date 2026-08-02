import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface StaffOption {
  id: string;
  name: string;
  permissionRole: "ADMIN" | "MANAGER";
}

/** Active employees available as CRM task owners and customer managers. */
export async function GET(): Promise<NextResponse> {
  const auth = await requireApiPermission("crm.manage");
  if (!auth.ok) return auth.response;

  const staff = (await db.user.findMany({
    where: {
      permissionRole: { in: ["ADMIN", "MANAGER"] },
      deletedAt: null,
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true, permissionRole: true },
  })) as StaffOption[];

  return NextResponse.json({ staff });
}
