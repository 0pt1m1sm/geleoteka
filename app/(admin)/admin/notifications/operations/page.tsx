export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { retryStaffNotificationDelivery } from "@/app/actions/staff-notifications";
import { Card, MetricCard, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { roleHasPermission } from "@/lib/authz";
import { tenantDb } from "@/lib/tenant/scoped-db";
import { loadTelegramRuntimeConfig } from "@/lib/staff-notifications/channels/telegram/config";
import { TELEGRAM_SLOW_SEND_THRESHOLD_MS } from "@/lib/staff-notifications/channels/telegram/diagnostics";
import { loadStaffNotificationRetentionDays } from "@/lib/staff-notifications/operations-config";
import { TENANT_KEY } from "@/lib/tenant";
import { formatDateTime } from "@/lib/utils";

const DELIVERY_STATUSES = [
  "PENDING",
  "PROCESSING",
  "RETRY",
  "SENT",
  "DEAD",
  "CANCELLED",
] as const;
type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
type VisibleStatus = Extract<DeliveryStatus, "PENDING" | "RETRY" | "DEAD">;

const TELEGRAM_DIAGNOSTIC_WINDOW_MS = 24 * 60 * 60 * 1000;
const TELEGRAM_RECENT_SEND_LIMIT = 50;

interface Props {
  searchParams: Promise<{ status?: string }>;
}

interface DeliveryRow {
  id: string;
  status: DeliveryStatus;
  channel: string;
  attempts: number;
  nextAttemptAt: Date;
  lastErrorCode: string | null;
  event: {
    type: string;
    occurredAt: Date;
  };
}

interface TelegramSendAttemptRow {
  id: string;
  operation: string;
  outcome: string;
  durationMs: number;
  isSlow: boolean;
  errorCode: string | null;
  createdAt: Date;
}

interface TelegramSendSummaryRow {
  successful: number;
  failed: number;
  slow: number;
  medianDurationMs: number;
  maxDurationMs: number;
}

export default async function StaffNotificationOperationsPage({
  searchParams,
}: Props): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await roleHasPermission(session.permissionRole, "notifications.manage"))) {
    redirect("/");
  }

  const { status: rawStatus } = await searchParams;
  const status: VisibleStatus = ["PENDING", "RETRY", "DEAD"].includes(
    rawStatus ?? "",
  )
    ? (rawStatus as VisibleStatus)
    : "PENDING";
  const telegramDiagnosticSince = new Date(
    Date.now() - TELEGRAM_DIAGNOSTIC_WINDOW_MS,
  );

  // Через шов изоляции: условие по арендатору добавляется само.
  const db = await tenantDb();

  const [
    eventRows,
    deliveryStatusRows,
    deliveries,
    retentionDays,
    telegram,
    telegramSendAttempts,
    telegramSendSummaryRows,
  ] = await Promise.all([
      db.staffNotificationEvent.findMany({
        where: { tenantKey: TENANT_KEY },
        select: { type: true },
      }) as Promise<Array<{ type: string }>>,
      db.staffNotificationDelivery.findMany({
        where: { tenantKey: TENANT_KEY },
        select: { status: true },
      }) as Promise<Array<{ status: DeliveryStatus }>>,
      db.staffNotificationDelivery.findMany({
        where: { tenantKey: TENANT_KEY, status },
        orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
        take: 100,
        select: {
          id: true,
          status: true,
          channel: true,
          attempts: true,
          nextAttemptAt: true,
          lastErrorCode: true,
          event: { select: { type: true, occurredAt: true } },
        },
      }) as Promise<DeliveryRow[]>,
      loadStaffNotificationRetentionDays(),
      loadTelegramRuntimeConfig(),
      db.telegramSendAttempt.findMany({
        where: { tenantKey: TENANT_KEY },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: TELEGRAM_RECENT_SEND_LIMIT,
        select: {
          id: true,
          operation: true,
          outcome: true,
          durationMs: true,
          isSlow: true,
          errorCode: true,
          createdAt: true,
        },
      }) as Promise<TelegramSendAttemptRow[]>,
      db.$queryRaw<TelegramSendSummaryRow[]>`
        SELECT
          (COUNT(*) FILTER (WHERE "outcome" = 'SUCCESS'))::integer AS "successful",
          (COUNT(*) FILTER (WHERE "outcome" = 'FAILURE'))::integer AS "failed",
          (COUNT(*) FILTER (WHERE "isSlow" = true))::integer AS "slow",
          COALESCE(
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "durationMs"))::integer,
            0
          ) AS "medianDurationMs",
          COALESCE(MAX("durationMs"), 0)::integer AS "maxDurationMs"
        FROM "TelegramSendAttempt"
        WHERE "tenantKey" = ${TENANT_KEY}
          AND "createdAt" >= ${telegramDiagnosticSince}
      `,
    ]);

  // Prisma groupBy loses its types through the singleton; these projections
  // intentionally contain only non-PII enum/catalog strings and are reduced in JS.
  const deliveryCounts = Object.fromEntries(
    DELIVERY_STATUSES.map((item) => [item, 0]),
  ) as Record<DeliveryStatus, number>;
  for (const row of deliveryStatusRows) deliveryCounts[row.status] += 1;

  const eventCounts = new Map<string, number>();
  for (const row of eventRows) {
    eventCounts.set(row.type, (eventCounts.get(row.type) ?? 0) + 1);
  }
  const stuckCount = deliveryCounts.RETRY + deliveryCounts.DEAD;
  const telegramSendSummary = telegramSendSummaryRows[0] ?? {
    successful: 0,
    failed: 0,
    slow: 0,
    medianDurationMs: 0,
    maxDurationMs: 0,
  };

  return (
    <div>
      <PageHeader
        eyebrow="Уведомления · Эксплуатация"
        title="Очередь доставок"
        description="Только технические статусы и нормализованные коды ошибок — без имён, адресов, chat_id и содержимого событий."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/notifications" className="btn btn-secondary text-sm">
              Лента
            </Link>
            <Link
              href="/admin/notifications/telegram"
              className="btn btn-secondary text-sm"
            >
              Telegram
            </Link>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Событий опубликовано"
          value={eventRows.length}
          description="В пределах настроенного retention"
        />
        <MetricCard label="PENDING" value={deliveryCounts.PENDING} />
        <MetricCard
          label="Застряло"
          value={stuckCount}
          description="RETRY + DEAD"
          variant={stuckCount > 0 ? "warning" : "default"}
        />
        <MetricCard
          label="DEAD"
          value={deliveryCounts.DEAD}
          variant={deliveryCounts.DEAD > 0 ? "warning" : "default"}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Состояние канала</h2>
          <dl className="space-y-2 text-sm">
            <StatusLine
              label="Telegram"
              value={telegram.enabled ? "включён" : `выключен (${telegram.reason})`}
            />
            <StatusLine
              label="Отсечка исторических событий"
              value={telegram.enabled ? formatDateTime(telegram.enabledAt) : "не активна"}
            />
            <StatusLine
              label="Retention"
              value={retentionDays ? `${retentionDays} дн.` : "не настроен"}
            />
          </dl>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Доставки по статусам</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {DELIVERY_STATUSES.map((item) => (
              <StatusLine key={item} label={item} value={String(deliveryCounts[item])} />
            ))}
          </dl>
        </Card>
      </div>

      <section className="mb-6" aria-labelledby="telegram-channel-diagnostics">
        <div className="mb-3">
          <h2 id="telegram-channel-diagnostics" className="font-semibold">
            Исходящий канал Telegram · последние 24 часа
          </h2>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            Медленная отправка — дольше {formatDuration(TELEGRAM_SLOW_SEND_THRESHOLD_MS)}.
            Успешный медленный вызов показан отдельно от обычного успеха.
          </p>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Успешно"
            value={telegramSendSummary.successful}
            variant={telegramSendSummary.successful > 0 ? "success" : "default"}
          />
          <MetricCard
            label="Отказов"
            value={telegramSendSummary.failed}
            variant={telegramSendSummary.failed > 0 ? "warning" : "default"}
          />
          <MetricCard
            label="Медленно"
            value={telegramSendSummary.slow}
            description="Любой исход дольше порога"
            variant={telegramSendSummary.slow > 0 ? "warning" : "default"}
          />
          <MetricCard
            label="Медиана"
            value={formatDuration(telegramSendSummary.medianDurationMs)}
          />
          <MetricCard
            label="Максимум"
            value={formatDuration(telegramSendSummary.maxDurationMs)}
            variant={
              telegramSendSummary.maxDurationMs > TELEGRAM_SLOW_SEND_THRESHOLD_MS
                ? "warning"
                : "default"
            }
          />
        </div>

        <Card>
          <h3 className="mb-3 font-semibold">Последние отправки</h3>
          {telegramSendAttempts.length === 0 ? (
            <p className="text-sm text-[var(--foreground-muted)]">
              Исходящих попыток пока нет.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--foreground-muted)]">
                    <th className="px-3 py-2">Время</th>
                    <th className="px-3 py-2">Операция</th>
                    <th className="px-3 py-2">Состояние</th>
                    <th className="px-3 py-2">Длительность</th>
                    <th className="px-3 py-2">Код ошибки</th>
                  </tr>
                </thead>
                <tbody>
                  {telegramSendAttempts.map((attempt) => (
                    <tr
                      key={attempt.id}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <td className="px-3 py-3">{formatDateTime(attempt.createdAt)}</td>
                      <td className="px-3 py-3">{telegramOperationLabel(attempt.operation)}</td>
                      <td className="px-3 py-3">
                        <TelegramSendState attempt={attempt} />
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">
                        {formatDuration(attempt.durationMs)}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">
                        {attempt.errorCode ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      <Card className="mb-6">
        <h2 className="mb-3 font-semibold">Опубликованные события по типам</h2>
        {eventCounts.size === 0 ? (
          <p className="text-sm text-[var(--foreground-muted)]">Событий пока нет.</p>
        ) : (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm md:grid-cols-2">
            {[...eventCounts.entries()]
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([type, count]) => (
                <StatusLine key={type} label={type} value={String(count)} />
              ))}
          </dl>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          {(["PENDING", "RETRY", "DEAD"] as const).map((item) => (
            <Link
              key={item}
              href={`/admin/notifications/operations?status=${item}`}
              className={
                status === item
                  ? "badge border border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                  : "badge border border-[var(--border)] bg-[var(--background-secondary)] text-[var(--foreground)] hover:border-[var(--border-hover)]"
              }
            >
              {item} · {deliveryCounts[item]}
            </Link>
          ))}
        </div>

        {deliveries.length === 0 ? (
          <p className="text-sm text-[var(--foreground-muted)]">
            Доставок в статусе {status} нет.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--foreground-muted)]">
                  <th className="px-3 py-2">Тип</th>
                  <th className="px-3 py-2">Канал</th>
                  <th className="px-3 py-2">Попыток</th>
                  <th className="px-3 py-2">Код ошибки</th>
                  <th className="px-3 py-2">Следующая попытка</th>
                  <th className="px-3 py-2">Событие</th>
                  {status === "DEAD" ? <th className="px-3 py-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {deliveries.map((delivery) => (
                  <tr
                    key={delivery.id}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="px-3 py-3 font-mono text-xs">{delivery.event.type}</td>
                    <td className="px-3 py-3">{delivery.channel}</td>
                    <td className="px-3 py-3">{delivery.attempts}</td>
                    <td className="px-3 py-3 font-mono text-xs">
                      {delivery.lastErrorCode ?? "—"}
                    </td>
                    <td className="px-3 py-3">{formatDateTime(delivery.nextAttemptAt)}</td>
                    <td className="px-3 py-3">{formatDateTime(delivery.event.occurredAt)}</td>
                    {status === "DEAD" ? (
                      <td className="px-3 py-3 text-right">
                        <form action={retryStaffNotificationDelivery.bind(null, delivery.id)}>
                          <button type="submit" className="btn btn-secondary text-sm">
                            Повторить
                          </button>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] pb-1 last:border-0">
      <dt className="min-w-0 break-all text-[var(--foreground-muted)]">{label}</dt>
      <dd className="shrink-0 font-medium">{value}</dd>
    </div>
  );
}

function TelegramSendState({
  attempt,
}: {
  attempt: Pick<TelegramSendAttemptRow, "outcome" | "isSlow">;
}) {
  if (attempt.outcome === "FAILURE") {
    return (
      <span className="badge border border-[var(--color-error)] text-[var(--color-error)]">
        Отказ{attempt.isSlow ? " · медленно" : ""}
      </span>
    );
  }
  if (attempt.isSlow) {
    return (
      <span className="badge border border-[var(--color-warning)] text-[var(--color-warning)]">
        Медленно · успех
      </span>
    );
  }
  return (
    <span className="badge border border-[var(--color-success)] text-[var(--color-success)]">
      Успех
    </span>
  );
}

function telegramOperationLabel(operation: string): string {
  if (operation === "NOTIFICATION_DELIVERY") return "Уведомление";
  if (operation === "TEST_NOTIFICATION") return "Тестовое уведомление";
  if (operation === "UPDATES_POLL") return "Опрос обновлений";
  return "Ответ бота";
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${durationMs} мс`;
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(
    durationMs / 1_000,
  )} с`;
}
