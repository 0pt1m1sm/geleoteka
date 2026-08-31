export const dynamic = "force-dynamic";

import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { db } from "@/lib/db";
import { pageSeo } from "@/lib/seo";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { isGenerationIndexable } from "@/lib/models/index-policy";
import { LinkPending } from "@/components/shared/LinkPending";

interface Props {
  params: Promise<{ slug: string; code: string }>;
}

interface GenerationDetail {
  id: string;
  code: string;
  yearFrom: number;
  yearTo: number | null;
  description: string | null;
  commonIssues: string[];
  model: { name: string; slug: string };
  trims: Array<{ code: string; engineCode: string | null; bodyStyle: string | null; isDefault: boolean }>;
  partReferenceFitments: Array<{
    reference: { oem: string; name: string; groupName: string | null };
  }>;
}

/**
 * Код кузова в адресе — верхний регистр, только буквы и цифры: «w463a» и
 * «W463A» это один кузов, и двух адресов у него быть не должно.
 */
function normalizeCode(raw: string): string {
  try {
    return decodeURIComponent(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  } catch {
    return "";
  }
}

const getGeneration = cache(async (slug: string, code: string) => {
  return db.vehicleGeneration.findFirst({
    where: { code, isActive: true, model: { slug, isActive: true } },
    select: {
      id: true,
      code: true,
      yearFrom: true,
      yearTo: true,
      description: true,
      commonIssues: true,
      model: { select: { name: true, slug: true } },
      trims: {
        select: { code: true, engineCode: true, bodyStyle: true, isDefault: true },
        orderBy: { code: "asc" },
      },
      partReferenceFitments: {
        select: { reference: { select: { oem: true, name: true, groupName: true } } },
      },
    },
  });
});

/** Годы выпуска строкой. */
function years(g: { yearFrom: number; yearTo: number | null }): string {
  return `${g.yearFrom}–${g.yearTo ?? "н.в."}`;
}

/** Двигатели поколения: из комплектаций, без служебной «все варианты». */
function engines(g: GenerationDetail): string[] {
  const set = new Set<string>();
  for (const t of g.trims) {
    if (t.isDefault) continue;
    if (t.engineCode) set.add(t.engineCode);
  }
  return [...set].sort();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, code } = await params;
  const normalized = normalizeCode(code);
  const g = normalized ? ((await getGeneration(slug, normalized)) as GenerationDetail | null) : null;

  if (!g) {
    return pageSeo({
      title: "Поколение не найдено",
      description: "Такого кузова нет в каталоге Geleoteka.",
      path: `/models/${slug}/${code}`,
      noindex: true,
    });
  }

  const parts = g.partReferenceFitments.length;
  return pageSeo({
    title: `Mercedes-Benz ${g.model.name} ${g.code} (${years(g)}) — обслуживание и запчасти`,
    description:
      g.description ??
      `Mercedes-Benz ${g.model.name} ${g.code}, ${years(g)}. Обслуживание, ремонт и запчасти в Geleoteka.`,
    path: `/models/${g.model.slug}/${g.code}`,
    // Правило общее с картой сайта — см. lib/models/generation-index.ts.
    // Страница остаётся доступной в любом случае: каталог подбора ею
    // пользуется. Речь только о том, просить ли её в выдачу.
    noindex: !isGenerationIndexable({ description: g.description, partsCount: parts }),
  });
}

export default async function GenerationPage({ params }: Props) {
  const { slug, code } = await params;
  const normalized = normalizeCode(code);
  if (!normalized) notFound();

  // Написание кузова приводим к каноническому: иначе у одной страницы
  // появляется столько адресов, сколько способов её набрать.
  if (normalized !== code) permanentRedirect(`/models/${slug}/${normalized}`);

  const g = (await getGeneration(slug, normalized)) as GenerationDetail | null;
  if (!g) notFound();

  const engineList = engines(g);
  // Детали этого кузова, сгруппированные по узлу: список из трёхсот строк
  // подряд нечитаем, а по группам он превращается в оглавление.
  const byGroup = new Map<string, Array<{ oem: string; name: string }>>();
  for (const f of g.partReferenceFitments) {
    const key = f.reference.groupName ?? "Прочее";
    const arr = byGroup.get(key) ?? [];
    arr.push({ oem: f.reference.oem, name: f.reference.name });
    byGroup.set(key, arr);
  }
  const groups = [...byGroup.entries()]
    .map(([name, items]) => ({
      name,
      items: items.sort((a, b) => a.name.localeCompare(b.name, "ru")),
    }))
    .sort((a, b) => b.items.length - a.items.length);

  return (
    <div className="container-page py-8">
      <Breadcrumbs
        items={[
          { name: "Главная", href: "/" },
          { name: "Модели", href: "/models" },
          { name: g.model.name, href: `/models/${g.model.slug}` },
          { name: g.code },
        ]}
      />

      <p className="text-xs uppercase tracking-wide text-[var(--foreground-muted)] mb-1">
        Mercedes-Benz {g.model.name}
      </p>
      <h1 className="text-2xl sm:text-3xl font-bold mb-1">
        {g.code} <span className="text-[var(--foreground-muted)]">· {years(g)}</span>
      </h1>

      {g.description && <p className="mt-4 max-w-3xl">{g.description}</p>}

      {engineList.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-2">Двигатели</h2>
          <p className="text-sm text-[var(--foreground-muted)]">{engineList.join(", ")}</p>
        </div>
      )}

      {g.commonIssues.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-2">Слабые места</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm max-w-3xl">
            {g.commonIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {groups.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-3">
            Запчасти для {g.code} · {g.partReferenceFitments.length}
          </h2>
          <div className="space-y-5">
            {groups.map((grp) => (
              <div key={grp.name}>
                <h3 className="text-sm uppercase tracking-wide text-[var(--foreground-muted)] mb-2">
                  {grp.name} · {grp.items.length}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {grp.items.map((it) => (
                    <Link
                      key={it.oem}
                      href={`/parts/oem/${it.oem}`}
                      className="badge text-xs hover:text-[var(--color-accent)]"
                      title={it.name}
                    >
                      {it.name}
                      <LinkPending />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/booking" className="btn btn-primary">
          Записаться на сервис
          <LinkPending />
        </Link>
        <Link href={`/models/${g.model.slug}`} className="btn btn-secondary">
          Все поколения {g.model.name}
          <LinkPending />
        </Link>
      </div>
    </div>
  );
}
