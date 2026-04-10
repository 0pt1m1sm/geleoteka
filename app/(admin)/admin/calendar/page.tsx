export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminCalendar } from "@/components/admin/AdminCalendar";

export default async function CalendarPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  const appointments = await db.appointment.findMany({
    where: { status: { notIn: ["CANCELLED"] } },
    include: {
      user: { select: { name: true, phone: true } },
      car: { select: { model: true } },
      services: { include: { service: { select: { name: true } } } },
      master: { select: { name: true } },
    },
    orderBy: { dateTime: "asc" },
  });

  const serialized = appointments.map((a: Record<string, unknown>) => ({
    id: a.id as string,
    dateTime: (a.dateTime as Date).toISOString(),
    status: a.status as string,
    clientName: (a.user as Record<string, string>).name,
    clientPhone: (a.user as Record<string, string>).phone,
    carModel: (a.car as Record<string, string>).model,
    masterName: (a.master as Record<string, string> | null)?.name ?? null,
    services: (a.services as Array<{ service: { name: string } }>).map(
      (s) => s.service.name
    ),
  }));

  return (
    <div>
      <h1 className="text-display text-2xl font-bold mb-6">Календарь записей</h1>
      <AdminCalendar appointments={serialized} />
    </div>
  );
}
