export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { ModelEditForm } from "@/components/admin/ModelEditForm";

export default async function NewModelPage(): Promise<React.ReactElement> {
  await requireRole(["ADMIN", "MANAGER"]);

  const manufacturers = (await db.manufacturer.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  })) as Array<{ id: string; name: string }>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-display text-2xl font-bold mb-6">Новая модель</h1>
      <ModelEditForm mode="create" manufacturers={manufacturers} />
    </div>
  );
}
