export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { TENANT_KEY } from "@/lib/tenant";
import { AdminCalendar } from "@/components/admin/AdminCalendar";
import { ScheduleManager } from "@/components/admin/ScheduleManager";
import { PageHeader } from "@/components/ui";
import { formatForDatetimeLocalInput } from "@/lib/timezone";
import { customerName } from "@/lib/crm/customer-display";

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

  const [repairOrders, activeBayRows] = await Promise.all([
    db.repairOrder.findMany({
      where: { status: { notIn: ["CANCELLED"] } },
      include: {
        user: { select: { name: true, phone: true } },
        vehicle: { select: { model: true } },
        jobLines: { select: { description: true }, orderBy: { sortOrder: "asc" } },
        master: { select: { name: true } },
        slot: { select: { bayId: true, bay: { select: { name: true } } } },
      },
      orderBy: { dateTime: "asc" },
    }),
    db.serviceBay.findMany({
      where: { tenantKey: TENANT_KEY, isActive: true },
      select: { id: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
  ]);

  // Every instant is converted to shop wall-clock HERE, once. The calendar is a
  // client component, and the browser's timezone is not necessarily the shop's —
  // sending raw ISO would render a Moscow 10:00 booking at whatever hour the
  // viewer's laptop believes in.
  const serialized = repairOrders.map((ro: Record<string, unknown>) => {
    const wall = formatForDatetimeLocalInput(ro.dateTime as Date); // YYYY-MM-DDTHH:mm
    const [date, time] = wall.split("T");
    const [h, m] = time.split(":").map(Number);
    const user = ro.user as { name: string; phone: string } | null;
    const slot = ro.slot as { bayId: string; bay: { name: string } } | null;
    return {
      id: ro.id as string,
      date,
      minute: h * 60 + m,
      time,
      status: ro.status as string,
      clientName: customerName(user),
      clientPhone: user?.phone ?? "",
      vehicleModel: (ro.vehicle as Record<string, string>).model,
      masterName: (ro.master as Record<string, string> | null)?.name ?? null,
      bayId: slot?.bayId ?? null,
      bayName: slot?.bay.name ?? null,
      jobs: (ro.jobLines as Array<{ description: string }>).map((j) => j.description),
    };
  });

  const todayBusiness = formatForDatetimeLocalInput(new Date()).split("T")[0];

  return (
    <div>
      <PageHeader
        eyebrow="Сервис"
        title="Календарь записей"
        description="Записи, часы работы, праздники и блокировки времени"
      />
      <AdminCalendar
        activeBayIds={(activeBayRows as Array<{ id: string }>).map((bay) => bay.id)}
        repairOrders={serialized}
        weekly={weeklyRows}
        exceptions={exceptions}
        blocked={blocked}
        today={todayBusiness}
      />
      <div className="mt-6">
        <ScheduleManager weekly={weeklyRows} exceptions={exceptions} blocked={blocked} />
      </div>
    </div>
  );
}
