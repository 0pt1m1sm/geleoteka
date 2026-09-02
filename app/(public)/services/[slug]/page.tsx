export const dynamic = "force-dynamic";

import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { tenantDb } from "@/lib/tenant/scoped-db";
import { formatPrice } from "@/lib/utils";
import { pageSeo } from "@/lib/seo";
import { resolveModelSlug } from "@/lib/vehicle-catalog-types";
import { buildFaqJsonLd, buildServiceJsonLd } from "@/lib/seo-jsonld";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { FAQAccordion } from "@/components/shared/FAQAccordion";
import { Markdown } from "@/components/shared/Markdown";
import { normalizeFaq } from "@/lib/service-content";
import { postsForService } from "@/lib/models/related-content";

interface ServiceDetail {
  slug: string;
  name: string;
  description: string | null;
  body: string | null;
  faq: unknown;
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
  // Через шов изоляции: условие по арендатору добавляется само.
  const db = await tenantDb();
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

  const faq = normalizeFaq(service.faq);
  // Статьи по теме услуги: страница услуги отвечает «что делаем и почём»,
  // а статья — «почему так и что будет, если тянуть». Порознь это два
  // документа про одно и то же без единой ссылки друг на друга.
  const posts = await postsForService(slug);

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

      {service.body ? (
        <div className="card mb-8">
          <Markdown
            source={service.body}
            className="text-[var(--foreground-muted)] leading-relaxed space-y-4"
            components={{
              h2: (props) => (
                <h2
                  className="text-xl font-semibold text-[var(--foreground)] mt-6 first:mt-0"
                  {...props}
                />
              ),
              h3: (props) => (
                <h3 className="text-lg font-semibold text-[var(--foreground)] mt-4" {...props} />
              ),
              ul: (props) => <ul className="list-disc pl-5 space-y-1" {...props} />,
              ol: (props) => <ol className="list-decimal pl-5 space-y-1" {...props} />,
              strong: (props) => <strong className="text-[var(--foreground)]" {...props} />,
            }}
          />
        </div>
      ) : null}

      {faq.length > 0 ? (
        <div className="card mb-8">
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: buildFaqJsonLd(faq.map((i) => ({ question: i.q, answer: i.a }))),
            }}
          />
          <h2 className="text-lg font-semibold mb-4">Вопросы и ответы</h2>
          <FAQAccordion
            items={faq.map((i) => ({
              question: i.q,
              answerNode: (
                <p className="text-sm text-[var(--foreground-muted)] leading-relaxed pt-3">
                  {i.a}
                </p>
              ),
            }))}
          />
        </div>
      ) : null}

      {posts.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Разбираем подробно</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {posts.map((post) => (
              <Link key={post.slug} href={`/blog/${post.slug}`} className="card card-hover p-4">
                <p className="font-medium">{post.title}</p>
                {post.excerpt && (
                  <p className="text-sm text-[var(--foreground-muted)] mt-1">{post.excerpt}</p>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {service.applicableModels.length > 0 && (
        <div className="card mb-8">
          <h2 className="text-lg font-semibold mb-4">Применимые модели</h2>
          <div className="flex flex-wrap gap-2">
            {service.applicableModels.map((model: string) => {
              // applicableModels — свободный текст («AMG», «EQ», «C-Class»).
              // Наивная слагификация давала битые ссылки (/models/amg,
              // /models/eq → 404). resolveModelSlug возвращает реальный слаг
              // либо null для имён без страницы — на null рендерим текстом.
              const slug = resolveModelSlug(model);
              return slug ? (
                <Link
                  key={model}
                  href={`/models/${slug}`}
                  className="badge badge-silver hover:border-[var(--color-accent)] transition-colors"
                >
                  {model}
                </Link>
              ) : (
                <span key={model} className="badge badge-silver">
                  {model}
                </span>
              );
            })}
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
