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
}

/**
 * Per-page metadata with a canonical URL and page-specific Open Graph.
 * The title is merged into the root `%s | Geleoteka` template by Next.
 */
export function pageSeo({ title, description, path, image }: PageSeoInput): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "ru_RU",
      siteName: "Geleoteka",
      title,
      description,
      url: path,
      ...(image ? { images: [{ url: image, alt: title }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}
