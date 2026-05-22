-- Drop the denormalized rental cost. The price now lives on the deal's active
-- estimate (RENTAL_DAY line) and Deal.total. Backfill (scripts/backfill-fulfillment-deals.ts)
-- must have run first so every booking's deal carries the equivalent line.
ALTER TABLE "RentalBooking" DROP COLUMN "totalCost";
