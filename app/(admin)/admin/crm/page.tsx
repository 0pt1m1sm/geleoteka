export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { formatPrice } from "@/lib/utils";
import {
  DEAL_STAGE_LABELS,
  isOpenStage,
} from "@/lib/deal-stage-labels";
import { CrmTaskList } from "@/components/crm/CrmTaskList";

interface OpenDealRow {
  id: string;
  number: string | null;
  total: number;
  stage: string;
  channel: string;
  updatedAt: Date;
  customer: { id: string; name: string };
}

export default async function CrmDashboardPage() {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const [openCount, wonLast30d, myOverdueCount, recentTasks, deals] = await Promise.all([
    db.deal.count({
      where: { stage: { in: ["DRAFT", "QUOTED", "APPROVED", "IN_FULFILLMENT", "DELIVERED"] } },
    }),
    db.deal.aggregate({
      where: { stage: "WON", closedAt: { gte: thirtyDaysAgo } },
      _sum: { total: true },
      _count: true,
    }),
    db.crmTask.count({
      where: { ownerUserId: session.id, status: "OPEN", dueAt: { lt: startOfToday } },
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
      where: { stage: { in: ["DRAFT", "QUOTED", "APPROVED", "IN_FULFILLMENT", "DELIVERED"] } },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        number: true,
        total: true,
        stage: true,
        channel: true,
        updatedAt: true,
        customer: { select: { id: true, name: true } },
      },
    }) as Promise<OpenDealRow[]>,
  ]);

  const wonSum = (wonLast30d._sum.total as number | null) ?? 0;
  const wonCount = wonLast30d._count;
  const avgTicket = wonCount > 0 ? Math.round(wonSum / wonCount) : 0;

  return (
    <div>
      <PageHeader eyebrow="CRM" title="Дашборд" description="Коммерческая часть платформы" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <div className="text-xs uppercase tracking-wider text-[var(--foreground-muted)]">Открытые сделки</div>
          <div className="mt-2 text-3xl font-bold">{openCount}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-[var(--foreground-muted)]">Выручка (30 дн)</div>
          <div className="mt-2 text-3xl font-bold text-[var(--color-accent)]">
            {formatPrice(wonSum)}
          </div>
          <div className="mt-1 text-xs text-[var(--foreground-muted)]">{wonCount} закрытых</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-[var(--foreground-muted)]">Средний чек (30 дн)</div>
          <div className="mt-2 text-3xl font-bold">{formatPrice(avgTicket)}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-[var(--foreground-muted)]">Просрочено задач</div>
          <div className={`mt-2 text-3xl font-bold ${myOverdueCount > 0 ? "text-[var(--color-error)]" : ""}`}>
            {myOverdueCount}
          </div>
          <div className="mt-1 text-xs">
            <Link
              href="/admin/crm/tasks?scope=today&owner=mine"
              className="text-[var(--color-accent)] hover:underline"
            >
              Перейти к задачам →
            </Link>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CrmTaskList
            tasks={recentTasks}
            nowMs={new Date().valueOf()}
            canCreate={false}
            showLinks
            emptyText="У вас нет открытых задач."
          />
        </Card>
        <Card>
          <h3 className="font-semibold mb-3">Последние открытые сделки</h3>
          {deals.length === 0 ? (
            <p className="text-sm text-[var(--foreground-muted)]">Открытых сделок нет.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {deals.map((d) => (
                <li key={d.id} className="py-2 flex items-center justify-between gap-3">
                  <Link
                    href={`/admin/crm/deals/${d.id}`}
                    className="flex-1 min-w-0 hover:text-[var(--color-accent)]"
                  >
                    <div className="font-medium truncate">{d.customer.name}</div>
                    <div className="text-xs text-[var(--foreground-muted)]">
                      {d.number ?? "—"} · {DEAL_STAGE_LABELS[d.stage] ?? d.stage} · {d.channel}
                      {isOpenStage(d.stage) ? "" : ""}
                    </div>
                  </Link>
                  <div className="text-sm font-medium tabular-nums">{formatPrice(d.total)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

    </div>
  );
}
