export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { formatDate, formatPrice } from "@/lib/utils";
import { ESTIMATE_STAGE_LABELS } from "@/lib/deal-stage-labels";

/**
 * Сметы — REPORT-only list. Estimates are child entities of Deals; they
 * cannot exist standalone. This page is the cross-deal tracking view
 * ("what have I sent, what's pending response, what's signed?") — no
 * create CTAs. Manager creates an estimate by opening (or creating) a
 * Deal at /admin/crm/deals, where the inline "Открыть активную смету"
 * button on the Сметы card handles open / revise / fresh-DRAFT
 * automatically.
 *
 * Each row links to the estimate detail page (primary action) and to its
 * parent deal page (secondary action) so the manager can pivot context
 * without going back to the deals list.
 */

const STAGE_GROUPS: Record<string, string[]> = {
  active: ["DRAFT", "SENT"],
  approved: ["APPROVED"],
  declined: ["DECLINED"],
  archive: ["EXPIRED", "SUPERSEDED"],
  all: ["DRAFT", "SENT", "APPROVED", "DECLINED", "EXPIRED", "SUPERSEDED"],
};

interface EstimateRow {
  id: string;
  number: string | null;
  stage: string;
  total: number;
  validUntil: Date | null;
  sentAt: Date | null;
  createdAt: Date;
  deal: {
    id: string;
    number: string | null;
    channel: string;
    customer: { name: string };
    vehicle: { make: string; model: string } | null;
  };
}

interface Props {
  searchParams: Promise<{ stage?: string }>;
}

export default async function AdminEstimatesListPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const { stage: stageParam } = await searchParams;
  const stageKey = stageParam && stageParam in STAGE_GROUPS ? stageParam : "active";
  const stages = STAGE_GROUPS[stageKey];

  const estimates = (await db.estimate.findMany({
    where: { stage: { in: stages as never[] } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      number: true,
      stage: true,
      total: true,
      validUntil: true,
      sentAt: true,
      createdAt: true,
      deal: {
        select: {
          id: true,
          number: true,
          channel: true,
          customer: { select: { name: true } },
          vehicle: { select: { make: true, model: true } },
        },
      },
    },
  })) as unknown as EstimateRow[];

  return (
    <div>
      <PageHeader
        eyebrow="CRM · Коммерция"
        title="Сметы"
        description="Список и фильтр по всем сметам. Сметы создаются и редактируются внутри сделок."
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <Chip current={stageKey} value="active" label="Активные" />
        <Chip current={stageKey} value="approved" label="Согласованы" />
        <Chip current={stageKey} value="declined" label="Отклонены" />
        <Chip current={stageKey} value="archive" label="Архив" />
        <Chip current={stageKey} value="all" label="Все" />
      </div>

      {estimates.length === 0 ? (
        <EmptyState stageLabel={stageKey} />
      ) : (
        <ul className="space-y-3">
          {estimates.map((est) => (
            <li key={est.id} className="card flex items-start justify-between gap-4">
              <Link
                href={`/admin/crm/estimates/${est.id}`}
                className="row-clickable flex-1 min-w-0 -mx-2 px-2 py-1 rounded"
              >
                <div className="font-medium truncate">
                  {est.deal.customer.name}
                  {est.deal.vehicle
                    ? ` · ${est.deal.vehicle.make} ${est.deal.vehicle.model}`
                    : ""}
                </div>
                <div className="mt-1 text-xs text-[var(--foreground-muted)] flex flex-wrap gap-x-3">
                  <span>{est.number ?? "—"}</span>
                  <span>{ESTIMATE_STAGE_LABELS[est.stage] ?? est.stage}</span>
                  <span>{est.deal.channel}</span>
                  <span>
                    {est.sentAt
                      ? `отпр. ${formatDate(est.sentAt)}`
                      : `созд. ${formatDate(est.createdAt)}`}
                  </span>
                  {est.validUntil ? (
                    <span>до {formatDate(est.validUntil)}</span>
                  ) : null}
                </div>
              </Link>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <div className="text-lg font-bold text-[var(--color-accent)] tabular-nums">
                  {formatPrice(est.total)}
                </div>
                <Link
                  href={`/admin/crm/deals/${est.deal.id}`}
                  className="text-xs text-[var(--foreground-muted)] hover:text-[var(--color-accent)] active:opacity-70 transition-opacity whitespace-nowrap"
                  title="Открыть сделку"
                >
                  → {est.deal.number ?? "сделка"}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ stageLabel }: { stageLabel: string }): React.ReactElement {
  return (
    <Card className="text-center py-12 space-y-3">
      <p className="text-[var(--foreground-muted)]">
        {stageLabel === "active"
          ? "Активных смет нет."
          : "Смет нет в этом разделе."}
      </p>
      <p className="text-xs text-[var(--foreground-muted)]">
        Сметы создаются внутри сделок.
      </p>
      <Link
        href="/admin/crm/deals"
        className="btn btn-primary text-sm inline-flex"
      >
        Перейти к сделкам
      </Link>
    </Card>
  );
}

function Chip({
  current,
  value,
  label,
}: {
  current: string;
  value: string;
  label: string;
}): React.ReactElement {
  const isActive = current === value;
  return (
    <Link
      href={`/admin/crm/estimates?stage=${value}`}
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
