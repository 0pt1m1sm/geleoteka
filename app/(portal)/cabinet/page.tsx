export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { APPOINTMENT_STATUS_LABELS, formatDate } from "@/lib/utils";

export default async function CabinetDashboard() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [appointments, loyalty, cars] = await Promise.all([
    db.appointment.findMany({
      where: { userId: session.id, status: { notIn: ["COMPLETED", "CANCELLED"] } },
      include: { car: true, services: { include: { service: true } } },
      orderBy: { dateTime: "asc" },
      take: 5,
    }),
    db.loyaltyAccount.findUnique({ where: { userId: session.id } }),
    db.car.count({ where: { userId: session.id } }),
  ]);

  return (
    <div>
      <h1 className="text-display text-2xl font-bold mb-6">
        Добро пожаловать, {session.name}
      </h1>

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)]">Автомобили</p>
          <p className="text-2xl font-bold">{cars}</p>
          <Link href="/cabinet/cars" className="text-xs text-[var(--color-accent)]">
            Управлять →
          </Link>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)]">Активные записи</p>
          <p className="text-2xl font-bold">{appointments.length}</p>
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

      {/* Active appointments */}
      <h2 className="text-lg font-semibold mb-4">Текущие записи</h2>
      {appointments.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-[var(--foreground-muted)] mb-4">Нет активных записей</p>
          <Link href="/booking" className="btn btn-primary">
            Записаться на сервис
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {appointments.map((apt: Record<string, unknown>) => (
            <div key={apt.id as string} className="card">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">
                    {(apt.car as Record<string, unknown>).model as string}
                  </p>
                  <p className="text-sm text-[var(--foreground-muted)]">
                    {formatDate(apt.dateTime as Date)}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(apt.services as Array<{ service: { name: string } }>).map(
                      (as_: { service: { name: string } }, i: number) => (
                        <span key={i} className="badge badge-silver text-xs">
                          {as_.service.name}
                        </span>
                      )
                    )}
                  </div>
                </div>
                <span
                  className={`badge text-xs status-${(apt.status as string).toLowerCase()}`}
                >
                  {APPOINTMENT_STATUS_LABELS[apt.status as string] ?? apt.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
