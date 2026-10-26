export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { getReorderReport } from "@/app/actions/replenishment";
import { ReplenishmentReport } from "@/components/admin/ReplenishmentReport";
import { WarehouseSwitcher } from "@/components/admin/WarehouseSwitcher";
import { listWarehouses, resolveWarehouseId } from "@/app/actions/warehouses";

export default async function ReplenishmentPage({ searchParams }: { searchParams: Promise<{ wh?: string }> }) {
  // requireRole здесь нельзя: он бросает, и страница падает необработанной
  // ошибкой вместо входа (конвенция проекта).
  const session = await getSession();
  if (!session || !["ADMIN", "MANAGER"].includes(session.permissionRole)) {
    redirect("/login?from=/admin/warehouse/replenishment");
  }
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
