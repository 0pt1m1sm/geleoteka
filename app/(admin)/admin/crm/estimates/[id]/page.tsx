export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { formatDate, formatDateTime, formatPrice } from "@/lib/utils";
import {
  DEAL_LINE_TYPE_LABELS,
  ESTIMATE_STAGE_LABELS,
} from "@/lib/deal-stage-labels";
import { EstimateActions } from "@/components/crm/EstimateActions";

interface EstimateDetail {
  id: string;
  number: string | null;
  stage: string;
  notes: string | null;
  validUntil: Date | null;
  sentAt: Date | null;
  approvedAt: Date | null;
  declinedAt: Date | null;
  declineReason: string | null;
  parentEstimateId: string | null;
  createdAt: Date;
  subtotalLabor: number;
  subtotalParts: number;
  subtotalRental: number;
  discount: number;
  tax: number;
  total: number;
  deal: {
    id: string;
    number: string | null;
    channel: string;
    customer: { id: string; name: string; phone: string };
    vehicle: { make: string; model: string; year: number } | null;
  };
  preparedBy: { id: string; name: string } | null;
  estimateLines: Array<{
    id: string;
    type: string;
    description: string;
    qty: number;
    unitPrice: number;
    total: number;
  }>;
  revisions: Array<{ id: string; stage: string; createdAt: Date }>;
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EstimateDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const { id } = await params;
  const estimate = (await db.estimate.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      stage: true,
      notes: true,
      validUntil: true,
      sentAt: true,
      approvedAt: true,
      declinedAt: true,
      declineReason: true,
      parentEstimateId: true,
      createdAt: true,
      subtotalLabor: true,
      subtotalParts: true,
      subtotalRental: true,
      discount: true,
      tax: true,
      total: true,
      deal: {
        select: {
          id: true,
          number: true,
          channel: true,
          customer: { select: { id: true, name: true, phone: true } },
          vehicle: { select: { make: true, model: true, year: true } },
        },
      },
      preparedBy: { select: { id: true, name: true } },
      estimateLines: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          type: true,
          description: true,
          qty: true,
          unitPrice: true,
          total: true,
        },
      },
      revisions: {
        orderBy: { createdAt: "asc" },
        select: { id: true, stage: true, createdAt: true },
      },
    },
  })) as EstimateDetail | null;
  if (!estimate) notFound();

  const isTerminal = ["APPROVED", "DECLINED", "EXPIRED", "SUPERSEDED"].includes(
    estimate.stage,
  );

  return (
    <div>
      <PageHeader
        eyebrow={`Смета${estimate.number ? ` ${estimate.number}` : ""} · ${ESTIMATE_STAGE_LABELS[estimate.stage] ?? estimate.stage}`}
        title={estimate.deal.customer.name}
        description={
          estimate.deal.vehicle
            ? `${estimate.deal.vehicle.make} ${estimate.deal.vehicle.model} ${estimate.deal.vehicle.year}`
            : undefined
        }
        actions={
          <div className="flex items-center gap-4 text-xs">
            <a
              href={`/admin/crm/estimates/${estimate.id}/print?auto=1`}
              target="_blank"
              rel="noopener"
              className="text-[var(--color-accent)] hover:underline"
            >
              Печать ↗
            </a>
            <Link
              href={`/admin/crm/deals/${estimate.deal.id}`}
              className="text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
            >
              ← К сделке
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Позиции сметы</h3>
              <span className="text-xs text-[var(--foreground-muted)]">
                Зафиксировано на момент создания
              </span>
            </div>
            {estimate.estimateLines.length === 0 ? (
              <p className="text-sm text-[var(--foreground-muted)]">
                Смета пуста.
              </p>
            ) : (
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--background-secondary)] text-xs uppercase tracking-wider text-[var(--foreground-muted)]">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Тип</th>
                      <th className="text-left px-4 py-2 font-medium">Описание</th>
                      <th className="text-right px-4 py-2 font-medium">Кол-во</th>
                      <th className="text-right px-4 py-2 font-medium">Цена</th>
                      <th className="text-right px-4 py-2 font-medium">Сумма</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {estimate.estimateLines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-4 py-2 text-xs text-[var(--foreground-muted)]">
                          {DEAL_LINE_TYPE_LABELS[line.type] ?? line.type}
                        </td>
                        <td className="px-4 py-2">{line.description}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{line.qty}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatPrice(line.unitPrice)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium">
                          {formatPrice(line.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-1.5 text-sm">
              <div className="flex justify-between text-[var(--foreground-muted)]">
                <span>Работы</span>
                <span className="tabular-nums">{formatPrice(estimate.subtotalLabor)}</span>
              </div>
              <div className="flex justify-between text-[var(--foreground-muted)]">
                <span>Запчасти</span>
                <span className="tabular-nums">{formatPrice(estimate.subtotalParts)}</span>
              </div>
              {estimate.subtotalRental ? (
                <div className="flex justify-between text-[var(--foreground-muted)]">
                  <span>Аренда</span>
                  <span className="tabular-nums">{formatPrice(estimate.subtotalRental)}</span>
                </div>
              ) : null}
              {estimate.discount ? (
                <div className="flex justify-between text-[var(--foreground-muted)]">
                  <span>Скидки</span>
                  <span className="tabular-nums">{formatPrice(estimate.discount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between items-baseline pt-2 border-t border-[var(--border)]">
                <span className="text-sm font-medium">Итого</span>
                <span className="text-xl font-bold text-[var(--color-accent)] tabular-nums">
                  {formatPrice(estimate.total)}
                </span>
              </div>
            </div>
          </Card>

          {estimate.declineReason ? (
            <Card>
              <h3 className="font-semibold mb-2">Причина отказа</h3>
              <p className="text-sm text-[var(--foreground-muted)]">
                {estimate.declineReason}
              </p>
            </Card>
          ) : null}

          {estimate.revisions.length > 0 ? (
            <Card>
              <h3 className="font-semibold mb-2">Пересмотры</h3>
              <ul className="text-sm space-y-1">
                {estimate.revisions.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/admin/crm/estimates/${r.id}`}
                      className="hover:text-[var(--color-accent)]"
                    >
                      {ESTIMATE_STAGE_LABELS[r.stage] ?? r.stage} · {formatDateTime(r.createdAt)} ↗
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {estimate.parentEstimateId ? (
            <Card>
              <p className="text-sm text-[var(--foreground-muted)]">
                Пересмотр сметы:{" "}
                <Link
                  href={`/admin/crm/estimates/${estimate.parentEstimateId}`}
                  className="text-[var(--color-accent)] hover:underline"
                >
                  открыть исходную
                </Link>
              </p>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-4">
          <Card>
            <h3 className="font-semibold mb-2">Сделка</h3>
            <Link
              href={`/admin/crm/deals/${estimate.deal.id}`}
              className="text-sm hover:text-[var(--color-accent)]"
            >
              {estimate.deal.number ?? "Без номера"} · {estimate.deal.channel}
            </Link>
            <div className="mt-3 text-xs text-[var(--foreground-muted)] space-y-1">
              <div>
                Клиент:{" "}
                <Link
                  href={`/admin/customers/${estimate.deal.customer.id}`}
                  className="hover:text-[var(--color-accent)]"
                >
                  {estimate.deal.customer.name}
                </Link>
              </div>
              <div>
                <a
                  href={`tel:${estimate.deal.customer.phone}`}
                  className="font-mono hover:text-[var(--color-accent)]"
                >
                  {estimate.deal.customer.phone}
                </a>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="font-semibold mb-2">Параметры</h3>
            <dl className="text-xs space-y-1 text-[var(--foreground-muted)]">
              <div className="flex justify-between">
                <dt>Стадия</dt>
                <dd className="text-[var(--foreground)]">
                  {ESTIMATE_STAGE_LABELS[estimate.stage] ?? estimate.stage}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Создана</dt>
                <dd>{formatDate(estimate.createdAt)}</dd>
              </div>
              {estimate.sentAt ? (
                <div className="flex justify-between">
                  <dt>Отправлена</dt>
                  <dd>{formatDate(estimate.sentAt)}</dd>
                </div>
              ) : null}
              {estimate.approvedAt ? (
                <div className="flex justify-between">
                  <dt>Согласована</dt>
                  <dd>{formatDate(estimate.approvedAt)}</dd>
                </div>
              ) : null}
              {estimate.declinedAt ? (
                <div className="flex justify-between">
                  <dt>Отклонена</dt>
                  <dd>{formatDate(estimate.declinedAt)}</dd>
                </div>
              ) : null}
              {estimate.validUntil ? (
                <div className="flex justify-between">
                  <dt>Действительна до</dt>
                  <dd>{formatDate(estimate.validUntil)}</dd>
                </div>
              ) : null}
              {estimate.preparedBy ? (
                <div className="flex justify-between">
                  <dt>Подготовил</dt>
                  <dd>{estimate.preparedBy.name}</dd>
                </div>
              ) : null}
            </dl>
          </Card>

          {!isTerminal ? (
            <Card>
              <h3 className="font-semibold mb-2">Действия</h3>
              <EstimateActions estimateId={estimate.id} stage={estimate.stage} />
            </Card>
          ) : null}

          {estimate.notes ? (
            <Card>
              <h3 className="font-semibold mb-2">Заметки</h3>
              <p className="text-xs text-[var(--foreground-muted)] whitespace-pre-wrap">
                {estimate.notes}
              </p>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
