export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { WarehouseOverview } from "@/components/admin/WarehouseOverview";
import { WarehouseScanBox } from "@/components/admin/WarehouseScanBox";
import { WarehouseMovementsFeed } from "@/components/admin/WarehouseMovementsFeed";
import { WarehouseLocationLookup } from "@/components/admin/WarehouseLocationLookup";
import { WarehouseLocationsAdmin } from "@/components/admin/WarehouseLocationsAdmin";

interface Props {
  searchParams: Promise<{ q?: string; page?: string; loc?: string }>;
}

export default async function WarehousePage({ searchParams }: Props) {
  const session = await requireRole(["ADMIN", "MANAGER", "WAREHOUSE_WORKER"]);
  const canManageLocations = session.permissionRole === "ADMIN" || session.permissionRole === "MANAGER";
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const loc = (sp.loc ?? "").trim();

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Запчасти" title="Склад" description="Остатки, сканирование и движения" />

      {/* Scan box — Task 4 */}
      <WarehouseScanBox />

      {/* Location lookup — Task 10 */}
      <WarehouseLocationLookup />

      {/* Location block/unblock admin — Phase 2.5 (admin/manager only) */}
      {canManageLocations && <WarehouseLocationsAdmin />}

      {/* Stock overview — Task 2 */}
      <WarehouseOverview q={q} page={page} loc={loc} />

      {/* Movements feed — Task 5 */}
      <WarehouseMovementsFeed />
    </div>
  );
}
