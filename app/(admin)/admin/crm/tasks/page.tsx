export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { CrmTaskList } from "@/components/crm/CrmTaskList";

interface TaskRow {
  id: string;
  title: string;
  body: string | null;
  kind: string;
  status: string;
  dueAt: Date;
  completedAt: Date | null;
  owner: { id: string; name: string };
  customer: { id: string; name: string } | null;
  deal: { id: string; number: string | null } | null;
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
  const scope = scopeParam ?? "today";
  const ownerScope = ownerParam ?? "mine";

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

  const tasks = (await db.crmTask.findMany({
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
      owner: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true } },
      deal: { select: { id: true, number: true } },
    },
  })) as TaskRow[];

  return (
    <div>
      <PageHeader eyebrow="CRM · Задачи" title="Задачи" />

      <div className="flex flex-wrap gap-2 mb-4">
        <Chip scope={scope} ownerScope={ownerScope} value="today" label="Сегодня" />
        <Chip scope={scope} ownerScope={ownerScope} value="overdue" label="Просрочено" />
        <Chip scope={scope} ownerScope={ownerScope} value="week" label="На неделе" />
        <Chip scope={scope} ownerScope={ownerScope} value="open" label="Все открытые" />
        <Chip scope={scope} ownerScope={ownerScope} value="done" label="Выполненные" />
        <Chip scope={scope} ownerScope={ownerScope} value="all" label="Все" />
        <span className="mx-2 text-[var(--foreground-muted)]">·</span>
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
      </div>

      <Card>
        <CrmTaskList tasks={tasks} nowMs={new Date().valueOf()} showLinks />
      </Card>
    </div>
  );
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
