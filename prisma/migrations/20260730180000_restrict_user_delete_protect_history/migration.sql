-- Deleting a person must not be a command to delete their history.
--
-- RepairOrder.userId, Deal.customerUserId and CommunicationLog.customerUserId
-- were ON DELETE CASCADE, so a single `DELETE FROM "User"` silently removed the
-- customer's repair orders, deals, estimates and correspondence — and, through
-- the aggregate cascades below those rows, their job lines, slots and estimate
-- lines too. The application-level delete has been removed, but a procedural
-- guard is not data protection: this makes the DATABASE refuse.
--
-- Cascades INSIDE an aggregate are left untouched (RepairOrder → JobLine/Slot,
-- Deal → Estimate → EstimateLine): there "delete the parent" genuinely does mean
-- "delete its parts". Only the person → aggregate edges become RESTRICT.
--
-- Written by hand rather than generated: `prisma migrate dev` wanted to reset
-- the dev database and to re-emit unrelated drift (the un-modelled GIN indexes
-- and the StockMovement index rename — see 20260720083911 and
-- 20260730172500 for that standing convention).
--
-- Purely a constraint swap: no data is read or written, so it is safe to deploy
-- while the shop is live. Existing rows are unaffected.

-- RepairOrder → customer
ALTER TABLE "RepairOrder" DROP CONSTRAINT "RepairOrder_userId_fkey";
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Deal → customer
ALTER TABLE "Deal" DROP CONSTRAINT "Deal_customerUserId_fkey";
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_customerUserId_fkey"
  FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CommunicationLog → customer
ALTER TABLE "CommunicationLog" DROP CONSTRAINT "CommunicationLog_customerUserId_fkey";
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_customerUserId_fkey"
  FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
