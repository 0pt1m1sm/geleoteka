/*
  Warnings:

  - Made the column `dealId` on table `PartOrder` required. This step will fail if there are existing NULL values in that column.
  - Made the column `dealId` on table `RentalBooking` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "PartOrder" DROP CONSTRAINT "PartOrder_dealId_fkey";

-- DropForeignKey
ALTER TABLE "RentalBooking" DROP CONSTRAINT "RentalBooking_dealId_fkey";

-- NOTE: Prisma's diff wanted to DROP "Part_photos_gin_idx" and
-- "Vehicle_photos_gin_idx" here — GIN indexes that exist in the DB but are not
-- modelled in schema.prisma. Those drops are unrelated to this migration and
-- were removed deliberately; do not re-add them.

-- AlterTable
ALTER TABLE "PartOrder" ALTER COLUMN "dealId" SET NOT NULL;

-- AlterTable
ALTER TABLE "RentalBooking" ALTER COLUMN "dealId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "PartOrder" ADD CONSTRAINT "PartOrder_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalBooking" ADD CONSTRAINT "RentalBooking_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
