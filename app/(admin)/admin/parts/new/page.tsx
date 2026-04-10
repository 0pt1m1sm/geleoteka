export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { PartForm } from "@/components/admin/PartForm";

export default async function NewPartPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  const categories = await db.partCategory.findMany({
    orderBy: { sortOrder: "asc" },
  });

  const cats = categories.map((c: Record<string, unknown>) => ({
    id: c.id as string,
    name: c.name as string,
  }));

  return (
    <div className="max-w-2xl">
      <h1 className="text-display text-2xl font-bold mb-6">Добавить запчасть</h1>
      <PartForm categories={cats} />
    </div>
  );
}
