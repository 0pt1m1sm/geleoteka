-- CreateTable
CREATE TABLE "Manufacturer" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Manufacturer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleModel" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "engines" TEXT,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "manufacturerId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleGeneration" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "yearFrom" INTEGER NOT NULL,
    "yearTo" INTEGER,
    "modelId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Manufacturer_slug_key" ON "Manufacturer"("slug");

-- CreateIndex
CREATE INDEX "Manufacturer_isActive_sortOrder_idx" ON "Manufacturer"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleModel_slug_key" ON "VehicleModel"("slug");

-- CreateIndex
CREATE INDEX "VehicleModel_manufacturerId_sortOrder_idx" ON "VehicleModel"("manufacturerId", "sortOrder");

-- CreateIndex
CREATE INDEX "VehicleModel_isActive_idx" ON "VehicleModel"("isActive");

-- CreateIndex
CREATE INDEX "VehicleGeneration_modelId_sortOrder_idx" ON "VehicleGeneration"("modelId", "sortOrder");

-- CreateIndex
CREATE INDEX "VehicleGeneration_isActive_idx" ON "VehicleGeneration"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleGeneration_modelId_code_key" ON "VehicleGeneration"("modelId", "code");

-- AddForeignKey
ALTER TABLE "VehicleModel" ADD CONSTRAINT "VehicleModel_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleGeneration" ADD CONSTRAINT "VehicleGeneration_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "VehicleModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
