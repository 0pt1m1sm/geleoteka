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
