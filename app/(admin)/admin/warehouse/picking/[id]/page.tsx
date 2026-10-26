export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant/scoped-db";
import { getOpenPickLines, getPickedLines } from "@/app/actions/picking";
import { listWarehouses, resolveWarehouseId } from "@/app/actions/warehouses";
import { PageHeader } from "@/components/ui";
import { PickBox } from "@/components/admin/PickBox";
import { WarehouseSwitcher } from "@/components/admin/WarehouseSwitcher";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ wh?: string }>;
}

export default async function PickingOrderPage({ params, searchParams }: Props) {
  // Через шов изоляции: условие по арендатору добавляется само.
  const db = await tenantDb();
  // requireRole здесь нельзя: он бросает, и страница падает необработанной
  // ошибкой вместо входа (конвенция проекта).
  const session = await getSession();
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE_WORKER"].includes(session.permissionRole)) {
    redirect("/login?from=/admin/warehouse/picking");
  }
  const { id } = await params;
  const sp = await searchParams;

  const ro = (await db.repairOrder.findUnique({
    where: { id },
    select: { roNumber: true, user: { select: { name: true } } },
  })) as { roNumber: string | null; user: { name: string } | null } | null;
  if (!ro) notFound();

  const warehouses = await listWarehouses();
  const warehouseId = await resolveWarehouseId(sp.wh, warehouses);
  const [lines, pickedLines] = await Promise.all([getOpenPickLines(id, warehouseId), getPickedLines(id)]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Отбор"
        title={`Заказ-наряд ${ro.roNumber ?? ""}`}
        description={ro.user?.name ?? ""}
        backHref="/admin/warehouse/fulfill"
        backLabel="Выдача"
        actions={<WarehouseSwitcher warehouses={warehouses} current={warehouseId} />}
      />
      <PickBox repairOrderId={id} lines={lines} pickedLines={pickedLines} warehouseId={warehouseId} />
    </div>
  );
}
