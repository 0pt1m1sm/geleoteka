export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { EstimateReview } from "@/components/portal/EstimateReview";
import { Card, PageHeader } from "@/components/ui";

export default async function EstimatesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const repairOrders = await db.repairOrder.findMany({
    where: {
      userId: session.id,
      status: "ESTIMATE",
    },
    include: {
      vehicle: { select: { model: true } },
      jobLines: {
        orderBy: { sortOrder: "asc" },
        include: {
          laborLines: { select: { description: true, bookHours: true, rate: true, total: true } },
          partLines: { select: { description: true, qty: true, unitPrice: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const serialized = repairOrders.map((ro: Record<string, unknown>) => {
    const vehicle = ro.vehicle as { model: string };
    const jobs = ro.jobLines as Array<Record<string, unknown>>;
    return {
      id: ro.id as string,
      total: ro.total as number,
      carModel: vehicle.model,
      jobs: jobs.map((j) => ({
        id: j.id as string,
        description: j.description as string,
        status: j.status as "PROPOSED" | "APPROVED" | "DECLINED" | "DEFERRED" | "IN_PROGRESS" | "DONE",
        total: j.total as number,
        laborLines: (j.laborLines as Array<{
          description: string;
          bookHours: number;
          rate: number;
          total: number;
        }>).map((l) => ({
          description: l.description,
          bookHours: l.bookHours,
          rate: l.rate,
          total: l.total,
        })),
        partLines: (j.partLines as Array<{
          description: string;
          qty: number;
          unitPrice: number;
        }>).map((p) => ({
          description: p.description,
          qty: p.qty,
          unitPrice: p.unitPrice,
        })),
      })),
    };
  });

  return (
    <div>
      <PageHeader eyebrow="Кабинет" title="Сметы" />
      {serialized.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--foreground-muted)]">Нет смет на согласование</p>
        </Card>
      ) : (
        <EstimateReview repairOrders={serialized} />
      )}
    </div>
  );
}
