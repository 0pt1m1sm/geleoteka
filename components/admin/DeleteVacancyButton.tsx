"use client";

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

  async function handleDelete() {
    if (!(await confirm({ message: `Удалить вакансию «${vacancyTitle}»? Действие необратимо.`, danger: true }))) return;
    try {
      await deleteVacancy(vacancyId);
      toast.success("Вакансия удалена");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось удалить вакансию");
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      className="text-xs text-[var(--color-error)] hover:underline shrink-0"
      title="Удалить вакансию"
    >
      Удалить
    </button>
  );
}
