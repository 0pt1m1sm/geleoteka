"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { pingIndexNow } from "@/lib/indexnow";
import { collectSeoHealth } from "@/lib/seo-health";
import { fetchSearchTraffic } from "@/lib/yandex-metrika-api";
import { fetchWebmasterSummary } from "@/lib/yandex-webmaster";
import { TENANT_KEY } from "@/lib/tenant";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://geleoteka.ru";

/**
 * Разовая ручная отправка ВСЕХ URL из sitemap в IndexNow.
 *
 * Штатный pingIndexNow срабатывает только когда сущность меняют через админку,
 * поэтому страницы, существовавшие до появления IndexNow (03.08), в Яндекс
 * push-каналом не уходили. Эта кнопка закрывает разрыв: тянет актуальный
 * sitemap.xml (уже без непрофильных моделей) и толкает весь список разом.
 *
 * Кнопка ручная и нечастая: IndexNow игнорирует повторную подачу неизменных
 * URL, так что жать её нужно после крупных изменений, а не регулярно.
 */
export async function submitSitemapToIndexNow(): Promise<{
  error: string | null;
  submitted?: number;
}> {
  await requireRole(["ADMIN", "MANAGER"]);
  try {
    const res = await fetch(`${SITE_URL}/sitemap.xml`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { error: "Не удалось прочитать sitemap.xml" };
    const xml = await res.text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
    if (urls.length === 0) return { error: "В sitemap нет ни одного URL" };
    await pingIndexNow(urls);
    return { error: null, submitted: urls.length };
  } catch {
    return { error: "Отправка не удалась — попробуйте позже" };
  }
}

/**
 * Слепок SEO-состояния: техметрики собирает сервер, «страниц в индексе» и
 * заметку о позициях админ вносит руками после замера site:домен в Яндексе.
 */
export async function captureSeoSnapshot(
  _prevState: { error: string | null } | null,
  formData: FormData,
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const indexedRaw = ((formData.get("indexedPages") as string) || "").trim();
  const indexedPages = indexedRaw ? Number.parseInt(indexedRaw, 10) : null;
  if (indexedRaw && (Number.isNaN(indexedPages) || indexedPages! < 0)) {
    return { error: "«Страниц в индексе» должно быть неотрицательным числом" };
  }
  const note = ((formData.get("note") as string) || "").trim() || null;

  const [health, webmaster, traffic] = await Promise.all([
    collectSeoHealth(),
    fetchWebmasterSummary(),
    fetchSearchTraffic(),
  ]);

  await db.seoSnapshot.create({
    data: {
      tenantKey: TENANT_KEY,
      source: "manual",
      indexedPagesApi: webmaster?.searchablePages ?? null,
      sqi: webmaster?.sqi ?? null,
      searchVisits7d: traffic?.visits7d ?? null,
      sitemapUrls: health.sitemapUrls,
      servicesTotal: health.servicesTotal,
      servicesWithBody: health.servicesWithBody,
      postsPublished: health.postsPublished,
      postsDraft: health.postsDraft,
      metrikaConfigured: health.metrikaConfigured,
      verificationConfigured: health.verificationConfigured,
      indexnowConfigured: health.indexnowConfigured,
      indexedPages,
      note,
    },
  });

  revalidatePath("/admin/seo");
  return { error: null };
}
