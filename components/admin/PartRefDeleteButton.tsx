"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useProgressRouter } from "@/components/shared/NavigationProgressProvider";
import { deletePartReference } from "@/app/actions/part-references";
import { confirm } from "@/lib/ui/confirm";
import { toast } from "@/lib/ui/toast";

export function PartRefDeleteButton({
  id,
  name,
  afterDeleteHref,
}: {
  id: string;
  name: string;
  /** Куда уйти после удаления (карточка позиции); без него — refresh списка. */
  afterDeleteHref?: string;
}): React.ReactElement {
  const router = useRouter();
  const nav = useProgressRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete(): void {
    startTransition(async () => {
      if (!(await confirm({ message: `Удалить «${name}» из справочника?` }))) return;
      const res = await deletePartReference(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (afterDeleteHref) {
        nav.push(afterDeleteHref);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      aria-label={`Удалить из справочника: ${name}`}
      className="p-1.5 rounded text-[var(--foreground-muted)] hover:text-[var(--color-error)] disabled:opacity-50"
    >
      <Trash2 size={14} aria-hidden />
    </button>
  );
}
