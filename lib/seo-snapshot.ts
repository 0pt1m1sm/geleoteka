import "server-only";

import { tenantDb } from "@/lib/tenant/scoped-db";
import { collectSeoHealth } from "@/lib/seo-health";
import { fetchSearchTraffic } from "@/lib/yandex-metrika-api";
import { fetchWebmasterSummary } from "@/lib/yandex-webmaster";
import { TENANT_KEY } from "@/lib/tenant";

/**
 * Суточный авто-снапшот SEO для панели: воркер дёргает тик каждый час, а
 * тик сам решает, пора ли (последний auto-слепок старше 20 часов — так
 * замер «плывёт» по суткам, но не дублируется). Ручные снапшоты (кнопка)
 * в гейте не участвуют.
 */

const AUTO_SNAPSHOT_MIN_AGE_MS = 20 * 60 * 60 * 1000;

export type SeoSnapshotTickResult = "fresh" | "captured" | "failed";

export async function runSeoSnapshotTick(): Promise<SeoSnapshotTickResult> {
  const db = await tenantDb();
  try {
    const latest = (await db.seoSnapshot.findFirst({
      where: { tenantKey: TENANT_KEY, source: "auto" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    })) as { createdAt: Date } | null;
    if (latest && Date.now() - latest.createdAt.getTime() < AUTO_SNAPSHOT_MIN_AGE_MS) {
      return "fresh";
    }

    const [health, webmaster, traffic] = await Promise.all([
      collectSeoHealth(),
      fetchWebmasterSummary(),
      fetchSearchTraffic(),
    ]);

    await db.seoSnapshot.create({
      data: {
        tenantKey: TENANT_KEY,
        source: "auto",
        sitemapUrls: health.sitemapUrls,
        servicesTotal: health.servicesTotal,
        servicesWithBody: health.servicesWithBody,
        postsPublished: health.postsPublished,
        postsDraft: health.postsDraft,
        metrikaConfigured: health.metrikaConfigured,
        verificationConfigured: health.verificationConfigured,
        indexnowConfigured: health.indexnowConfigured,
        indexedPagesApi: webmaster?.searchablePages ?? null,
        sqi: webmaster?.sqi ?? null,
        searchVisits7d: traffic?.visits7d ?? null,
        indexedPages: null,
        note: null,
      },
    });
    return "captured";
  } catch {
    // Телеметрия не имеет права ронять воркер; без деталей в лог.
    console.error("seo_snapshot.tick_failed");
    return "failed";
  }
}
