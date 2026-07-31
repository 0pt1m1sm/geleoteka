-- Deleting a parent must not silently destroy records of independent value.
--
-- A referential-integrity audit of all 77 relations found the same mistake the
-- 20260730180000 migration fixed for User, repeated in five more places. Each
-- of these was a Cascade that would erase business, financial or audit history
-- as a side effect of deleting something else entirely:
--
--   RepairOrder.vehicleId   deleting a car erased its whole service history —
--                           job lines, labor, parts, slot and work photos
--   RentalBooking.vehicleId deleting a car erased the rental contract, its
--                           dates, contact details and booking number
--   PartOrderItem.partId    deleting a catalogue part erased WHAT WAS SOLD and
--                           at what price on a shipped customer order (its
--                           siblings PartLine/EstimateLine/SupplierOrderItem
--                           are all SetNull for exactly this reason)
--   StockItem.partId        deleting a catalogue part erased the append-only
--                           stock-movement ledger beneath it — every receipt,
--                           consumption, reversal and adjustment, in every
--                           warehouse. The schema documents that ledger as an
--                           audit record.
--   CrmTask.ownerUserId     deleting a staff user erased their task queue,
--                           including the payment reminders that are the only
--                           record of chasing money.
--
-- Aggregate-internal cascades are deliberately left alone: RepairOrder →
-- JobLine/Slot/photos, Estimate → EstimateLine, Part → PartTrim. There
-- "delete the parent" genuinely does mean "delete its parts".
--
-- Purely a constraint swap — no rows are read or written, so this is safe to
-- deploy while the shop is live.
--
-- NOTE: Prisma's diff also wants to DROP the un-modelled GIN indexes
-- Part_photos_gin_idx / Vehicle_photos_gin_idx and to RENAME a StockMovement
-- index. Both are omitted, per the standing convention in 20260720083911,
-- 20260730172500 and 20260730180000.

ALTER TABLE "RepairOrder" DROP CONSTRAINT "RepairOrder_vehicleId_fkey";
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RentalBooking" DROP CONSTRAINT "RentalBooking_vehicleId_fkey";
ALTER TABLE "RentalBooking" ADD CONSTRAINT "RentalBooking_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PartOrderItem" DROP CONSTRAINT "PartOrderItem_partId_fkey";
ALTER TABLE "PartOrderItem" ADD CONSTRAINT "PartOrderItem_partId_fkey"
  FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockItem" DROP CONSTRAINT "StockItem_partId_fkey";
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_partId_fkey"
  FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CrmTask" DROP CONSTRAINT "CrmTask_ownerUserId_fkey";
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
