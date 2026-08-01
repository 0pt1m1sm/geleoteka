-- Staff notifications Story 3: anchor each FOLLOW_UP task to the newest
-- inbound CommunicationLog it covers. The nullable column keeps the migration
-- additive for historical and manually-created tasks.
--
-- IMPORTANT: this migration intentionally contains no unrelated index drops or
-- renames. In particular Part_photos_gin_idx, Vehicle_photos_gin_idx and the
-- StockMovement indexes are untouched.

ALTER TABLE "CrmTask"
  ADD COLUMN "lastInboundCommLogId" TEXT;

-- Existing open reply obligations need the same CAS semantics immediately
-- after deploy. Anchor each one to the newest inbound communication for its
-- exact (customer, deal) pair; IS NOT DISTINCT FROM preserves the no-deal pair.
UPDATE "CrmTask" AS task
SET "lastInboundCommLogId" = (
  SELECT communication."id"
  FROM "CommunicationLog" AS communication
  WHERE communication."customerUserId" = task."customerUserId"
    AND communication."dealId" IS NOT DISTINCT FROM task."dealId"
    AND communication."channel" IN (
      'PHONE_INBOUND',
      'SMS_INBOUND',
      'EMAIL_INBOUND',
      'WHATSAPP_INBOUND',
      'TELEGRAM_INBOUND',
      'MAX_INBOUND'
    )
  ORDER BY communication."createdAt" DESC, communication."id" DESC
  LIMIT 1
)
WHERE task."kind" = 'FOLLOW_UP'
  AND task."status" = 'OPEN';

CREATE INDEX "CrmTask_lastInboundCommLogId_idx"
  ON "CrmTask"("lastInboundCommLogId");

ALTER TABLE "CrmTask"
  ADD CONSTRAINT "CrmTask_lastInboundCommLogId_fkey"
  FOREIGN KEY ("lastInboundCommLogId")
  REFERENCES "CommunicationLog"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
