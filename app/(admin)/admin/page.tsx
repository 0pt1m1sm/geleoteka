export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/utils";
import { startOfDay, endOfDay, addDays } from "date-fns";
import { Card, MetricCard, PageHeader } from "@/components/ui";
import { UpcomingOrdersTable, type UpcomingOrderRow } from "./UpcomingOrdersTable";

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
      <PageHeader eyebrow="Админ" title="Дашборд" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard label="Записей сегодня" value={todayCount} />
        <MetricCard label="В работе" value={activeCount} variant="warning" />
        <MetricCard label="Завершено сегодня" value={completedToday.length} variant="success" />
        <MetricCard label="Выручка за день" value={formatPrice(dailyRevenue)} variant="accent" />
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Ближайшие записи (7 дней)</h2>
        <Link href="/admin/repair-orders" className="text-sm text-[var(--color-accent)] hover:underline">
          Все записи →
        </Link>
      </div>

      {upcoming.length === 0 ? (
        <Card className="text-center py-8">
          <p className="text-[var(--foreground-muted)]">Нет записей на ближайшую неделю</p>
        </Card>
      ) : (
        <UpcomingOrdersTable
          rows={upcoming.map((ro: Record<string, unknown>): UpcomingOrderRow => {
            const user = ro.user as { name: string; phone: string | null };
            const vehicle = ro.vehicle as { model: string };
            const jobs = ro.jobLines as Array<{ description: string }>;
            return {
              id: ro.id as string,
              customerName: user.name,
              customerPhone: user.phone,
              vehicleModel: vehicle.model,
              dateTime: (ro.dateTime as Date).toISOString(),
              status: ro.status as string,
              jobs: jobs.map((j) => j.description),
            };
          })}
        />
      )}
    </div>
  );
}
