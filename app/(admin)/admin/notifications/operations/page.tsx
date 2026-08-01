export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { retryStaffNotificationDelivery } from "@/app/actions/staff-notifications";
import { Card, MetricCard, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { roleHasPermission } from "@/lib/authz";
import { db } from "@/lib/db";
import { loadTelegramRuntimeConfig } from "@/lib/staff-notifications/channels/telegram/config";
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

  const [eventRows, deliveryStatusRows, deliveries, retentionDays, telegram] =
    await Promise.all([
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
