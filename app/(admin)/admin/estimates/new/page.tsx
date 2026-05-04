export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { EstimateBuilder } from "@/components/admin/EstimateBuilder";

export default async function NewEstimatePage() {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const repairOrders = await db.repairOrder.findMany({
    where: {
      status: { in: ["ESTIMATE", "APPROVED", "IN_PROGRESS"] },
    },
    include: {
      user: { select: { name: true } },
      vehicle: { select: { model: true } },
    },
    orderBy: { dateTime: "desc" },
    take: 100,
  });

  const options = repairOrders.map((ro: Record<string, unknown>) => ({
    id: ro.id as string,
    label: `${(ro.user as { name: string }).name} — ${(ro.vehicle as { model: string }).model}`,
  }));

  return (
    <div className="max-w-2xl">
      <h1 className="text-display text-2xl font-bold mb-6">Создать смету</h1>
      <EstimateBuilder repairOrders={options} />
    </div>
  );
}
