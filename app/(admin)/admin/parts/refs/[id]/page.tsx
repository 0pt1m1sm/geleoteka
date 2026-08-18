export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui";
import { PartRefDeleteButton } from "@/components/admin/PartRefDeleteButton";

interface Props {
  params: Promise<{ id: string }>;
}

interface RefDetail {
  id: string;
  oem: string;
  name: string;
  brand: string;
  groupName: string | null;
  notes: string | null;
  source: string;
  createdAt: Date;
  fitments: Array<{
    generation: {
      code: string;
      yearFrom: number;
      yearTo: number | null;
      model: { name: string; slug: string };
    };
  }>;
  parts: Array<{ id: string; name: string; price: number; isActive: boolean }>;
}

const SOURCE_LABELS: Record<string, string> = {
  shop: "создана из товара магазина",
  import: "импорт списком / сид",
  manual: "добавлена вручную",
};

export default async function PartRefDetailPage({ params }: Props) {
  await requireRole(["ADMIN", "MANAGER"]);
  const { id } = await params;

  const ref = (await db.partReference.findUnique({
    where: { id },
    select: {
      id: true,
      oem: true,
      name: true,
      brand: true,
      groupName: true,
      notes: true,
      source: true,
      createdAt: true,
      fitments: {
        select: {
          generation: {
            select: {
              code: true,
              yearFrom: true,
              yearTo: true,
              model: { select: { name: true, slug: true } },
            },
          },
        },
      },
      parts: {
        select: { id: true, name: true, price: true, isActive: true },
      },
    },
  })) as RefDetail | null;

  if (!ref) notFound();

  const estimateUseCount = (await db.estimateLine.count({
    where: { referenceId: ref.id },
  })) as number;

  const fitments = [...ref.fitments].sort((a, b) =>
    a.generation.code.localeCompare(b.generation.code),
  );

  return (
    <div className="max-w-2xl">
      <PageHeader
        eyebrow="Справочник номенклатуры"
        title={ref.name}
        description={`${ref.brand} · каталожное название`}
        actions={
          <Link href="/admin/parts/refs" className="btn btn-secondary btn-sm">
            ← К справочнику
          </Link>
        }
      />

      <Card className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--foreground-muted)] mb-1">
              Номер (OEM)
            </p>
            <p className="font-mono text-lg select-all">{ref.oem}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--foreground-muted)] mb-1">
              Группа / агрегат
            </p>
            <p>{ref.groupName ?? "Без группы"}</p>
          </div>
        </div>

        {ref.notes && (
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--foreground-muted)] mb-1">
              Уточнение
            </p>
            <p className="text-sm">{ref.notes}</p>
          </div>
        )}

        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--foreground-muted)] mb-2">
            Применяемость
          </p>
          {fitments.length === 0 ? (
            <p className="text-sm text-[var(--foreground-muted)]">
              Не указана — позиция универсальная или применяемость ещё не заполнена.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {fitments.map((f) => (
                <Link
                  key={f.generation.code}
                  href={`/admin/parts/refs?model=${f.generation.model.slug}&gen=${encodeURIComponent(f.generation.code)}`}
                  className="badge"
                >
                  {f.generation.model.name} · {f.generation.code} ·{" "}
                  {f.generation.yearFrom}–{f.generation.yearTo ?? "н.в."}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--foreground-muted)] mb-1">
              Происхождение
            </p>
            <p className="text-sm">{SOURCE_LABELS[ref.source] ?? ref.source}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--foreground-muted)] mb-1">
              В сметах
            </p>
            <p className="text-sm">
              {estimateUseCount > 0 ? `${estimateUseCount} строк(и)` : "не использовалась"}
            </p>
          </div>
        </div>
      </Card>

      <Card className="mt-4 space-y-3">
        <p className="text-xs uppercase tracking-wide text-[var(--foreground-muted)]">
          {ref.parts.length > 1 ? `Товары магазина · ${ref.parts.length}` : "Товар магазина"}
        </p>
        {ref.parts.length > 0 ? (
          <div className="divide-y divide-[var(--border)]">
            {ref.parts.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="font-medium truncate">{p.name}</p>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    {formatPrice(p.price)}
                    {!p.isActive && " · скрыт с витрины"}
                  </p>
                </div>
                <Link href={`/admin/parts/${p.id}`} className="btn btn-secondary btn-sm shrink-0">
                  Открыть товар
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-[var(--foreground-muted)]">
              Товара с этим номером в магазине ещё нет.
            </p>
            <Link href={`/admin/parts/new?ref=${ref.id}`} className="btn btn-primary btn-sm shrink-0">
              Создать товар
            </Link>
          </div>
        )}
      </Card>

      <div className="mt-6 flex justify-end">
        <PartRefDeleteButton id={ref.id} name={ref.name} afterDeleteHref="/admin/parts/refs" />
      </div>
    </div>
  );
}
