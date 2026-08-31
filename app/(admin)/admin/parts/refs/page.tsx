export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { expandGenerationCodes, normalizeOem } from "@/lib/part-reference";
import { Card, PageHeader } from "@/components/ui";
import { PartRefAddForm } from "@/components/admin/PartRefAddForm";
import { PartRefImportForm } from "@/components/admin/PartRefImportForm";
import { PartRefDeleteButton } from "@/components/admin/PartRefDeleteButton";
import {
  PartRefFilterBar,
  type ModelFilterOption,
} from "@/components/admin/PartRefFilterBar";

const PAGE_SIZE = 100;
/** Значение параметра group для позиций без группы. */
const NO_GROUP = "none";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

interface RefRow {
  id: string;
  oem: string;
  name: string;
  groupName: string | null;
  notes: string | null;
  fitments: Array<{ generation: { code: string } }>;
  parts: Array<{ id: string }>;
}

interface ModelRow {
  slug: string;
  name: string;
  generations: Array<{ code: string; yearFrom: number; yearTo: number | null }>;
}

const REF_SELECT = {
  id: true,
  oem: true,
  name: true,
  groupName: true,
  notes: true,
  fitments: { select: { generation: { select: { code: true } } } },
  // Только НОВЫЙ товар и детерминированный порядок — как в
  // app/actions/part-references.ts. Без этого ссылка «в магазине» вела бы в
  // произвольный вариант, а номенклатура с одним лишь б/у экземпляром
  // показывала бы «в магазине» и прятала «Создать товар» — новый товар для
  // неё было бы не завести из списка справочника вовсе.
  parts: { where: { condition: "NEW" }, select: { id: true }, orderBy: { createdAt: "asc" }, take: 1 },
} as const;

function RefCard({ r }: { r: RefRow }): React.ReactElement {
  const shopPartId = r.parts[0]?.id ?? null;
  const codes = r.fitments.map((f) => f.generation.code).sort();
  return (
    <div className="card flex items-center justify-between gap-4 py-3">
      <Link href={`/admin/parts/refs/${r.id}`} className="flex-1 min-w-0 group">
        <p className="font-medium truncate group-hover:text-[var(--color-accent)]">{r.name}</p>
        <p className="text-xs text-[var(--foreground-muted)] font-mono">
          {r.oem}
          {r.groupName && ` · ${r.groupName}`}
          {codes.length > 0 && ` · ${codes.join(", ")}`}
          {r.notes && ` · ${r.notes}`}
        </p>
      </Link>
      <div className="flex items-center gap-2 shrink-0">
        {shopPartId ? (
          <Link
            href={`/admin/parts/${shopPartId}`}
            className="badge bg-[var(--color-success-bg)] text-[var(--color-success)]"
          >
            в магазине
          </Link>
        ) : (
          // Оба пути и здесь: у номенклатуры чистого разбора нового товара нет
          // и не появится, а завести б/у экземпляр надо.
          <div className="flex gap-1">
            <Link
              href={`/admin/parts/new?ref=${r.id}&condition=USED`}
              className="btn btn-secondary btn-sm text-xs"
            >
              Б/у
            </Link>
            <Link
              href={`/admin/parts/new?ref=${r.id}`}
              className="btn btn-secondary btn-sm text-xs"
            >
              Создать товар
            </Link>
          </div>
        )}
        <PartRefDeleteButton id={r.id} name={r.name} />
      </div>
    </div>
  );
}

export default async function PartRefsPage({ searchParams }: Props) {
  await requireRole(["ADMIN", "MANAGER"]);

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const modelSlug = typeof sp.model === "string" ? sp.model.trim() : "";
  const gen = typeof sp.gen === "string" ? sp.gen.trim() : "";
  const group = typeof sp.group === "string" ? sp.group.trim() : "";
  const qOem = normalizeOem(q);

  const models = (await db.vehicleModel.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      slug: true,
      name: true,
      generations: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { code: true, yearFrom: true, yearTo: true },
      },
    },
  })) as ModelRow[];
  const selectedModel = models.find((m) => m.slug === modelSlug) ?? null;
  // Кузов вне выбранной модели не применяем (устаревшая ссылка/опечатка в URL).
  const genValid = gen !== "" && !!selectedModel?.generations.some((g) => g.code === gen);

  // Шаги 1–2: применяемость через fitments (с синонимами кода: W464↔W463A).
  const fitmentFilter = genValid
    ? {
        fitments: {
          some: { generation: { code: { in: expandGenerationCodes([gen]) } } },
        },
      }
    : selectedModel
      ? { fitments: { some: { generation: { model: { slug: selectedModel.slug } } } } }
      : {};

  // База фильтра — поиск + модель/кузов. Группа накладывается только на
  // список, чтобы чипсы агрегатов всегда показывали остальные варианты.
  const baseWhere = {
    ...(q
      ? {
          OR: [
            ...(qOem ? [{ oem: { contains: qOem, mode: "insensitive" as const } }] : []),
            { name: { contains: q, mode: "insensitive" as const } },
            { groupName: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...fitmentFilter,
  };
  const listWhere = {
    ...baseWhere,
    ...(group ? { groupName: group === NO_GROUP ? null : group } : {}),
  };

  const hasVehicleFilter = genValid || !!selectedModel;

  const [total, refs, groupCounts, noFitmentRefs] = await Promise.all([
    db.partReference.count({ where: listWhere }),
    db.partReference.findMany({
      where: listWhere,
      select: REF_SELECT,
      orderBy: [{ groupName: "asc" }, { name: "asc" }],
      take: PAGE_SIZE,
    }) as unknown as Promise<RefRow[]>,
    db.partReference.groupBy({
      by: ["groupName"],
      where: baseWhere,
      _count: { _all: true },
    }) as unknown as Promise<Array<{ groupName: string | null; _count: { _all: number } }>>,
    // Выбран автомобиль → отдельно показываем позиции, у которых применяемость
    // не заполнена: иначе они молча пропадают, а данные пока разреженные.
    hasVehicleFilter
      ? (db.partReference.findMany({
          where: {
            ...(q
              ? {
                  OR: [
                    ...(qOem ? [{ oem: { contains: qOem, mode: "insensitive" as const } }] : []),
                    { name: { contains: q, mode: "insensitive" as const } },
                    { groupName: { contains: q, mode: "insensitive" as const } },
                  ],
                }
              : {}),
            ...(group ? { groupName: group === NO_GROUP ? null : group } : {}),
            fitments: { none: {} },
          },
          select: REF_SELECT,
          orderBy: [{ groupName: "asc" }, { name: "asc" }],
          take: PAGE_SIZE,
        }) as unknown as Promise<RefRow[]>)
      : Promise.resolve([] as RefRow[]),
  ]);

  const groups = groupCounts
    .map((g) => ({
      key: g.groupName ?? NO_GROUP,
      label: g.groupName ?? "Без группы",
      count: g._count._all,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));
  const totalInBase = groups.reduce((sum, g) => sum + g.count, 0);
  const knownGroups = groups.filter((g) => g.key !== NO_GROUP).map((g) => g.label);
  // Выбранный агрегат мог занулиться в текущем срезе — селект всё равно должен
  // показывать его выбранным, а не молча съезжать на «Все агрегаты».
  if (group && !groups.some((g) => g.key === group)) {
    groups.push({ key: group, label: group === NO_GROUP ? "Без группы" : group, count: 0 });
  }

  const filterBarModels: ModelFilterOption[] = models.map((m) => ({
    slug: m.slug,
    name: m.name,
    generations: m.generations,
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Запчасти"
        title="Справочник номенклатуры"
        description="Подбор как в каталоге: модель → кузов → агрегат → позиция. Не товары: база номеров для смет и создания товаров."
        actions={
          <Link href="/admin/models" className="btn btn-secondary btn-sm">
            Модели и поколения
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <details className="card">
          <summary className="cursor-pointer select-none font-medium">Добавить позицию</summary>
          <div className="pt-4">
            <PartRefAddForm groups={knownGroups} />
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

      <div className="mb-4">
        <PartRefFilterBar
          models={filterBarModels}
          groups={groups}
          totalInBase={totalInBase}
          initial={{ model: selectedModel?.slug ?? "", gen: genValid ? gen : "", group, q }}
        />
      </div>

      {refs.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--foreground-muted)]">
            {q || hasVehicleFilter || group
              ? "По выбранным фильтрам ничего не найдено"
              : "Справочник пуст — импортируйте список или добавьте позицию"}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {refs.map((r) => (
            <RefCard key={r.id} r={r} />
          ))}
          {total > refs.length && (
            <p className="text-xs text-[var(--foreground-muted)] pt-2">
              Показаны первые {refs.length} из {total} — уточните фильтры.
            </p>
          )}
        </div>
      )}

      {noFitmentRefs.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer select-none text-sm text-[var(--foreground-muted)]">
            Ещё {noFitmentRefs.length} поз. без указанной применяемости — возможно, тоже подходят
          </summary>
          <div className="space-y-2 mt-3">
            {noFitmentRefs.map((r) => (
              <RefCard key={r.id} r={r} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
