export const dynamic = "force-dynamic";

import Link from "next/link";
import { Plus } from "lucide-react";

import { DeleteBlogPostButton } from "@/components/admin/DeleteBlogPostButton";
import { Card, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

interface PostRow {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  publishedAt: Date | null;
  updatedAt: Date;
}

const DATE_FMT = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" });

export default async function AdminBlogPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  const posts = (await db.blogPost.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      published: true,
      publishedAt: true,
      updatedAt: true,
    },
  })) as PostRow[];

  return (
    <div>
      <PageHeader
        eyebrow="Сайт"
        title="Статьи"
        actions={
          <Link href="/admin/blog/new" className="btn btn-primary">
            <Plus size={16} /> Новая статья
          </Link>
        }
      />

      {posts.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--foreground-muted)]">
            Статей пока нет. Черновики видны только здесь — на сайт попадают
            только опубликованные.
          </p>
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-[var(--border)]">
            {posts.map((post) => (
              <li key={post.id} className="flex items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/blog/${post.id}`}
                    className="font-medium hover:text-[var(--color-accent)] transition-colors"
                  >
                    {post.title}
                  </Link>
                  <p className="text-xs text-[var(--foreground-muted)] font-mono truncate">
                    /blog/{post.slug}
                  </p>
                </div>
                <span
                  className={`badge shrink-0 ${post.published ? "badge-success" : ""}`}
                >
                  {post.published
                    ? `Опубликована${post.publishedAt ? ` ${DATE_FMT.format(post.publishedAt)}` : ""}`
                    : "Черновик"}
                </span>
                {post.published ? (
                  <Link
                    href={`/blog/${post.slug}`}
                    className="text-xs text-[var(--foreground-muted)] hover:underline shrink-0"
                  >
                    Открыть
                  </Link>
                ) : null}
                <DeleteBlogPostButton postId={post.id} postTitle={post.title} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
