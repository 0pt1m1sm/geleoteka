export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { formatForDatetimeLocalInput } from "@/lib/timezone";
import {
  REPAIR_ORDER_STATUS_LABELS,
  formatDateTime,
  formatPrice,
} from "@/lib/utils";
import { StatusChanger } from "@/components/admin/StatusChanger";
import { WorkPhotosManager } from "@/components/admin/WorkPhotosManager";
import { RepairOrderDetailsForm } from "@/components/admin/RepairOrderDetailsForm";
import { getApprovedWorksCost } from "@/lib/crm/approved-estimate";

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
  dealId: string;
  user: { id: string; name: string; phone: string; email: string };
  vehicle: { model: string | null; year: number | null; vin: string | null };
  jobLines: Array<{
    id: string;
    description: string;
    status: string;
    laborTotal: number;
    partsTotal: number;
    total: number;
    laborLines: Array<{ bookHours: number; rate: number }>;
    partLines: Array<{ description: string; qty: number; unitCost: number; unitPrice: number }>;
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
      dealId: true,
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
          laborLines: { select: { bookHours: true, rate: true }, take: 1 },
          partLines: {
            select: { description: true, qty: true, unitCost: true, unitPrice: true },
            take: 1,
          },
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

  // Works cost (Работы) lives on the deal's APPROVED estimate, not on the RO —
  // service ROs are created (dispatch-fulfillment) with no financial fields, so
  // ro.total is always 0. Surface the approved estimate's labor subtotal.
  const worksCost = (await getApprovedWorksCost(ro.dealId)) ?? ro.total;

  const statusLabel = REPAIR_ORDER_STATUS_LABELS[ro.status] ?? ro.status;

  return (
    <div>
      <PageHeader
        eyebrow={ro.roNumber ? `№${ro.roNumber}` : "Заказ-наряд"}
        title={`Mercedes-Benz ${ro.vehicle.model ?? "—"}${ro.vehicle.year ? `, ${ro.vehicle.year}` : ""}`}
        description={`${statusLabel} · ${formatDateTime(ro.dateTime)} · ${formatPrice(worksCost)}`}
        actions={
          <Link href="/admin/repair-orders" className="back-link">
            ← К списку
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-4">
          <div className="card flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-[var(--foreground-muted)]">
                Финансовая часть
              </div>
              <div className="mt-1 text-sm">
                {ro.jobLines.length === 0
                  ? "Нет работ в смете"
                  : `${ro.jobLines.length} работ · ${formatPrice(worksCost)}`}
              </div>
              <p className="mt-2 text-xs text-[var(--foreground-muted)]">
                Цены и согласование — в CRM. Эта страница отвечает за исполнение.
              </p>
            </div>
            <Link
              href={`/admin/crm/deals/${ro.dealId}`}
              className="btn btn-secondary text-sm shrink-0"
            >
              Открыть сделку →
            </Link>
          </div>

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
                  promisedAt: formatForDatetimeLocalInput(ro.promisedAt),
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
                className="font-medium hover:text-[var(--color-accent)] active:opacity-70 transition-opacity"
              >
                {ro.user.name}
              </Link>
              <p className="text-xs text-[var(--foreground-muted)]">
                <a href={`tel:${ro.user.phone}`} className="hover:text-[var(--color-accent)] active:opacity-70 transition-opacity">
                  {ro.user.phone}
                </a>
                {" · "}
                <a
                  href={`mailto:${ro.user.email}`}
                  className="hover:text-[var(--color-accent)] active:opacity-70 transition-opacity"
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
