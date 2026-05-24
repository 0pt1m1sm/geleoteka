export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOpenPickLines } from "@/app/actions/picking";
import { PageHeader } from "@/components/ui";
import { PickBox } from "@/components/admin/PickBox";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PickingOrderPage({ params }: Props) {
  await requireRole(["ADMIN", "MANAGER", "WAREHOUSE_WORKER"]);
  const { id } = await params;

  const ro = (await db.repairOrder.findUnique({
    where: { id },
    select: { roNumber: true, user: { select: { name: true } } },
  })) as { roNumber: string | null; user: { name: string } | null } | null;
  if (!ro) notFound();

  const lines = await getOpenPickLines(id);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Отбор"
        title={`Заказ-наряд ${ro.roNumber ?? ""}`}
        description={ro.user?.name ?? ""}
      />
      <PickBox repairOrderId={id} lines={lines} />
    </div>
  );
}
