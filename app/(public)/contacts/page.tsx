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

/**
 * Convert a regular Yandex.Maps share URL into the embed-widget URL.
 * Accepts either format the admin might paste:
 *   - https://yandex.com/maps/org/<id>/...     → widget org card
 *   - https://yandex.com/map-widget/v1/...     → returned as-is
 * Anything else is returned untouched (the admin sees the result and can fix).
 */
function toYandexWidgetSrc(url: string): string {
  if (!url) return "";
  return url.replace("/maps/", "/map-widget/v1/");
}

export default async function ContactsPage(): Promise<React.ReactElement> {
  const [cms, eyebrow, title, description, howtoTitle, howtoItems, mapUrl] = await Promise.all([
    getCMSMany(CMS_KEYS),
    getCMSText("contacts.eyebrow"),
    getCMSText("contacts.title"),
    getCMSText("contacts.description"),
    getCMSText("contacts.howto.title"),
    getCMSList("contacts.howto.items"),
    getCMSText("contacts.map.url"),
  ]);

  const mapWidgetSrc = toYandexWidgetSrc(mapUrl);

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

        <div className="card overflow-hidden p-0 min-h-[400px]">
          <iframe
            src={mapWidgetSrc}
            title={`Карта — ${cms["contacts.address"]}`}
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            className="w-full h-[400px] border-0 block"
          />
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
