import Link from "next/link";
import { getCMSMany } from "@/lib/cms";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const CMS_KEYS = [
  "contacts.phone.service",
  "contacts.phone.parts",
  "contacts.email",
  "contacts.address",
  "contacts.hours.service",
  "contacts.hours.parts",
] as const;

const FALLBACKS: Record<string, string> = {
  "contacts.phone.service": "+7 (495) 123-45-67",
  "contacts.phone.parts": "+7 (495) 123-45-68",
  "contacts.email": "info@geleoteka.ru",
  "contacts.address": "Москва, ул. Примерная, 15",
  "contacts.hours.service": "Пн–Пт: 9:00–20:00, Сб: 10:00–18:00",
  "contacts.hours.parts": "Пн–Пт: 9:00–19:00, Сб: 10:00–17:00",
};

/** Strip non-dial chars to build a tel: href. */
function telHref(display: string): string {
  return `tel:${display.replace(/[^+\d]/g, "")}`;
}

export default async function ContactsPage(): Promise<React.ReactElement> {
  const cms = await getCMSMany(CMS_KEYS, FALLBACKS);

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Контакты"
        title="Свяжитесь с нами"
        description="Свяжитесь с нами или приезжайте — мы всегда рады помочь"
        align="center"
        className="mb-12"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Отдел сервиса</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-[var(--foreground-muted)]">Телефон</p>
                <a
                  href={telHref(cms["contacts.phone.service"])}
                  className="text-lg font-medium hover:text-[var(--color-accent)] transition-colors"
                >
                  {cms["contacts.phone.service"]}
                </a>
              </div>
              <div>
                <p className="text-sm text-[var(--foreground-muted)]">Часы работы</p>
                <p className="font-medium">{cms["contacts.hours.service"]}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Отдел запчастей</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-[var(--foreground-muted)]">Телефон</p>
                <a
                  href={telHref(cms["contacts.phone.parts"])}
                  className="text-lg font-medium hover:text-[var(--color-accent)] transition-colors"
                >
                  {cms["contacts.phone.parts"]}
                </a>
              </div>
              <div>
                <p className="text-sm text-[var(--foreground-muted)]">Часы работы</p>
                <p className="font-medium">{cms["contacts.hours.parts"]}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Общие контакты</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-[var(--foreground-muted)]">Email</p>
                <a
                  href={`mailto:${cms["contacts.email"]}`}
                  className="font-medium hover:text-[var(--color-accent)] transition-colors"
                >
                  {cms["contacts.email"]}
                </a>
              </div>
              <div>
                <p className="text-sm text-[var(--foreground-muted)]">Адрес</p>
                <p className="font-medium">{cms["contacts.address"]}</p>
              </div>
            </div>
          </div>

          <Link href="/booking" className="btn btn-primary w-full text-center">
            Записаться на сервис
          </Link>
        </div>

        <div className="card flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--color-secondary)] mx-auto mb-4 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-[var(--foreground-muted)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 0115 0z"
                />
              </svg>
            </div>
            <p className="text-[var(--foreground-muted)] text-sm">Яндекс Карта</p>
            <p className="text-xs text-[var(--foreground-muted)] mt-1">
              Подключается после получения API-ключа
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Как добраться</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <h3 className="font-medium mb-2">На автомобиле</h3>
            <p className="text-sm text-[var(--foreground-muted)]">
              Съезд с МКАД, 500 м по {cms["contacts.address"].split(",").slice(-1)[0].trim()}. Бесплатная парковка перед сервисом.
            </p>
          </div>
          <div>
            <h3 className="font-medium mb-2">На метро</h3>
            <p className="text-sm text-[var(--foreground-muted)]">
              Уточните маршрут по телефону {cms["contacts.phone.service"]}.
            </p>
          </div>
          <div>
            <h3 className="font-medium mb-2">На такси</h3>
            <p className="text-sm text-[var(--foreground-muted)]">
              Назовите адрес: {cms["contacts.address"]}. Въезд через шлагбаум — назовите номер записи.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
