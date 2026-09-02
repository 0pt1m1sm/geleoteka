import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";


/**
 * Вычисляется при запросе, а не при сборке: адрес сайта берётся из переменной
 * окружения, а в окружении сборки её нет. Статический robots.txt впечатал бы
 * запасное значение и увёл поисковики не на тот домен.
 */
export const dynamic = "force-dynamic";

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
