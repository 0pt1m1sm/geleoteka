export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { REPAIR_ORDER_STATUS_LABELS, formatDate } from "@/lib/utils";

export default async function CabinetDashboard() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [repairOrders, loyalty, vehicleCount] = await Promise.all([
    db.repairOrder.findMany({
      where: {
        userId: session.id,
        status: { notIn: ["PAID", "CLOSED", "CANCELLED"] },
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
      <h1 className="text-display text-2xl font-bold mb-6">
        Добро пожаловать, {session.name}
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)]">Автомобили</p>
          <p className="text-2xl font-bold">{vehicleCount}</p>
          <Link href="/cabinet/cars" className="text-xs text-[var(--color-accent)]">
            Управлять →
          </Link>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)]">Активные заказ-наряды</p>
          <p className="text-2xl font-bold">{repairOrders.length}</p>
          <Link href="/cabinet/tracking" className="text-xs text-[var(--color-accent)]">
            Отслеживать →
          </Link>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)]">Баллы лояльности</p>
          <p className="text-2xl font-bold">{loyalty?.points ?? 0}</p>
          <Link href="/cabinet/loyalty" className="text-xs text-[var(--color-accent)]">
            Подробнее →
          </Link>
        </div>
      </div>

      <h2 className="text-lg font-semibold mb-4">Текущие заказ-наряды</h2>
      {repairOrders.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-[var(--foreground-muted)] mb-4">Нет активных заказ-нарядов</p>
          <Link href="/booking" className="btn btn-primary">
            Записаться на сервис
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {repairOrders.map((ro: Record<string, unknown>) => {
            const vehicle = ro.vehicle as { model: string };
            const jobs = ro.jobLines as Array<{ description: string }>;
            return (
              <div key={ro.id as string} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{vehicle.model}</p>
                    <p className="text-sm text-[var(--foreground-muted)]">
                      {formatDate(ro.dateTime as Date)}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {jobs.map((j, i) => (
                        <span key={i} className="badge badge-silver text-xs">
                          {j.description}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span
                    className={`badge text-xs status-${(ro.status as string).toLowerCase()}`}
                  >
                    {REPAIR_ORDER_STATUS_LABELS[ro.status as string] ?? ro.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
