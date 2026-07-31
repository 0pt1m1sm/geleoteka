-- A car is a descriptive reference, not the owner of the work; a person's
-- departure must not take their task queue with them.
--
-- The 20260731120000 migration stopped these two deletes from DESTROYING
-- records (Cascade → Restrict). That was the safe half of the fix: it refuses
-- rather than erases. This is the other half — it lets the delete through and
-- simply drops the pointer.
--
--   RepairOrder.vehicleId  Jobs, labour, parts and photos belong to the order,
--                          and the order to its deal. The car is only a
--                          reference on it, so an operator can delete or
--                          replace a car freely and the paperwork keeps every
--                          line of work, merely losing the link. Restrict made
--                          a car with any history undeletable, which is not
--                          how the shop actually works — cars get sold,
--                          re-plated and entered twice.
--
--   CrmTask.ownerUserId    A task outlives the employee who held it. Detached
--                          it shows as unassigned and a manager reassigns it;
--                          deleting the person together with their tasks is
--                          still possible, but only as an explicit choice in
--                          the erase flow rather than a database refusal.
--
-- RentalBooking.vehicleId is deliberately NOT changed. There the car is the
-- subject of the contract, not a descriptive field — a booking without a car
-- means nothing — so a fleet car with bookings stays undeletable and is
-- archived instead.
--
-- Column relaxations only (NOT NULL dropped, FK action changed). No row is
-- read or written and no existing value becomes invalid, so this is safe to
-- deploy while the shop is live.
--
-- NOTE: Prisma's diff also wants to DROP the un-modelled GIN indexes
-- Part_photos_gin_idx / Vehicle_photos_gin_idx and to RENAME a StockMovement
-- index. Both are omitted, per the standing convention in 20260720083911,
-- 20260730172500, 20260730180000 and 20260731120000.

ALTER TABLE "RepairOrder" ALTER COLUMN "vehicleId" DROP NOT NULL;
ALTER TABLE "RepairOrder" DROP CONSTRAINT "RepairOrder_vehicleId_fkey";
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmTask" ALTER COLUMN "ownerUserId" DROP NOT NULL;
ALTER TABLE "CrmTask" DROP CONSTRAINT "CrmTask_ownerUserId_fkey";
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
