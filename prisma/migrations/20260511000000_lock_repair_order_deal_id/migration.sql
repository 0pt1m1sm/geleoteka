-- DropForeignKey
ALTER TABLE "RepairOrder" DROP CONSTRAINT "RepairOrder_dealId_fkey";

-- AlterTable
ALTER TABLE "RepairOrder" ALTER COLUMN "dealId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

