-- DropForeignKey
ALTER TABLE "DealLine" DROP CONSTRAINT IF EXISTS "DealLine_dealId_fkey";
ALTER TABLE "DealLine" DROP CONSTRAINT IF EXISTS "DealLine_partId_fkey";
ALTER TABLE "DealLine" DROP CONSTRAINT IF EXISTS "DealLine_vehicleId_fkey";

-- DropTable
DROP TABLE IF EXISTS "DealLine";
