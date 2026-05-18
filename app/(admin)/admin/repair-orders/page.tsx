export const dynamic = "force-dynamic";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatDate, REPAIR_ORDER_STATUS_LABELS } from "@/lib/utils";
import { StatusChanger } from "@/components/admin/StatusChanger";
import { DeleteRepairOrderButton } from "@/components/admin/DeleteRepairOrderButton";
import { Card, PageHeader } from "@/components/ui";

const VALID_STATUSES = new Set(Object.keys(REPAIR_ORDER_STATUS_LABELS));

interface Props {
  searchParams: Promise<{ status?: string }>;
}

export default async function AppointmentsPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const isAdmin = session.permissionRole === "ADMIN";
  const { status } = await searchParams;
  const filterStatus = status && VALID_STATUSES.has(status) ? status : null;

  const repairOrders = await db.repairOrder.findMany({
    where: filterStatus ? { status: filterStatus as never } : undefined,
    include: {
      user: { select: { name: true, phone: true } },
      vehicle: { select: { model: true, year: true, vin: true, plate: true } },
      jobLines: {
        select: { description: true, status: true },
        orderBy: { sortOrder: "asc" },
      },
      master: { select: { name: true } },
    },
    orderBy: { dateTime: "desc" },
    take: 100,
  });

  return (
    <div>
      <PageHeader
        eyebrow="Сервис"
        title="Записи"
        description="Операционная сторона: статус, мастер, фото. Цены и согласование клиента — в CRM."
      />

      <StatusFilter active={filterStatus} />

      {repairOrders.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--foreground-muted)]">
            {filterStatus
              ? `Нет записей со статусом «${REPAIR_ORDER_STATUS_LABELS[filterStatus]}»`
              : "Записей пока нет"}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {repairOrders.map((ro: Record<string, unknown>) => {
            const user = ro.user as { name: string; phone: string };
            const vehicle = ro.vehicle as { model: string; year: number; vin: string | null; plate: string | null };
            const jobs = ro.jobLines as Array<{ description: string; status: string }>;
            const master = ro.master as { name: string } | null;
            return (
              <div key={ro.id as string} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div>
                      <Link
                        href={`/admin/repair-orders/${ro.id as string}`}
                        className="font-medium hover:text-[var(--color-accent)]"
                      >
                        {user.name}
                      </Link>
                      {user.phone && (
                        <a
                          href={`tel:${user.phone}`}
                          className="block text-xs text-[var(--foreground-muted)] hover:text-[var(--color-accent)] font-mono"
                        >
                          {user.phone}
                        </a>
                      )}
                    </div>

                    <div className="text-xs text-[var(--foreground-muted)] flex flex-wrap gap-x-3 gap-y-0.5">
                      <span className="text-[var(--foreground)]">
                        Mercedes-Benz {vehicle.model}
                        {vehicle.year ? ` ${vehicle.year}` : ""}
                      </span>
                      {vehicle.plate && <span>№ {vehicle.plate}</span>}
                      {vehicle.vin && <span className="font-mono">VIN {vehicle.vin}</span>}
                    </div>

                    <div className="text-xs text-[var(--foreground-muted)]">
                      {formatDate(ro.dateTime as Date)}
                      {master && ` · Мастер: ${master.name}`}
                    </div>

                    {jobs.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {jobs.map((j, i) => (
                          <span key={i} className="badge badge-silver text-[10px]">
                            {j.description}
                          </span>
                        ))}
                      </div>
                    )}

                    {ro.notes ? (
                      <p className="text-xs italic text-[var(--foreground-muted)] pt-1 border-t border-[var(--border)]">
                        {ro.notes as string}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <StatusChanger
                      repairOrderId={ro.id as string}
                      currentStatus={ro.status as string}
                    />
                    <Link
                      href={`/admin/repair-orders/${ro.id as string}`}
                      className="inline-flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline"
                    >
                      Открыть
                      <ChevronRight size={12} aria-hidden />
                    </Link>
                    {isAdmin && (
                      <DeleteRepairOrderButton
                        repairOrderId={ro.id as string}
                        customerName={user.name}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusFilter({ active }: { active: string | null }): React.ReactElement {
  const presets: Array<{ key: string | null; label: string }> = [
    { key: null, label: "Все" },
    { key: "SCHEDULED", label: REPAIR_ORDER_STATUS_LABELS.SCHEDULED },
    { key: "IN_PROGRESS", label: REPAIR_ORDER_STATUS_LABELS.IN_PROGRESS },
    { key: "READY", label: REPAIR_ORDER_STATUS_LABELS.READY },
    { key: "COMPLETED", label: REPAIR_ORDER_STATUS_LABELS.COMPLETED },
  ];
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {presets.map((p) => {
        const isActive = active === p.key;
        const href = p.key ? `/admin/repair-orders?status=${p.key}` : "/admin/repair-orders";
        return (
          <Link
            key={p.label}
            href={href}
            className={
              isActive
                ? "badge bg-[var(--color-accent)] text-[var(--color-accent-foreground)] border border-[var(--color-accent)]"
                : "badge bg-[var(--background-secondary)] text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--border-hover)]"
            }
          >
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}
