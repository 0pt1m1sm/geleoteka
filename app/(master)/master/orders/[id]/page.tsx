export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import {
  REPAIR_ORDER_STATUS_LABELS,
  formatDateTime,
  formatPrice,
} from "@/lib/utils";
import { MasterStatusChanger } from "@/components/master/MasterStatusChanger";

interface RepairOrderDetail {
  id: string;
  roNumber: string | null;
  status: string;
  dateTime: Date;
  mileageIn: number | null;
  concern: string | null;
  notes: string | null;
  total: number;
  subtotalLabor: number;
  subtotalParts: number;
  promisedAt: Date | null;
  masterUserId: string | null;
  user: { name: string; phone: string; email: string };
  vehicle: { model: string | null; year: number | null; vin: string | null };
  jobLines: Array<{
    id: string;
    description: string;
    laborTotal: number;
    status: string;
  }>;
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MasterOrderDetailPage({ params }: Props) {
  const session = await requireAuth();
  const { id } = await params;

  const ro = (await db.repairOrder.findUnique({
    where: { id },
    select: {
      id: true,
      roNumber: true,
      status: true,
      dateTime: true,
      mileageIn: true,
      concern: true,
      notes: true,
      total: true,
      subtotalLabor: true,
      subtotalParts: true,
      promisedAt: true,
      masterUserId: true,
      user: { select: { name: true, phone: true, email: true } },
      vehicle: { select: { model: true, year: true, vin: true } },
      jobLines: {
        select: {
          id: true,
          description: true,
          laborTotal: true,
          status: true,
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  })) as RepairOrderDetail | null;

  if (!ro) notFound();

  const role = session.permissionRole;
  const isElevated = role === "ADMIN" || role === "MANAGER";
  // Strict: a master who's not the assignee gets 404 (not their concern).
  // Elevated roles can view any order.
  if (!isElevated && ro.masterUserId !== session.id) notFound();

  const statusLabel = REPAIR_ORDER_STATUS_LABELS[ro.status] ?? ro.status;

  return (
    <div>
      <PageHeader
        eyebrow={ro.roNumber ? `№${ro.roNumber}` : "Заказ-наряд"}
        title={`Mercedes-Benz ${ro.vehicle.model ?? "—"}${ro.vehicle.year ? `, ${ro.vehicle.year}` : ""}`}
        description={`${statusLabel} · ${formatDateTime(ro.dateTime)}`}
        actions={
          <Link
            href="/master"
            className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
          >
            ← К очереди
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-4">
          <Card>
            <h2 className="text-lg font-semibold mb-3">Клиент</h2>
            <div className="text-sm space-y-1">
              <p className="font-medium">{ro.user.name}</p>
              <p className="text-[var(--foreground-muted)]">
                <a
                  href={`tel:${ro.user.phone}`}
                  className="hover:text-[var(--color-accent)]"
                >
                  {ro.user.phone}
                </a>
                {" · "}
                <a
                  href={`mailto:${ro.user.email}`}
                  className="hover:text-[var(--color-accent)]"
                >
                  {ro.user.email}
                </a>
              </p>
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold mb-3">Автомобиль</h2>
            <div className="text-sm space-y-1">
              <p className="font-medium">
                Mercedes-Benz {ro.vehicle.model ?? "—"}
                {ro.vehicle.year ? `, ${ro.vehicle.year}` : ""}
              </p>
              {ro.vehicle.vin && (
                <p className="text-xs text-[var(--foreground-muted)] font-mono">
                  VIN {ro.vehicle.vin}
                </p>
              )}
              {ro.mileageIn != null && (
                <p className="text-xs text-[var(--foreground-muted)]">
                  Пробег при приёме: {ro.mileageIn.toLocaleString("ru-RU")} км
                </p>
              )}
            </div>
          </Card>

          {ro.concern && (
            <Card>
              <h2 className="text-lg font-semibold mb-2">Жалоба клиента</h2>
              <p className="text-sm whitespace-pre-wrap">{ro.concern}</p>
            </Card>
          )}

          <Card>
            <h2 className="text-lg font-semibold mb-3">Работы</h2>
            {ro.jobLines.length === 0 ? (
              <p className="text-sm text-[var(--foreground-muted)]">
                Заказ-наряд пустой. Менеджер ещё не добавил работы.
              </p>
            ) : (
              <ul className="space-y-2">
                {ro.jobLines.map((j) => (
                  <li
                    key={j.id}
                    className="flex items-baseline justify-between gap-3 text-sm border-b border-[var(--border)] last:border-0 pb-2 last:pb-0"
                  >
                    <span className="flex-1">{j.description}</span>
                    <span className="text-xs text-[var(--foreground-muted)] shrink-0">
                      {formatPrice(j.laborTotal)} · {j.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {ro.notes && (
            <Card>
              <h2 className="text-lg font-semibold mb-2">Примечания</h2>
              <p className="text-sm whitespace-pre-wrap">{ro.notes}</p>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card className="space-y-4">
            <MasterStatusChanger
              repairOrderId={ro.id}
              currentStatus={ro.status}
            />
            {ro.promisedAt && (
              <div>
                <p className="text-xs text-[var(--foreground-muted)] mb-1">
                  Обещано клиенту
                </p>
                <p className="text-sm">{formatDateTime(ro.promisedAt)}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-[var(--foreground-muted)] mb-1">Итого</p>
              <p className="text-2xl font-bold text-[var(--color-accent)]">
                {formatPrice(ro.total)}
              </p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">
                Работа: {formatPrice(ro.subtotalLabor)} · Запчасти:{" "}
                {formatPrice(ro.subtotalParts)}
              </p>
            </div>
          </Card>

          {isElevated && ro.masterUserId !== session.id && (
            <Card>
              <p className="text-xs text-[var(--foreground-muted)]">
                Вы открыли чужой заказ-наряд как{" "}
                {role === "ADMIN" ? "администратор" : "менеджер"}. Изменения
                статуса логируются.
              </p>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
