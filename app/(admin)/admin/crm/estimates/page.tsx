export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { formatDate, formatPrice } from "@/lib/utils";
import { ESTIMATE_STAGE_LABELS } from "@/lib/deal-stage-labels";
import { NewDealDialog } from "@/components/crm/NewDealDialog";

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

  const [estimates, customers] = await Promise.all([
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
      where: { isCustomer: true },
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
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="CRM · Коммерция"
        title="Сметы"
        description="Смета создаётся внутри сделки. Начните с новой сделки или откройте существующую."
        actions={<NewDealDialog customers={customers} />}
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <Chip current={stageKey} value="active" label="Активные" />
        <Chip current={stageKey} value="approved" label="Согласованы" />
        <Chip current={stageKey} value="declined" label="Отклонены" />
        <Chip current={stageKey} value="archive" label="Архив" />
        <Chip current={stageKey} value="all" label="Все" />
      </div>

      {estimates.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--foreground-muted)]">Смет нет.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {estimates.map((est) => (
            <li key={est.id}>
              <Link
                href={`/admin/crm/estimates/${est.id}`}
                className="card flex items-start justify-between gap-4 hover:border-[var(--border-hover)]"
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
