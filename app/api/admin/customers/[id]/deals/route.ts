import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface DealOption {
  id: string;
  number: string | null;
  stage: string;
  total: number;
}

interface VehicleOption {
  id: string;
  make: string | null;
  model: string;
  year: number | null;
}

/**
 * Active deals and cars for a given customer — used by the TaskForm deal picker on
 * /admin/crm/tasks (where neither customer nor deal is pre-bound). Returns
 * deals in stages NEW / IN_PROGRESS only — WON / LOST are hidden because
 * a manager typing a new task almost always means an active deal.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // Первый потребитель фасада: раньше здесь ловился редирект, предназначенный
  // браузеру, и переводился в 401 — хотя вошедшему без права положен 403.
  const auth = await requireApiPermission("crm.manage");
  if (!auth.ok) return auth.response;
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
  // Машины отдаём тем же запросом: диалог заказ-наряда спрашивает и то и другое,
  // а два похода за контекстом одного клиента — лишняя задержка на открытии.
  const vehicles = (await db.vehicle.findMany({
    where: { ownerUserId: id, ownershipType: "CUSTOMER" },
    orderBy: { createdAt: "desc" },
    select: { id: true, make: true, model: true, year: true },
  })) as VehicleOption[];
  return NextResponse.json({ deals, vehicles });
}
