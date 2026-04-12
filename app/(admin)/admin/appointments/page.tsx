export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { StatusChanger } from "@/components/admin/StatusChanger";
import { DeleteAppointmentButton } from "@/components/admin/DeleteAppointmentButton";

export default async function AppointmentsPage() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
    redirect("/login");
  }

  const isAdmin = session.role === "ADMIN";

  const appointments = await db.appointment.findMany({
    include: {
      user: { select: { name: true, phone: true } },
      car: { select: { model: true, year: true, vin: true, plate: true } },
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
          {appointments.map((apt) => (
            <div key={apt.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-2">
                  {/* Customer */}
                  <div>
                    <p className="font-medium">{apt.user.name}</p>
                    {apt.user.phone && (
                      <a
                        href={`tel:${apt.user.phone}`}
                        className="text-xs text-[var(--foreground-muted)] hover:text-[var(--color-accent)] font-mono"
                      >
                        {apt.user.phone}
                      </a>
                    )}
                  </div>

                  {/* Car */}
                  <div className="text-xs text-[var(--foreground-muted)] flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="text-[var(--foreground)]">
                      Mercedes-Benz {apt.car.model}
                      {apt.car.year ? ` ${apt.car.year}` : ""}
                    </span>
                    {apt.car.plate && <span>№ {apt.car.plate}</span>}
                    {apt.car.vin && <span className="font-mono">VIN {apt.car.vin}</span>}
                  </div>

                  {/* Date & master */}
                  <div className="text-xs text-[var(--foreground-muted)]">
                    {formatDate(apt.dateTime)}
                    {apt.master && ` · Мастер: ${apt.master.name}`}
                  </div>

                  {/* Services */}
                  {apt.services.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {apt.services.map((s, i) => (
                        <span key={i} className="badge badge-silver text-[10px]">
                          {s.service.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Notes */}
                  {apt.notes && (
                    <p className="text-xs italic text-[var(--foreground-muted)] pt-1 border-t border-[var(--border)]">
                      {apt.notes}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <StatusChanger appointmentId={apt.id} currentStatus={apt.status} />
                  {isAdmin && (
                    <DeleteAppointmentButton appointmentId={apt.id} customerName={apt.user.name} />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
