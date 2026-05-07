import Link from "next/link";
import { PageHeader } from "@/components/ui";

const VACANCIES = [
  {
    title: "Автомеханик (G-Class)",
    type: "Полная занятость",
    description:
      "Ремонт и обслуживание Mercedes-Benz G-Class. Опыт работы от 3 лет. Знание STAR Diagnostics — преимущество.",
    requirements: [
      "Опыт ремонта Mercedes от 3 лет",
      "Знание подвески, двигателей, трансмиссий",
      "Готовность к обучению",
    ],
  },
  {
    title: "Автоэлектрик",
    type: "Полная занятость",
    description:
      "Диагностика и ремонт электрических систем Mercedes-Benz. COMAND, MBUX, системы помощи водителю.",
    requirements: [
      "Опыт работы с электрикой Mercedes",
      "Знание CAN/LIN шин",
      "Умение работать с STAR Diagnostics",
    ],
  },
  {
    title: "Сервисный консультант",
    type: "Полная занятость",
    description:
      "Приём клиентов, оформление заказ-нарядов, контроль качества обслуживания. Опыт в автосервисе приветствуется.",
    requirements: [
      "Коммуникабельность и клиентоориентированность",
      "Опыт в автосервисе от 1 года",
      "Знание модельного ряда Mercedes — плюс",
    ],
  },
];

export default function VacanciesPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Карьера"
        title="Вакансии"
        description="Присоединяйтесь к команде Geleoteka — работайте с лучшими автомобилями в мире"
        align="center"
        className="mb-12"
      />

      <div className="space-y-6 mb-12">
        {VACANCIES.map((vacancy, i) => (
          <div key={i} className="card">
            <div className="flex items-start justify-between gap-4 mb-3">
              <h2 className="text-xl font-semibold">{vacancy.title}</h2>
              <span className="badge badge-silver text-xs shrink-0">
                {vacancy.type}
              </span>
            </div>
            <p className="text-[var(--foreground-muted)] mb-4">
              {vacancy.description}
            </p>
            <div>
              <h3 className="text-sm font-medium mb-2">Требования:</h3>
              <ul className="space-y-1">
                {vacancy.requirements.map((req, j) => (
                  <li
                    key={j}
                    className="flex items-center gap-2 text-sm text-[var(--foreground-muted)]"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shrink-0" />
                    {req}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      <div className="card text-center">
        <h3 className="font-semibold mb-2">Не нашли подходящую вакансию?</h3>
        <p className="text-sm text-[var(--foreground-muted)] mb-4">
          Отправьте резюме на{" "}
          <a
            href="mailto:hr@geleoteka.ru"
            className="text-[var(--color-accent)] hover:underline"
          >
            hr@geleoteka.ru
          </a>{" "}
          — мы всегда рассматриваем сильных кандидатов.
        </p>
        <Link href="/contacts" className="btn btn-secondary text-sm">
          Контакты
        </Link>
      </div>
    </div>
  );
}
