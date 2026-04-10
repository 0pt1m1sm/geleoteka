export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { StatusBoard } from "@/components/portal/StatusBoard";

interface ActiveAppointment {
  id: string;
  status: string;
  dateTime: string;
  carModel: string;
  services: string[];
}

export default async function TrackingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const appointments = await db.appointment.findMany({
    where: {
      userId: session.id,
      status: { notIn: ["COMPLETED", "CANCELLED"] },
    },
    include: {
      car: { select: { model: true } },
      services: { include: { service: { select: { name: true } } } },
    },
    orderBy: { dateTime: "asc" },
  });

  const active: ActiveAppointment[] = appointments.map(
    (a: Record<string, unknown>) => ({
      id: a.id as string,
      status: a.status as string,
      dateTime: (a.dateTime as Date).toISOString(),
      carModel: (a.car as Record<string, string>).model,
      services: (a.services as Array<{ service: { name: string } }>).map(
        (s) => s.service.name
      ),
    })
  );

  return (
    <div>
      <h1 className="text-display text-2xl font-bold mb-6">
        Статус ремонта
      </h1>
      {active.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--foreground-muted)]">
            Нет активных заказов
          </p>
        </div>
      ) : (
        <StatusBoard initial={active} />
      )}
    </div>
  );
}
