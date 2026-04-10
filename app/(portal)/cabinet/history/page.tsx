export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { APPOINTMENT_STATUS_LABELS, formatDate, formatPrice } from "@/lib/utils";

export default async function HistoryPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const appointments = await db.appointment.findMany({
    where: { userId: session.id },
    include: {
      car: true,
      services: { include: { service: true } },
      master: true,
      estimate: { include: { items: true } },
    },
    orderBy: { dateTime: "desc" },
  });

  return (
    <div>
      <h1 className="text-display text-2xl font-bold mb-6">
        История обслуживания
      </h1>

      {appointments.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--foreground-muted)]">Записей пока нет</p>
        </div>
      ) : (
        <div className="space-y-4">
          {appointments.map((apt: Record<string, unknown>) => {
            const estimate = apt.estimate as Record<string, unknown> | null;
            const car = apt.car as Record<string, unknown>;
            const master = apt.master as Record<string, unknown> | null;
            const services = apt.services as Array<{ service: { name: string } }>;

            return (
              <div key={apt.id as string} className="card">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <p className="font-medium">
                      {car.model as string} — {formatDate(apt.dateTime as Date)}
                    </p>
                    {master && (
                      <p className="text-sm text-[var(--foreground-muted)]">
                        Мастер: {master.name as string}
                      </p>
                    )}
                  </div>
                  <span
                    className={`badge text-xs status-${(apt.status as string).toLowerCase()}`}
                  >
                    {APPOINTMENT_STATUS_LABELS[apt.status as string] ?? apt.status}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1 mb-3">
                  {services.map((as_, i) => (
                    <span key={i} className="badge badge-silver text-xs">
                      {as_.service.name}
                    </span>
                  ))}
                </div>

                {estimate && (
                  <div className="pt-3 border-t border-[var(--border)]">
                    <p className="text-sm">
                      Стоимость:{" "}
                      <span className="font-semibold">
                        {formatPrice((estimate.finalCost as number) ?? (estimate.total as number))}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
