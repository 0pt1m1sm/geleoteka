export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOpenPackLines } from "@/app/actions/packing";
import { PageHeader } from "@/components/ui";
import { PackBox } from "@/components/admin/PackBox";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PackingOrderPage({ params }: Props) {
  await requireRole(["ADMIN", "MANAGER", "WAREHOUSE_WORKER"]);
  const { id } = await params;

  const order = (await db.partShipment.findUnique({
    where: { id },
    select: { orderNumber: true, status: true, contactName: true },
  })) as { orderNumber: string | null; status: string; contactName: string } | null;
  if (!order) notFound();

  const lines = await getOpenPackLines(id);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Упаковка"
        title={`Заказ ${order.orderNumber ?? id.slice(0, 8)}`}
        description={`${order.contactName} · ${order.status}`}
        backHref="/admin/warehouse/packing"
        backLabel="Упаковка"
      />
      <PackBox orderId={id} lines={lines} />
    </div>
  );
}
