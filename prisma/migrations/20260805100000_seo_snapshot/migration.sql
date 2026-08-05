-- Слепки SEO-состояния для панели /admin/seo
CREATE TABLE "SeoSnapshot" (
    "id" TEXT NOT NULL,
    "tenantKey" TEXT NOT NULL DEFAULT 'geleoteka',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sitemapUrls" INTEGER,
    "servicesTotal" INTEGER NOT NULL,
    "servicesWithBody" INTEGER NOT NULL,
    "postsPublished" INTEGER NOT NULL,
    "postsDraft" INTEGER NOT NULL,
    "metrikaConfigured" BOOLEAN NOT NULL,
    "verificationConfigured" BOOLEAN NOT NULL,
    "indexnowConfigured" BOOLEAN NOT NULL,
    "indexedPages" INTEGER,
    "note" TEXT,
    CONSTRAINT "SeoSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SeoSnapshot_tenantKey_createdAt_idx" ON "SeoSnapshot"("tenantKey", "createdAt");
