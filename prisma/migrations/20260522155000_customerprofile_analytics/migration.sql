-- CRM analytics on CustomerProfile + one-time backfill from history.
-- AlterTable
ALTER TABLE "CustomerProfile"
  ADD COLUMN "firstSeenAt" TIMESTAMP(3),
  ADD COLUMN "lastTouchAt" TIMESTAMP(3),
  ADD COLUMN "lifetimeValue" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "source" TEXT;

-- Backfill existing profiles from deals + communications.
-- LEAST() ignores NULL args in Postgres, so firstSeenAt = earliest of the two mins.
UPDATE "CustomerProfile" cp SET
  "lifetimeValue" = COALESCE((SELECT SUM(d.total) FROM "Deal" d WHERE d."customerUserId" = cp."userId" AND d.stage = 'WON'), 0),
  "lastTouchAt"   = (SELECT MAX(c."createdAt") FROM "CommunicationLog" c WHERE c."customerUserId" = cp."userId"),
  "firstSeenAt"   = LEAST(
                      (SELECT MIN(d."createdAt") FROM "Deal" d WHERE d."customerUserId" = cp."userId"),
                      (SELECT MIN(c."createdAt") FROM "CommunicationLog" c WHERE c."customerUserId" = cp."userId")
                    ),
  "source"        = (SELECT d.source FROM "Deal" d WHERE d."customerUserId" = cp."userId" AND d.source IS NOT NULL ORDER BY d."createdAt" ASC LIMIT 1);

-- Create + backfill profiles for customers who have history but no profile row yet.
INSERT INTO "CustomerProfile" ("userId", "lifetimeValue", "firstSeenAt", "lastTouchAt", "source")
SELECT u.id,
       COALESCE((SELECT SUM(d.total) FROM "Deal" d WHERE d."customerUserId" = u.id AND d.stage = 'WON'), 0),
       LEAST(
         (SELECT MIN(d."createdAt") FROM "Deal" d WHERE d."customerUserId" = u.id),
         (SELECT MIN(c."createdAt") FROM "CommunicationLog" c WHERE c."customerUserId" = u.id)
       ),
       (SELECT MAX(c."createdAt") FROM "CommunicationLog" c WHERE c."customerUserId" = u.id),
       (SELECT d.source FROM "Deal" d WHERE d."customerUserId" = u.id AND d.source IS NOT NULL ORDER BY d."createdAt" ASC LIMIT 1)
FROM "User" u
WHERE u."isCustomer" = true
  AND u."deletedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "CustomerProfile" cp WHERE cp."userId" = u.id)
  AND (EXISTS (SELECT 1 FROM "Deal" d WHERE d."customerUserId" = u.id)
       OR EXISTS (SELECT 1 FROM "CommunicationLog" c WHERE c."customerUserId" = u.id));
