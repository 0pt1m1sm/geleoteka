export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOpenPickLines } from "@/app/actions/picking";
import { listWarehouses, resolveWarehouseId } from "@/app/actions/warehouses";
import { PageHeader } from "@/components/ui";
import { PickBox } from "@/components/admin/PickBox";
import { WarehouseSwitcher } from "@/components/admin/WarehouseSwitcher";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ wh?: string }>;
}

export default async function PickingOrderPage({ params, searchParams }: Props) {
  await requireRole(["ADMIN", "MANAGER", "WAREHOUSE_WORKER"]);
  const { id } = await params;
  const sp = await searchParams;

  const ro = (await db.repairOrder.findUnique({
    where: { id },
    select: { roNumber: true, user: { select: { name: true } } },
  })) as { roNumber: string | null; user: { name: string } | null } | null;
  if (!ro) notFound();

  const warehouses = await listWarehouses();
  const warehouseId = await resolveWarehouseId(sp.wh, warehouses);
  const lines = await getOpenPickLines(id, warehouseId);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Отбор"
        title={`Заказ-наряд ${ro.roNumber ?? ""}`}
        description={ro.user?.name ?? ""}
        backHref="/admin/warehouse/picking"
        backLabel="Отбор"
        actions={<WarehouseSwitcher warehouses={warehouses} current={warehouseId} />}
      />
      <PickBox repairOrderId={id} lines={lines} warehouseId={warehouseId} />
    </div>
  );
}
