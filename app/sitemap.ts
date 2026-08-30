import type { MetadataRoute } from "next";

import { db } from "@/lib/db";
import { getActiveModels } from "@/lib/vehicle-catalog";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://geleoteka.ru";

// Без этого Next запекает sitemap на этапе сборки, где БД недоступна, — все
// динамические ветки молча падают в .catch и прод навсегда отдаёт 9 статических
// URL без услуг, моделей и запчастей (наблюдалось в бою 03.08.2026).
export const dynamic = "force-dynamic";

/**
 * Sitemap for the public marketing site.
 *
 * Static marketing routes plus every published detail page from the database.
 * Anything requiring auth or carrying a private token is deliberately absent —
 * it is disallowed in robots.ts and must not be advertised here either.
 *
 * A database hiccup must not fail the whole route: a sitemap missing its
 * dynamic half is recoverable, a 500 that makes search engines drop the file
 * is not.
 */

const STATIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
  { path: "/", priority: 1.0, changeFrequency: "weekly" },
  { path: "/services", priority: 0.9, changeFrequency: "weekly" },
  { path: "/models", priority: 0.8, changeFrequency: "monthly" },
  { path: "/parts", priority: 0.8, changeFrequency: "daily" },
  { path: "/rentals", priority: 0.7, changeFrequency: "weekly" },
  { path: "/about", priority: 0.6, changeFrequency: "monthly" },
  { path: "/contacts", priority: 0.6, changeFrequency: "monthly" },
  { path: "/vacancies", priority: 0.5, changeFrequency: "weekly" },
  { path: "/blog", priority: 0.6, changeFrequency: "weekly" },
  { path: "/booking", priority: 0.9, changeFrequency: "monthly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  const [services, parts, rentals, models, posts] = await Promise.all([
    db.service
      .findMany({ select: { slug: true, updatedAt: true } })
      .catch(() => [] as Array<{ slug: string; updatedAt: Date }>),
    db.part
      // В карту сайта попадают только ХОЗЯЕВА вариантов: у не-хозяев canonical
      // указывает на хозяина и стоит noindex, класть их в карту значит
      // предлагать поисковику то, что сами же просим не индексировать.
      // Фильтр по condition оставлен: хозяином почти всегда является новый
      // товар, а деталь без нового (чистый разбор) получит свою страницу по
      // номеру в Story 6.
      .findMany({
        where: { isActive: true, condition: "NEW" },
        select: { slug: true, updatedAt: true },
      })
      .catch(() => [] as Array<{ slug: string; updatedAt: Date }>),
    db.vehicle
      .findMany({
        where: { ownershipType: "RENTAL", isArchived: false },
        select: { id: true, updatedAt: true },
      })
      .catch(() => [] as Array<{ id: string; updatedAt: Date }>),
    getActiveModels().catch(() => [] as Array<{ slug: string }>),
    db.blogPost
      .findMany({ where: { published: true }, select: { slug: true, updatedAt: true } })
      .catch(() => [] as Array<{ slug: string; updatedAt: Date }>),
  ]);

  for (const s of services as Array<{ slug: string; updatedAt: Date }>) {
    entries.push({
      url: `${SITE_URL}/services/${s.slug}`,
      lastModified: s.updatedAt,
      changeFrequency: "monthly",
      priority: 0.7,
    });
  }

  for (const m of models as Array<{ slug: string }>) {
    // Сервис обслуживает все Mercedes (профильно G-Class), поэтому в sitemap
    // все модели. G-Class приоритетнее прочих — приоритет ниже у остальных.
    entries.push({
      url: `${SITE_URL}/models/${m.slug}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: m.slug === "g-class" ? 0.8 : 0.5,
    });
  }

  for (const p of parts as Array<{ slug: string; updatedAt: Date }>) {
    entries.push({
      url: `${SITE_URL}/parts/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }

  for (const r of rentals as Array<{ id: string; updatedAt: Date }>) {
    entries.push({
      url: `${SITE_URL}/rentals/${r.id}`,
      lastModified: r.updatedAt,
      changeFrequency: "weekly",
      priority: 0.5,
    });
  }

  for (const p of posts as Array<{ slug: string; updatedAt: Date }>) {
    entries.push({
      url: `${SITE_URL}/blog/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "monthly",
      priority: 0.5,
    });
  }

  return entries;
}
