export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { WarehouseOverview } from "@/components/admin/WarehouseOverview";
import { WarehouseScanBox } from "@/components/admin/WarehouseScanBox";
import { WarehouseMovementsFeed } from "@/components/admin/WarehouseMovementsFeed";
import { WarehouseLocationLookup } from "@/components/admin/WarehouseLocationLookup";
import { WarehouseLocationsAdmin } from "@/components/admin/WarehouseLocationsAdmin";
import { WarehouseSwitcher } from "@/components/admin/WarehouseSwitcher";
import { WarehouseAdmin } from "@/components/admin/WarehouseAdmin";
import { listWarehouses, resolveWarehouseId } from "@/app/actions/warehouses";

interface Props {
  searchParams: Promise<{ q?: string; page?: string; loc?: string; wh?: string }>;
}

export default async function WarehousePage({ searchParams }: Props) {
  const session = await requireRole(["ADMIN", "MANAGER", "WAREHOUSE_WORKER"]);
  const canManageLocations = session.permissionRole === "ADMIN" || session.permissionRole === "MANAGER";
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const loc = (sp.loc ?? "").trim();
  const warehouses = await listWarehouses();
  const warehouseId = await resolveWarehouseId(sp.wh, warehouses);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Запчасти"
        title="Склад"
        description="Остатки, сканирование и движения"
        actions={<WarehouseSwitcher warehouses={warehouses} current={warehouseId} />}
      />

      <div className="flex flex-wrap gap-2">
        <Link href="/admin/warehouse/receiving" className="btn btn-primary inline-flex w-fit min-h-[44px]">
          Приёмка →
        </Link>
        <Link href="/admin/warehouse/fulfill" className="btn btn-secondary inline-flex w-fit min-h-[44px]">
          Отбор / Упаковка →
        </Link>
        <Link href="/admin/warehouse/stocktake" className="btn btn-secondary inline-flex w-fit min-h-[44px]">
          Инвентаризация →
        </Link>
        <Link href="/admin/warehouse/picking" className="btn btn-secondary inline-flex w-fit min-h-[44px]">
          Отбор →
        </Link>
        <Link href="/admin/warehouse/packing" className="btn btn-secondary inline-flex w-fit min-h-[44px]">
          Упаковка →
        </Link>
        <Link href="/admin/warehouse/replenishment" className="btn btn-secondary inline-flex w-fit min-h-[44px]">
          Дозаказ →
        </Link>
        <Link href="/admin/warehouse/reports/valuation" className="btn btn-secondary inline-flex w-fit min-h-[44px]">
          Отчёты →
        </Link>
      </div>

      {/* Workflow cheat sheet — docs/warehouse/storekeeper-workflow.md, in-app */}
      <details className="card">
        <summary className="cursor-pointer font-semibold select-none">Как работает склад</summary>
        <ol className="mt-3 space-y-1.5 text-sm text-[var(--foreground-muted)] list-decimal list-inside">
          <li>
            <Link href="/admin/warehouse/receiving" className="text-[var(--color-accent)] hover:underline">Приёмка</Link>
            {" — принятый товар всегда попадает в ячейку ПРИЁМКА (или указанную вами). Наклейте наш QR-ярлык: "}
            <Link href="/admin/warehouse/labels" className="text-[var(--color-accent)] hover:underline">печать этикеток</Link>.
          </li>
          <li>Раскладка — в скан-боксе ниже отсканируйте товар, затем полку: перенос ПРИЁМКА → полка.</li>
          <li>
            <Link href="/admin/warehouse/picking" className="text-[var(--color-accent)] hover:underline">Отбор</Link>
            {" — выдача запчастей на заказ-наряд: скан товара + скан полки."}
          </li>
          <li>
            <Link href="/admin/warehouse/packing" className="text-[var(--color-accent)] hover:underline">Упаковка</Link>
            {" — сборка отгрузки клиенту, затем скан коробки и отправка."}
          </li>
          <li>
            <Link href="/admin/warehouse/stocktake" className="text-[var(--color-accent)] hover:underline">Инвентаризация</Link>
            {" — пересчёт по ячейкам; остатки исправляются только через неё."}
          </li>
        </ol>
        <p className="mt-2 text-xs text-[var(--foreground-muted)]">
          Одна деталь = один QR-ярлык (артикул). Весь остаток живёт в ячейках: приняли → разложили → отобрали.
        </p>
      </details>

      {/* Scan box — Task 4 (writes routed to the active warehouse) */}
      <WarehouseScanBox warehouseId={warehouseId} />

      {/* Location lookup — Task 10 */}
      <WarehouseLocationLookup warehouseId={warehouseId} />

      {/* Warehouse admin — Phase 6 (admin/manager only) */}
      {canManageLocations && <WarehouseAdmin warehouses={warehouses} />}

      {/* Location block/unblock admin — Phase 2.5 (admin/manager only) */}
      {canManageLocations && <WarehouseLocationsAdmin warehouseId={warehouseId} />}

      {/* Stock overview — Task 2 (scoped to the active warehouse) */}
      <WarehouseOverview q={q} page={page} loc={loc} warehouseId={warehouseId} />

      {/* Movements feed — Task 5 */}
      <WarehouseMovementsFeed />
    </div>
  );
}
