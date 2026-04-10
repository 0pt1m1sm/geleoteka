export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatPrice, formatDate, APPOINTMENT_STATUS_LABELS } from "@/lib/utils";
import { startOfDay, endOfDay, addDays } from "date-fns";

export default async function AdminDashboard() {
  await requireRole(["ADMIN", "MANAGER"]);

  const today = new Date();
  const dayStart = startOfDay(today);
  const dayEnd = endOfDay(today);
  const weekEnd = endOfDay(addDays(today, 7));

  const [todayCount, activeCount, completedToday, upcoming] = await Promise.all([
    db.appointment.count({
      where: { dateTime: { gte: dayStart, lte: dayEnd } },
    }),
    db.appointment.count({
      where: { status: { in: ["ACCEPTED", "DIAGNOSIS", "IN_REPAIR", "QC"] } },
    }),
    db.appointment.findMany({
      where: {
        status: "COMPLETED",
        completedAt: { gte: dayStart, lte: dayEnd },
      },
      include: { estimate: true },
    }),
    db.appointment.findMany({
      where: {
        dateTime: { gte: dayStart, lte: weekEnd },
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
      include: {
        user: { select: { name: true, phone: true } },
        car: { select: { model: true } },
        services: { include: { service: { select: { name: true } } } },
      },
      orderBy: { dateTime: "asc" },
      take: 20,
    }),
  ]);

  const dailyRevenue = completedToday.reduce((sum: number, a: Record<string, unknown>) => {
    const est = a.estimate as Record<string, unknown> | null;
    return sum + ((est?.finalCost as number) ?? (est?.total as number) ?? 0);
  }, 0);

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

      {/* Upcoming appointments */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Ближайшие записи (7 дней)</h2>
        <Link href="/admin/appointments" className="text-sm text-[var(--color-accent)]">
          Все записи →
        </Link>
      </div>

      {upcoming.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-[var(--foreground-muted)]">Нет записей на ближайшую неделю</p>
        </div>
      ) : (
        <div className="space-y-3">
          {upcoming.map((apt: Record<string, unknown>) => {
            const user = apt.user as Record<string, string>;
            const car = apt.car as Record<string, string>;
            const services = apt.services as Array<{ service: { name: string } }>;
            return (
              <div key={apt.id as string} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{user.name}</p>
                    <p className="text-sm text-[var(--foreground-muted)]">
                      {car.model} · {formatDate(apt.dateTime as Date)}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {services.map((s, i) => (
                        <span key={i} className="badge badge-silver text-xs">
                          {s.service.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className={`badge text-xs status-${(apt.status as string).toLowerCase()}`}>
                    {APPOINTMENT_STATUS_LABELS[apt.status as string] ?? apt.status}
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
