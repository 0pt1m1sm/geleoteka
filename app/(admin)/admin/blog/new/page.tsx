export const dynamic = "force-dynamic";

import { BlogPostForm } from "@/components/admin/BlogPostForm";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";

export default async function NewBlogPostPage() {
  await requireRole(["ADMIN", "MANAGER"]);
  return (
    <div>
      <PageHeader eyebrow="Статьи" title="Новая статья" />
      <BlogPostForm />
    </div>
  );
}
