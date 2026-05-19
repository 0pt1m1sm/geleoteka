-- Soft-delete timestamp for User. Customer-list/search queries filter
-- `deletedAt IS NULL` so deleted customers disappear from the CRM while
-- their historic Deals, RepairOrders, and CommunicationLogs stay intact.
-- Hard delete (DROP row) is reserved for guest accounts with isTempPassword=true.
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
