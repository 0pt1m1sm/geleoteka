export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { ModelEditForm } from "@/components/admin/ModelEditForm";
import { GenerationManager } from "@/components/admin/GenerationManager";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditModelPage({ params }: Props): Promise<React.ReactElement> {
  await requireRole(["ADMIN", "MANAGER"]);
  const { id } = await params;

  const [model, manufacturers] = await Promise.all([
    db.vehicleModel.findUnique({
      where: { id },
      include: {
        generations: {
          orderBy: [{ sortOrder: "asc" }, { yearFrom: "asc" }],
        },
      },
    }),
    db.manufacturer.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!model) notFound();

  const m = model as Record<string, unknown>;
  const initial = {
    id: m.id as string,
    slug: m.slug as string,
    name: m.name as string,
    description: (m.description as string) ?? "",
    engines: (m.engines as string) ?? "",
    features: (m.features as string[]) ?? [],
    manufacturerId: m.manufacturerId as string,
    isActive: m.isActive as boolean,
  };
  const generations = (m.generations as Array<{
    id: string;
    code: string;
    yearFrom: number;
    yearTo: number | null;
    isActive: boolean;
  }>);

  return (
    <div className="max-w-3xl">
      <nav className="mb-6 text-sm text-[var(--foreground-muted)]">
        <Link href="/admin/models" className="hover:text-[var(--foreground)]">
          ← Модели
        </Link>
      </nav>
      <h1 className="text-display text-2xl font-bold mb-6">
        {initial.name}
      </h1>

      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-4">Свойства модели</h2>
        <ModelEditForm mode="edit" initial={initial} manufacturers={manufacturers as Array<{ id: string; name: string }>} />
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Поколения</h2>
        <GenerationManager modelId={initial.id} generations={generations} />
      </div>
    </div>
  );
}
