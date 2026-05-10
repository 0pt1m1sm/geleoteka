export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { formatDate, formatPrice } from "@/lib/utils";
import {
  DEAL_CHANNEL_LABELS,
  DEAL_STAGE_LABELS,
} from "@/lib/deal-stage-labels";

const STAGE_GROUPS: Record<string, string[]> = {
  all: ["DRAFT", "QUOTED", "APPROVED", "IN_FULFILLMENT", "DELIVERED", "WON", "LOST"],
  open: ["DRAFT", "QUOTED", "APPROVED", "IN_FULFILLMENT", "DELIVERED"],
  won: ["WON"],
  lost: ["LOST"],
};

interface DealRow {
  id: string;
  number: string | null;
  stage: string;
  channel: string;
  total: number;
  createdAt: Date;
  updatedAt: Date;
  customer: { id: string; name: string };
  vehicle: { make: string; model: string } | null;
}

interface Props {
  searchParams: Promise<{ stage?: string; channel?: string }>;
}

export default async function CrmDealsPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const { stage: stageParam, channel } = await searchParams;
  const stageKey = stageParam && stageParam in STAGE_GROUPS ? stageParam : "open";
  const stagesFilter = STAGE_GROUPS[stageKey];

  const where: Record<string, unknown> = { stage: { in: stagesFilter } };
  if (channel) where.channel = channel;

  const deals = (await db.deal.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      number: true,
      stage: true,
      channel: true,
      total: true,
      createdAt: true,
      updatedAt: true,
      customer: { select: { id: true, name: true } },
      vehicle: { select: { make: true, model: true } },
    },
  })) as DealRow[];

  return (
    <div>
      <PageHeader eyebrow="CRM · Коммерция" title="Сделки" />

      <div className="flex flex-wrap gap-2 mb-4">
        <StageChip current={stageKey} value="open" label="Открытые" />
        <StageChip current={stageKey} value="won" label="WON" />
        <StageChip current={stageKey} value="lost" label="LOST" />
        <StageChip current={stageKey} value="all" label="Все" />
      </div>

      {deals.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--foreground-muted)]">Сделок нет.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {deals.map((d) => (
            <li key={d.id}>
              <Link
                href={`/admin/crm/deals/${d.id}`}
                className="card flex items-start justify-between gap-4 hover:border-[var(--border-hover)]"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{d.customer.name}</div>
                  <div className="mt-1 text-xs text-[var(--foreground-muted)] flex flex-wrap gap-x-3">
                    <span>{d.number ?? "—"}</span>
                    <span>{DEAL_STAGE_LABELS[d.stage] ?? d.stage}</span>
                    <span>{DEAL_CHANNEL_LABELS[d.channel] ?? d.channel}</span>
                    {d.vehicle ? <span>{d.vehicle.make} {d.vehicle.model}</span> : null}
                    <span>{formatDate(d.createdAt)}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold text-[var(--color-accent)] tabular-nums">
                    {formatPrice(d.total)}
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

function StageChip({
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
      href={`/admin/crm/deals?stage=${value}`}
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
