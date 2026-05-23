-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "taxRate" INTEGER NOT NULL DEFAULT 20;

-- Backfill: pre-existing estimates must NOT be retroactively taxed. Every row
-- that exists at migration time → 0%. The column default (20) applies only to
-- estimates created after this migration. Must stay in THIS migration file.
UPDATE "Estimate" SET "taxRate" = 0;
