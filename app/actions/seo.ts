"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { collectSeoHealth } from "@/lib/seo-health";
import { fetchSearchTraffic } from "@/lib/yandex-metrika-api";
import { fetchWebmasterSummary } from "@/lib/yandex-webmaster";
import { TENANT_KEY } from "@/lib/tenant";

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
