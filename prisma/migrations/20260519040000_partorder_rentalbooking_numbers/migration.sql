-- Symmetry with Deal / Estimate / RepairOrder: PartOrder gets PO-NNNN,
-- RentalBooking gets RB-NNNN. Same sequence-backed pattern as the prior
-- 20260519030000_human_numbers migration.

ALTER TABLE "PartOrder" ADD COLUMN "orderNumber" TEXT;
CREATE UNIQUE INDEX "PartOrder_orderNumber_key" ON "PartOrder"("orderNumber");

ALTER TABLE "RentalBooking" ADD COLUMN "bookingNumber" TEXT;
CREATE UNIQUE INDEX "RentalBooking_bookingNumber_key" ON "RentalBooking"("bookingNumber");

CREATE SEQUENCE IF NOT EXISTS "PartOrder_number_seq" START 1;
CREATE SEQUENCE IF NOT EXISTS "RentalBooking_number_seq" START 1;

-- Backfill PartOrder.orderNumber in createdAt order.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt", id) AS rn FROM "PartOrder"
)
UPDATE "PartOrder" po
SET "orderNumber" = 'PO-' || lpad(r.rn::text, 4, '0')
FROM ranked r
WHERE po.id = r.id AND po."orderNumber" IS NULL;

SELECT setval(
  '"PartOrder_number_seq"',
  GREATEST((SELECT COUNT(*) FROM "PartOrder"), 1),
  TRUE
);

-- Backfill RentalBooking.bookingNumber in createdAt order.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt", id) AS rn FROM "RentalBooking"
)
UPDATE "RentalBooking" rb
SET "bookingNumber" = 'RB-' || lpad(r.rn::text, 4, '0')
FROM ranked r
WHERE rb.id = r.id AND rb."bookingNumber" IS NULL;

SELECT setval(
  '"RentalBooking_number_seq"',
  GREATEST((SELECT COUNT(*) FROM "RentalBooking"), 1),
  TRUE
);
