import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface DealOption {
  id: string;
  number: string | null;
  stage: string;
  total: number;
}

/**
 * Active deals for a given customer — used by the TaskForm deal picker on
 * /admin/crm/tasks (where neither customer nor deal is pre-bound). Returns
 * deals in stages NEW / IN_PROGRESS only — WON / LOST are hidden because
 * a manager typing a new task almost always means an active deal.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireRole(["ADMIN", "MANAGER"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const deals = (await db.deal.findMany({
    where: {
      customerUserId: id,
      stage: { in: ["NEW", "IN_PROGRESS"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, number: true, stage: true, total: true },
  })) as DealOption[];
  return NextResponse.json({ deals });
}
