export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { getReorderReport } from "@/app/actions/replenishment";
import { ReplenishmentReport } from "@/components/admin/ReplenishmentReport";

export default async function ReplenishmentPage() {
  await requireRole(["ADMIN", "MANAGER"]);
  const rows = await getReorderReport();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Запчасти"
        title="Дозаказ"
        description="Позиции, опустившиеся до точки дозаказа"
        backHref="/admin/warehouse"
        backLabel="Склад"
      />
      <ReplenishmentReport rows={rows} />
    </div>
  );
}
