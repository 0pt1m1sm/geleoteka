export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { VacancyForm } from "@/components/admin/VacancyForm";

interface Props {
  params: Promise<{ id: string }>;
}

interface VacancyRow {
  id: string;
  title: string;
  type: string;
  description: string;
  requirements: string[];
  isActive: boolean;
  sortOrder: number;
}

export default async function EditVacancyPage({ params }: Props) {
  await requireRole(["ADMIN", "MANAGER"]);
  const { id } = await params;

  const vacancy = (await db.vacancy.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      type: true,
      description: true,
      requirements: true,
      isActive: true,
      sortOrder: true,
    },
  })) as VacancyRow | null;

  if (!vacancy) notFound();

  return (
    <div>
      <PageHeader eyebrow="Вакансии" title={vacancy.title} />
      <VacancyForm initial={vacancy} />
    </div>
  );
}
