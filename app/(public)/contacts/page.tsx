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
 * Convert a Yandex.Maps URL the admin pasted into the iframe-embed widget URL.
 * Accepts either format:
 *   - https://yandex.com/maps/org/<id>/...     → widget org card
 *   - https://yandex.com/map-widget/v1/...     → returned as-is
 *
 * Whatever the admin pastes, this function additionally **strips card-panel
 * modes** (`mode=search&ol=biz`, `mode=poi`) — those overlay a giant org card
 * on the iframe map that consumes most of the viewport on mobile. We render
 * a clean pin-only embed and put a separate "Открыть на Яндекс.Картах" link
 * below so the user still has one click to hours / route / taxi.
 */
function toYandexWidgetSrc(url: string): string {
  if (!url) return "";
  const widgetUrl = url.replace("/maps/", "/map-widget/v1/");
  try {
    const u = new URL(widgetUrl);
    // Pull coordinates from `ll` if present, fall back to `poi[point]`.
    const ll = u.searchParams.get("ll") ?? u.searchParams.get("poi[point]");
    const z = u.searchParams.get("z") ?? "17";
    if (!ll) return widgetUrl;
    // Build a clean pin-only widget URL: same coords, same zoom, red marker,
    // no mode/card panel that would overlay the map on mobile.
    const out = new URL("https://yandex.com/map-widget/v1/");
    out.searchParams.set("ll", ll);
    out.searchParams.set("z", z);
    out.searchParams.set("pt", `${ll},pm2rdm`);
    return out.toString();
  } catch {
    return widgetUrl;
  }
}

/**
 * Convert the admin's CMS map URL into a "click-through" link that opens the
 * full Yandex.Maps page (org card, hours, photos, reviews, route button) in
 * a new tab. Shown next to the iframe so users always have one tap to full
 * info regardless of viewport.
 */
function toYandexFullMapsUrl(url: string): string {
  if (!url) return "https://yandex.com/maps";
  try {
    const widgetUrl = url.replace("/maps/", "/map-widget/v1/");
    const u = new URL(widgetUrl);
    // Prefer the org id when present — opens directly on the business page.
    const oid = u.searchParams.get("oid")
      ?? extractOidFromPoiUri(u.searchParams.get("poi[uri]") ?? "");
    if (oid) {
      return `https://yandex.com/maps/?oid=${oid}&ol=biz`;
    }
    // Fall back to a bare coordinate map on the public Yandex.Maps host.
    const ll = u.searchParams.get("ll") ?? u.searchParams.get("poi[point]");
    if (ll) {
      const z = u.searchParams.get("z") ?? "17";
      return `https://yandex.com/maps/?ll=${encodeURIComponent(ll)}&z=${z}`;
    }
  } catch {
    // fall through
  }
  return url;
}

function extractOidFromPoiUri(uri: string): string | null {
  // "ymapsbm1://org?oid=211932722600" → "211932722600"
  const m = uri.match(/oid=(\d+)/);
  return m ? m[1] : null;
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
  const fullMapsHref = toYandexFullMapsUrl(mapUrl);

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        align="center"
        className="mb-12"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
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

        <div className="card overflow-hidden p-0 flex flex-col lg:h-full">
          <iframe
            src={mapWidgetSrc}
            title={`Карта — ${cms["contacts.address"]}`}
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            className="w-full h-[420px] sm:h-[450px] lg:flex-1 lg:min-h-[450px] border-0 block"
          />
          <a
            href={fullMapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="block px-4 py-3 text-sm font-medium text-center bg-[var(--background-secondary)] hover:bg-[var(--card-hover)] border-t border-[var(--border)] text-[var(--color-accent)] transition-colors"
          >
            Открыть на Яндекс.Картах →
          </a>
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
