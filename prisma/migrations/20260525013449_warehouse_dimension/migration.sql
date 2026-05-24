-- WMS Phase 6: multi-warehouse dimension.
-- 1. Warehouse table
CREATE TABLE "Warehouse" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "tenantKey" TEXT NOT NULL DEFAULT 'geleoteka',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Warehouse_tenantKey_code_key" ON "Warehouse"("tenantKey", "code");
CREATE INDEX "Warehouse_tenantKey_isDefault_idx" ON "Warehouse"("tenantKey", "isDefault");

-- 2. Seed the default MAIN warehouse (deterministic id for backfill + host resolver)
INSERT INTO "Warehouse" ("id","code","name","isActive","isDefault","tenantKey","updatedAt")
VALUES ('wh_main_geleoteka','MAIN','Основной склад',true,true,'geleoteka',CURRENT_TIMESTAMP);

-- 3. Add nullable warehouseId to the five stock tables
ALTER TABLE "StockItem" ADD COLUMN "warehouseId" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN "warehouseId" TEXT;
ALTER TABLE "StockBin" ADD COLUMN "warehouseId" TEXT;
ALTER TABLE "StockLocation" ADD COLUMN "warehouseId" TEXT;
ALTER TABLE "StockCountSession" ADD COLUMN "warehouseId" TEXT;

-- 4. Backfill all existing rows to MAIN
UPDATE "StockItem" SET "warehouseId" = 'wh_main_geleoteka';
UPDATE "StockMovement" SET "warehouseId" = 'wh_main_geleoteka';
UPDATE "StockBin" SET "warehouseId" = 'wh_main_geleoteka';
UPDATE "StockLocation" SET "warehouseId" = 'wh_main_geleoteka';
UPDATE "StockCountSession" SET "warehouseId" = 'wh_main_geleoteka';

-- 5. Enforce NOT NULL
ALTER TABLE "StockItem" ALTER COLUMN "warehouseId" SET NOT NULL;
ALTER TABLE "StockMovement" ALTER COLUMN "warehouseId" SET NOT NULL;
ALTER TABLE "StockBin" ALTER COLUMN "warehouseId" SET NOT NULL;
ALTER TABLE "StockLocation" ALTER COLUMN "warehouseId" SET NOT NULL;
ALTER TABLE "StockCountSession" ALTER COLUMN "warehouseId" SET NOT NULL;

-- 6. Foreign keys
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockBin" ADD CONSTRAINT "StockBin_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockCountSession" ADD CONSTRAINT "StockCountSession_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7. Swap StockItem uniqueness: partId -> (partId, warehouseId)
DROP INDEX "StockItem_partId_key";
CREATE UNIQUE INDEX "StockItem_partId_warehouseId_key" ON "StockItem"("partId", "warehouseId");

-- 8. Widen StockMovement idempotency unique to include warehouseId
DROP INDEX "StockMovement_tenantKey_sourceType_sourceId_reason_key";
CREATE UNIQUE INDEX "StockMovement_tenantKey_sourceType_sourceId_reason_warehouseId_key" ON "StockMovement"("tenantKey", "sourceType", "sourceId", "reason", "warehouseId");

-- 9. Make StockLocation cell codes unique per warehouse
DROP INDEX "StockLocation_tenantKey_code_key";
CREATE UNIQUE INDEX "StockLocation_tenantKey_warehouseId_code_key" ON "StockLocation"("tenantKey", "warehouseId", "code");
