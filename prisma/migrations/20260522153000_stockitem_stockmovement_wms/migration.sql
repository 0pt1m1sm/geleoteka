-- WMS core: StockItem (on-hand/reserved, 1:1 Part) + StockMovement ledger.
-- Additive — Part.quantity is retained during the migration window and dropped
-- in a later migration once all writers/readers move to StockItem.
-- (Prisma's diff also wanted to DROP the un-modelled Part_photos_gin_idx /
-- Vehicle_photos_gin_idx GIN indexes; those drops are intentionally omitted.)

-- CreateEnum
CREATE TYPE "StockMovementReason" AS ENUM ('RECEIPT', 'CONSUMPTION', 'ADJUSTMENT', 'RESERVATION', 'RELEASE');

-- CreateTable
CREATE TABLE "StockItem" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "barcode" TEXT,
    "gtin" TEXT,
    "tenantKey" TEXT NOT NULL DEFAULT 'geleoteka',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "reason" "StockMovementReason" NOT NULL,
    "quantityDelta" INTEGER NOT NULL DEFAULT 0,
    "reservedDelta" INTEGER NOT NULL DEFAULT 0,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "actorUserId" TEXT,
    "note" TEXT,
    "tenantKey" TEXT NOT NULL DEFAULT 'geleoteka',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockItem_partId_key" ON "StockItem"("partId");

-- CreateIndex
CREATE INDEX "StockItem_tenantKey_partId_idx" ON "StockItem"("tenantKey", "partId");

-- CreateIndex
CREATE INDEX "StockItem_barcode_idx" ON "StockItem"("barcode");

-- CreateIndex
CREATE INDEX "StockMovement_tenantKey_itemId_createdAt_idx" ON "StockMovement"("tenantKey", "itemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_tenantKey_sourceType_sourceId_reason_key" ON "StockMovement"("tenantKey", "sourceType", "sourceId", "reason");

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one StockItem per existing Part, copying current on-hand quantity.
-- ON CONFLICT keeps it safe to re-run. gen_random_uuid() is built-in (PG13+).
INSERT INTO "StockItem" ("id", "partId", "quantity", "tenantKey", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", "quantity", 'geleoteka', now(), now()
FROM "Part"
ON CONFLICT ("partId") DO NOTHING;
