export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import {
  REPAIR_ORDER_STATUS_LABELS,
  formatDateTime,
  formatPrice,
} from "@/lib/utils";
import { StatusChanger } from "@/components/admin/StatusChanger";
import { WorkPhotosManager } from "@/components/admin/WorkPhotosManager";
import { RepairOrderDetailsForm } from "@/components/admin/RepairOrderDetailsForm";
import { JobLineEditor } from "@/components/admin/JobLineEditor";

interface RepairOrderDetail {
  id: string;
  roNumber: string | null;
  status: string;
  dateTime: Date;
  total: number;
  concern: string | null;
  notes: string | null;
  mileageIn: number | null;
  mileageOut: number | null;
  promisedAt: Date | null;
  masterUserId: string | null;
  user: { id: string; name: string; phone: string; email: string };
  vehicle: { model: string | null; year: number | null; vin: string | null };
  jobLines: Array<{
    id: string;
    description: string;
    status: string;
    laborTotal: number;
    partsTotal: number;
    total: number;
  }>;
  workPhotos: Array<{
    id: string;
    url: string;
    caption: string | null;
    createdAt: Date;
    uploadedBy: { id: string; name: string } | null;
  }>;
}

interface MasterUser {
  id: string;
  name: string;
}

interface Props {
  params: Promise<{ id: string }>;
}

function toLocalInputValue(d: Date | null): string {
  if (!d) return "";
  // Format as "yyyy-MM-ddTHH:mm" in local time for <input type="datetime-local">.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function AdminRepairOrderDetailPage({ params }: Props) {
  await requireRole(["ADMIN", "MANAGER"]);
  const { id } = await params;

  const ro = (await db.repairOrder.findUnique({
    where: { id },
    select: {
      id: true,
      roNumber: true,
      status: true,
      dateTime: true,
      total: true,
      concern: true,
      notes: true,
      mileageIn: true,
      mileageOut: true,
      promisedAt: true,
      masterUserId: true,
      user: { select: { id: true, name: true, phone: true, email: true } },
      vehicle: { select: { model: true, year: true, vin: true } },
      jobLines: {
        select: {
          id: true,
          description: true,
          status: true,
          laborTotal: true,
          partsTotal: true,
          total: true,
        },
        orderBy: { sortOrder: "asc" },
      },
      workPhotos: {
        select: {
          id: true,
          url: true,
          caption: true,
          createdAt: true,
          uploadedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  })) as RepairOrderDetail | null;
  if (!ro) notFound();

  const masters = (await db.user.findMany({
    where: { isMaster: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })) as MasterUser[];

  const statusLabel = REPAIR_ORDER_STATUS_LABELS[ro.status] ?? ro.status;

  return (
    <div>
      <PageHeader
        eyebrow={ro.roNumber ? `№${ro.roNumber}` : "Заказ-наряд"}
        title={`Mercedes-Benz ${ro.vehicle.model ?? "—"}${ro.vehicle.year ? `, ${ro.vehicle.year}` : ""}`}
        description={`${statusLabel} · ${formatDateTime(ro.dateTime)} · ${formatPrice(ro.total)}`}
        actions={
          <Link
            href="/admin/repair-orders"
            className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
          >
            ← К списку
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-4">
          <details open className="card group">
            <summary className="cursor-pointer list-none flex items-center justify-between gap-3 select-none">
              <span className="text-lg font-semibold">Работы и стоимость</span>
              <span className="text-xs text-[var(--foreground-muted)]">
                {ro.jobLines.length === 0
                  ? "Нет работ"
                  : `${ro.jobLines.length} · ${formatPrice(ro.total)}`}
              </span>
            </summary>
            <div className="mt-4">
              <JobLineEditor
                repairOrderId={ro.id}
                initialJobs={ro.jobLines}
              />
            </div>
          </details>

          <details open className="card group">
            <summary className="cursor-pointer list-none flex items-center justify-between gap-3 select-none">
              <span className="text-lg font-semibold">Параметры заказ-наряда</span>
              <span className="text-xs text-[var(--foreground-muted)]">
                Жалоба, заметки, пробег, мастер
              </span>
            </summary>
            <div className="mt-4">
              <RepairOrderDetailsForm
                repairOrderId={ro.id}
                initial={{
                  concern: ro.concern ?? "",
                  notes: ro.notes ?? "",
                  mileageIn: ro.mileageIn?.toString() ?? "",
                  mileageOut: ro.mileageOut?.toString() ?? "",
                  promisedAt: toLocalInputValue(ro.promisedAt),
                  masterUserId: ro.masterUserId ?? "",
                }}
                masters={masters}
              />
            </div>
          </details>

          <details className="card group">
            <summary className="cursor-pointer list-none flex items-center justify-between gap-3 select-none">
              <span className="text-lg font-semibold">Фотографии работ</span>
              <span className="text-xs text-[var(--foreground-muted)]">
                {ro.workPhotos.length === 0
                  ? "Нет фото"
                  : `${ro.workPhotos.length} шт.`}
              </span>
            </summary>
            <div className="mt-4">
              <WorkPhotosManager
                repairOrderId={ro.id}
                initialPhotos={ro.workPhotos}
              />
            </div>
          </details>
        </div>

        <aside className="space-y-4">
          <Card>
            <h3 className="font-semibold mb-3">Клиент</h3>
            <div className="text-sm space-y-1">
              <Link
                href={`/admin/customers/${ro.user.id}`}
                className="font-medium hover:text-[var(--color-accent)]"
              >
                {ro.user.name}
              </Link>
              <p className="text-xs text-[var(--foreground-muted)]">
                <a href={`tel:${ro.user.phone}`} className="hover:text-[var(--color-accent)]">
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
            {ro.vehicle.vin && (
              <p className="mt-3 text-xs text-[var(--foreground-muted)] font-mono">
                VIN {ro.vehicle.vin}
              </p>
            )}
          </Card>

          <Card>
            <h3 className="font-semibold mb-2">Статус</h3>
            <StatusChanger
              repairOrderId={ro.id}
              currentStatus={ro.status}
            />
          </Card>
        </aside>
      </div>
    </div>
  );
}
