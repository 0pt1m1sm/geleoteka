export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { REPAIR_ORDER_STATUS_LABELS, formatDate } from "@/lib/utils";
import { Badge, Card, MetricCard, PageHeader } from "@/components/ui";

export default async function CabinetDashboard() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [repairOrders, loyalty, vehicleCount] = await Promise.all([
    db.repairOrder.findMany({
      where: {
        userId: session.id,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
      include: {
        vehicle: { select: { model: true } },
        jobLines: { select: { description: true }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { dateTime: "asc" },
      take: 5,
    }),
    db.loyaltyAccount.findUnique({ where: { userId: session.id } }),
    db.vehicle.count({
      where: { ownerUserId: session.id, ownershipType: "CUSTOMER" },
    }),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Кабинет"
        title={`Добро пожаловать, ${session.name}`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <MetricCard
          label="Автомобили"
          value={vehicleCount}
          href="/cabinet/cars"
          hrefLabel="Управлять"
        />
        <MetricCard
          label="Активные заказ-наряды"
          value={repairOrders.length}
          variant={repairOrders.length > 0 ? "accent" : "default"}
          href="/cabinet/tracking"
          hrefLabel="Отслеживать"
        />
        <MetricCard
          label="Баллы лояльности"
          value={loyalty?.points ?? 0}
          variant="accent"
          href="/cabinet/loyalty"
          hrefLabel="Подробнее"
        />
      </div>

      <h2 className="text-lg font-semibold mb-4">Текущие заказ-наряды</h2>
      {repairOrders.length === 0 ? (
        <Card className="text-center py-8">
          <p className="text-[var(--foreground-muted)] mb-4">Нет активных заказ-нарядов</p>
          <Link href="/booking" className="btn btn-primary">
            Записаться на сервис
          </Link>
        </Card>
      ) : (
        <div className="space-y-4">
          {repairOrders.map((ro: Record<string, unknown>) => {
            const vehicle = ro.vehicle as { model: string };
            const jobs = ro.jobLines as Array<{ description: string }>;
            return (
              <Card key={ro.id as string}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{vehicle.model}</p>
                    <p className="text-sm text-[var(--foreground-muted)]">
                      {formatDate(ro.dateTime as Date)}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {jobs.map((j, i) => (
                        <Badge key={i} variant="silver">
                          {j.description}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <span
                    className={`badge text-xs status-${(ro.status as string).toLowerCase()}`}
                  >
                    {REPAIR_ORDER_STATUS_LABELS[ro.status as string] ?? ro.status}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
