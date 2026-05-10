-- CreateTable
CREATE TABLE "RepairOrderPhoto" (
    "id" TEXT NOT NULL,
    "repairOrderId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairOrderPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepairOrderPhoto_repairOrderId_idx" ON "RepairOrderPhoto"("repairOrderId");

-- CreateIndex
CREATE INDEX "RepairOrderPhoto_uploadedById_idx" ON "RepairOrderPhoto"("uploadedById");

-- CreateIndex
CREATE INDEX "RepairOrderPhoto_createdAt_idx" ON "RepairOrderPhoto"("createdAt");

-- AddForeignKey
ALTER TABLE "RepairOrderPhoto" ADD CONSTRAINT "RepairOrderPhoto_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "RepairOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrderPhoto" ADD CONSTRAINT "RepairOrderPhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
