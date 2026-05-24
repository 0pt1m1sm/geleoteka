export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/auth";
import { listOrdersNeedingPacking } from "@/app/actions/packing";
import { PageHeader } from "@/components/ui";
import { PackingOrderList } from "@/components/admin/PackingOrderList";

export default async function PackingPage() {
  await requireRole(["ADMIN", "MANAGER", "WAREHOUSE_WORKER"]);
  const orders = await listOrdersNeedingPacking();

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Запчасти" title="Упаковка" description="Упаковка и отгрузка заказов запчастей" />
      <PackingOrderList orders={orders} />
    </div>
  );
}
