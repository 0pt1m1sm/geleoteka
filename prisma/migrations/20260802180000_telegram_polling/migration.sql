-- Inbound Telegram switches from webhook push to getUpdates polling: RKN
-- throttling makes Telegram→RU webhook delivery time out, so we pull instead.
--
-- TelegramPollState is the confirmation cursor. nextOffset must only move
-- forward (the guard lives in application code as a monotonic updateMany);
-- lastDrainStartedAt is a cooldown stamp for interactive status checks.
--
-- The diagnostics operation check gains UPDATES_POLL so every poll call is
-- measured next to sends on the operations screen.
--
-- IMPORTANT: no unrelated index drops or renames belong in this migration.
-- Part_photos_gin_idx, Vehicle_photos_gin_idx and StockMovement indexes are
-- untouched.

CREATE TABLE "TelegramPollState" (
  "tenantKey"          TEXT NOT NULL DEFAULT 'geleoteka',
  "nextOffset"         BIGINT NOT NULL DEFAULT 0,
  "lastDrainStartedAt" TIMESTAMP(3),
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TelegramPollState_pkey" PRIMARY KEY ("tenantKey"),
  CONSTRAINT "TelegramPollState_nextOffset_check" CHECK ("nextOffset" >= 0)
);

ALTER TABLE "TelegramSendAttempt"
  DROP CONSTRAINT "TelegramSendAttempt_operation_check";
ALTER TABLE "TelegramSendAttempt"
  ADD CONSTRAINT "TelegramSendAttempt_operation_check" CHECK (
    "operation" IN (
      'NOTIFICATION_DELIVERY',
      'WEBHOOK_REPLY',
      'TEST_NOTIFICATION',
      'UPDATES_POLL'
    )
  );
