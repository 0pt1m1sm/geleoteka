export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { REPAIR_ORDER_STATUS_LABELS, formatDateTime, formatPrice } from "@/lib/utils";

interface AssignedRow {
  id: string;
  roNumber: string | null;
  status: string;
  dateTime: Date;
  total: number;
  user: { name: string; phone: string };
  vehicle: { model: string | null; year: number | null };
}

const ACTIVE_STATUSES = [
  "ESTIMATE",
  "APPROVED",
  "IN_PROGRESS",
  "AWAITING_PARTS",
  "QC",
  "READY",
] as const;

const STATUS_BADGE: Record<string, string> = {
  ESTIMATE: "bg-[var(--background-secondary)] text-[var(--foreground-muted)]",
  APPROVED: "bg-[var(--color-info-bg,rgba(59,130,246,0.12))] text-[var(--color-info,#3b82f6)]",
  IN_PROGRESS: "bg-[var(--color-warning-bg,rgba(245,158,11,0.12))] text-[var(--color-warning,#f59e0b)]",
  AWAITING_PARTS: "bg-[var(--color-error-bg)] text-[var(--color-error)]",
  QC: "bg-[var(--color-info-bg,rgba(59,130,246,0.12))] text-[var(--color-info,#3b82f6)]",
  READY: "bg-[var(--color-accent)]/15 text-[var(--color-accent)]",
  INVOICED: "bg-[var(--background-secondary)] text-[var(--foreground-muted)]",
  PAID: "bg-[var(--background-secondary)] text-[var(--foreground-muted)]",
  CLOSED: "bg-[var(--background-secondary)] text-[var(--foreground-muted)]",
  CANCELLED: "bg-[var(--background-secondary)] text-[var(--foreground-muted)]",
};

export default async function MasterDashboardPage() {
  const session = await requireAuth();
  // Admins/managers viewing this page see ALL active orders so they can
  // triage; masters see only their own queue.
  const isElevated =
    session.permissionRole === "ADMIN" || session.permissionRole === "MANAGER";

  const where: Record<string, unknown> = {
    status: { in: [...ACTIVE_STATUSES] },
  };
  if (!isElevated) {
    where.masterUserId = session.id;
  }

  const orders = (await db.repairOrder.findMany({
    where,
    orderBy: [{ dateTime: "asc" }],
    select: {
      id: true,
      roNumber: true,
      status: true,
      dateTime: true,
      total: true,
      user: { select: { name: true, phone: true } },
      vehicle: { select: { model: true, year: true } },
    },
    take: 100,
  })) as AssignedRow[];

  return (
    <div>
      <PageHeader
        eyebrow={isElevated ? "Все активные работы" : "Мои работы"}
        title={`Очередь${isElevated ? " (все мастера)" : ""}`}
        description={`Активных: ${orders.length}`}
      />

      {orders.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--foreground-muted)] mb-2">
            {isElevated
              ? "Нет активных работ"
              : "На вас не назначено активных работ"}
          </p>
          <p className="text-xs text-[var(--foreground-muted)]">
            Когда менеджер назначит вам заказ-наряд, он появится здесь.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const badge = STATUS_BADGE[o.status] ?? "bg-[var(--background-secondary)] text-[var(--foreground-muted)]";
            const statusLabel = REPAIR_ORDER_STATUS_LABELS[o.status] ?? o.status;
            return (
              <Link
                key={o.id}
                href={`/master/orders/${o.id}`}
                className="card card-hover flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-medium truncate">
                      {o.roNumber ? `№${o.roNumber}` : "Без номера"} ·{" "}
                      Mercedes-Benz {o.vehicle.model ?? "—"}
                      {o.vehicle.year ? `, ${o.vehicle.year}` : ""}
                    </p>
                    <span className={`badge text-[10px] ${badge}`}>{statusLabel}</span>
                  </div>
                  <p className="text-xs text-[var(--foreground-muted)] truncate">
                    {o.user.name} · {o.user.phone} · {formatDateTime(o.dateTime)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-[var(--color-accent)] text-sm">
                    {formatPrice(o.total)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
