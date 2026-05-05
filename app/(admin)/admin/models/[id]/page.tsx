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
          include: {
            // Non-default trims only — admins manage these. The system-managed
            // default trim is created automatically and never shown here.
            trims: {
              where: { isDefault: false },
              orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
            },
          },
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
  type RawTrim = {
    id: string;
    code: string;
    bodyStyle: string | null;
    drivetrain: string | null;
    fuelType: "PETROL" | "DIESEL" | "ELECTRIC" | "HYBRID" | null;
    engineCode: string | null;
    displacementL: unknown;
    horsepower: number | null;
    notes: string | null;
    isActive: boolean;
  };
  const rawGenerations = m.generations as Array<{
    id: string;
    code: string;
    yearFrom: number;
    yearTo: number | null;
    isActive: boolean;
    trims: RawTrim[];
  }>;
  const generations = rawGenerations.map((g) => ({
    id: g.id,
    code: g.code,
    yearFrom: g.yearFrom,
    yearTo: g.yearTo,
    isActive: g.isActive,
    trims: g.trims.map((t) => ({
      id: t.id,
      code: t.code,
      bodyStyle: t.bodyStyle,
      drivetrain: t.drivetrain,
      fuelType: t.fuelType,
      engineCode: t.engineCode,
      displacementL:
        t.displacementL === null || t.displacementL === undefined ? null : String(t.displacementL),
      horsepower: t.horsepower,
      notes: t.notes,
      isActive: t.isActive,
    })),
  }));

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
