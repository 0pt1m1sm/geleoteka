export const dynamic = "force-dynamic";

import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Markdown } from "@/components/shared/Markdown";
import { db } from "@/lib/db";
import { pageSeo } from "@/lib/seo";
import { buildArticleJsonLd } from "@/lib/seo-jsonld";
import { generationsForPost, servicesForPost } from "@/lib/models/related-content";
import { formatPrice } from "@/lib/utils";

interface BlogPostRow {
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  publishedAt: Date | null;
  updatedAt: Date;
  tags: string[];
}

interface Props {
  params: Promise<{ slug: string }>;
}

/** Время чтения в минутах. 900 знаков в минуту — обычный темп для русского
 *  текста; округляем вверх, чтобы «1 мин» не обещала меньше, чем есть. */
function readingMinutes(content: string): number {
  return Math.max(1, Math.ceil(content.length / 900));
}

/** Shared with generateMetadata so the lookup runs once per request. */
const getPublishedPost = cache(async (slug: string): Promise<BlogPostRow | null> => {
  return (await db.blogPost.findFirst({
    where: { slug, published: true },
    select: {
      slug: true,
      title: true,
      excerpt: true,
      content: true,
      publishedAt: true,
      updatedAt: true,
      tags: true,
    },
  })) as BlogPostRow | null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) {
    return pageSeo({
      title: "Статья не найдена",
      description: "Запрошенная статья не найдена. Посмотрите другие материалы о Гелендвагене.",
      path: `/blog/${slug}`,
    });
  }
  return pageSeo({
    title: post.title,
    description:
      post.excerpt ??
      `${post.title} — разбор от сервиса Гелендвагенов Geleoteka в Москве.`,
    path: `/blog/${slug}`,
  });
}

const DATE_FMT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default async function BlogPostPage({ params }: Props): Promise<React.ReactElement> {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) notFound();
  // Кузова, упомянутые в тексте: читателю есть куда пойти за деталями и
  // ценами, а два документа про одно и то же перестают быть одинокими.
  // Услуги по теме статьи и кузова из текста — оба направления одной связи:
  // читатель дочитал про болячку и должен попасть к цене и к запчастям, а не
  // в тупик.
  const [generations, services] = await Promise.all([
    generationsForPost(post),
    servicesForPost(post),
  ]);


  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: buildArticleJsonLd({
            title: post.title,
            slug: post.slug,
            excerpt: post.excerpt,
            publishedAt: post.publishedAt,
            updatedAt: post.updatedAt,
          }),
        }}
      />
      <Breadcrumbs
        items={[
          { name: "Главная", href: "/" },
          { name: "Статьи", href: "/blog" },
          { name: post.title },
        ]}
      />

      <h1 className="text-display text-3xl sm:text-4xl font-bold mb-4">{post.title}</h1>
      {/* Дата и время чтения одной строкой. Время чтения — не украшение:
          оно отвечает на «сколько это займёт» до того, как человек начнёт
          скроллить, и снимает часть отказов «выглядит длинно, закрою». */}
      <p className="flex flex-wrap items-center gap-x-3 text-sm text-[var(--foreground-muted)] mb-6">
        {post.publishedAt ? (
          <time dateTime={post.publishedAt.toISOString()}>
            {DATE_FMT.format(post.publishedAt)}
          </time>
        ) : null}
        <span>{readingMinutes(post.content)} мин чтения</span>
      </p>

      {/* Ответ ПЕРЕД текстом, а не после него.
          Человек приходит из поиска с конкретным вопросом и решает за секунды,
          та ли это страница. Раньше он видел заголовок и сразу простыню, а
          короткий ответ (excerpt) не показывался вовсе, услуги и цены лежали
          внизу — куда при высоком показателе отказов никто не доходит. */}
      {post.excerpt && (
        <p className="text-lg leading-relaxed mb-6 border-l-2 border-[var(--color-accent)] pl-4">
          {post.excerpt}
        </p>
      )}

      {services.length > 0 && (
        <div className="card mb-8 py-4">
          <p className="text-xs uppercase tracking-wide text-[var(--foreground-muted)] mb-2">
            Что мы с этим делаем
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {services.map((svc) => (
              <Link
                key={svc.slug}
                href={`/services/${svc.slug}`}
                className="hover:text-[var(--color-accent)]"
              >
                {svc.name}
                {svc.priceMin ? (
                  <span className="text-[var(--foreground-muted)]">
                    {" "}
                    — от {formatPrice(svc.priceMin)}
                  </span>
                ) : null}
              </Link>
            ))}
            <Link href="/booking" className="btn btn-primary btn-sm">
              Записаться
            </Link>
          </div>
        </div>
      )}

      <Markdown
        source={post.content}
        className="text-[var(--foreground-muted)] leading-relaxed space-y-4"
        components={{
          h2: (props) => (
            <h2
              className="text-2xl font-semibold text-[var(--foreground)] mt-8 first:mt-0"
              {...props}
            />
          ),
          h3: (props) => (
            <h3 className="text-xl font-semibold text-[var(--foreground)] mt-6" {...props} />
          ),
          ul: (props) => <ul className="list-disc pl-5 space-y-1" {...props} />,
          ol: (props) => <ol className="list-decimal pl-5 space-y-1" {...props} />,
          strong: (props) => <strong className="text-[var(--foreground)]" {...props} />,
          a: (props) => (
            <a className="text-[var(--color-accent)] hover:underline" {...props} />
          ),
        }}
      />

      {generations.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xl font-semibold mb-3">Про эти кузова</h2>
          <div className="flex flex-wrap gap-2">
            {generations.map((g) => (
              <Link
                key={`${g.model.slug}-${g.code}`}
                href={`/models/${g.model.slug}/${g.code}`}
                className="card card-hover px-4 py-2 text-sm"
              >
                <span className="font-medium">
                  {g.model.name} {g.code}
                </span>
                <span className="text-[var(--foreground-muted)]">
                  {" "}
                  · {g.yearFrom}–{g.yearTo ?? "н.в."}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-12 card text-center">
        <p className="text-sm text-[var(--foreground-muted)] mb-4">
          Вопрос по вашему Гелендвагену? Покажем машину мастеру и назовём точную
          стоимость — запись онлайн.
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/booking" className="btn btn-primary">
            Записаться на сервис
          </Link>
          <Link href="/services" className="btn btn-secondary">
            Услуги и цены
          </Link>
        </div>
      </div>
    </div>
  );
}
