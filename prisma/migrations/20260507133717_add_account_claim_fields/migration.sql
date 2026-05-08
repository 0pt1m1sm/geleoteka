-- AlterTable
ALTER TABLE "PartOrder" ADD COLUMN     "claimToken" TEXT;

-- AlterTable
ALTER TABLE "RepairOrder" ADD COLUMN     "claimToken" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isTempPassword" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "PartOrder_claimToken_idx" ON "PartOrder"("claimToken");

-- CreateIndex
CREATE INDEX "RepairOrder_claimToken_idx" ON "RepairOrder"("claimToken");
