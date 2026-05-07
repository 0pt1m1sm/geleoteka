export const dynamic = "force-dynamic";

import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { Markdown } from "@/components/shared/Markdown";
import { getCMSText, getCMSRichtext, getCMSList } from "@/lib/cms";

export default async function VacanciesPage(): Promise<React.ReactElement> {
  const [eyebrow, title, description, items, ctaTitle, ctaBody, ctaButton] = await Promise.all([
    getCMSText("vacancies.eyebrow"),
    getCMSText("vacancies.title"),
    getCMSText("vacancies.description"),
    getCMSList("vacancies.items"),
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
        {items.map((vacancy, i) => (
          <div key={i} className="card">
            <div className="flex items-start justify-between gap-4 mb-3">
              <h2 className="text-xl font-semibold">{vacancy.title}</h2>
              <span className="badge badge-silver text-xs shrink-0">{vacancy.type}</span>
            </div>
            <div className="text-[var(--foreground-muted)] mb-4">
              <Markdown source={vacancy.description ?? ""} />
            </div>
            <div>
              <h3 className="text-sm font-medium mb-2">Требования:</h3>
              <div className="text-sm text-[var(--foreground-muted)]">
                <Markdown source={vacancy.requirements ?? ""} />
              </div>
            </div>
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
