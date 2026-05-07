export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AdminCalendar } from "@/components/admin/AdminCalendar";
import { PageHeader } from "@/components/ui";

export default async function CalendarPage() {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const repairOrders = await db.repairOrder.findMany({
    where: { status: { notIn: ["CANCELLED"] } },
    include: {
      user: { select: { name: true, phone: true } },
      vehicle: { select: { model: true } },
      jobLines: { select: { description: true }, orderBy: { sortOrder: "asc" } },
      master: { select: { name: true } },
    },
    orderBy: { dateTime: "asc" },
  });

  const serialized = repairOrders.map((ro: Record<string, unknown>) => ({
    id: ro.id as string,
    dateTime: (ro.dateTime as Date).toISOString(),
    status: ro.status as string,
    clientName: (ro.user as Record<string, string>).name,
    clientPhone: (ro.user as Record<string, string>).phone,
    vehicleModel: (ro.vehicle as Record<string, string>).model,
    masterName: (ro.master as Record<string, string> | null)?.name ?? null,
    jobs: (ro.jobLines as Array<{ description: string }>).map((j) => j.description),
  }));

  return (
    <div>
      <PageHeader eyebrow="Сервис" title="Календарь записей" />
      <AdminCalendar repairOrders={serialized} />
    </div>
  );
}
