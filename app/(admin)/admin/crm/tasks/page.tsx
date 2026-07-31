export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { CrmTaskList } from "@/components/crm/CrmTaskList";
import { INBOUND_COMM_CHANNELS } from "@/lib/crm/inbound-communications";

interface StoredTaskRow {
  id: string;
  title: string;
  body: string | null;
  kind: string;
  status: string;
  dueAt: Date;
  completedAt: Date | null;
  ownerUserId: string | null;
  customerUserId: string | null;
  dealId: string | null;
  owner: { id: string; name: string } | null;
  customer: { id: string; name: string } | null;
  deal: { id: string; number: string | null } | null;
}

interface InboundCommunicationRow {
  id: string;
  customerUserId: string;
  dealId: string | null;
  channel: string;
}

interface Props {
  searchParams: Promise<{ scope?: string; owner?: string }>;
}

export default async function CrmTasksPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const { scope: scopeParam, owner: ownerParam } = await searchParams;
  // Default scope is "open" (all my open tasks regardless of due date) so a
  // freshly created task with a future due date is immediately visible.
  // Use the "Сегодня" / "Просрочено" / "На неделе" chips to narrow down.
  const scope = ["today", "overdue", "week", "open", "done", "all"].includes(
    scopeParam ?? "",
  )
    ? (scopeParam as string)
    : "open";
  const ownerScope = ["mine", "team", "replies"].includes(ownerParam ?? "")
    ? (ownerParam as string)
    : "mine";

  const now = new Date();
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(startToday);
  endToday.setDate(endToday.getDate() + 1);
  const endWeek = new Date(startToday);
  endWeek.setDate(endWeek.getDate() + 7);

  const where: Record<string, unknown> = {};
  if (ownerScope === "mine") {
    where.ownerUserId = session.id;
  } else if (ownerScope === "replies") {
    // Deliberately no owner predicate: this is the shared queue, including
    // replies assigned to colleagues and replies with ownerUserId=null.
    where.kind = "FOLLOW_UP";
  }

  if (scope === "overdue") {
    where.status = "OPEN";
    where.dueAt = { lt: startToday };
  } else if (scope === "today") {
    where.status = "OPEN";
    where.dueAt = { gte: startToday, lt: endToday };
  } else if (scope === "week") {
    where.status = "OPEN";
    where.dueAt = { gte: startToday, lt: endWeek };
  } else if (scope === "open") {
    where.status = "OPEN";
  } else if (scope === "done") {
    where.status = "DONE";
  }
  // "all" leaves filter empty (all statuses, all dues)

  const storedTasks = (await db.crmTask.findMany({
    where,
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
    take: 200,
    select: {
      id: true,
      title: true,
      body: true,
      kind: true,
      status: true,
      dueAt: true,
      completedAt: true,
      ownerUserId: true,
      customerUserId: true,
      dealId: true,
      owner: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true } },
      deal: { select: { id: true, number: true } },
    },
  })) as StoredTaskRow[];

  // CrmTask deliberately has no message FK until Story 3. Resolve the current
  // OPEN reply task to the newest inbound CommunicationLog for the same exact
  // (customerUserId, dealId) pair. `dealId: null` is a real pair, not a reason
  // to drop the task from navigation.
  const pairs = new Map<string, { customerUserId: string; dealId: string | null }>();
  for (const task of storedTasks) {
    if (task.kind !== "FOLLOW_UP" || task.status !== "OPEN" || !task.customerUserId) continue;
    pairs.set(communicationPairKey(task.customerUserId, task.dealId), {
      customerUserId: task.customerUserId,
      dealId: task.dealId,
    });
  }

  const pairValues = Array.from(pairs.values());
  const latestInboundRows = pairValues.length > 0
    ? (await db.communicationLog.findMany({
        where: {
          channel: { in: [...INBOUND_COMM_CHANNELS] },
          OR: pairValues,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        distinct: ["customerUserId", "dealId"],
        select: {
          id: true,
          customerUserId: true,
          dealId: true,
          channel: true,
        },
      }) as InboundCommunicationRow[])
    : [];

  const latestInboundByPair = new Map(
    latestInboundRows.map((entry) => [
      communicationPairKey(entry.customerUserId, entry.dealId),
      { id: entry.id, channel: entry.channel },
    ]),
  );

  const tasks = storedTasks.map((task) => ({
    ...task,
    latestInboundCommunication:
      task.kind === "FOLLOW_UP" && task.status === "OPEN" && task.customerUserId
        ? latestInboundByPair.get(communicationPairKey(task.customerUserId, task.dealId)) ?? null
        : null,
  }));

  return (
    <div>
      <PageHeader eyebrow="CRM · Задачи" title="Задачи" />

      <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div
          className="flex min-w-0 max-w-full flex-col gap-1"
          role="group"
          aria-labelledby="task-due-filter-label"
        >
          <span
            id="task-due-filter-label"
            className="text-[10px] font-medium uppercase tracking-wider text-[var(--foreground-muted)]"
          >
            Срок
          </span>
          <div className="flex flex-wrap gap-2">
            <Chip scope={scope} ownerScope={ownerScope} value="today" label="Сегодня" />
            <Chip scope={scope} ownerScope={ownerScope} value="overdue" label="Просрочено" />
            <Chip scope={scope} ownerScope={ownerScope} value="week" label="На неделе" />
          </div>
        </div>
        <div
          className="flex min-w-0 max-w-full flex-col gap-1"
          role="group"
          aria-labelledby="task-state-filter-label"
        >
          <span
            id="task-state-filter-label"
            className="text-[10px] font-medium uppercase tracking-wider text-[var(--foreground-muted)]"
          >
            Состояние
          </span>
          <div className="flex flex-wrap gap-2">
            <Chip scope={scope} ownerScope={ownerScope} value="open" label="Все открытые" />
            <Chip scope={scope} ownerScope={ownerScope} value="done" label="Выполненные" />
            <Chip scope={scope} ownerScope={ownerScope} value="all" label="Все" />
          </div>
        </div>
        <div
          className="flex min-w-0 max-w-full flex-col gap-1"
          role="group"
          aria-labelledby="task-owner-filter-label"
        >
          <span
            id="task-owner-filter-label"
            className="text-[10px] font-medium uppercase tracking-wider text-[var(--foreground-muted)]"
          >
            Кто
          </span>
          <div className="flex flex-wrap gap-2">
            <OwnerChip
              scope={scope}
              ownerScope={ownerScope}
              value="mine"
              label="Мои"
            />
            <OwnerChip
              scope={scope}
              ownerScope={ownerScope}
              value="team"
              label="Команда"
            />
            <OwnerChip
              scope={scope}
              ownerScope={ownerScope}
              value="replies"
              label="Ответы клиентов"
            />
          </div>
        </div>
      </div>

      <Card>
        <CrmTaskList tasks={tasks} nowMs={new Date().valueOf()} showLinks />
      </Card>
    </div>
  );
}

function communicationPairKey(customerUserId: string, dealId: string | null): string {
  return `${customerUserId}\u0000${dealId ?? ""}`;
}

function Chip({
  scope,
  ownerScope,
  value,
  label,
}: {
  scope: string;
  ownerScope: string;
  value: string;
  label: string;
}): React.ReactElement {
  const isActive = scope === value;
  return (
    <Link
      href={`/admin/crm/tasks?scope=${value}&owner=${ownerScope}`}
      className={
        isActive
          ? "badge bg-[var(--color-accent)] text-[var(--color-accent-foreground)] border border-[var(--color-accent)]"
          : "badge bg-[var(--background-secondary)] text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--border-hover)]"
      }
    >
      {label}
    </Link>
  );
}

function OwnerChip({
  scope,
  ownerScope,
  value,
  label,
}: {
  scope: string;
  ownerScope: string;
  value: string;
  label: string;
}): React.ReactElement {
  const isActive = ownerScope === value;
  return (
    <Link
      href={`/admin/crm/tasks?scope=${scope}&owner=${value}`}
      className={
        isActive
          ? "badge bg-[var(--color-accent)] text-[var(--color-accent-foreground)] border border-[var(--color-accent)]"
          : "badge bg-[var(--background-secondary)] text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--border-hover)]"
      }
    >
      {label}
    </Link>
  );
}
