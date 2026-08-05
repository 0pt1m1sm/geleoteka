import "server-only";

import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";

/**
 * Живой техчек SEO для панели /admin/seo: всё, что сервер может проверить
 * сам, без внешних API. Позиции выдачи и число страниц в индексе сюда
 * сознательно не входят — Яндекс не отдаёт их без капчи/OAuth, эти цифры
 * вносятся вручную при замере.
 */

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://geleoteka.ru";

export interface SeoHealth {
  /** Число <loc> в собственном sitemap; null — sitemap не удалось получить. */
  sitemapUrls: number | null;
  servicesTotal: number;
  servicesWithBody: number;
  postsPublished: number;
  postsDraft: number;
  metrikaConfigured: boolean;
  verificationConfigured: boolean;
  indexnowConfigured: boolean;
}

async function countSitemapUrls(): Promise<number | null> {
  try {
    const res = await fetch(`${SITE_URL}/sitemap.xml`, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const xml = await res.text();
    return (xml.match(/<loc>/g) ?? []).length;
  } catch {
    return null;
  }
}

/** «12 (+4)» — значение и дельта к предыдущему замеру той же метрики. */
export function withDelta(
  current: number | null,
  previous: number | null | undefined,
): string {
  if (current == null) return "—";
  if (previous == null) return String(current);
  const d = current - previous;
  return d === 0 ? String(current) : `${current} (${d > 0 ? "+" : ""}${d})`;
}

export async function collectSeoHealth(): Promise<SeoHealth> {
  const [sitemapUrls, servicesTotal, servicesWithBody, postsPublished, postsDraft, metrika, verification, indexnow] =
    await Promise.all([
      countSitemapUrls(),
      db.service.count() as Promise<number>,
      db.service.count({ where: { body: { not: null } } }) as Promise<number>,
      db.blogPost.count({ where: { published: true } }) as Promise<number>,
      db.blogPost.count({ where: { published: false } }) as Promise<number>,
      getSetting("YANDEX_METRIKA_ID"),
      getSetting("YANDEX_VERIFICATION"),
      getSetting("INDEXNOW_KEY"),
    ]);

  return {
    sitemapUrls,
    servicesTotal,
    servicesWithBody,
    postsPublished,
    postsDraft,
    metrikaConfigured: Boolean(metrika?.trim()),
    // Права можно подтвердить и файлом — тогда Setting пуст, но файл в
    // public/ есть навсегда; поле трактуем как «meta-тег задан».
    verificationConfigured: Boolean(verification?.trim()),
    indexnowConfigured: Boolean(indexnow?.trim()),
  };
}
