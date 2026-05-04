-- CreateEnum
CREATE TYPE "UserPermissionRole" AS ENUM ('NONE', 'CLIENT', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "VehicleOwnershipType" AS ENUM ('CUSTOMER', 'RENTAL', 'LOANER');

-- CreateEnum
CREATE TYPE "RepairOrderStatus" AS ENUM ('ESTIMATE', 'APPROVED', 'IN_PROGRESS', 'AWAITING_PARTS', 'QC', 'READY', 'INVOICED', 'PAID', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobLineStatus" AS ENUM ('PROPOSED', 'APPROVED', 'DECLINED', 'DEFERRED', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "PartLineStatus" AS ENUM ('NEEDED', 'ORDERED', 'RECEIVED', 'INSTALLED');

-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_carId_fkey";

-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_masterId_fkey";

-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_userId_fkey";

-- DropForeignKey
ALTER TABLE "AppointmentService" DROP CONSTRAINT "AppointmentService_appointmentId_fkey";

-- DropForeignKey
ALTER TABLE "AppointmentService" DROP CONSTRAINT "AppointmentService_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "Car" DROP CONSTRAINT "Car_userId_fkey";

-- DropForeignKey
ALTER TABLE "Estimate" DROP CONSTRAINT "Estimate_appointmentId_fkey";

-- DropForeignKey
ALTER TABLE "EstimateItem" DROP CONSTRAINT "EstimateItem_estimateId_fkey";

-- DropForeignKey
ALTER TABLE "FounderContribution" DROP CONSTRAINT "FounderContribution_founderId_fkey";

-- DropForeignKey
ALTER TABLE "FounderContribution" DROP CONSTRAINT "FounderContribution_orderId_fkey";

-- DropForeignKey
ALTER TABLE "LoyaltyTransaction" DROP CONSTRAINT "LoyaltyTransaction_appointmentId_fkey";

-- DropForeignKey
ALTER TABLE "RentalBooking" DROP CONSTRAINT "RentalBooking_carId_fkey";

-- DropForeignKey
ALTER TABLE "SupplierOrder" DROP CONSTRAINT "SupplierOrder_supplierId_fkey";

-- DropIndex
DROP INDEX "RentalBooking_carId_idx";

-- DropIndex
DROP INDEX "SupplierOrder_supplierId_idx";

-- AlterTable
ALTER TABLE "LoyaltyTransaction" DROP COLUMN "appointmentId",
ADD COLUMN     "repairOrderId" TEXT;

-- AlterTable
ALTER TABLE "MasterProfile" DROP CONSTRAINT "MasterProfile_pkey",
DROP COLUMN "createdAt",
DROP COLUMN "experience",
DROP COLUMN "id",
DROP COLUMN "name",
DROP COLUMN "photo",
DROP COLUMN "role",
DROP COLUMN "updatedAt",
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "specialty" TEXT,
ADD COLUMN     "userId" TEXT NOT NULL,
ADD COLUMN     "yearsExperience" INTEGER,
ADD CONSTRAINT "MasterProfile_pkey" PRIMARY KEY ("userId");

-- AlterTable
ALTER TABLE "RentalBooking" DROP COLUMN "carId",
ADD COLUMN     "vehicleId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "SupplierOrder" DROP COLUMN "supplierId",
ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "role",
ADD COLUMN     "isCustomer" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isMaster" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSupplier" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "permissionRole" "UserPermissionRole" NOT NULL DEFAULT 'CLIENT',
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- DropTable
DROP TABLE "Appointment";

-- DropTable
DROP TABLE "AppointmentService";

-- DropTable
DROP TABLE "Car";

-- DropTable
DROP TABLE "Estimate";

-- DropTable
DROP TABLE "EstimateItem";

-- DropTable
DROP TABLE "Founder";

-- DropTable
DROP TABLE "FounderContribution";

-- DropTable
DROP TABLE "Master";

-- DropTable
DROP TABLE "RentalCar";

-- DropTable
DROP TABLE "Supplier";

-- DropEnum
DROP TYPE "AppointmentStatus";

-- DropEnum
DROP TYPE "EstimateItemType";

-- DropEnum
DROP TYPE "EstimateStatus";

-- DropEnum
DROP TYPE "UserRole";

-- CreateTable
CREATE TABLE "CustomerProfile" (
    "userId" TEXT NOT NULL,
    "preferredMasterUserId" TEXT,
    "blacklisted" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "CustomerProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "SupplierProfile" (
    "userId" TEXT NOT NULL,
    "contactName" TEXT,
    "country" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SupplierProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "ownershipType" "VehicleOwnershipType" NOT NULL DEFAULT 'CUSTOMER',
    "ownerUserId" TEXT,
    "vin" TEXT,
    "plate" TEXT,
    "make" TEXT NOT NULL DEFAULT 'Mercedes-Benz',
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "color" TEXT,
    "engine" TEXT,
    "horsepower" INTEGER,
    "transmission" TEXT,
    "features" TEXT[],
    "seats" INTEGER NOT NULL DEFAULT 5,
    "mileage" INTEGER NOT NULL DEFAULT 0,
    "dailyRate" INTEGER,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "photos" TEXT[],
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairOrder" (
    "id" TEXT NOT NULL,
    "roNumber" TEXT,
    "userId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "masterUserId" TEXT,
    "status" "RepairOrderStatus" NOT NULL DEFAULT 'ESTIMATE',
    "dateTime" TIMESTAMP(3) NOT NULL,
    "mileageIn" INTEGER,
    "mileageOut" INTEGER,
    "concern" TEXT,
    "notes" TEXT,
    "subtotalLabor" INTEGER NOT NULL DEFAULT 0,
    "subtotalParts" INTEGER NOT NULL DEFAULT 0,
    "tax" INTEGER NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "promisedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepairOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLine" (
    "id" TEXT NOT NULL,
    "repairOrderId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "status" "JobLineStatus" NOT NULL DEFAULT 'PROPOSED',
    "laborTotal" INTEGER NOT NULL DEFAULT 0,
    "partsTotal" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborLine" (
    "id" TEXT NOT NULL,
    "jobLineId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "bookHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualHours" DOUBLE PRECISION,
    "rate" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "technicianUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaborLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartLine" (
    "id" TEXT NOT NULL,
    "jobLineId" TEXT NOT NULL,
    "partId" TEXT,
    "description" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unitCost" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" INTEGER NOT NULL DEFAULT 0,
    "supplierUserId" TEXT,
    "status" "PartLineStatus" NOT NULL DEFAULT 'NEEDED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProfile_userId_key" ON "CustomerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierProfile_userId_key" ON "SupplierProfile"("userId");

-- CreateIndex
CREATE INDEX "SupplierProfile_isActive_idx" ON "SupplierProfile"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_vin_key" ON "Vehicle"("vin");

-- CreateIndex
CREATE INDEX "Vehicle_ownerUserId_idx" ON "Vehicle"("ownerUserId");

-- CreateIndex
CREATE INDEX "Vehicle_ownershipType_idx" ON "Vehicle"("ownershipType");

-- CreateIndex
CREATE INDEX "Vehicle_isAvailable_idx" ON "Vehicle"("isAvailable");

-- CreateIndex
CREATE INDEX "Vehicle_isArchived_idx" ON "Vehicle"("isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "RepairOrder_roNumber_key" ON "RepairOrder"("roNumber");

-- CreateIndex
CREATE INDEX "RepairOrder_userId_idx" ON "RepairOrder"("userId");

-- CreateIndex
CREATE INDEX "RepairOrder_vehicleId_idx" ON "RepairOrder"("vehicleId");

-- CreateIndex
CREATE INDEX "RepairOrder_masterUserId_idx" ON "RepairOrder"("masterUserId");

-- CreateIndex
CREATE INDEX "RepairOrder_status_idx" ON "RepairOrder"("status");

-- CreateIndex
CREATE INDEX "RepairOrder_dateTime_idx" ON "RepairOrder"("dateTime");

-- CreateTable
CREATE TABLE "Slot" (
    "id" TEXT NOT NULL,
    "dateTime" TIMESTAMP(3) NOT NULL,
    "repairOrderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Slot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Slot_dateTime_key" ON "Slot"("dateTime");

-- CreateIndex
CREATE UNIQUE INDEX "Slot_repairOrderId_key" ON "Slot"("repairOrderId");

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "RepairOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "JobLine_repairOrderId_idx" ON "JobLine"("repairOrderId");

-- CreateIndex
CREATE INDEX "JobLine_status_idx" ON "JobLine"("status");

-- CreateIndex
CREATE INDEX "LaborLine_jobLineId_idx" ON "LaborLine"("jobLineId");

-- CreateIndex
CREATE INDEX "PartLine_jobLineId_idx" ON "PartLine"("jobLineId");

-- CreateIndex
CREATE INDEX "PartLine_partId_idx" ON "PartLine"("partId");

-- CreateIndex
CREATE UNIQUE INDEX "MasterProfile_userId_key" ON "MasterProfile"("userId");

-- CreateIndex
CREATE INDEX "RentalBooking_vehicleId_idx" ON "RentalBooking"("vehicleId");

-- CreateIndex
CREATE INDEX "SupplierOrder_userId_idx" ON "SupplierOrder"("userId");

-- CreateIndex
CREATE INDEX "User_isCustomer_idx" ON "User"("isCustomer");

-- CreateIndex
CREATE INDEX "User_isMaster_idx" ON "User"("isMaster");

-- CreateIndex
CREATE INDEX "User_isSupplier_idx" ON "User"("isSupplier");

-- CreateIndex
CREATE INDEX "User_permissionRole_idx" ON "User"("permissionRole");

-- AddForeignKey
ALTER TABLE "CustomerProfile" ADD CONSTRAINT "CustomerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterProfile" ADD CONSTRAINT "MasterProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProfile" ADD CONSTRAINT "SupplierProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_masterUserId_fkey" FOREIGN KEY ("masterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLine" ADD CONSTRAINT "JobLine_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "RepairOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborLine" ADD CONSTRAINT "LaborLine_jobLineId_fkey" FOREIGN KEY ("jobLineId") REFERENCES "JobLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborLine" ADD CONSTRAINT "LaborLine_technicianUserId_fkey" FOREIGN KEY ("technicianUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartLine" ADD CONSTRAINT "PartLine_jobLineId_fkey" FOREIGN KEY ("jobLineId") REFERENCES "JobLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartLine" ADD CONSTRAINT "PartLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "RepairOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalBooking" ADD CONSTRAINT "RentalBooking_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrder" ADD CONSTRAINT "SupplierOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

