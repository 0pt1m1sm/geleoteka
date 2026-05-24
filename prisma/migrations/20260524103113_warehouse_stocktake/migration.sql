-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('OPEN', 'REVIEW', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockCountScope" AS ENUM ('ZONE', 'LOCATION', 'FULL', 'PART');

-- CreateEnum
CREATE TYPE "StockCountClassification" AS ENUM ('FOUND', 'MISSING', 'UNEXPECTED', 'UNKNOWN');

-- NOTE: `prisma migrate dev` also generated DROP INDEX for the un-modelled
-- Part_photos_gin_idx / Vehicle_photos_gin_idx GIN indexes (created as raw SQL in
-- 20260505123839_add_uploaded_image; Prisma can't model GIN on String[]). Those
-- drops are intentionally OMITTED here — same convention as 20260522153000.

-- CreateTable
CREATE TABLE "StockCountSession" (
    "id" TEXT NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'OPEN',
    "scope" "StockCountScope" NOT NULL,
    "scopeValue" TEXT,
    "scopeLocations" TEXT[],
    "scopePartIds" TEXT[],
    "note" TEXT,
    "createdByUserId" TEXT,
    "postedByUserId" TEXT,
    "postedAt" TIMESTAMP(3),
    "tenantKey" TEXT NOT NULL DEFAULT 'geleoteka',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockCountSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountLine" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "itemId" TEXT,
    "rawCode" TEXT,
    "location" TEXT NOT NULL,
    "systemQty" INTEGER NOT NULL,
    "countedQty" INTEGER,
    "classification" "StockCountClassification",
    "postedDelta" INTEGER,
    "tenantKey" TEXT NOT NULL DEFAULT 'geleoteka',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockCountSession_tenantKey_status_createdAt_idx" ON "StockCountSession"("tenantKey", "status", "createdAt");

-- CreateIndex
CREATE INDEX "StockCountLine_tenantKey_sessionId_idx" ON "StockCountLine"("tenantKey", "sessionId");

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StockCountSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
