-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID');

-- AlterTable
ALTER TABLE "RepairOrder" ADD COLUMN     "trimId" TEXT;

-- CreateTable
CREATE TABLE "VehicleTrim" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "bodyStyle" TEXT,
    "drivetrain" TEXT,
    "fuelType" "FuelType",
    "engineCode" TEXT,
    "displacementL" DECIMAL(3,1),
    "horsepower" INTEGER,
    "notes" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleTrim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartTrim" (
    "partId" TEXT NOT NULL,
    "trimId" TEXT NOT NULL,

    CONSTRAINT "PartTrim_pkey" PRIMARY KEY ("partId","trimId")
);

-- CreateIndex
CREATE INDEX "VehicleTrim_generationId_sortOrder_idx" ON "VehicleTrim"("generationId", "sortOrder");

-- CreateIndex
CREATE INDEX "VehicleTrim_isActive_idx" ON "VehicleTrim"("isActive");

-- CreateIndex
CREATE INDEX "VehicleTrim_isDefault_idx" ON "VehicleTrim"("isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleTrim_generationId_code_key" ON "VehicleTrim"("generationId", "code");

-- CreateIndex
CREATE INDEX "PartTrim_trimId_idx" ON "PartTrim"("trimId");

-- CreateIndex
CREATE INDEX "RepairOrder_trimId_idx" ON "RepairOrder"("trimId");

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_trimId_fkey" FOREIGN KEY ("trimId") REFERENCES "VehicleTrim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleTrim" ADD CONSTRAINT "VehicleTrim_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "VehicleGeneration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartTrim" ADD CONSTRAINT "PartTrim_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartTrim" ADD CONSTRAINT "PartTrim_trimId_fkey" FOREIGN KEY ("trimId") REFERENCES "VehicleTrim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
