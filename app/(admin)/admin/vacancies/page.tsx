export const dynamic = "force-dynamic";

import Link from "next/link";
import { Plus } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button, Card, PageHeader } from "@/components/ui";
import { DeleteVacancyButton } from "@/components/admin/DeleteVacancyButton";

interface VacancyRow {
  id: string;
  title: string;
  type: string;
  isActive: boolean;
  sortOrder: number;
  requirements: string[];
}

export default async function AdminVacanciesPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  const vacancies = (await db.vacancy.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      type: true,
      isActive: true,
      sortOrder: true,
      requirements: true,
    },
  })) as VacancyRow[];

  const activeCount = vacancies.filter((v) => v.isActive).length;

  return (
    <div>
      <PageHeader
        eyebrow="Вакансии"
        title="Открытые позиции"
        description={`Всего: ${vacancies.length} · Активных: ${activeCount}`}
        actions={
          <Link href="/admin/vacancies/new">
            <Button size="sm" leftIcon={<Plus size={14} />}>Добавить</Button>
          </Link>
        }
      />

      {vacancies.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--foreground-muted)] mb-4">Вакансий пока нет</p>
          <Link href="/admin/vacancies/new">
            <Button size="sm">Добавить первую</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {vacancies.map((v) => (
            <div
              key={v.id}
              className="card flex items-center justify-between gap-4"
            >
              <Link
                href={`/admin/vacancies/${v.id}`}
                className="flex-1 min-w-0 hover:opacity-80 transition-opacity"
              >
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium truncate">{v.title}</p>
                  {!v.isActive && (
                    <span className="badge text-[10px] bg-[var(--color-error-bg)] text-[var(--color-error)]">
                      Скрыта
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                  {v.type} · {v.requirements.length} требований · сорт. {v.sortOrder}
                </p>
              </Link>
              <DeleteVacancyButton vacancyId={v.id} vacancyTitle={v.title} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
