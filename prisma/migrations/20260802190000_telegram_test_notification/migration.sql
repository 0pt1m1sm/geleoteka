-- Allow an explicitly labelled test call in the same secret-free diagnostic
-- stream as production notification delivery and webhook replies.
ALTER TABLE "TelegramSendAttempt"
  DROP CONSTRAINT "TelegramSendAttempt_operation_check";

ALTER TABLE "TelegramSendAttempt"
  ADD CONSTRAINT "TelegramSendAttempt_operation_check" CHECK (
    "operation" IN (
      'NOTIFICATION_DELIVERY',
      'WEBHOOK_REPLY',
      'TEST_NOTIFICATION'
    )
  );

-- The compound primary key makes the one-minute actor cooldown enforceable by
-- one conditional UPSERT across concurrent requests and application instances.
-- No destination id, chat_id, token, message text or provider payload is kept.
CREATE TABLE "TelegramTestSendThrottle" (
  "tenantKey"   TEXT NOT NULL DEFAULT 'geleoteka',
  "actorUserId" TEXT NOT NULL,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TelegramTestSendThrottle_pkey"
    PRIMARY KEY ("tenantKey", "actorUserId")
);
