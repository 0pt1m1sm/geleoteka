"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteVacancy } from "@/app/actions/vacancies";
import { confirm } from "@/lib/ui/confirm";
import { toast } from "@/lib/ui/toast";

export function DeleteVacancyButton({
  vacancyId,
  vacancyTitle,
}: {
  vacancyId: string;
  vacancyTitle: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    void (async () => {
      if (!(await confirm({ message: `Удалить вакансию «${vacancyTitle}»? Действие необратимо.`, danger: true }))) return;
      startTransition(async () => {
        try {
          await deleteVacancy(vacancyId);
          toast.success("Вакансия удалена");
          router.refresh();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Не удалось удалить вакансию");
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
      title="Удалить вакансию"
    >
      Удалить
    </button>
  );
}
