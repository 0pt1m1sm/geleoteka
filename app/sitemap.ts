import type { MetadataRoute } from "next";

import { tenantDb } from "@/lib/tenant/scoped-db";
import { isGenerationIndexable, isModelIndexable } from "@/lib/models/index-policy";
import { SITE_URL } from "@/lib/site-url";


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
  // /vacancies убрана: HR-объявление на 717 знаков, в индекс не просится
  // (см. noindex на самой странице).
  { path: "/blog", priority: 0.6, changeFrequency: "weekly" },
  { path: "/booking", priority: 0.9, changeFrequency: "monthly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = await tenantDb();
  const now = new Date();

  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  const [services, generations, refs, looseParts, rentals, models, posts] = await Promise.all([
    db.service
      .findMany({ select: { slug: true, updatedAt: true } })
      .catch(() => [] as Array<{ slug: string; updatedAt: Date }>),
    // Р1: в карте сайта — АДРЕСА ПО НОМЕРУ, а не слаги товаров. Канонический
    // адрес номенклатуры теперь всегда страница по номеру, и карта обязана
    // перечислять именно её, иначе она заявляла бы поисковику адреса, которые
    // сами указывают canonical на другой.
    db.vehicleGeneration
      .findMany({
        where: { isActive: true, model: { isActive: true } },
        select: {
          code: true,
          updatedAt: true,
          description: true,
          model: { select: { slug: true } },
          _count: { select: { partReferenceFitments: true } },
        },
      })
      .catch(() => [] as SitemapGeneration[]),
    db.partReference
      .findMany({
        where: { parts: { some: { isActive: true } } },
        select: {
          oem: true,
          updatedAt: true,
        },
      })
      .catch(() => [] as SitemapRef[]),
    // Товары БЕЗ номенклатуры (служебные артикулы «под заказ») страницы по
    // номеру не имеют и остаются сами себе каноном — их адреса в карте свои.
    // condition: "NEW" ОБЯЗАТЕЛЕН: страница закрывает от индексации всё, что не
    // новое (адрес экземпляра умрёт с продажей), и без фильтра карта заявляла
    // бы поисковику адреса, которые сами себя закрывают. Найдено ревью #109.
    db.part
      .findMany({
        where: { isActive: true, referenceId: null, condition: "NEW" },
        select: { slug: true, updatedAt: true },
      })
      .catch(() => [] as Array<{ slug: string; updatedAt: Date }>),
    db.vehicle
      .findMany({
        where: { ownershipType: "RENTAL", isArchived: false },
        select: { id: true, updatedAt: true },
      })
      .catch(() => [] as Array<{ id: string; updatedAt: Date }>),
    // Считаем детали здесь же: решение об индексации модели зависит от них,
    // а getActiveModels их не отдаёт.
    db.vehicleModel
      .findMany({
        where: { isActive: true },
        select: {
          slug: true,
          description: true,
          _count: { select: { generations: true } },
          generations: { select: { _count: { select: { partReferenceFitments: true } } } },
        },
      })
      .then((rows: Array<{ slug: string; description: string | null; generations: Array<{ _count: { partReferenceFitments: number } }> }>) =>
        rows.map((m) => ({
          slug: m.slug,
          description: m.description,
          partsCount: m.generations.reduce((sum, g) => sum + g._count.partReferenceFitments, 0),
        })),
      )
      .catch(() => [] as SitemapModel[]),
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

  // Страницы ПОКОЛЕНИЙ: у каждого кузова свой набор запчастей и своих болячек,
  // и спрос в поиске идёт именно по кузову. Заявляем только те, где есть
  // содержание — описание или привязанные детали; пустые страница сама отдаёт
  // с noindex, и заявлять их значило бы ей противоречить.
  for (const g of generations as SitemapGeneration[]) {
    if (!isGenerationIndexable({ description: g.description, partsCount: g._count.partReferenceFitments }))
      continue;
    entries.push({
      url: `${SITE_URL}/models/${g.model.slug}/${g.code}`,
      lastModified: g.updatedAt,
      changeFrequency: "monthly",
      priority: 0.7,
    });
  }

  // Модели: та же логика, что у поколений. Шаблонная страница без своего
  // содержания в карту не идёт — она сама отдаёт noindex.
  for (const m of models as SitemapModel[]) {
    // Раньше сюда шли ВСЕ модели: «сервис обслуживает все Mercedes». Но
    // страница без своего содержания этого не доказывает — она повторяет
    // соседнюю, и Яндекс исключил 16 таких из 35. Что сервис работает со всем
    // модельным рядом, говорит раздел /models: он остаётся в карте.
    if (!isModelIndexable({ description: m.description, partsCount: m.partsCount })) continue;
    entries.push({
      url: `${SITE_URL}/models/${m.slug}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: m.slug === "g-class" ? 0.8 : 0.5,
    });
  }

  type SitemapRef = { oem: string; updatedAt: Date };
  type SitemapModel = { slug: string; description: string | null; partsCount: number };
  type SitemapGeneration = {
    code: string;
    updatedAt: Date;
    description: string | null;
    model: { slug: string };
    _count: { partReferenceFitments: number };
  };

  // Условие в самом запросе: номенклатура с хотя бы одним живым товаром. По
  // остатку НЕ фильтруем — «под заказ» это предложение, а не пустая страница,
  // и это ровно тот хвост запросов по номеру, ради которого история затевалась.
  // Пустые же номенклатуры сама страница отдаёт с noindex, и заявлять их в
  // карте значило бы ей противоречить.
  for (const r of refs as SitemapRef[]) {
    entries.push({
      url: `${SITE_URL}/parts/oem/${r.oem}`,
      lastModified: r.updatedAt,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }

  for (const p of looseParts as Array<{ slug: string; updatedAt: Date }>) {
    entries.push({
      url: `${SITE_URL}/parts/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly",
      priority: 0.5,
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
