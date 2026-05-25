export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOpenPackLines } from "@/app/actions/packing";
import { listWarehouses, resolveWarehouseId } from "@/app/actions/warehouses";
import { PageHeader } from "@/components/ui";
import { PackBox } from "@/components/admin/PackBox";
import { WarehouseSwitcher } from "@/components/admin/WarehouseSwitcher";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ wh?: string }>;
}

export default async function PackingOrderPage({ params, searchParams }: Props) {
  await requireRole(["ADMIN", "MANAGER", "WAREHOUSE_WORKER"]);
  const { id } = await params;
  const sp = await searchParams;

  const order = (await db.partShipment.findUnique({
    where: { id },
    select: { orderNumber: true, status: true, contactName: true },
  })) as { orderNumber: string | null; status: string; contactName: string } | null;
  if (!order) notFound();

  const warehouses = await listWarehouses();
  const warehouseId = await resolveWarehouseId(sp.wh, warehouses);
  const lines = await getOpenPackLines(id, warehouseId);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Упаковка"
        title={`Заказ ${order.orderNumber ?? id.slice(0, 8)}`}
        description={`${order.contactName} · ${order.status}`}
        backHref="/admin/warehouse/packing"
        backLabel="Упаковка"
        actions={<WarehouseSwitcher warehouses={warehouses} current={warehouseId} />}
      />
      <PackBox orderId={id} lines={lines} warehouseId={warehouseId} />
    </div>
  );
}
