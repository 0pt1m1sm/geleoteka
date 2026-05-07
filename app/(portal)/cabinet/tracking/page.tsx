export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { StatusBoard } from "@/components/portal/StatusBoard";
import { Card, PageHeader } from "@/components/ui";

interface ActiveRepairOrder {
  id: string;
  status: string;
  dateTime: string;
  carModel: string;
  services: string[];
}

export default async function TrackingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const repairOrders = await db.repairOrder.findMany({
    where: {
      userId: session.id,
      status: { notIn: ["PAID", "CLOSED", "CANCELLED"] },
    },
    include: {
      vehicle: { select: { model: true } },
      jobLines: { select: { description: true }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: { dateTime: "asc" },
  });

  const active: ActiveRepairOrder[] = repairOrders.map(
    (ro: Record<string, unknown>) => ({
      id: ro.id as string,
      status: ro.status as string,
      dateTime: (ro.dateTime as Date).toISOString(),
      carModel: (ro.vehicle as { model: string }).model,
      services: (ro.jobLines as Array<{ description: string }>).map(
        (j) => j.description
      ),
    })
  );

  return (
    <div>
      <PageHeader eyebrow="Кабинет" title="Статус ремонта" />
      {active.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--foreground-muted)]">Нет активных заказ-нарядов</p>
        </Card>
      ) : (
        <StatusBoard initial={active} />
      )}
    </div>
  );
}
