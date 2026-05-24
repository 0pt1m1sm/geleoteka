export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { TENANT_KEY } from "@/lib/wms-host";
import { listCountSessions } from "@/lib/wms/public";
import { PageHeader } from "@/components/ui";
import { StocktakeNewSession } from "@/components/admin/StocktakeNewSession";
import { StocktakeSessionList } from "@/components/admin/StocktakeSessionList";

export default async function StocktakePage() {
  await requireRole(["ADMIN", "MANAGER", "WAREHOUSE_WORKER"]);
  const sessions = await listCountSessions(db, TENANT_KEY);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Запчасти" title="Инвентаризация" description="Пересчёт остатков по ячейкам" />
      <StocktakeNewSession />
      <StocktakeSessionList sessions={sessions} />
    </div>
  );
}
