export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveModelsWithTrims } from "@/lib/vehicle-catalog";
import { PartEditForm } from "@/components/admin/PartEditForm";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditPartPage({ params }: Props) {
  await requireRole(["ADMIN", "MANAGER"]);
  const { id } = await params;

  const [part, categories, models] = await Promise.all([
    db.part.findUnique({
      where: { id },
      include: {
        partTrims: { select: { trimId: true } },
      },
    }),
    db.partCategory.findMany({ orderBy: { sortOrder: "asc" } }),
    getActiveModelsWithTrims(),
  ]);

  if (!part) notFound();

  const p = part as Record<string, unknown>;
  const partTrims = (p.partTrims as Array<{ trimId: string }>) ?? [];
  const serialized = {
    id: p.id as string,
    article: p.article as string,
    name: p.name as string,
    description: (p.description as string) ?? "",
    price: p.price as number,
    compareAtPrice: (p.compareAtPrice as number) ?? 0,
    quantity: p.quantity as number,
    isOEM: p.isOEM as boolean,
    isActive: p.isActive as boolean,
    categoryId: (p.categoryId as string) ?? "",
    trimIds: partTrims.map((pt) => pt.trimId),
    photos: ((p.photos as string[]) ?? []),
  };

  const cats = categories.map((c: Record<string, unknown>) => ({
    id: c.id as string,
    name: c.name as string,
  }));

  return (
    <div className="max-w-2xl">
      <h1 className="text-display text-2xl font-bold mb-6">Редактировать запчасть</h1>
      <PartEditForm part={serialized} categories={cats} models={models} />
    </div>
  );
}
