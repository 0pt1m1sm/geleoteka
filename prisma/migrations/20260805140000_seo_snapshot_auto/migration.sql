-- Авто-снапшоты SEO: источник и метрики из API Яндекса
ALTER TABLE "SeoSnapshot" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "SeoSnapshot" ADD COLUMN "indexedPagesApi" INTEGER;
ALTER TABLE "SeoSnapshot" ADD COLUMN "sqi" INTEGER;
ALTER TABLE "SeoSnapshot" ADD COLUMN "searchVisits7d" INTEGER;
CREATE INDEX "SeoSnapshot_tenantKey_source_createdAt_idx" ON "SeoSnapshot"("tenantKey", "source", "createdAt");
