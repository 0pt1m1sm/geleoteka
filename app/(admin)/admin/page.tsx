export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/utils";
import { startOfDay, endOfDay, addDays } from "date-fns";
import { Card, MetricCard, PageHeader } from "@/components/ui";
import { UpcomingOrdersTable, type UpcomingOrderRow } from "./UpcomingOrdersTable";
import { CrmTaskList } from "@/components/crm/CrmTaskList";
import { DEAL_STAGE_LABELS } from "@/lib/deal-stage-labels";

interface OpenDealRow {
  id: string;
  number: string | null;
  total: number;
  stage: string;
  channel: string;
  updatedAt: Date;
  customer: { id: string; name: string };
}

const OPEN_DEAL_STAGES = ["DRAFT", "QUOTED", "APPROVED", "IN_FULFILLMENT", "DELIVERED"] as const;

export default async function AdminDashboard() {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const today = new Date();
  const dayStart = startOfDay(today);
  const dayEnd = endOfDay(today);
  const weekEnd = endOfDay(addDays(today, 7));
  const thirtyDaysAgo = addDays(today, -30);

  const [
    todayCount,
    activeCount,
    completedToday,
    upcoming,
    openDealCount,
    wonLast30d,
    myOverdueCount,
    recentTasks,
    openDeals,
  ] = await Promise.all([
    db.repairOrder.count({
      where: { dateTime: { gte: dayStart, lte: dayEnd } },
    }),
    db.repairOrder.count({
      where: { status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
    }),
    db.repairOrder.findMany({
      where: {
        status: "COMPLETED",
        completedAt: { gte: dayStart, lte: dayEnd },
      },
      select: { total: true },
    }),
    db.repairOrder.findMany({
      where: {
        dateTime: { gte: dayStart, lte: weekEnd },
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
      include: {
        user: { select: { name: true, phone: true } },
        vehicle: { select: { model: true } },
        jobLines: { select: { description: true }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { dateTime: "asc" },
      take: 20,
    }),
    db.deal.count({ where: { stage: { in: OPEN_DEAL_STAGES as unknown as never[] } } }),
    db.deal.aggregate({
      where: { stage: "WON", closedAt: { gte: thirtyDaysAgo } },
      _sum: { total: true },
      _count: true,
    }),
    db.crmTask.count({
      where: { ownerUserId: session.id, status: "OPEN", dueAt: { lt: dayStart } },
    }),
    db.crmTask.findMany({
      where: { ownerUserId: session.id, status: "OPEN" },
      orderBy: { dueAt: "asc" },
      take: 5,
      select: {
        id: true,
        title: true,
        body: true,
        kind: true,
        status: true,
        dueAt: true,
        completedAt: true,
        owner: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        deal: { select: { id: true, number: true } },
      },
    }),
    db.deal.findMany({
      where: { stage: { in: OPEN_DEAL_STAGES as unknown as never[] } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        number: true,
        total: true,
        stage: true,
        channel: true,
        updatedAt: true,
        customer: { select: { id: true, name: true } },
      },
    }) as unknown as Promise<OpenDealRow[]>,
  ]);

  const dailyRevenue = completedToday.reduce(
    (sum: number, ro: { total: number }) => sum + ro.total,
    0,
  );
  const wonSum = (wonLast30d._sum.total as number | null) ?? 0;
  const wonCount = wonLast30d._count;
  const avgTicket = wonCount > 0 ? Math.round(wonSum / wonCount) : 0;

  return (
    <div>
      <PageHeader eyebrow="Админ" title="Дашборд" />

      <h2 className="text-xs uppercase tracking-wider text-[var(--foreground-muted)] mb-3">
        Сервис · Сегодня
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Записей сегодня" value={todayCount} />
        <MetricCard label="В работе" value={activeCount} variant="warning" />
        <MetricCard label="Завершено сегодня" value={completedToday.length} variant="success" />
        <MetricCard label="Выручка за день" value={formatPrice(dailyRevenue)} variant="accent" />
      </div>

      <h2 className="text-xs uppercase tracking-wider text-[var(--foreground-muted)] mb-3">
        CRM · Коммерция (30 дн)
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard label="Открытые сделки" value={openDealCount} />
        <MetricCard label="Выручка (30 дн)" value={formatPrice(wonSum)} variant="accent" />
        <MetricCard label="Средний чек" value={formatPrice(avgTicket)} />
        <MetricCard
          label="Просрочено задач"
          value={myOverdueCount}
          variant={myOverdueCount > 0 ? "warning" : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Мои задачи</h3>
            <Link
              href="/admin/crm/tasks?scope=open&owner=mine"
              className="text-xs text-[var(--color-accent)] hover:underline"
            >
              Все →
            </Link>
          </div>
          <CrmTaskList
            tasks={recentTasks}
            nowMs={new Date().valueOf()}
            canCreate={false}
            showLinks
            emptyText="У вас нет открытых задач."
          />
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Открытые сделки</h3>
            <Link
              href="/admin/crm/deals"
              className="text-xs text-[var(--color-accent)] hover:underline"
            >
              Все →
            </Link>
          </div>
          {openDeals.length === 0 ? (
            <p className="text-sm text-[var(--foreground-muted)]">
              Открытых сделок нет.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {openDeals.map((d) => (
                <li key={d.id} className="py-2 flex items-center justify-between gap-3">
                  <Link
                    href={`/admin/crm/deals/${d.id}`}
                    className="flex-1 min-w-0 hover:text-[var(--color-accent)]"
                  >
                    <div className="font-medium truncate">{d.customer.name}</div>
                    <div className="text-xs text-[var(--foreground-muted)]">
                      {d.number ?? "—"} · {DEAL_STAGE_LABELS[d.stage] ?? d.stage} · {d.channel}
                    </div>
                  </Link>
                  <div className="text-sm font-medium tabular-nums shrink-0">
                    {formatPrice(d.total)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Ближайшие записи (7 дней)</h2>
        <Link href="/admin/repair-orders" className="text-sm text-[var(--color-accent)] hover:underline">
          Все записи →
        </Link>
      </div>

      {upcoming.length === 0 ? (
        <Card className="text-center py-8">
          <p className="text-[var(--foreground-muted)]">Нет записей на ближайшую неделю</p>
        </Card>
      ) : (
        <UpcomingOrdersTable
          rows={upcoming.map((ro: Record<string, unknown>): UpcomingOrderRow => {
            const user = ro.user as { name: string; phone: string | null };
            const vehicle = ro.vehicle as { model: string };
            const jobs = ro.jobLines as Array<{ description: string }>;
            return {
              id: ro.id as string,
              customerName: user.name,
              customerPhone: user.phone,
              vehicleModel: vehicle.model,
              dateTime: (ro.dateTime as Date).toISOString(),
              status: ro.status as string,
              jobs: jobs.map((j) => j.description),
            };
          })}
        />
      )}
    </div>
  );
}
