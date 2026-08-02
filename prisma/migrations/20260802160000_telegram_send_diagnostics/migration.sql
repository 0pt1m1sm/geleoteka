-- Secret-free outbound Telegram diagnostics. This table intentionally stores
-- no destination identifiers, Bot API token, message text, request URL or
-- provider response body. Retention reuses STAFF_NOTIFICATION_RETENTION_DAYS.
--
-- IMPORTANT: no unrelated index drops or renames belong in this migration.

CREATE TABLE "TelegramSendAttempt" (
  "id"         TEXT NOT NULL,
  "tenantKey"  TEXT NOT NULL DEFAULT 'geleoteka',
  "operation"  TEXT NOT NULL,
  "outcome"    TEXT NOT NULL,
  "durationMs" INTEGER NOT NULL,
  "isSlow"     BOOLEAN NOT NULL,
  "errorCode"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TelegramSendAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TelegramSendAttempt_durationMs_check" CHECK ("durationMs" >= 0),
  CONSTRAINT "TelegramSendAttempt_operation_check" CHECK (
    "operation" IN ('NOTIFICATION_DELIVERY', 'WEBHOOK_REPLY')
  ),
  CONSTRAINT "TelegramSendAttempt_outcome_error_check" CHECK (
    ("outcome" = 'SUCCESS' AND "errorCode" IS NULL) OR
    ("outcome" = 'FAILURE' AND "errorCode" IS NOT NULL)
  )
);

CREATE INDEX "TelegramSendAttempt_tenantKey_createdAt_idx"
  ON "TelegramSendAttempt"("tenantKey", "createdAt");
