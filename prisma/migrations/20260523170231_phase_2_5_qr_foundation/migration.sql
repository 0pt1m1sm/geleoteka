-- CreateEnum
CREATE TYPE "ScanResult" AS ENUM ('SUCCESS', 'REJECTED', 'ERROR');

-- AlterEnum
ALTER TYPE "UserPermissionRole" ADD VALUE 'WAREHOUSE_WORKER';

-- NOTE: Prisma's diff again wanted to DROP the un-modelled "Part_photos_gin_idx"
-- and "Vehicle_photos_gin_idx" GIN indexes (created via raw SQL in
-- 20260505123839_add_uploaded_image). Those drops are intentionally omitted —
-- the indexes back photo-array queries and are managed outside the Prisma schema.

-- AlterTable
ALTER TABLE "StockBinMovement" ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateTable
CREATE TABLE "StockLocation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "zone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "tenantKey" TEXT NOT NULL DEFAULT 'geleoteka',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "deviceId" TEXT,
    "sessionId" TEXT,
    "action" TEXT NOT NULL,
    "rawCode" TEXT NOT NULL,
    "parsedObjectType" TEXT,
    "parsedObjectId" TEXT,
    "result" "ScanResult" NOT NULL,
    "errorCode" TEXT,
    "tenantKey" TEXT NOT NULL DEFAULT 'geleoteka',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockLocation_tenantKey_idx" ON "StockLocation"("tenantKey");

-- CreateIndex
CREATE UNIQUE INDEX "StockLocation_tenantKey_code_key" ON "StockLocation"("tenantKey", "code");

-- CreateIndex
CREATE INDEX "ScanEvent_tenantKey_createdAt_idx" ON "ScanEvent"("tenantKey", "createdAt");

-- CreateIndex
CREATE INDEX "ScanEvent_tenantKey_userId_createdAt_idx" ON "ScanEvent"("tenantKey", "userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockBinMovement_tenantKey_idempotencyKey_key" ON "StockBinMovement"("tenantKey", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_tenantKey_idempotencyKey_key" ON "StockMovement"("tenantKey", "idempotencyKey");

