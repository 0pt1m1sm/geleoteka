export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveModelsWithTrims } from "@/lib/vehicle-catalog";
import { PartForm } from "@/components/admin/PartForm";

export default async function NewPartPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  const [categories, models] = await Promise.all([
    db.partCategory.findMany({ orderBy: { sortOrder: "asc" } }),
    getActiveModelsWithTrims(),
  ]);

  const cats = categories.map((c: Record<string, unknown>) => ({
    id: c.id as string,
    name: c.name as string,
  }));

  return (
    <div className="max-w-2xl">
      <h1 className="text-display text-2xl font-bold mb-6">Добавить запчасть</h1>
      <PartForm categories={cats} models={models} />
    </div>
  );
}
