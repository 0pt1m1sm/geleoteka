-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('DRAFT', 'QUOTED', 'APPROVED', 'IN_FULFILLMENT', 'DELIVERED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "DealChannel" AS ENUM ('SERVICE', 'PARTS_RETAIL', 'PARTS_WHOLESALE', 'RENTAL', 'WALK_IN');

-- CreateEnum
CREATE TYPE "DealPaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'REFUNDED');

-- CreateEnum
CREATE TYPE "DealLineType" AS ENUM ('LABOR', 'PART', 'RENTAL_DAY', 'DISCOUNT', 'FEE');

-- CreateEnum
CREATE TYPE "EstimateStage" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'DECLINED', 'EXPIRED', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "PartOrder" ADD COLUMN     "dealId" TEXT;

-- AlterTable
ALTER TABLE "RentalBooking" ADD COLUMN     "dealId" TEXT;

-- AlterTable
ALTER TABLE "RepairOrder" ADD COLUMN     "dealId" TEXT;

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "customerUserId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "ownerUserId" TEXT,
    "stage" "DealStage" NOT NULL DEFAULT 'DRAFT',
    "channel" "DealChannel" NOT NULL,
    "source" TEXT,
    "paymentStatus" "DealPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "subtotalLabor" INTEGER NOT NULL DEFAULT 0,
    "subtotalParts" INTEGER NOT NULL DEFAULT 0,
    "subtotalRental" INTEGER NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "tax" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "quotedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "claimToken" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealLine" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "type" "DealLineType" NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "partId" TEXT,
    "vehicleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "dealId" TEXT NOT NULL,
    "stage" "EstimateStage" NOT NULL DEFAULT 'DRAFT',
    "preparedByUserId" TEXT,
    "validUntil" TIMESTAMP(3),
    "parentEstimateId" TEXT,
    "notes" TEXT,
    "sentAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "subtotalLabor" INTEGER NOT NULL DEFAULT 0,
    "subtotalParts" INTEGER NOT NULL DEFAULT 0,
    "subtotalRental" INTEGER NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "tax" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateLine" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "type" "DealLineType" NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "partId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstimateLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Deal_number_key" ON "Deal"("number");

-- CreateIndex
CREATE INDEX "Deal_customerUserId_idx" ON "Deal"("customerUserId");

-- CreateIndex
CREATE INDEX "Deal_vehicleId_idx" ON "Deal"("vehicleId");

-- CreateIndex
CREATE INDEX "Deal_ownerUserId_idx" ON "Deal"("ownerUserId");

-- CreateIndex
CREATE INDEX "Deal_stage_idx" ON "Deal"("stage");

-- CreateIndex
CREATE INDEX "Deal_channel_idx" ON "Deal"("channel");

-- CreateIndex
CREATE INDEX "Deal_claimToken_idx" ON "Deal"("claimToken");

-- CreateIndex
CREATE INDEX "Deal_createdAt_idx" ON "Deal"("createdAt");

-- CreateIndex
CREATE INDEX "DealLine_dealId_sortOrder_idx" ON "DealLine"("dealId", "sortOrder");

-- CreateIndex
CREATE INDEX "DealLine_type_idx" ON "DealLine"("type");

-- CreateIndex
CREATE INDEX "DealLine_partId_idx" ON "DealLine"("partId");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_number_key" ON "Estimate"("number");

-- CreateIndex
CREATE INDEX "Estimate_dealId_idx" ON "Estimate"("dealId");

-- CreateIndex
CREATE INDEX "Estimate_stage_idx" ON "Estimate"("stage");

-- CreateIndex
CREATE INDEX "Estimate_number_idx" ON "Estimate"("number");

-- CreateIndex
CREATE INDEX "EstimateLine_estimateId_sortOrder_idx" ON "EstimateLine"("estimateId", "sortOrder");

-- CreateIndex
CREATE INDEX "EstimateLine_partId_idx" ON "EstimateLine"("partId");

-- CreateIndex
CREATE INDEX "PartOrder_dealId_idx" ON "PartOrder"("dealId");

-- CreateIndex
CREATE INDEX "RentalBooking_dealId_idx" ON "RentalBooking"("dealId");

-- CreateIndex
CREATE INDEX "RepairOrder_dealId_idx" ON "RepairOrder"("dealId");

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartOrder" ADD CONSTRAINT "PartOrder_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalBooking" ADD CONSTRAINT "RentalBooking_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealLine" ADD CONSTRAINT "DealLine_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealLine" ADD CONSTRAINT "DealLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealLine" ADD CONSTRAINT "DealLine_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_preparedByUserId_fkey" FOREIGN KEY ("preparedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_parentEstimateId_fkey" FOREIGN KEY ("parentEstimateId") REFERENCES "Estimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ============================================================
-- BACKFILL — synthesize a Deal for every existing fulfillment
-- ============================================================
--
-- Phase 0 of Deal+Fulfillment migration. Every existing RepairOrder,
-- PartOrder, and RentalBooking gets a corresponding Deal so that
-- subsequent steps can mark dealId NOT NULL. The backfill is
-- idempotent over its own scope: it skips rows that already have a
-- non-null dealId. If you re-run after a partial failure, no rows are
-- duplicated.
--
-- Stage mapping derived from each fulfillment's status. See the
-- Deal+Fulfillment PRD for rationale.

-- 1) RepairOrders → Deals (channel=SERVICE)
WITH inserted AS (
  INSERT INTO "Deal" (
    id, "customerUserId", "vehicleId", stage, channel, source,
    "subtotalLabor", "subtotalParts", discount, tax, total,
    "claimToken", "createdAt", "updatedAt"
  )
  SELECT
    'c' || replace(gen_random_uuid()::text, '-', ''),
    ro."userId",
    ro."vehicleId",
    CASE ro.status
      WHEN 'ESTIMATE' THEN 'QUOTED'::"DealStage"
      WHEN 'APPROVED' THEN 'APPROVED'::"DealStage"
      WHEN 'IN_PROGRESS' THEN 'IN_FULFILLMENT'::"DealStage"
      WHEN 'AWAITING_PARTS' THEN 'IN_FULFILLMENT'::"DealStage"
      WHEN 'QC' THEN 'IN_FULFILLMENT'::"DealStage"
      WHEN 'READY' THEN 'IN_FULFILLMENT'::"DealStage"
      WHEN 'INVOICED' THEN 'DELIVERED'::"DealStage"
      WHEN 'PAID' THEN 'WON'::"DealStage"
      WHEN 'CLOSED' THEN 'WON'::"DealStage"
      WHEN 'CANCELLED' THEN 'LOST'::"DealStage"
      ELSE 'DRAFT'::"DealStage"
    END,
    'SERVICE'::"DealChannel",
    'backfill-ro',
    ro."subtotalLabor",
    ro."subtotalParts",
    ro.discount,
    ro.tax,
    ro.total,
    ro."claimToken",
    ro."createdAt",
    ro."updatedAt"
  FROM "RepairOrder" ro
  WHERE ro."dealId" IS NULL
  RETURNING id, "customerUserId", "vehicleId", "createdAt"
)
-- Link each new Deal back to the source RO. We rematch by (customer, vehicle, createdAt)
-- because the RETURNING above doesn't preserve the source RO id.
UPDATE "RepairOrder" ro
SET "dealId" = ins.id
FROM inserted ins
WHERE ro."dealId" IS NULL
  AND ro."userId" = ins."customerUserId"
  AND ro."vehicleId" = ins."vehicleId"
  AND ro."createdAt" = ins."createdAt";

-- 2) DealLines for each backfilled RepairOrder, synthesized from JobLine totals.
INSERT INTO "DealLine" (id, "dealId", "sortOrder", type, description, qty, "unitPrice", total, "createdAt")
SELECT
  'c' || replace(gen_random_uuid()::text, '-', ''),
  ro."dealId",
  jl."sortOrder",
  'LABOR'::"DealLineType",
  jl.description,
  1,
  jl."laborTotal",
  jl."laborTotal",
  jl."createdAt"
FROM "JobLine" jl
JOIN "RepairOrder" ro ON ro.id = jl."repairOrderId"
WHERE ro."dealId" IS NOT NULL
  AND jl."laborTotal" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "DealLine" dl
    WHERE dl."dealId" = ro."dealId" AND dl.type = 'LABOR'::"DealLineType" AND dl.description = jl.description
  );

INSERT INTO "DealLine" (id, "dealId", "sortOrder", type, description, qty, "unitPrice", total, "createdAt")
SELECT
  'c' || replace(gen_random_uuid()::text, '-', ''),
  ro."dealId",
  jl."sortOrder" + 1000,
  'PART'::"DealLineType",
  jl.description || ' (запчасти)',
  1,
  jl."partsTotal",
  jl."partsTotal",
  jl."createdAt"
FROM "JobLine" jl
JOIN "RepairOrder" ro ON ro.id = jl."repairOrderId"
WHERE ro."dealId" IS NOT NULL
  AND jl."partsTotal" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "DealLine" dl
    WHERE dl."dealId" = ro."dealId" AND dl.type = 'PART'::"DealLineType" AND dl.description = jl.description || ' (запчасти)'
  );

-- 3) PartOrders → Deals (channel=PARTS_RETAIL)
WITH inserted AS (
  INSERT INTO "Deal" (
    id, "customerUserId", "vehicleId", stage, channel, source,
    "subtotalParts", total, "claimToken", notes,
    "createdAt", "updatedAt"
  )
  SELECT
    'c' || replace(gen_random_uuid()::text, '-', ''),
    -- Guest part orders stored userId NULL; we cannot synthesize a Deal without
    -- a customer FK, so we only backfill orders that have a userId. Guest
    -- orders without userId are intentionally skipped here; the Deal+Fulfillment
    -- v2 migration will require dealId NOT NULL only after we resolve them.
    po."userId",
    NULL,
    CASE po.status
      WHEN 'PENDING' THEN 'DRAFT'::"DealStage"
      WHEN 'CONFIRMED' THEN 'APPROVED'::"DealStage"
      WHEN 'SHIPPED' THEN 'IN_FULFILLMENT'::"DealStage"
      WHEN 'COMPLETED' THEN 'WON'::"DealStage"
      WHEN 'CANCELLED' THEN 'LOST'::"DealStage"
      ELSE 'DRAFT'::"DealStage"
    END,
    'PARTS_RETAIL'::"DealChannel",
    'backfill-po',
    po.total,
    po.total,
    po."claimToken",
    po.notes,
    po."createdAt",
    po."updatedAt"
  FROM "PartOrder" po
  WHERE po."dealId" IS NULL
    AND po."userId" IS NOT NULL
  RETURNING id, "customerUserId", "createdAt"
)
UPDATE "PartOrder" po
SET "dealId" = ins.id
FROM inserted ins
WHERE po."dealId" IS NULL
  AND po."userId" = ins."customerUserId"
  AND po."createdAt" = ins."createdAt";

-- 4) DealLines for each backfilled PartOrder, one per PartOrderItem.
INSERT INTO "DealLine" (id, "dealId", "sortOrder", type, description, qty, "unitPrice", total, "partId", "createdAt")
SELECT
  'c' || replace(gen_random_uuid()::text, '-', ''),
  po."dealId",
  ROW_NUMBER() OVER (PARTITION BY po.id ORDER BY poi.id),
  'PART'::"DealLineType",
  COALESCE(p.name, 'Запчасть'),
  poi.quantity,
  poi."unitPrice",
  poi.quantity * poi."unitPrice",
  poi."partId",
  po."createdAt"
FROM "PartOrderItem" poi
JOIN "PartOrder" po ON po.id = poi."orderId"
LEFT JOIN "Part" p ON p.id = poi."partId"
WHERE po."dealId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "DealLine" dl
    WHERE dl."dealId" = po."dealId" AND dl."partId" = poi."partId"
  );

-- 5) RentalBookings → Deals (channel=RENTAL)
WITH inserted AS (
  INSERT INTO "Deal" (
    id, "customerUserId", "vehicleId", stage, channel, source,
    "subtotalRental", total, "claimToken", notes,
    "createdAt", "updatedAt"
  )
  SELECT
    'c' || replace(gen_random_uuid()::text, '-', ''),
    rb."userId",
    rb."vehicleId",
    CASE rb.status
      WHEN 'PENDING' THEN 'DRAFT'::"DealStage"
      WHEN 'CONFIRMED' THEN 'APPROVED'::"DealStage"
      WHEN 'ACTIVE' THEN 'IN_FULFILLMENT'::"DealStage"
      WHEN 'RETURNED' THEN 'WON'::"DealStage"
      WHEN 'CANCELLED' THEN 'LOST'::"DealStage"
      ELSE 'DRAFT'::"DealStage"
    END,
    'RENTAL'::"DealChannel",
    'backfill-rb',
    rb."totalCost",
    rb."totalCost",
    rb."claimToken",
    rb.notes,
    rb."createdAt",
    rb."updatedAt"
  FROM "RentalBooking" rb
  WHERE rb."dealId" IS NULL
    AND rb."userId" IS NOT NULL
  RETURNING id, "customerUserId", "vehicleId", "createdAt"
)
UPDATE "RentalBooking" rb
SET "dealId" = ins.id
FROM inserted ins
WHERE rb."dealId" IS NULL
  AND rb."userId" = ins."customerUserId"
  AND rb."vehicleId" = ins."vehicleId"
  AND rb."createdAt" = ins."createdAt";

-- 6) DealLine for each backfilled RentalBooking — single RENTAL_DAY line.
INSERT INTO "DealLine" (id, "dealId", "sortOrder", type, description, qty, "unitPrice", total, "vehicleId", "createdAt")
SELECT
  'c' || replace(gen_random_uuid()::text, '-', ''),
  rb."dealId",
  0,
  'RENTAL_DAY'::"DealLineType",
  'Аренда: ' || COALESCE(v.make || ' ' || v.model, 'автомобиль'),
  GREATEST(1, EXTRACT(EPOCH FROM (rb."endDate" - rb."startDate")) / 86400)::int,
  CASE
    WHEN EXTRACT(EPOCH FROM (rb."endDate" - rb."startDate")) / 86400 > 0
    THEN (rb."totalCost" / GREATEST(1, EXTRACT(EPOCH FROM (rb."endDate" - rb."startDate")) / 86400))::int
    ELSE rb."totalCost"
  END,
  rb."totalCost",
  rb."vehicleId",
  rb."createdAt"
FROM "RentalBooking" rb
LEFT JOIN "Vehicle" v ON v.id = rb."vehicleId"
WHERE rb."dealId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "DealLine" dl
    WHERE dl."dealId" = rb."dealId" AND dl.type = 'RENTAL_DAY'::"DealLineType"
  );
