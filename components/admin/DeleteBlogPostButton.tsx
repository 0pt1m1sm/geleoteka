"use client";

import { useTransition } from "react";
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
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    void (async () => {
      if (
        !(await confirm({
          message: `Удалить статью «${postTitle}»? Действие необратимо.`,
          danger: true,
        }))
      )
        return;
      startTransition(async () => {
        try {
          await deleteBlogPost(postId);
          toast.success("Статья удалена");
          router.refresh();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Не удалось удалить статью");
        }
      });
    })();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      className="text-xs text-[var(--color-error)] hover:underline shrink-0 disabled:opacity-50"
      title="Удалить статью"
    >
      Удалить
    </button>
  );
}
