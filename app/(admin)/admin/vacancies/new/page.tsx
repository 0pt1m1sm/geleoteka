import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { VacancyForm } from "@/components/admin/VacancyForm";

export default async function NewVacancyPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  return (
    <div>
      <PageHeader eyebrow="Вакансии" title="Новая вакансия" />
      <VacancyForm />
    </div>
  );
}
