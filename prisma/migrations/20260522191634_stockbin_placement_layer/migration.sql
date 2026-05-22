-- NOTE: Prisma's diff again wanted to DROP the un-modelled "Part_photos_gin_idx"
-- and "Vehicle_photos_gin_idx" GIN indexes (created via raw SQL in
-- 20260505123839_add_uploaded_image). Those drops are intentionally omitted —
-- this migration is purely additive (the StockBin placement layer).

-- CreateEnum
CREATE TYPE "StockBinMovementReason" AS ENUM ('PLACE', 'TRANSFER', 'REMOVE');

-- CreateTable
CREATE TABLE "StockBin" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "tenantKey" TEXT NOT NULL DEFAULT 'geleoteka',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBinMovement" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "reason" "StockBinMovementReason" NOT NULL,
    "fromLocation" TEXT,
    "toLocation" TEXT,
    "quantity" INTEGER NOT NULL,
    "actorUserId" TEXT,
    "note" TEXT,
    "tenantKey" TEXT NOT NULL DEFAULT 'geleoteka',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockBinMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockBin_tenantKey_location_idx" ON "StockBin"("tenantKey", "location");

-- CreateIndex
CREATE UNIQUE INDEX "StockBin_tenantKey_itemId_location_key" ON "StockBin"("tenantKey", "itemId", "location");

-- CreateIndex
CREATE INDEX "StockBinMovement_tenantKey_itemId_createdAt_idx" ON "StockBinMovement"("tenantKey", "itemId", "createdAt");

-- AddForeignKey
ALTER TABLE "StockBin" ADD CONSTRAINT "StockBin_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBinMovement" ADD CONSTRAINT "StockBinMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
