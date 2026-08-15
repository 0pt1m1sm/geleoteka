import type { Metadata } from "next";

/**
 * Shared SEO building blocks for the public site.
 *
 * `robots.ts` already tells well-behaved crawlers to stay out of the private
 * routes; the per-page `noindex` here is the second line of defence, because a
 * disallowed URL that leaks via a link or referrer can still be indexed without
 * being crawled. It matters most for `/estimate/<token>`, where an indexed page
 * would expose a customer's quote to anyone searching.
 */

/** Marks a route as private: never indexed, never followed, no cached snippet. */
export const NOINDEX: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export interface PageSeoInput {
  title: string;
  description: string;
  /** Site-root-relative path, e.g. "/services". Becomes the canonical URL. */
  path: string;
  image?: string;
  /**
   * Оставить страницу доступной по прямой ссылке, но убрать из индекса
   * (robots noindex). Для страниц вне тематики сайта — например моделей
   * Mercedes, не относящихся к G-Class у специализированного сервиса.
   */
  noindex?: boolean;
}

/**
 * Per-page metadata with a canonical URL and page-specific Open Graph.
 * The title is merged into the root `%s | Geleoteka` template by Next.
 */
/**
 * Fallback OG image for pages that don't pass their own. Nested metadata
 * objects in Next REPLACE the parent segment's wholesale (no deep merge), so
 * without this every page that sets `openGraph` would ship no image at all.
 */
export const DEFAULT_OG_IMAGE = {
  url: "/images/hero/g-class-hero.jpg",
  width: 1920,
  height: 1080,
  alt: "Mercedes-Benz G-Class (Гелендваген) в сервисе Geleoteka",
};

export function pageSeo({ title, description, path, image, noindex }: PageSeoInput): Metadata {
  return {
    title,
    description,
    ...(noindex ? { robots: NOINDEX.robots } : {}),
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "ru_RU",
      siteName: "Geleoteka",
      title,
      description,
      url: path,
      images: [image ? { url: image, alt: title } : DEFAULT_OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image ?? DEFAULT_OG_IMAGE.url],
    },
  };
}
