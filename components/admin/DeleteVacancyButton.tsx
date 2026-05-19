"use client";

import { useRouter } from "next/navigation";
import { deleteVacancy } from "@/app/actions/vacancies";
import { confirm } from "@/lib/ui/confirm";

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
    await deleteVacancy(vacancyId);
    router.refresh();
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
