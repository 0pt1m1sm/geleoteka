export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveModelsWithTrims } from "@/lib/vehicle-catalog";
import { PartForm } from "@/components/admin/PartForm";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function NewPartPage({ searchParams }: Props) {
  await requireRole(["ADMIN", "MANAGER"]);

  const sp = await searchParams;
  const refId = typeof sp.ref === "string" ? sp.ref : null;

  const [categories, models, ref] = await Promise.all([
    db.partCategory.findMany({ orderBy: { sortOrder: "asc" } }),
    getActiveModelsWithTrims(),
    refId
      ? db.partReference.findUnique({
          where: { id: refId },
          select: { oem: true, name: true },
        })
      : Promise.resolve(null),
  ]);

  const cats = categories.map((c: Record<string, unknown>) => ({
    id: c.id as string,
    name: c.name as string,
  }));
  const initial = ref
    ? { article: (ref as { oem: string }).oem, name: (ref as { name: string }).name }
    : undefined;

  return (
    <div className="max-w-2xl">
      <h1 className="text-display text-2xl font-bold mb-6">Добавить запчасть</h1>
      <PartForm categories={cats} models={models} initial={initial} />
    </div>
  );
}
