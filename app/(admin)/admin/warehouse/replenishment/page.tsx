export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { getReorderReport } from "@/app/actions/replenishment";
import { ReplenishmentReport } from "@/components/admin/ReplenishmentReport";
import { WarehouseSwitcher } from "@/components/admin/WarehouseSwitcher";
import { listWarehouses, resolveWarehouseId } from "@/app/actions/warehouses";

export default async function ReplenishmentPage({ searchParams }: { searchParams: Promise<{ wh?: string }> }) {
  await requireRole(["ADMIN", "MANAGER"]);
  const { wh } = await searchParams;
  const warehouses = await listWarehouses();
  const warehouseId = await resolveWarehouseId(wh, warehouses);
  const rows = await getReorderReport(warehouseId);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Запчасти"
        title="Дозаказ"
        description="Позиции, опустившиеся до точки дозаказа"
        backHref="/admin/warehouse"
        backLabel="Склад"
        actions={<WarehouseSwitcher warehouses={warehouses} current={warehouseId} />}
      />
      <ReplenishmentReport rows={rows} />
    </div>
  );
}
