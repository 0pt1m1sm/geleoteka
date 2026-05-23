-- CreateEnum
CREATE TYPE "CustomsMode" AS ENUM ('PERCENT_CIF', 'CARGO_PER_KG');

-- AlterTable
ALTER TABLE "Part" ADD COLUMN     "weightGrams" INTEGER;

-- AlterTable
ALTER TABLE "SupplierOrder" ADD COLUMN     "cargoRateUsdCents" INTEGER,
ADD COLUMN     "customsMode" "CustomsMode" NOT NULL DEFAULT 'PERCENT_CIF',
ADD COLUMN     "customsPercentBps" INTEGER,
ADD COLUMN     "manualWeightOverrideGrams" INTEGER,
ADD COLUMN     "shippingRateUsdCents" INTEGER,
ADD COLUMN     "shippingWeightGrams" INTEGER,
ADD COLUMN     "usdRateKopecks" INTEGER;
