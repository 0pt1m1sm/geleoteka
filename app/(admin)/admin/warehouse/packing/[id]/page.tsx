export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant/scoped-db";
import { getOpenPackLines, getPackedLines } from "@/app/actions/packing";
import { listWarehouses, resolveWarehouseId } from "@/app/actions/warehouses";
import { PageHeader } from "@/components/ui";
import { PackBox } from "@/components/admin/PackBox";
import { WarehouseSwitcher } from "@/components/admin/WarehouseSwitcher";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ wh?: string }>;
}

export default async function PackingOrderPage({ params, searchParams }: Props) {
  // Через шов изоляции: условие по арендатору добавляется само.
  const db = await tenantDb();
  // requireRole здесь нельзя: он бросает, и страница падает необработанной
  // ошибкой вместо входа (конвенция проекта).
  const session = await getSession();
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE_WORKER"].includes(session.permissionRole)) {
    redirect("/login?from=/admin/warehouse/packing");
  }
  const { id } = await params;
  const sp = await searchParams;

  const order = (await db.partShipment.findUnique({
    where: { id },
    select: { orderNumber: true, status: true, contactName: true },
  })) as { orderNumber: string | null; status: string; contactName: string } | null;
  if (!order) notFound();

  const warehouses = await listWarehouses();
  const warehouseId = await resolveWarehouseId(sp.wh, warehouses);
  const [lines, packedLines] = await Promise.all([getOpenPackLines(id, warehouseId), getPackedLines(id)]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Упаковка"
        title={`Заказ ${order.orderNumber ?? id.slice(0, 8)}`}
        description={`${order.contactName} · ${order.status}`}
        backHref="/admin/warehouse/fulfill"
        backLabel="Выдача"
        actions={<WarehouseSwitcher warehouses={warehouses} current={warehouseId} />}
      />
      <PackBox orderId={id} lines={lines} packedLines={packedLines} warehouseId={warehouseId} />
    </div>
  );
}
