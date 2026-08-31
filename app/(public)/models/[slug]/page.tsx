export const dynamic = "force-dynamic";

import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getModelBySlug, generationLabel } from "@/lib/vehicle-catalog";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/utils";
import { pageSeo } from "@/lib/seo";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { LinkPending } from "@/components/shared/LinkPending";
import { isModelIndexable } from "@/lib/models/index-policy";

interface Props {
  params: Promise<{ slug: string }>;
}

/** Shared with generateMetadata so the detail lookup runs once per request. */
const getCachedModelBySlug = cache(getModelBySlug);

/** Сколько позиций справочника привязано к поколениям этой модели. Нужен для
 *  решения об индексации — см. lib/models/index-policy.ts. */
const countModelParts = cache(async (slug: string): Promise<number> => {
  return (await db.partReferenceFitment.count({
    where: { generation: { model: { slug } } },
  })) as number;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const model = await getCachedModelBySlug(slug);

  if (!model) {
    return pageSeo({
      title: "Модель не найдена",
      description:
        "Запрошенная модель не найдена. Посмотрите полный каталог поколений Mercedes-Benz G-Class в сервисе Geleoteka.",
      path: `/models/${slug}`,
    });
  }

  return pageSeo({
    title: `Mercedes-Benz ${model.name} — обслуживание и ремонт в Москве`,
    description:
      model.description ??
      `Mercedes-Benz ${model.name}: поколения, двигатели, особенности и услуги сервиса для этого автомобиля в Geleoteka.`,
    path: `/models/${slug}`,
    // Модель без своего содержания — шаблон: название, годы поколений и тот же
    // прайс, что у соседа. Из 35 страниц моделей Яндекс исключил 16 именно
    // поэтому. Страница остаётся доступной, в выдачу не просится; сказать
    // «обслуживаем весь модельный ряд» есть кому — у раздела /models своя
    // страница на 4600 знаков.
    noindex: !isModelIndexable({
      description: model.description ?? null,
      partsCount: await countModelParts(slug),
    }),
  });
}

export default async function ModelPage({ params }: Props): Promise<React.ReactElement> {
  const { slug } = await params;
  const model = await getCachedModelBySlug(slug);

  if (!model) notFound();

  const services: Array<{ id: string; slug: string; name: string; priceMin: number | null }> =
    await db.service.findMany({
      where: { applicableModels: { has: model.name } },
      orderBy: { name: "asc" },
      select: { id: true, slug: true, name: true, priceMin: true },
    });

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <Breadcrumbs
        items={[
          { name: "Главная", href: "/" },
          { name: "Модели", href: "/models" },
          { name: model.name },
        ]}
      />

      <h1 className="text-display text-4xl font-bold mb-3">
        Mercedes-Benz {model.name}
      </h1>
      <ul className="flex flex-wrap gap-2 mb-8">
        {model.generations.map((g) => (
          <li key={g.code} className="badge badge-silver text-xs font-mono">
            {generationLabel(g)}
          </li>
        ))}
      </ul>

      {model.description && (
        <div className="card mb-8">
          <p className="text-[var(--foreground-muted)] leading-relaxed text-lg">
            {model.description}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="card">
          <h3 className="text-sm font-medium text-[var(--foreground-muted)] mb-2">
            Поколения
          </h3>
          {/* Ссылки, а не текст: у каждого кузова своя страница с болячками
              и запчастями именно под него, и спрос в поиске идёт по кузову
              («слабые места W463»), а не по модели вообще. */}
          <ul className="space-y-1">
            {model.generations.map((g) => (
              <li key={g.code} className="text-sm font-medium">
                <Link
                  href={`/models/${model.slug}/${g.code}`}
                  className="hover:text-[var(--color-accent)]"
                >
                  {generationLabel(g)}
                  <LinkPending />
                </Link>
              </li>
            ))}
          </ul>
        </div>
        {model.engines && (
          <div className="card">
            <h3 className="text-sm font-medium text-[var(--foreground-muted)] mb-2">
              Двигатели
            </h3>
            <p className="text-sm font-medium">{model.engines}</p>
          </div>
        )}
      </div>

      {model.features.length > 0 && (
        <div className="card mb-8">
          <h2 className="text-lg font-semibold mb-4">Особенности</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {model.features.map((feature) => (
              <li
                key={feature}
                className="flex items-center gap-3 text-[var(--foreground-muted)] text-sm"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shrink-0" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      )}

      {services.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">
            Услуги для {model.name}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {services.map((service) => (
              <Link
                key={service.id}
                href={`/services/${service.slug}`}
                className="card card-hover group"
              >
                <h3 className="font-medium group-hover:text-[var(--color-accent)] transition-colors">
                  {service.name}
                </h3>
                {service.priceMin && (
                  <p className="text-sm text-[var(--color-accent)] mt-1">
                    от {formatPrice(service.priceMin)}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <Link href="/booking" className="btn btn-primary flex-1 text-center">
          Записаться на сервис
        </Link>
        <Link
          href={`/parts?model=${encodeURIComponent(model.name)}`}
          className="btn btn-secondary flex-1 text-center"
        >
          Запчасти для {model.name}
        </Link>
      </div>
    </div>
  );
}
