"use client";

import { useRouter } from "next/navigation";

import { deleteBlogPost } from "@/app/actions/blog";
import { confirm } from "@/lib/ui/confirm";
import { toast } from "@/lib/ui/toast";

export function DeleteBlogPostButton({
  postId,
  postTitle,
}: {
  postId: string;
  postTitle: string;
}) {
  const router = useRouter();

  async function handleDelete() {
    if (
      !(await confirm({
        message: `Удалить статью «${postTitle}»? Действие необратимо.`,
        danger: true,
      }))
    )
      return;
    await deleteBlogPost(postId);
    toast.success("Статья удалена");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      className="text-xs text-[var(--color-error)] hover:underline shrink-0"
      title="Удалить статью"
    >
      Удалить
    </button>
  );
}
