-- AlterTable
ALTER TABLE "RentalBooking" ADD COLUMN     "claimToken" TEXT;

-- CreateIndex
CREATE INDEX "RentalBooking_claimToken_idx" ON "RentalBooking"("claimToken");
