-- AlterTable
ALTER TABLE "RentalCar" ADD COLUMN     "engine" TEXT,
ADD COLUMN     "features" TEXT[],
ADD COLUMN     "horsepower" INTEGER,
ADD COLUMN     "seats" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "transmission" TEXT;
