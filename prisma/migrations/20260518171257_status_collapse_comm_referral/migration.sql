-- Collapse RepairOrderStatus 10→5, PartOrderStatus 5→4, RentalBookingStatus 5→4.
-- Add ReferralSource enum + User.referralSource column.
-- Expand CommChannel with directional split (WhatsApp/Telegram/MAX) and keep
-- legacy values alive for any in-flight rows.

-- =========================================================================
-- RepairOrderStatus 10 → 5
-- =========================================================================
-- Mapping:
--   ESTIMATE / APPROVED          → SCHEDULED
--   IN_PROGRESS / AWAITING_PARTS / QC → IN_PROGRESS
--   READY / INVOICED             → READY
--   PAID / CLOSED                → COMPLETED
--   CANCELLED                    → CANCELLED

-- Step 1: rename old enum
ALTER TYPE "RepairOrderStatus" RENAME TO "RepairOrderStatus_old";

-- Step 2: create new enum
CREATE TYPE "RepairOrderStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED');

-- Step 3: drop the default that referenced the old type, then cast existing
-- values via CASE, then add the new default.
ALTER TABLE "RepairOrder" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "RepairOrder" ALTER COLUMN "status" TYPE "RepairOrderStatus" USING (
  CASE "status"::text
    WHEN 'ESTIMATE'       THEN 'SCHEDULED'::"RepairOrderStatus"
    WHEN 'APPROVED'       THEN 'SCHEDULED'::"RepairOrderStatus"
    WHEN 'IN_PROGRESS'    THEN 'IN_PROGRESS'::"RepairOrderStatus"
    WHEN 'AWAITING_PARTS' THEN 'IN_PROGRESS'::"RepairOrderStatus"
    WHEN 'QC'             THEN 'IN_PROGRESS'::"RepairOrderStatus"
    WHEN 'READY'          THEN 'READY'::"RepairOrderStatus"
    WHEN 'INVOICED'       THEN 'READY'::"RepairOrderStatus"
    WHEN 'PAID'           THEN 'COMPLETED'::"RepairOrderStatus"
    WHEN 'CLOSED'         THEN 'COMPLETED'::"RepairOrderStatus"
    WHEN 'CANCELLED'      THEN 'CANCELLED'::"RepairOrderStatus"
  END
);
ALTER TABLE "RepairOrder" ALTER COLUMN "status" SET DEFAULT 'SCHEDULED'::"RepairOrderStatus";

-- Step 4: drop old enum
DROP TYPE "RepairOrderStatus_old";

-- =========================================================================
-- PartOrderStatus 5 → 4
-- =========================================================================
-- Mapping: PENDING / CONFIRMED → PROCESSING; SHIPPED / COMPLETED / CANCELLED stay
ALTER TYPE "PartOrderStatus" RENAME TO "PartOrderStatus_old";
CREATE TYPE "PartOrderStatus" AS ENUM ('PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED');

ALTER TABLE "PartOrder" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "PartOrder" ALTER COLUMN "status" TYPE "PartOrderStatus" USING (
  CASE "status"::text
    WHEN 'PENDING'   THEN 'PROCESSING'::"PartOrderStatus"
    WHEN 'CONFIRMED' THEN 'PROCESSING'::"PartOrderStatus"
    WHEN 'SHIPPED'   THEN 'SHIPPED'::"PartOrderStatus"
    WHEN 'COMPLETED' THEN 'COMPLETED'::"PartOrderStatus"
    WHEN 'CANCELLED' THEN 'CANCELLED'::"PartOrderStatus"
  END
);
ALTER TABLE "PartOrder" ALTER COLUMN "status" SET DEFAULT 'PROCESSING'::"PartOrderStatus";

DROP TYPE "PartOrderStatus_old";

-- =========================================================================
-- RentalBookingStatus 5 → 4
-- =========================================================================
-- Mapping: PENDING / CONFIRMED → BOOKED; ACTIVE / RETURNED / CANCELLED stay
ALTER TYPE "RentalBookingStatus" RENAME TO "RentalBookingStatus_old";
CREATE TYPE "RentalBookingStatus" AS ENUM ('BOOKED', 'ACTIVE', 'RETURNED', 'CANCELLED');

ALTER TABLE "RentalBooking" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "RentalBooking" ALTER COLUMN "status" TYPE "RentalBookingStatus" USING (
  CASE "status"::text
    WHEN 'PENDING'   THEN 'BOOKED'::"RentalBookingStatus"
    WHEN 'CONFIRMED' THEN 'BOOKED'::"RentalBookingStatus"
    WHEN 'ACTIVE'    THEN 'ACTIVE'::"RentalBookingStatus"
    WHEN 'RETURNED'  THEN 'RETURNED'::"RentalBookingStatus"
    WHEN 'CANCELLED' THEN 'CANCELLED'::"RentalBookingStatus"
  END
);
ALTER TABLE "RentalBooking" ALTER COLUMN "status" SET DEFAULT 'BOOKED'::"RentalBookingStatus";

DROP TYPE "RentalBookingStatus_old";

-- =========================================================================
-- CommChannel — add directional split for messengers
-- =========================================================================
-- PG can ADD VALUE inside the same migration as long as the new values are
-- not USED later in the same migration. Safe here.
ALTER TYPE "CommChannel" ADD VALUE 'WHATSAPP_INBOUND';
ALTER TYPE "CommChannel" ADD VALUE 'WHATSAPP_OUTBOUND';
ALTER TYPE "CommChannel" ADD VALUE 'TELEGRAM_INBOUND';
ALTER TYPE "CommChannel" ADD VALUE 'TELEGRAM_OUTBOUND';
ALTER TYPE "CommChannel" ADD VALUE 'MAX_INBOUND';
ALTER TYPE "CommChannel" ADD VALUE 'MAX_OUTBOUND';

-- =========================================================================
-- ReferralSource + User.referralSource
-- =========================================================================
CREATE TYPE "ReferralSource" AS ENUM (
  'YANDEX', 'GOOGLE', 'AVITO', 'INSTAGRAM', 'TELEGRAM_CHAN',
  'FRIEND', 'REPEAT', 'WALK_IN', 'OTHER'
);

ALTER TABLE "User" ADD COLUMN "referralSource" "ReferralSource";
