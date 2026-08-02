-- A customer may have one personal manager. Both sides live in the unified
-- User table; deleting the employee detaches customers without deleting them.
ALTER TABLE "User" ADD COLUMN "managerUserId" TEXT;

CREATE INDEX "User_managerUserId_idx" ON "User"("managerUserId");

ALTER TABLE "User" ADD CONSTRAINT "User_managerUserId_fkey"
  FOREIGN KEY ("managerUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
