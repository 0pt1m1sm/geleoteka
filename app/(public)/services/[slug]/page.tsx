export const dynamic = "force-dynamic";

import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/utils";
import { pageSeo } from "@/lib/seo";
import { buildServiceJsonLd } from "@/lib/seo-jsonld";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";

interface ServiceDetail {
  slug: string;
  name: string;
  description: string | null;
  priceMin: number | null;
  priceMax: number | null;
  durationMinutes: number | null;
  applicableModels: string[];
}

interface Props {
  params: Promise<{ slug: string }>;
}

/** Shared with generateMetadata so the detail lookup runs once per request. */
const getServiceBySlug = cache(async (slug: string): Promise<ServiceDetail | null> => {
  return db.service.findUnique({ where: { slug } });
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);

  if (!service) {
    return pageSeo({
      title: "Услуга не найдена",
      description:
        "Запрошенная услуга не найдена. Посмотрите полный список услуг по ремонту и ТО Mercedes-Benz G-Class в сервисе Geleoteka.",
      path: `/services/${slug}`,
    });
  }

  // Title по семантическому ядру «услуга × гелендваген × москва × цена»:
  // латиница «g class ремонт» почти не ищется, народная форма — «гелендваген».
  const priceNote =
    service.priceMin != null ? ` Цены от ${formatPrice(service.priceMin)}.` : "";
  return pageSeo({
    title: `${service.name} Гелендвагена (G-Class) в Москве — цены и запись`,
    description:
      `${service.name} Mercedes-Benz G-Class (Гелендваген) в Москве. ` +
      `${service.description ?? "Работы любой сложности, оригинальные запчасти."}` +
      `${priceNote} Онлайн-запись в сервис Geleoteka.`,
    path: `/services/${slug}`,
  });
}

export default async function ServicePage({ params }: Props) {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);

  if (!service) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: buildServiceJsonLd({
            name: service.name,
            slug: service.slug,
            description: service.description,
            priceMin: service.priceMin,
            priceMax: service.priceMax,
          }),
        }}
      />
      <Breadcrumbs
        items={[
          { name: "Главная", href: "/" },
          { name: "Услуги", href: "/services" },
          { name: service.name },
        ]}
      />

      <h1 className="text-display text-4xl font-bold mb-4">{service.name}</h1>

      {(service.priceMin || service.priceMax) && (
        <div className="flex items-center gap-2 mb-8">
          <span className="text-2xl font-semibold text-[var(--color-accent)]">
            {service.priceMin && service.priceMax
              ? `${formatPrice(service.priceMin)} — ${formatPrice(service.priceMax)}`
              : service.priceMin
                ? `от ${formatPrice(service.priceMin)}`
                : `до ${formatPrice(service.priceMax!)}`}
          </span>
        </div>
      )}

      <div className="card mb-8">
        <p className="text-[var(--foreground-muted)] leading-relaxed text-lg">
          {service.description}
        </p>
      </div>

      {service.applicableModels.length > 0 && (
        <div className="card mb-8">
          <h2 className="text-lg font-semibold mb-4">Применимые модели</h2>
          <div className="flex flex-wrap gap-2">
            {service.applicableModels.map((model: string) => (
              <Link
                key={model}
                href={`/models/${model.toLowerCase().replace(/\s+/g, "-")}`}
                className="badge badge-silver hover:border-[var(--color-accent)] transition-colors"
              >
                {model}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-4">
        <Link href="/booking" className="btn btn-primary">
          Записаться на сервис
        </Link>
        <Link href="/services" className="btn btn-secondary">
          Все услуги
        </Link>
      </div>
    </div>
  );
}
