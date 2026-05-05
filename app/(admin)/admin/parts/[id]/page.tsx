export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveModels } from "@/lib/vehicle-catalog";
import { PartEditForm } from "@/components/admin/PartEditForm";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditPartPage({ params }: Props) {
  await requireRole(["ADMIN", "MANAGER"]);
  const { id } = await params;

  const [part, categories, models] = await Promise.all([
    db.part.findUnique({ where: { id } }),
    db.partCategory.findMany({ orderBy: { sortOrder: "asc" } }),
    getActiveModels(),
  ]);

  if (!part) notFound();

  const p = part as Record<string, unknown>;
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
    compatibleModels: (p.compatibleModels as string[]).join(", "),
  };

  const cats = categories.map((c: Record<string, unknown>) => ({
    id: c.id as string,
    name: c.name as string,
  }));
  const modelNames = models.map((m) => m.name);

  return (
    <div className="max-w-2xl">
      <h1 className="text-display text-2xl font-bold mb-6">Редактировать запчасть</h1>
      <PartEditForm part={serialized} categories={cats} modelNames={modelNames} />
    </div>
  );
}
