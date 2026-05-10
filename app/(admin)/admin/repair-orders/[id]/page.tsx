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

interface RepairOrderDetail {
  id: string;
  roNumber: string | null;
  status: string;
  dateTime: Date;
  total: number;
  user: { id: string; name: string; phone: string; email: string };
  vehicle: { model: string | null; year: number | null; vin: string | null };
  workPhotos: Array<{
    id: string;
    url: string;
    caption: string | null;
    createdAt: Date;
    uploadedBy: { id: string; name: string } | null;
  }>;
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
      user: { select: { id: true, name: true, phone: true, email: true } },
      vehicle: { select: { model: true, year: true, vin: true } },
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
        <Card>
          <WorkPhotosManager
            repairOrderId={ro.id}
            initialPhotos={ro.workPhotos}
          />
        </Card>

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
