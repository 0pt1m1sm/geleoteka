export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { formatDate, formatPrice } from "@/lib/utils";
import { ESTIMATE_STAGE_LABELS } from "@/lib/deal-stage-labels";
import { NewDealDialog } from "@/components/crm/NewDealDialog";
import { NewEstimateForDealDialog } from "@/components/crm/NewEstimateForDealDialog";

interface CustomerOption {
  id: string;
  name: string;
  phone: string;
  vehicles: Array<{ id: string; make: string; model: string; year: number }>;
}

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

  const [estimates, customers, dealsWithoutEstimate, openDeals] = await Promise.all([
    db.estimate.findMany({
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
            channel: true,
            customer: { select: { name: true } },
            vehicle: { select: { make: true, model: true } },
          },
        },
      },
    }) as unknown as Promise<EstimateRow[]>,
    db.user.findMany({
      where: { isCustomer: true, deletedAt: null },
      orderBy: { name: "asc" },
      take: 500,
      select: {
        id: true,
        name: true,
        phone: true,
        vehicles: {
          where: { ownershipType: "CUSTOMER", isArchived: false },
          select: { id: true, make: true, model: true, year: true },
        },
      },
    }) as Promise<CustomerOption[]>,
    // Empty-state helper: when the manager opens "Сметы" on a fresh DB,
    // surface the open deals that don't have an estimate yet so they have a
    // direct path forward instead of "Смета создаётся внутри сделки..."
    // dead-end. Cheap because the deal count is small.
    db.deal.findMany({
      where: {
        stage: "NEW",
        estimates: { none: {} },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        channel: true,
        total: true,
        updatedAt: true,
        customer: { select: { name: true } },
        vehicle: { select: { make: true, model: true } },
      },
    }) as Promise<
      Array<{
        id: string;
        channel: string;
        total: number;
        updatedAt: Date;
        customer: { name: string };
        vehicle: { make: string; model: string } | null;
      }>
    >,
    // All open deals — fuel for the "Смета к сделке" deal-picker dialog.
    // Includes deals that already have an estimate; picking one opens or
    // revises (openOrCreateActiveEstimate handles both cases).
    db.deal.findMany({
      where: { stage: { in: ["NEW", "IN_PROGRESS"] } },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        id: true,
        number: true,
        stage: true,
        channel: true,
        total: true,
        updatedAt: true,
        customer: { select: { id: true, name: true } },
        vehicle: { select: { make: true, model: true } },
      },
    }) as Promise<
      Array<{
        id: string;
        number: string | null;
        stage: string;
        channel: string;
        total: number;
        updatedAt: Date;
        customer: { id: string; name: string };
        vehicle: { make: string; model: string } | null;
      }>
    >,
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="CRM · Коммерция"
        title="Сметы"
        description="Все сметы по всем сделкам. Каждая смета привязана к одной сделке — открыть, скачать PDF или пересмотреть можно из карточки сметы."
        actions={
          <div className="flex flex-wrap gap-2">
            <NewEstimateForDealDialog deals={openDeals} />
            <NewDealDialog
              customers={customers}
              triggerLabel="Новая сделка"
            />
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <Chip current={stageKey} value="active" label="Активные" />
        <Chip current={stageKey} value="approved" label="Согласованы" />
        <Chip current={stageKey} value="declined" label="Отклонены" />
        <Chip current={stageKey} value="archive" label="Архив" />
        <Chip current={stageKey} value="all" label="Все" />
      </div>

      {estimates.length === 0 ? (
        <EmptyState deals={dealsWithoutEstimate} stageLabel={stageKey} />
      ) : (
        <ul className="space-y-3">
          {estimates.map((est) => (
            <li key={est.id}>
              <Link
                href={`/admin/crm/estimates/${est.id}`}
                className="card card-hover flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
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
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold text-[var(--color-accent)] tabular-nums">
                    {formatPrice(est.total)}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface DealRow {
  id: string;
  channel: string;
  total: number;
  updatedAt: Date;
  customer: { name: string };
  vehicle: { make: string; model: string } | null;
}

function EmptyState({ deals, stageLabel }: { deals: DealRow[]; stageLabel: string }): React.ReactElement {
  // No estimates AND no open deals — true blank slate.
  if (deals.length === 0) {
    return (
      <Card className="text-center py-12 space-y-2">
        <p className="text-[var(--foreground-muted)]">Смет нет в этом разделе.</p>
        {stageLabel === "active" ? (
          <p className="text-xs text-[var(--foreground-muted)]">
            Создайте сделку — смета формируется из её позиций.
          </p>
        ) : null}
      </Card>
    );
  }
  // We're showing the empty-state CTA only on the "active" tab; other tabs
  // (Согласованы / Отклонены / Архив) keep the plain "Смет нет" message above.
  if (stageLabel !== "active") {
    return (
      <Card className="text-center py-12">
        <p className="text-[var(--foreground-muted)]">Смет нет в этом разделе.</p>
      </Card>
    );
  }
  return (
    <Card>
      <h3 className="font-semibold mb-1">Открытые сделки без сметы</h3>
      <p className="text-sm text-[var(--foreground-muted)] mb-3">
        Откройте сделку и нажмите «Новая смета» в карточке «Сметы».
      </p>
      <ul className="divide-y divide-[var(--border)]">
        {deals.map((d) => (
          <li key={d.id}>
            <Link
              href={`/admin/crm/deals/${d.id}`}
              className="row-clickable flex items-start justify-between gap-4 py-3 -mx-3 px-3 rounded"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {d.customer.name}
                  {d.vehicle ? ` · ${d.vehicle.make} ${d.vehicle.model}` : ""}
                </div>
                <div className="mt-0.5 text-xs text-[var(--foreground-muted)] flex flex-wrap gap-x-3">
                  <span>{d.channel}</span>
                  <span>обновлено {formatDate(d.updatedAt)}</span>
                </div>
              </div>
              <div className="text-right shrink-0 text-sm tabular-nums">
                {formatPrice(d.total)}
              </div>
            </Link>
          </li>
        ))}
      </ul>
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
