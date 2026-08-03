export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";

import { BlogPostForm } from "@/components/admin/BlogPostForm";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

interface Props {
  params: Promise<{ id: string }>;
}

interface PostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  tags: string[];
  published: boolean;
}

export default async function EditBlogPostPage({ params }: Props) {
  await requireRole(["ADMIN", "MANAGER"]);
  const { id } = await params;

  const post = (await db.blogPost.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      content: true,
      tags: true,
      published: true,
    },
  })) as PostRow | null;

  if (!post) notFound();

  return (
    <div>
      <PageHeader eyebrow="Статьи" title={post.title} />
      <BlogPostForm initial={post} />
    </div>
  );
}
