export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { generationLabel } from "@/lib/vehicle-catalog";

interface ModelRow {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  manufacturer: { name: string };
  generations: Array<{ id: string; code: string; yearFrom: number; yearTo: number | null; isActive: boolean }>;
}

export default async function AdminModelsPage(): Promise<React.ReactElement> {
  await requireRole(["ADMIN", "MANAGER"]);

  const models = (await db.vehicleModel.findMany({
    orderBy: [{ manufacturerId: "asc" }, { sortOrder: "asc" }],
    include: {
      manufacturer: { select: { name: true } },
      generations: {
        orderBy: [{ sortOrder: "asc" }, { yearFrom: "asc" }],
        select: { id: true, code: true, yearFrom: true, yearTo: true, isActive: true },
      },
    },
  })) as ModelRow[];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-display text-2xl font-bold">Модели и поколения</h1>
        <Link href="/admin/models/new" className="btn btn-primary text-sm">
          + Новая модель
        </Link>
      </div>

      <p className="text-sm text-[var(--foreground-muted)] mb-6">
        Каталог автомобилей, доступных в выпадающих списках бронирования и каталога запчастей. Модель = марка и название (например, Mercedes-Benz G-Class). Поколение = шасси-код и годы выпуска (например, W463A, 2018–н.в.).
      </p>

      <div className="space-y-3">
        {models.map((model) => (
          <Link
            key={model.id}
            href={`/admin/models/${model.id}`}
            className="card card-hover block"
          >
            <div className="flex items-start justify-between gap-4 mb-2">
              <div>
                <h2 className="font-semibold">
                  {model.manufacturer.name} {model.name}
                  {!model.isActive && (
                    <span className="ml-2 text-[10px] font-mono uppercase text-[var(--foreground-muted)]">
                      [скрыта]
                    </span>
                  )}
                </h2>
                <p className="text-xs text-[var(--foreground-muted)] font-mono mt-0.5">
                  {model.slug}
                </p>
              </div>
              <span className="text-xs text-[var(--color-accent)]">Изменить →</span>
            </div>
            {model.generations.length > 0 && (
              <ul className="flex flex-wrap gap-1.5 mt-3">
                {model.generations.map((g) => (
                  <li
                    key={g.id}
                    className={`badge text-[10px] font-mono ${g.isActive ? "badge-silver" : "badge-silver opacity-50"}`}
                  >
                    {generationLabel(g)}
                  </li>
                ))}
              </ul>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
