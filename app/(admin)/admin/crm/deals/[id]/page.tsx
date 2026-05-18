export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { formatDateTime, formatPrice } from "@/lib/utils";
import { DEAL_CHANNEL_LABELS } from "@/lib/deal-stage-labels";
import { DealStageChanger } from "@/components/crm/DealStageChanger";
import { EstimatesSection } from "@/components/crm/EstimatesSection";
import { CommunicationLogger } from "@/components/crm/CommunicationLogger";
import { CrmTaskList } from "@/components/crm/CrmTaskList";
import { ESTIMATE_STAGE_LABELS } from "@/lib/deal-stage-labels";

interface Props {
  params: Promise<{ id: string }>;
}

interface DealDetail {
  id: string;
  number: string | null;
  stage: string;
  channel: string;
  source: string | null;
  paymentStatus: string;
  total: number;
  subtotalLabor: number;
  subtotalParts: number;
  subtotalRental: number;
  discount: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  customer: { id: string; name: string; phone: string; email: string };
  vehicle: { id: string; make: string; model: string; year: number; vin: string | null } | null;
  owner: { id: string; name: string } | null;
  repairOrders: Array<{ id: string; roNumber: string | null; status: string; dateTime: Date }>;
  partOrders: Array<{ id: string; status: string; total: number }>;
  rentalBookings: Array<{ id: string; status: string; startDate: Date; endDate: Date }>;
  estimates: Array<{
    id: string;
    number: string | null;
    stage: string;
    total: number;
    sentAt: Date | null;
    validUntil: Date | null;
    createdAt: Date;
  }>;
  communicationLogs: Array<{
    id: string;
    channel: string;
    outcome: string;
    body: string | null;
    durationSec: number | null;
    createdAt: Date;
    author: { id: string; name: string } | null;
    deal: { id: string; number: string | null } | null;
    subject: string | null;
    resendEmailId: string | null;
    attachments: unknown;
  }>;
  tasks: Array<{
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
  }>;
}

export default async function CrmDealDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }
  const { id } = await params;

  const deal = (await db.deal.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      stage: true,
      channel: true,
      source: true,
      paymentStatus: true,
      total: true,
      subtotalLabor: true,
      subtotalParts: true,
      subtotalRental: true,
      discount: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      customer: { select: { id: true, name: true, phone: true, email: true } },
      vehicle: { select: { id: true, make: true, model: true, year: true, vin: true } },
      owner: { select: { id: true, name: true } },
      repairOrders: {
        select: { id: true, roNumber: true, status: true, dateTime: true },
        orderBy: { dateTime: "desc" },
      },
      partOrders: {
        select: { id: true, status: true, total: true },
        orderBy: { createdAt: "desc" },
      },
      rentalBookings: {
        select: { id: true, status: true, startDate: true, endDate: true },
        orderBy: { startDate: "desc" },
      },
      estimates: {
        select: {
          id: true,
          number: true,
          stage: true,
          total: true,
          sentAt: true,
          validUntil: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
      communicationLogs: {
        select: {
          id: true,
          channel: true,
          outcome: true,
          body: true,
          durationSec: true,
          createdAt: true,
          author: { select: { id: true, name: true } },
          deal: { select: { id: true, number: true } },
          subject: true,
          resendEmailId: true,
          attachments: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      tasks: {
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
        where: { status: { in: ["OPEN", "DONE"] } },
        orderBy: [{ status: "asc" }, { dueAt: "asc" }],
        take: 50,
      },
    },
  })) as DealDetail | null;
  if (!deal) notFound();

  // The "active" estimate is whichever non-SUPERSEDED row recompute-deal-totals
  // would pick — for UI purposes, just take the first by createdAt-desc that
  // isn't SUPERSEDED. Most deals have exactly one active estimate at a time.
  const activeEstimate = deal.estimates.find((e) => e.stage !== "SUPERSEDED") ?? null;

  return (
    <div>
      <PageHeader
        eyebrow={`Сделка${deal.number ? ` ${deal.number}` : ""}`}
        title={deal.customer.name}
        description={`${DEAL_CHANNEL_LABELS[deal.channel] ?? deal.channel} · ${formatDateTime(deal.createdAt)}`}
        actions={
          <Link
            href="/admin/crm/deals"
            className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
          >
            ← К списку
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="font-semibold">Активная смета</h3>
              {activeEstimate ? (
                <Link
                  href={`/admin/crm/estimates/${activeEstimate.id}`}
                  className="text-xs text-[var(--color-accent)] hover:underline"
                >
                  Открыть смету →
                </Link>
              ) : null}
            </div>
            {activeEstimate ? (
              <div className="text-sm space-y-1">
                <div className="text-[var(--foreground-muted)]">
                  {ESTIMATE_STAGE_LABELS[activeEstimate.stage] ?? activeEstimate.stage}
                  {activeEstimate.number ? ` · ${activeEstimate.number}` : ""}
                  {activeEstimate.sentAt
                    ? ` · отпр. ${formatDateTime(activeEstimate.sentAt)}`
                    : ` · созд. ${formatDateTime(activeEstimate.createdAt)}`}
                </div>
                <DealTotals deal={deal} />
              </div>
            ) : (
              <p className="text-sm text-[var(--foreground-muted)]">
                Активной сметы нет — используйте кнопку ниже.
              </p>
            )}
          </Card>

          <Card>
            <EstimatesSection
              dealId={deal.id}
              estimates={deal.estimates}
              canCreate={deal.stage === "DRAFT" || deal.stage === "QUOTED"}
            />
          </Card>

          <Card>
            <CommunicationLogger
              customerUserId={deal.customer.id}
              dealId={deal.id}
              customerEmail={deal.customer.email}
              initialEntries={deal.communicationLogs.map((e) => ({
                id: e.id,
                channel: e.channel,
                outcome: e.outcome,
                body: e.body,
                durationSec: e.durationSec,
                createdAt: e.createdAt,
                author: e.author,
                deal: e.deal,
                subject: e.subject,
                resendEmailId: e.resendEmailId,
                attachments: Array.isArray(e.attachments)
                  ? (e.attachments as Array<{ id: string; filename: string; content_type?: string }>)
                  : [],
              }))}
            />
          </Card>

          <Card>
            <CrmTaskList
              tasks={deal.tasks}
              nowMs={new Date().valueOf()}
              customerUserId={deal.customer.id}
              dealId={deal.id}
            />
          </Card>

          {deal.repairOrders.length > 0 ? (
            <Card>
              <h3 className="font-semibold mb-2">Заказ-наряд</h3>
              <ul className="text-sm space-y-1">
                {deal.repairOrders.map((ro) => (
                  <li key={ro.id}>
                    <Link
                      href={`/admin/repair-orders/${ro.id}`}
                      className="hover:text-[var(--color-accent)]"
                    >
                      {ro.roNumber ?? "Без номера"} · {ro.status} · {formatDateTime(ro.dateTime)} ↗
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {deal.partOrders.length > 0 ? (
            <Card>
              <h3 className="font-semibold mb-2">Заказ запчастей</h3>
              <ul className="text-sm space-y-1">
                {deal.partOrders.map((po) => (
                  <li key={po.id}>
                    {po.status} · {formatPrice(po.total)}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {deal.rentalBookings.length > 0 ? (
            <Card>
              <h3 className="font-semibold mb-2">Аренда</h3>
              <ul className="text-sm space-y-1">
                {deal.rentalBookings.map((rb) => (
                  <li key={rb.id}>
                    {rb.status} · {formatDateTime(rb.startDate)} → {formatDateTime(rb.endDate)}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-4">
          <Card>
            <h3 className="font-semibold mb-2">Клиент</h3>
            <div className="text-sm space-y-1">
              <Link
                href={`/admin/customers/${deal.customer.id}`}
                className="font-medium hover:text-[var(--color-accent)]"
              >
                {deal.customer.name}
              </Link>
              <p className="text-xs text-[var(--foreground-muted)]">
                <a href={`tel:${deal.customer.phone}`} className="hover:text-[var(--color-accent)]">
                  {deal.customer.phone}
                </a>
                {" · "}
                <a
                  href={`mailto:${deal.customer.email}`}
                  className="hover:text-[var(--color-accent)]"
                >
                  {deal.customer.email}
                </a>
              </p>
            </div>
            {deal.vehicle ? (
              <div className="mt-3 text-xs text-[var(--foreground-muted)]">
                {deal.vehicle.make} {deal.vehicle.model} {deal.vehicle.year}
                {deal.vehicle.vin ? (
                  <span className="block font-mono">VIN {deal.vehicle.vin}</span>
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card>
            <h3 className="font-semibold mb-2">Стадия</h3>
            <DealStageChanger dealId={deal.id} currentStage={deal.stage} />
            <div className="mt-3 text-xs text-[var(--foreground-muted)]">
              Канал: {DEAL_CHANNEL_LABELS[deal.channel] ?? deal.channel}
            </div>
            <div className="mt-1 text-xs text-[var(--foreground-muted)]">
              Оплата: {deal.paymentStatus}
            </div>
            {deal.source ? (
              <div className="mt-1 text-xs text-[var(--foreground-muted)]">
                Источник: {deal.source}
              </div>
            ) : null}
            {deal.owner ? (
              <div className="mt-1 text-xs text-[var(--foreground-muted)]">
                Менеджер: {deal.owner.name}
              </div>
            ) : null}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function DealTotals({ deal }: { deal: DealDetail }): React.ReactElement {
  return (
    <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-1.5 text-sm">
      <div className="flex justify-between text-[var(--foreground-muted)]">
        <span>Работы</span>
        <span className="tabular-nums">{formatPrice(deal.subtotalLabor)}</span>
      </div>
      <div className="flex justify-between text-[var(--foreground-muted)]">
        <span>Запчасти</span>
        <span className="tabular-nums">{formatPrice(deal.subtotalParts)}</span>
      </div>
      {deal.subtotalRental ? (
        <div className="flex justify-between text-[var(--foreground-muted)]">
          <span>Аренда</span>
          <span className="tabular-nums">{formatPrice(deal.subtotalRental)}</span>
        </div>
      ) : null}
      {deal.discount ? (
        <div className="flex justify-between text-[var(--foreground-muted)]">
          <span>Скидки</span>
          <span className="tabular-nums">{formatPrice(deal.discount)}</span>
        </div>
      ) : null}
      <div className="flex justify-between items-baseline pt-2 border-t border-[var(--border)]">
        <span className="text-sm font-medium">Итого</span>
        <span className="text-xl font-bold text-[var(--color-accent)] tabular-nums">
          {formatPrice(deal.total)}
        </span>
      </div>
    </div>
  );
}
