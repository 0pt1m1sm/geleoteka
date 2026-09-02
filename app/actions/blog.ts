"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant/scoped-db";
import { pingIndexNow } from "@/lib/indexnow";

/**
 * Статьи блога — инфо-кластер SEO («сколько стоит обслуживание гелендвагена»
 * и т.п.). Черновики видны только в админке; публикация — осознанный клик
 * владельца, поэтому каждый переход published фиксируется отдельным
 * blog.publish/blog.unpublish в журнале действий. В уведомления и аудит
 * попадают только slug и заголовок — без текста статьи.
 */

interface BlogFormData {
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  tags: string[];
  published: boolean;
}

function parseBlogFormData(formData: FormData): BlogFormData {
  const slug = ((formData.get("slug") as string) || "").trim().toLowerCase();
  const title = ((formData.get("title") as string) || "").trim();
  const excerpt = ((formData.get("excerpt") as string) || "").trim() || null;
  const content = ((formData.get("content") as string) || "").trim();
  const tags = ((formData.get("tags") as string) || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const published = formData.get("published") === "on";
  return { slug, title, excerpt, content, tags, published };
}

function validateBlogData(data: BlogFormData): string | null {
  if (!data.title) return "Заголовок обязателен";
  if (!data.slug) return "Slug обязателен";
  if (!/^[a-z0-9-]+$/.test(data.slug)) {
    return "Slug должен содержать только латиницу, цифры и дефисы";
  }
  if (!data.content) return "Текст статьи обязателен";
  return null;
}

function revalidateBlog(slug?: string): void {
  revalidatePath("/blog");
  if (slug) revalidatePath(`/blog/${slug}`);
  revalidatePath("/admin/blog");
}

export async function createBlogPost(
  _prevState: { error: string | null } | null,
  formData: FormData,
): Promise<{ error: string | null }> {
  // Через шов изоляции: арендатор проставляется в данные и в условие.
  const db = await tenantDb();
  const session = await requireRole(["ADMIN", "MANAGER"]);

  const data = parseBlogFormData(formData);
  const error = validateBlogData(data);
  if (error) return { error };

  let createdId: string;
  try {
    const created = (await db.blogPost.create({
      data: {
        slug: data.slug,
        title: data.title,
        excerpt: data.excerpt,
        content: data.content,
        tags: data.tags,
        authorId: session.id,
        published: data.published,
        publishedAt: data.published ? new Date() : null,
      },
      select: { id: true },
    })) as { id: string };
    createdId = created.id;
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { error: `Статья со slug «${data.slug}» уже существует` };
    }
    throw err;
  }

  await recordAudit({
    actor: session,
    action: "blog.create",
    targetType: "BlogPost",
    targetId: createdId,
    targetLabel: data.title,
    metadata: { slug: data.slug, published: data.published },
  });

  revalidateBlog(data.slug);
  if (data.published) await pingIndexNow(["/blog", `/blog/${data.slug}`]);
  redirect("/admin/blog");
}

export async function updateBlogPost(
  postId: string,
  _prevState: { error: string | null } | null,
  formData: FormData,
): Promise<{ error: string | null }> {
  // Через шов изоляции: арендатор проставляется в данные и в условие.
  const db = await tenantDb();
  const session = await requireRole(["ADMIN", "MANAGER"]);

  const data = parseBlogFormData(formData);
  const error = validateBlogData(data);
  if (error) return { error };

  const existing = (await db.blogPost.findUnique({
    where: { id: postId },
    select: { id: true, published: true, publishedAt: true, slug: true },
  })) as { id: string; published: boolean; publishedAt: Date | null; slug: string } | null;
  if (!existing) return { error: "Статья не найдена" };

  try {
    await db.blogPost.update({
      where: { id: postId },
      data: {
        slug: data.slug,
        title: data.title,
        excerpt: data.excerpt,
        content: data.content,
        tags: data.tags,
        published: data.published,
        // publishedAt ставится при ПЕРВОЙ публикации и дальше не трогается —
        // дата в выдаче не должна прыгать от каждой правки текста.
        publishedAt:
          data.published && !existing.publishedAt ? new Date() : existing.publishedAt,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { error: `Статья со slug «${data.slug}» уже существует` };
    }
    throw err;
  }

  const action =
    data.published === existing.published
      ? "blog.update"
      : data.published
        ? "blog.publish"
        : "blog.unpublish";
  await recordAudit({
    actor: session,
    action,
    targetType: "BlogPost",
    targetId: postId,
    targetLabel: data.title,
    metadata: { slug: data.slug },
  });

  revalidateBlog(data.slug);
  if (existing.slug !== data.slug) revalidatePath(`/blog/${existing.slug}`);
  if (data.published) await pingIndexNow(["/blog", `/blog/${data.slug}`]);
  redirect("/admin/blog");
}

export async function deleteBlogPost(postId: string): Promise<void> {
  // Через шов изоляции: арендатор проставляется в данные и в условие.
  const db = await tenantDb();
  const session = await requireRole(["ADMIN", "MANAGER"]);

  const existing = (await db.blogPost.findUnique({
    where: { id: postId },
    select: { slug: true, title: true },
  })) as { slug: string; title: string } | null;
  if (!existing) return;

  await db.blogPost.delete({ where: { id: postId } });

  await recordAudit({
    actor: session,
    action: "blog.delete",
    targetType: "BlogPost",
    targetId: postId,
    targetLabel: existing.title,
    metadata: { slug: existing.slug },
  });

  revalidateBlog(existing.slug);
  await pingIndexNow(["/blog"]);
}
