export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveFulfilmentTarget } from "@/lib/warehouse/resolve-fulfilment";
import { PageHeader } from "@/components/ui";
import { FulfilScanForm } from "@/components/admin/FulfilScanForm";

interface Props {
  searchParams: Promise<{ code?: string }>;
}

/**
 * Unified fulfilment entry: scan/type an order code → route to the right flow.
 * A PartShipment goes to packing, a RepairOrder to picking. Resolution + the
 * redirect run server-side (a plain GET form), so this works without client
 * server-action calls.
 */
export default async function FulfilPage({ searchParams }: Props) {
  await requireRole(["ADMIN", "MANAGER", "WAREHOUSE_WORKER"]);
  const { code } = await searchParams;

  let notFoundCode: string | null = null;
  if (code && code.trim()) {
    const target = await resolveFulfilmentTarget(db, code);
    if (target?.kind === "pack") redirect(`/admin/warehouse/packing/${target.id}`);
    if (target?.kind === "pick") redirect(`/admin/warehouse/picking/${target.id}`);
    notFoundCode = code.trim();
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Склад"
        title="Отбор / Упаковка"
        description="Отсканируйте или введите номер заказа"
        backHref="/admin/warehouse"
        backLabel="Склад"
      />
      <FulfilScanForm notFoundCode={notFoundCode} />
    </div>
  );
}
