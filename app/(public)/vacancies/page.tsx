export const dynamic = "force-dynamic";

import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { Markdown } from "@/components/shared/Markdown";
import { db } from "@/lib/db";
import { getCMSText, getCMSRichtext } from "@/lib/cms";
import { pageSeo } from "@/lib/seo";

export const metadata = pageSeo({
  title: "Вакансии в специализированном сервисе Mercedes-Benz G-Class",
  description:
    "Открытые вакансии специализированного сервиса Гелендвагена: мастера, механики, приёмщики. Работа с G-Class, достойная оплата и профессиональный коллектив.",
  path: "/vacancies",
  // Страница на 717 знаков и без единой контекстной ссылки: это HR-объявление,
  // а не ответ на поисковый запрос. В индекс не просится — она и не должна
  // конкурировать за внимание с услугами и статьями, а доля тонких страниц
  // тянет оценку домена вниз (41 исключённая из 113 на 31.08.2026).
  // Доступной остаётся: на неё ведёт меню, и по прямой ссылке она работает.
  noindex: true,
});

interface VacancyListItem {
  id: string;
  title: string;
  type: string;
  description: string;
  requirements: string[];
}

export default async function VacanciesPage(): Promise<React.ReactElement> {
  const [eyebrow, title, description, vacancies, ctaTitle, ctaBody, ctaButton] = await Promise.all([
    getCMSText("vacancies.eyebrow"),
    getCMSText("vacancies.title"),
    getCMSText("vacancies.description"),
    db.vacancy.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: { id: true, title: true, type: true, description: true, requirements: true },
    }) as Promise<VacancyListItem[]>,
    getCMSText("vacancies.cta.title"),
    getCMSRichtext("vacancies.cta.body"),
    getCMSText("vacancies.cta.button"),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        align="center"
        className="mb-12"
      />

      <div className="space-y-6 mb-12">
        {vacancies.length === 0 && (
          <div className="card text-center py-8">
            <p className="text-[var(--foreground-muted)]">Открытых вакансий пока нет</p>
          </div>
        )}
        {vacancies.map((vacancy) => (
          <div key={vacancy.id} className="card">
            <div className="flex items-start justify-between gap-4 mb-3">
              <h2 className="text-xl font-semibold">{vacancy.title}</h2>
              <span className="badge badge-silver text-xs shrink-0">{vacancy.type}</span>
            </div>
            <div className="text-[var(--foreground-muted)] mb-4">
              <Markdown source={vacancy.description} />
            </div>
            {vacancy.requirements.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">Требования:</h3>
                <ul className="text-sm text-[var(--foreground-muted)] list-disc list-inside space-y-1">
                  {vacancy.requirements.map((req, i) => (
                    <li key={i}>{req}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card text-center">
        <h3 className="font-semibold mb-2">{ctaTitle}</h3>
        <div className="text-sm text-[var(--foreground-muted)] mb-4">
          <Markdown source={ctaBody} />
        </div>
        <Link href="/contacts" className="btn btn-secondary text-sm">
          {ctaButton}
        </Link>
      </div>
    </div>
  );
}
