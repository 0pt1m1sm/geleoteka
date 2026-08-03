export const dynamic = "force-dynamic";

import Link from "next/link";

import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { pageSeo } from "@/lib/seo";

export const metadata = pageSeo({
  title: "Статьи об обслуживании Гелендвагена — советы сервиса",
  description:
    "Честные разборы от сервиса Гелендвагенов в Москве: сколько стоит обслуживание G-Class, типовые неисправности узлов W463, что проверять перед покупкой.",
  path: "/blog",
});

interface BlogListRow {
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: Date | null;
}

const DATE_FMT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default async function BlogListPage(): Promise<React.ReactElement> {
  // Пагинации нет намеренно: она понадобится ближе к полусотне статей, а
  // до того лишь удлиняет код. take(48) — предохранитель от бесконечной выдачи.
  const posts = (await db.blogPost.findMany({
    where: { published: true },
    orderBy: { publishedAt: "desc" },
    select: { slug: true, title: true, excerpt: true, publishedAt: true },
    take: 48,
  })) as BlogListRow[];

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <Breadcrumbs items={[{ name: "Главная", href: "/" }, { name: "Статьи" }]} />
      <PageHeader
        eyebrow="Блог"
        title="Статьи о Гелендвагене"
        description="Разборы стоимости владения, типовых неисправностей и правильного обслуживания G-Class — от мастеров, которые чинят их каждый день"
        align="center"
        className="mb-12"
      />

      {posts.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--foreground-muted)]">Статьи скоро появятся.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {posts.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`} className="card card-hover block">
              <h2 className="text-xl font-semibold mb-2 hover:text-[var(--color-accent)] transition-colors">
                {post.title}
              </h2>
              {post.excerpt ? (
                <p className="text-sm text-[var(--foreground-muted)] mb-3">{post.excerpt}</p>
              ) : null}
              {post.publishedAt ? (
                <time
                  dateTime={post.publishedAt.toISOString()}
                  className="text-xs text-[var(--foreground-muted)]"
                >
                  {DATE_FMT.format(post.publishedAt)}
                </time>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
