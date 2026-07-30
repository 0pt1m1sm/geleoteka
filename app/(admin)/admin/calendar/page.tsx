export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AdminCalendar } from "@/components/admin/AdminCalendar";
import { ScheduleManager } from "@/components/admin/ScheduleManager";
import { PageHeader } from "@/components/ui";
import { formatForDatetimeLocalInput } from "@/lib/timezone";

export default async function CalendarPage() {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const [weeklyRows, exceptionRows, blockedRows] = (await Promise.all([
    db.workingHours.findMany({ orderBy: { dayOfWeek: "asc" } }),
    db.scheduleException.findMany({ orderBy: { date: "asc" } }),
    db.blockedInterval.findMany({ orderBy: { startAt: "asc" } }),
  ])) as [
    Array<{ dayOfWeek: number; isOpen: boolean; openMinute: number; closeMinute: number }>,
    Array<{
      id: string;
      date: Date;
      isClosed: boolean;
      openMinute: number | null;
      closeMinute: number | null;
      reason: string | null;
    }>,
    Array<{ id: string; startAt: Date; endAt: Date; reason: string | null }>,
  ];

  const exceptions = exceptionRows.map((e) => ({
    id: e.id,
    // Stored as a DATE at UTC midnight; render the calendar day, not a local shift.
    date: e.date.toISOString().slice(0, 10),
    isClosed: e.isClosed,
    openMinute: e.openMinute,
    closeMinute: e.closeMinute,
    reason: e.reason,
  }));

  const blocked = blockedRows.map((b) => ({
    id: b.id,
    startAt: formatForDatetimeLocalInput(b.startAt),
    endAt: formatForDatetimeLocalInput(b.endAt),
    reason: b.reason,
  }));

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
      <PageHeader
        eyebrow="Сервис"
        title="Календарь записей"
        description="Записи, часы работы, праздники и блокировки времени"
      />
      <AdminCalendar repairOrders={serialized} />
      <div className="mt-6">
        <ScheduleManager weekly={weeklyRows} exceptions={exceptions} blocked={blocked} />
      </div>
    </div>
  );
}
