export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant/scoped-db";
import { TENANT_KEY } from "@/lib/wms-host";
import { listCountSessions } from "@/lib/wms/public";
import { listWarehouses, resolveWarehouseId } from "@/app/actions/warehouses";
import { PageHeader } from "@/components/ui";
import { StocktakeNewSession } from "@/components/admin/StocktakeNewSession";
import { StocktakeSessionList } from "@/components/admin/StocktakeSessionList";
import { WarehouseSwitcher } from "@/components/admin/WarehouseSwitcher";

interface Props {
  searchParams: Promise<{ wh?: string }>;
}

export default async function StocktakePage({ searchParams }: Props) {
  const db = await tenantDb();
  // requireRole здесь нельзя: он бросает, и страница падает необработанной
  // ошибкой вместо входа (конвенция проекта).
  const session = await getSession();
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE_WORKER"].includes(session.permissionRole)) {
    redirect("/login?from=/admin/warehouse/stocktake");
  }
  const sp = await searchParams;
  const sessions = await listCountSessions(db, TENANT_KEY);
  const warehouses = await listWarehouses();
  const warehouseId = await resolveWarehouseId(sp.wh, warehouses);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Запчасти"
        title="Инвентаризация"
        description="Пересчёт остатков по ячейкам"
        backHref="/admin/warehouse"
        backLabel="Склад"
        actions={<WarehouseSwitcher warehouses={warehouses} current={warehouseId} />}
      />
      <StocktakeNewSession warehouseId={warehouseId} />
      <StocktakeSessionList sessions={sessions} />
    </div>
  );
}
