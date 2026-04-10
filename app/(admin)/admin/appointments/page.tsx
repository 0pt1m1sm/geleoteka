export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { StatusChanger } from "@/components/admin/StatusChanger";

export default async function AppointmentsPage() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
    redirect("/login");
  }

  const appointments = await db.appointment.findMany({
    include: {
      user: { select: { name: true, phone: true } },
      car: { select: { model: true } },
      services: { include: { service: { select: { name: true } } } },
      master: { select: { name: true } },
    },
    orderBy: { dateTime: "desc" },
    take: 100,
  });

  return (
    <div>
      <h1 className="text-display text-2xl font-bold mb-6">Все записи</h1>

      {appointments.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--foreground-muted)]">Записей пока нет</p>
        </div>
      ) : (
        <div className="space-y-3">
          {appointments.map((apt: Record<string, unknown>) => {
            const user = apt.user as Record<string, string>;
            const car = apt.car as Record<string, string>;
            const master = apt.master as Record<string, string> | null;
            const services = apt.services as Array<{ service: { name: string } }>;
            return (
              <div key={apt.id as string} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{user.name}</p>
                    <p className="text-sm text-[var(--foreground-muted)]">
                      {car.model} · {formatDate(apt.dateTime as Date)}
                      {master && ` · ${master.name}`}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {services.map((s, i) => (
                        <span key={i} className="badge badge-silver text-[10px]">{s.service.name}</span>
                      ))}
                    </div>
                  </div>
                  <StatusChanger appointmentId={apt.id as string} currentStatus={apt.status as string} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
