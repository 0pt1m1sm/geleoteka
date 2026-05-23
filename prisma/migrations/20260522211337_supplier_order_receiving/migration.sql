-- AlterEnum
ALTER TYPE "SupplierOrderStatus" ADD VALUE 'PARTIALLY_RECEIVED';

-- AlterTable
ALTER TABLE "SupplierOrderItem" ADD COLUMN     "receivedQuantity" INTEGER NOT NULL DEFAULT 0;

-- Backfill: terminal-received orders already have their stock applied, so mark
-- their PART lines fully received to keep the new receiving UI from inviting a
-- duplicate receive. CANCELLED is intentionally excluded (may never have been
-- received). PARTIALLY_RECEIVED is new, so no rows carry it yet.
UPDATE "SupplierOrderItem" soi
SET "receivedQuantity" = soi."quantity"
FROM "SupplierOrder" so
WHERE soi."orderId" = so."id"
  AND so."status" IN ('RECEIVED', 'COMPLETED')
  AND soi."type" = 'PART';
