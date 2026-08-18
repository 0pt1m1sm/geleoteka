export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeOem } from "@/lib/part-reference";
import { Card, PageHeader } from "@/components/ui";
import { PartRefAddForm } from "@/components/admin/PartRefAddForm";
import { PartRefImportForm } from "@/components/admin/PartRefImportForm";
import { PartRefDeleteButton } from "@/components/admin/PartRefDeleteButton";

const PAGE_SIZE = 100;

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

interface RefRow {
  id: string;
  oem: string;
  name: string;
  groupName: string | null;
  models: string[];
  source: string;
}

export default async function PartRefsPage({ searchParams }: Props) {
  await requireRole(["ADMIN", "MANAGER"]);

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const qOem = normalizeOem(q);

  const where = q
    ? {
        OR: [
          ...(qOem ? [{ oem: { contains: qOem, mode: "insensitive" as const } }] : []),
          { name: { contains: q, mode: "insensitive" as const } },
          { groupName: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [total, refs] = await Promise.all([
    db.partReference.count({ where }),
    db.partReference.findMany({
      where,
      select: { id: true, oem: true, name: true, groupName: true, models: true, source: true },
      orderBy: { name: "asc" },
      take: PAGE_SIZE,
    }) as Promise<RefRow[]>,
  ]);

  // Soft join c магазином: артикул товара = нормализованный номер справочника.
  const parts = refs.length
    ? ((await db.part.findMany({
        where: { article: { in: refs.map((r) => r.oem) } },
        select: { id: true, article: true },
      })) as Array<{ id: string; article: string }>)
    : [];
  const partByArticle = new Map(parts.map((p) => [p.article, p.id]));

  return (
    <div>
      <PageHeader
        eyebrow="Запчасти"
        title="Справочник номенклатуры"
        description={`Позиций: ${total}. Не товары — база номеров и названий для смет и создания товаров. Пополняется сама при добавлении товаров.`}
      />

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <details className="card">
          <summary className="cursor-pointer select-none font-medium">Добавить позицию</summary>
          <div className="pt-4">
            <PartRefAddForm />
          </div>
        </details>
        <details className="card">
          <summary className="cursor-pointer select-none font-medium">
            Импорт списком (прайс / EPC / 1С)
          </summary>
          <div className="pt-4">
            <PartRefImportForm />
          </div>
        </details>
      </div>

      <form method="get" className="mb-4 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Поиск по номеру, названию или группе"
          aria-label="Поиск по справочнику"
          className="input flex-1 max-w-md"
        />
        <button type="submit" className="btn btn-secondary">Найти</button>
      </form>

      {refs.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--foreground-muted)]">
            {q ? "По запросу ничего не найдено" : "Справочник пуст — импортируйте список или добавьте позицию"}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {refs.map((r) => {
            const shopPartId = partByArticle.get(r.oem) ?? null;
            return (
              <div key={r.id} className="card flex items-center justify-between gap-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{r.name}</p>
                  <p className="text-xs text-[var(--foreground-muted)] font-mono">
                    {r.oem}
                    {r.groupName && ` · ${r.groupName}`}
                    {r.models.length > 0 && ` · ${r.models.join(", ")}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {shopPartId ? (
                    <Link
                      href={`/admin/parts/${shopPartId}`}
                      className="badge bg-[var(--color-success-bg)] text-[var(--color-success)]"
                    >
                      в магазине
                    </Link>
                  ) : (
                    <Link
                      href={`/admin/parts/new?ref=${r.id}`}
                      className="btn btn-secondary btn-sm text-xs"
                    >
                      Создать товар
                    </Link>
                  )}
                  <PartRefDeleteButton id={r.id} name={r.name} />
                </div>
              </div>
            );
          })}
          {total > refs.length && (
            <p className="text-xs text-[var(--foreground-muted)] pt-2">
              Показаны первые {refs.length} из {total} — уточните поиск.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
