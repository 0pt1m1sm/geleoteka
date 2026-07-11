export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveFulfilmentTarget } from "@/lib/warehouse/resolve-fulfilment";
import { listOrdersNeedingPicking } from "@/app/actions/picking";
import { listOrdersNeedingPacking } from "@/app/actions/packing";
import { Card, PageHeader } from "@/components/ui";
import { FulfilScanForm } from "@/components/admin/FulfilScanForm";

interface Props {
  searchParams: Promise<{ code?: string }>;
}

/**
 * Выдача — the single outbound entry: scan/type an order code (a PartShipment
 * routes to packing, a RepairOrder to picking), or pick from the unified queue
 * below. «Отбор» и «Упаковка» remain the industry-standard process names on
 * their detail screens; this page is the one door to both. Repair orders are
 * listed first (a car waiting in the shop usually outranks a parcel), each
 * group in its action's chronological order.
 */
export default async function FulfilPage({ searchParams }: Props) {
  await requireRole(["ADMIN", "MANAGER", "WAREHOUSE_WORKER"]);
  const { code } = await searchParams;

  let notFoundCode: string | null = null;
  if (code && code.trim()) {
    const target = await resolveFulfilmentTarget(db, code);
    if (target?.kind === "pack") redirect(`/admin/warehouse/packing/${target.id}`);
    if (target?.kind === "pick") redirect(`/admin/warehouse/picking/${target.id}`);
    notFoundCode = code.trim();
  }

  const [picks, packs] = await Promise.all([listOrdersNeedingPicking(), listOrdersNeedingPacking()]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Склад"
        title="Выдача"
        description="Отсканируйте номер заказа — или выберите из очереди ниже"
        backHref="/admin/warehouse"
        backLabel="Склад"
      />
      <FulfilScanForm notFoundCode={notFoundCode} />

      <section aria-label="Очередь выдачи">
        <h2 className="text-lg font-semibold mb-3">
          Очередь выдачи ({picks.length + packs.length})
        </h2>
        {picks.length === 0 && packs.length === 0 ? (
          <Card className="text-center py-10">
            <p className="text-[var(--foreground-muted)]">Выдавать нечего — все наряды отобраны, все отгрузки собраны.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {picks.map((p) => (
              <Link
                key={`pick-${p.repairOrderId}`}
                href={`/admin/warehouse/picking/${p.repairOrderId}`}
                className="card card-hover flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="badge text-[10px] bg-[var(--color-warning-bg)] text-[var(--color-warning)]">
                      В цех
                    </span>
                    <p className="font-medium">
                      {p.roNumber ? `Наряд №${p.roNumber}` : "Заказ-наряд"}
                    </p>
                  </div>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    {p.customerName} · {p.vehicle}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold">{p.openCount}</p>
                  <p className="text-xs text-[var(--foreground-muted)]">позиций отобрать</p>
                </div>
              </Link>
            ))}
            {packs.map((o) => (
              <Link
                key={`pack-${o.orderId}`}
                href={`/admin/warehouse/packing/${o.orderId}`}
                className="card card-hover flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="badge text-[10px] bg-[var(--color-info-bg)] text-[var(--color-info)]">
                      Отгрузка
                    </span>
                    <p className="font-medium">{o.orderNumber ? `Заказ #${o.orderNumber}` : "Заказ запчастей"}</p>
                  </div>
                  <p className="text-xs text-[var(--foreground-muted)]">{o.contactName}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold">
                    {o.packed} из {o.required}
                  </p>
                  <p className="text-xs text-[var(--foreground-muted)]">собрано</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
