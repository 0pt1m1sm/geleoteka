export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { formatDate, formatPrice } from "@/lib/utils";
import { ESTIMATE_STAGE_LABELS } from "@/lib/deal-stage-labels";

interface EstimateRow {
  id: string;
  number: string | null;
  stage: string;
  total: number;
  sentAt: Date | null;
  validUntil: Date | null;
  createdAt: Date;
  deal: {
    id: string;
    vehicle: { make: string; model: string; year: number } | null;
  };
}

export default async function CabinetEstimatesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const estimates = (await db.estimate.findMany({
    where: {
      deal: { customerUserId: session.id },
      stage: { in: ["DRAFT", "SENT", "APPROVED", "DECLINED"] },
    },
    orderBy: [{ stage: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      number: true,
      stage: true,
      total: true,
      sentAt: true,
      validUntil: true,
      createdAt: true,
      deal: {
        select: {
          id: true,
          vehicle: { select: { make: true, model: true, year: true } },
        },
      },
    },
  })) as unknown as EstimateRow[];

  const pending = estimates.filter((e) => e.stage === "SENT" || e.stage === "DRAFT");
  const closed = estimates.filter((e) => e.stage !== "SENT" && e.stage !== "DRAFT");

  return (
    <div>
      <PageHeader eyebrow="Кабинет" title="Сметы" />

      {pending.length === 0 && closed.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--foreground-muted)]">Смет нет.</p>
        </Card>
      ) : null}

      {pending.length > 0 ? (
        <>
          <h2 className="text-sm uppercase tracking-wider text-[var(--foreground-muted)] mb-3">
            Ожидают вашего решения
          </h2>
          <ul className="space-y-3 mb-6">
            {pending.map((est) => (
              <EstimateRowItem key={est.id} est={est} highlight />
            ))}
          </ul>
        </>
      ) : null}

      {closed.length > 0 ? (
        <>
          <h2 className="text-sm uppercase tracking-wider text-[var(--foreground-muted)] mb-3">
            История
          </h2>
          <ul className="space-y-3">
            {closed.map((est) => (
              <EstimateRowItem key={est.id} est={est} />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function EstimateRowItem({
  est,
  highlight,
}: {
  est: EstimateRow;
  highlight?: boolean;
}): React.ReactElement {
  return (
    <li>
      <Link
        href={`/cabinet/estimates/${est.id}`}
        className={
          "card flex items-start justify-between gap-4 " +
          (highlight ? "border-[var(--color-accent)]" : "hover:border-[var(--border-hover)]")
        }
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium">
            {est.deal.vehicle
              ? `${est.deal.vehicle.make} ${est.deal.vehicle.model} ${est.deal.vehicle.year}`
              : est.number ?? "Смета"}
          </div>
          <div className="mt-1 text-xs text-[var(--foreground-muted)] flex flex-wrap gap-x-3">
            <span>{ESTIMATE_STAGE_LABELS[est.stage] ?? est.stage}</span>
            <span>
              {est.sentAt
                ? `отправлена ${formatDate(est.sentAt)}`
                : `создана ${formatDate(est.createdAt)}`}
            </span>
            {est.validUntil ? (
              <span>действует до {formatDate(est.validUntil)}</span>
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
  );
}
