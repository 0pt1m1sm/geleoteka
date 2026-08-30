/**
 * Чистые билдеры JSON-LD для публичных страниц. Каждый возвращает строку,
 * готовую к вставке в <script type="application/ld+json"> — уже с эскейпом
 * `<`, чтобы значение с "</script>" не вырвалось из тега (санитизация из
 * гайда Next по JSON-LD).
 *
 * Вебмастер Яндекса валидирует Schema.org и строит по ней сниппеты — поэтому
 * билдеры собирают только поля, которые реально есть в данных: пустые ветки
 * опускаются, а не заполняются заглушками.
 */

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://geleoteka.ru";
export const ORGANIZATION_ID = `${SITE_URL}#organization`;

export function toJsonLdScript(value: object): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * «Пн–Пт: 10:00–20:00, Сб: 10:00–16:00, Вс: выходной» →
 * ["Mo-Fr 10:00-20:00", "Sa 10:00-16:00"].
 *
 * CMS хранит расписание человеческой строкой для футера; schema.org ждёт
 * формат openingHours. Непонятные куски пропускаем — неполная разметка
 * валидна, ошибочная нет.
 */
const RU_DAYS: Record<string, string> = {
  пн: "Mo",
  вт: "Tu",
  ср: "We",
  чт: "Th",
  пт: "Fr",
  сб: "Sa",
  вс: "Su",
};

export function parseRussianSchedule(raw: string): string[] {
  const out: string[] = [];
  for (const chunk of raw.split(",")) {
    const m = chunk
      .trim()
      .toLowerCase()
      .match(/^([а-я]{2})(?:\s*[-–—]\s*([а-я]{2}))?\s*:\s*(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})$/);
    if (!m) continue;
    const from = RU_DAYS[m[1]];
    const to = m[2] ? RU_DAYS[m[2]] : null;
    if (!from || (m[2] && !to)) continue;
    out.push(`${to ? `${from}-${to}` : from} ${m[3]}-${m[4]}`);
  }
  return out;
}

export interface OrganizationInput {
  phone?: string;
  email?: string;
  address?: string;
  hours?: string;
  sameAs?: string[];
}

export function buildOrganizationJsonLd(contacts: OrganizationInput): string {
  const openingHours = contacts.hours ? parseRussianSchedule(contacts.hours) : [];
  const sameAs = (contacts.sameAs ?? []).filter(
    (u) => typeof u === "string" && /^https:\/\//.test(u),
  );
  return toJsonLdScript({
    "@context": "https://schema.org",
    "@type": "AutoRepair",
    "@id": ORGANIZATION_ID,
    name: "Geleoteka",
    description:
      "Специализированный сервис Mercedes-Benz G-Class (Гелендваген) в Москве: ремонт, ТО, запчасти и аренда.",
    url: SITE_URL,
    image: `${SITE_URL}/images/hero/g-class-hero.jpg`,
    priceRange: "₽₽₽",
    ...(contacts.phone ? { telephone: contacts.phone } : {}),
    ...(contacts.email ? { email: contacts.email } : {}),
    ...(contacts.address
      ? {
          address: {
            "@type": "PostalAddress",
            // Полный адрес из CMS как есть, без выдуманного addressLocality:
            // сервис в Химках, и «Москва» в этом поле противоречила бы
            // streetAddress — рассогласованный NAP хуже неполного.
            streetAddress: contacts.address,
            addressCountry: "RU",
          },
        }
      : {}),
    ...(openingHours.length > 0 ? { openingHours } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
    areaServed: { "@type": "City", name: "Москва" },
    brand: { "@type": "Brand", name: "Mercedes-Benz G-Class" },
    makesOffer: {
      "@type": "Offer",
      itemOffered: {
        "@type": "Service",
        name: "Ремонт и обслуживание Mercedes-Benz G-Class",
      },
    },
  });
}

export interface BreadcrumbItem {
  name: string;
  /** Абсолютный путь от корня сайта; у последнего элемента опускается. */
  href?: string;
}

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]): string {
  return toJsonLdScript({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      ...(item.href ? { item: `${SITE_URL}${item.href}` } : {}),
    })),
  });
}

export interface ServiceJsonLdInput {
  name: string;
  slug: string;
  description?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
}

export function buildServiceJsonLd(s: ServiceJsonLdInput): string {
  const offers =
    s.priceMin != null && s.priceMax != null && s.priceMax > s.priceMin
      ? {
          "@type": "AggregateOffer",
          lowPrice: s.priceMin,
          highPrice: s.priceMax,
          priceCurrency: "RUB",
        }
      : s.priceMin != null || s.priceMax != null
        ? {
            "@type": "Offer",
            price: s.priceMin ?? s.priceMax,
            priceCurrency: "RUB",
          }
        : null;
  return toJsonLdScript({
    "@context": "https://schema.org",
    "@type": "Service",
    name: s.name,
    ...(s.description ? { description: s.description } : {}),
    url: `${SITE_URL}/services/${s.slug}`,
    serviceType: "Ремонт и обслуживание автомобилей",
    provider: { "@id": ORGANIZATION_ID },
    areaServed: { "@type": "City", name: "Москва" },
    ...(offers ? { offers } : {}),
  });
}

export interface ProductJsonLdInput {
  name: string;
  slug: string;
  article: string;
  /** Торговый идентификатор. Отличается от article у б/у экземпляров. */
  sku: string;
  description?: string | null;
  price: number;
  image?: string | null;
  inStock: boolean;
}

export function buildProductJsonLd(p: ProductJsonLdInput): string {
  return toJsonLdScript({
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    // Именно sku, а не article: артикул общий у нового товара и б/у
    // экземпляров, и две карточки опубликовали бы одинаковый sku — Google
    // склеивает такие товары по sku+brand и выбрасывает один.
    sku: p.sku,
    ...(p.description ? { description: p.description } : {}),
    ...(p.image ? { image: p.image.startsWith("http") ? p.image : `${SITE_URL}${p.image}` } : {}),
    url: `${SITE_URL}/parts/${p.slug}`,
    brand: { "@type": "Brand", name: "Mercedes-Benz" },
    offers: {
      "@type": "Offer",
      price: p.price,
      priceCurrency: "RUB",
      availability: p.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      seller: { "@id": ORGANIZATION_ID },
    },
  });
}

export interface RentalJsonLdInput {
  /** Например «Mercedes-Benz G 63 AMG». */
  name: string;
  /** Путь карточки, например `/rentals/<id>`. */
  path: string;
  /** Цена за сутки, ₽. */
  dailyPrice: number;
  description?: string | null;
  image?: string | null;
}

/**
 * Карточка аренды: Product + Offer с ценой за сутки. Яндекс понимает такую
 * разметку в сниппетах цен; unitText уточняет, что цена суточная.
 */
export function buildRentalJsonLd(r: RentalJsonLdInput): string {
  return toJsonLdScript({
    "@context": "https://schema.org",
    "@type": "Product",
    name: `Аренда ${r.name} в Москве`,
    ...(r.description ? { description: r.description } : {}),
    ...(r.image ? { image: r.image.startsWith("http") ? r.image : `${SITE_URL}${r.image}` } : {}),
    url: `${SITE_URL}${r.path}`,
    brand: { "@type": "Brand", name: "Mercedes-Benz" },
    offers: {
      "@type": "Offer",
      price: r.dailyPrice,
      priceCurrency: "RUB",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: r.dailyPrice,
        priceCurrency: "RUB",
        unitText: "сутки",
      },
      availability: "https://schema.org/InStock",
      seller: { "@id": ORGANIZATION_ID },
    },
  });
}

export interface ArticleJsonLdInput {
  title: string;
  slug: string;
  excerpt?: string | null;
  publishedAt?: Date | null;
  updatedAt?: Date | null;
}

export function buildArticleJsonLd(a: ArticleJsonLdInput): string {
  return toJsonLdScript({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    ...(a.excerpt ? { description: a.excerpt } : {}),
    url: `${SITE_URL}/blog/${a.slug}`,
    ...(a.publishedAt ? { datePublished: a.publishedAt.toISOString() } : {}),
    ...(a.updatedAt ? { dateModified: a.updatedAt.toISOString() } : {}),
    inLanguage: "ru-RU",
    author: { "@id": ORGANIZATION_ID },
    publisher: { "@id": ORGANIZATION_ID },
  });
}

export interface FaqJsonLdItem {
  question: string;
  answer: string;
}

export function buildFaqJsonLd(items: FaqJsonLdItem[]): string {
  return toJsonLdScript({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  });
}
