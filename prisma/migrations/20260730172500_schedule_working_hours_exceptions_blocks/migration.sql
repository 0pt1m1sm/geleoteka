-- Schedule configuration: weekly working hours, per-date exceptions (holidays /
-- special hours) and arbitrary blocked intervals. Purely additive — three new
-- tables, nothing existing is touched, so this is safe to deploy while bookings
-- are live. Availability keeps working from code defaults until rows are seeded.

-- NOTE: `prisma migrate dev` again generated DROP INDEX for the un-modelled
-- Part_photos_gin_idx / Vehicle_photos_gin_idx GIN indexes (created as raw SQL
-- in 20260505123839_add_uploaded_image; Prisma can't model GIN on String[]).
-- Those drops are intentionally OMITTED — same convention as 20260522153000,
-- 20260522191634, 20260523170231, 20260524103113 and 20260720083911.
--
-- It also generated `ALTER INDEX "StockMovement_tenantKey_sourceType_sourceId_reason_warehouseId_"
-- RENAME TO "StockMovement_tenantKey_sourceType_sourceId_reason_warehous_key"`,
-- reconciling a name Postgres truncated at 63 chars in 20260525013449. That
-- rename is unrelated to this migration and would abort the whole deploy if the
-- production index carried a different truncation, so it is omitted too.

-- CreateTable
CREATE TABLE "WorkingHours" (
    "dayOfWeek" INTEGER NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "openMinute" INTEGER NOT NULL DEFAULT 540,
    "closeMinute" INTEGER NOT NULL DEFAULT 1140,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkingHours_pkey" PRIMARY KEY ("dayOfWeek")
);

-- CreateTable
CREATE TABLE "ScheduleException" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT true,
    "openMinute" INTEGER,
    "closeMinute" INTEGER,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockedInterval" (
    "id" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedInterval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleException_date_key" ON "ScheduleException"("date");

-- CreateIndex
CREATE INDEX "ScheduleException_date_idx" ON "ScheduleException"("date");

-- CreateIndex
CREATE INDEX "BlockedInterval_startAt_endAt_idx" ON "BlockedInterval"("startAt", "endAt");
