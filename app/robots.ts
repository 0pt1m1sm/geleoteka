import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://geleoteka.ru";

/**
 * Crawl rules. Everything behind a login or carrying a private token is
 * disallowed — the tokenised estimate link (`/estimate/<token>`) especially,
 * since an indexed one would expose a customer's quote to anyone searching.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/cabinet",
        "/api",
        "/login",
        "/profile",
        "/register",
        "/reset-password",
        "/estimate",
        "/parts/cart",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
