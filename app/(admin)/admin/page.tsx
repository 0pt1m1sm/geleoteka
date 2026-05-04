export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatPrice, formatDate, REPAIR_ORDER_STATUS_LABELS } from "@/lib/utils";
import { startOfDay, endOfDay, addDays } from "date-fns";

export default async function AdminDashboard() {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const today = new Date();
  const dayStart = startOfDay(today);
  const dayEnd = endOfDay(today);
  const weekEnd = endOfDay(addDays(today, 7));

  const [todayCount, activeCount, completedToday, upcoming] = await Promise.all([
    db.repairOrder.count({
      where: { dateTime: { gte: dayStart, lte: dayEnd } },
    }),
    db.repairOrder.count({
      where: { status: { in: ["APPROVED", "IN_PROGRESS", "AWAITING_PARTS", "QC"] } },
    }),
    db.repairOrder.findMany({
      where: {
        status: { in: ["PAID", "CLOSED"] },
        completedAt: { gte: dayStart, lte: dayEnd },
      },
      select: { total: true },
    }),
    db.repairOrder.findMany({
      where: {
        dateTime: { gte: dayStart, lte: weekEnd },
        status: { notIn: ["PAID", "CLOSED", "CANCELLED"] },
      },
      include: {
        user: { select: { name: true, phone: true } },
        vehicle: { select: { model: true } },
        jobLines: { select: { description: true }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { dateTime: "asc" },
      take: 20,
    }),
  ]);

  const dailyRevenue = completedToday.reduce(
    (sum: number, ro: { total: number }) => sum + ro.total,
    0
  );

  return (
    <div>
      <h1 className="text-display text-2xl font-bold mb-6">Дашборд</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)]">Записей сегодня</p>
          <p className="text-3xl font-bold">{todayCount}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)]">В работе</p>
          <p className="text-3xl font-bold text-[var(--color-warning)]">{activeCount}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)]">Завершено сегодня</p>
          <p className="text-3xl font-bold text-[var(--color-success)]">{completedToday.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)]">Выручка за день</p>
          <p className="text-3xl font-bold text-[var(--color-accent)]">
            {formatPrice(dailyRevenue)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Ближайшие записи (7 дней)</h2>
        <Link href="/admin/repair-orders" className="text-sm text-[var(--color-accent)]">
          Все записи →
        </Link>
      </div>

      {upcoming.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-[var(--foreground-muted)]">Нет записей на ближайшую неделю</p>
        </div>
      ) : (
        <div className="space-y-3">
          {upcoming.map((ro: Record<string, unknown>) => {
            const user = ro.user as Record<string, string>;
            const vehicle = ro.vehicle as Record<string, string>;
            const jobs = ro.jobLines as Array<{ description: string }>;
            return (
              <div key={ro.id as string} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{user.name}</p>
                    <p className="text-sm text-[var(--foreground-muted)]">
                      {vehicle.model} · {formatDate(ro.dateTime as Date)}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {jobs.map((j, i) => (
                        <span key={i} className="badge badge-silver text-xs">
                          {j.description}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className={`badge text-xs status-${(ro.status as string).toLowerCase()}`}>
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
