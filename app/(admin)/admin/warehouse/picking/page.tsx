export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/auth";
import { listOrdersNeedingPicking } from "@/app/actions/picking";
import { PageHeader } from "@/components/ui";
import { PickingOrderList } from "@/components/admin/PickingOrderList";

export default async function PickingPage() {
  await requireRole(["ADMIN", "MANAGER", "WAREHOUSE_WORKER"]);
  const orders = await listOrdersNeedingPicking();

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Запчасти" title="Отбор" description="Отбор запчастей под заказ-наряды" backHref="/admin/warehouse" backLabel="Склад" />
      <PickingOrderList orders={orders} />
    </div>
  );
}
