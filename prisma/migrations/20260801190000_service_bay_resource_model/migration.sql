-- Resource-backed workshop capacity. This migration is deliberately handwritten:
-- the old Slot(dateTime) uniqueness stays in force until every row has a bay and
-- the replacement Slot(dateTime, bayId) unique index already exists.
--
-- SCHEDULE_CAPACITY is consumed only as migration input. The Setting row is kept
-- as a historical record, but application code no longer reads or exposes it;
-- active ServiceBay rows become the only capacity source of truth.
--
-- Standing drift exclusions: do not drop Part_photos_gin_idx or
-- Vehicle_photos_gin_idx, and do not rename any StockMovement index.

BEGIN;

CREATE TABLE "ServiceBay" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tenantKey" TEXT NOT NULL DEFAULT 'geleoteka',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceBay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceBay_tenantKey_name_key"
ON "ServiceBay"("tenantKey", "name");

CREATE INDEX "ServiceBay_tenantKey_isActive_sortOrder_idx"
ON "ServiceBay"("tenantKey", "isActive", "sortOrder");

-- A missing, malformed or non-positive legacy value means the historical
-- default: one bay. Cap the generated series at PostgreSQL's int range before
-- casting so a corrupt setting cannot abort the deploy.
WITH legacy_capacity AS (
    SELECT CASE
        WHEN btrim("value") ~ '^[0-9]+$'
             AND btrim("value")::numeric BETWEEN 1 AND 2147483647
          THEN btrim("value")::integer
        ELSE 1
    END AS capacity
    FROM "Setting"
    WHERE "key" = 'SCHEDULE_CAPACITY'
), effective_capacity AS (
    SELECT COALESCE((SELECT capacity FROM legacy_capacity LIMIT 1), 1) AS capacity
)
INSERT INTO "ServiceBay" (
    "id", "name", "isActive", "tenantKey", "sortOrder", "createdAt", "updatedAt"
)
SELECT
    'service_bay_migrated_' || bay_number,
    'Пост ' || bay_number,
    true,
    'geleoteka',
    bay_number - 1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM effective_capacity
CROSS JOIN LATERAL generate_series(1, effective_capacity.capacity) AS bay_number;

ALTER TABLE "Slot" ADD COLUMN "bayId" TEXT;

-- Slot(dateTime) is still unique here, so assigning all historical bookings to
-- the first bay cannot create a collision.
UPDATE "Slot"
SET "bayId" = 'service_bay_migrated_1'
WHERE "bayId" IS NULL;

ALTER TABLE "Slot" ALTER COLUMN "bayId" SET NOT NULL;

ALTER TABLE "Slot"
ADD CONSTRAINT "Slot_bayId_fkey"
FOREIGN KEY ("bayId") REFERENCES "ServiceBay"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Slot_bayId_idx" ON "Slot"("bayId");

-- Build the replacement while Slot_dateTime_key still protects every write.
CREATE UNIQUE INDEX "Slot_dateTime_bayId_key"
ON "Slot"("dateTime", "bayId");

-- Last operation: only now is the narrower, old guarantee redundant.
DROP INDEX "Slot_dateTime_key";

COMMIT;
