import Link from "next/link";
import { getCMSMany, getCMSText, getCMSList } from "@/lib/cms";
import { PageHeader } from "@/components/ui";
import { Markdown } from "@/components/shared/Markdown";

export const dynamic = "force-dynamic";

const CMS_KEYS = [
  "contacts.phone.service",
  "contacts.phone.parts",
  "contacts.email",
  "contacts.address",
  "contacts.hours.service",
  "contacts.hours.parts",
] as const;

/** Strip non-dial chars to build a tel: href. */
function telHref(display: string): string {
  return `tel:${display.replace(/[^+\d]/g, "")}`;
}

export default async function ContactsPage(): Promise<React.ReactElement> {
  const [cms, eyebrow, title, description, howtoTitle, howtoItems] = await Promise.all([
    getCMSMany(CMS_KEYS),
    getCMSText("contacts.eyebrow"),
    getCMSText("contacts.title"),
    getCMSText("contacts.description"),
    getCMSText("contacts.howto.title"),
    getCMSList("contacts.howto.items"),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
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
        <h2 className="text-lg font-semibold mb-4">{howtoTitle}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {howtoItems.map((item, i) => (
            <div key={i}>
              <h3 className="font-medium mb-2">{item.title}</h3>
              <div className="text-sm text-[var(--foreground-muted)]">
                <Markdown source={item.body ?? ""} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
