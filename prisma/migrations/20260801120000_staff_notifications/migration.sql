-- Staff notifications core (Story 2, dark mode).
--
-- Additive only: this migration creates six empty tenant-scoped tables and
-- one stable delivery-status enum. It does not read or backfill business data,
-- and no producer writes these tables until Story 3.
--
-- Event types, priorities, inbound source channels, adapter channel names,
-- destination kinds, token purposes and routing states deliberately remain
-- TEXT. Their closed catalogs live in TypeScript, so adding an event/channel
-- does not require a PostgreSQL enum migration.
--
-- IMPORTANT: Prisma diff for this schema also proposes unrelated drift fixes:
-- dropping Part_photos_gin_idx / Vehicle_photos_gin_idx and renaming the
-- StockMovement compound index. Those operations are intentionally absent.

CREATE TYPE "StaffNotificationDeliveryStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'RETRY',
  'SENT',
  'DEAD',
  'CANCELLED'
);

CREATE TABLE "StaffNotificationEvent" (
  "id"                    TEXT NOT NULL,
  "tenantKey"             TEXT NOT NULL DEFAULT 'geleoteka',
  "type"                  TEXT NOT NULL,
  "priority"              TEXT NOT NULL,
  "channel"               TEXT,
  "dedupeKey"             TEXT NOT NULL,
  "sourceType"            TEXT NOT NULL,
  "sourceId"              TEXT NOT NULL,
  "relatedCustomerUserId" TEXT,
  "relatedDealId"         TEXT,
  "relatedTaskId"         TEXT,
  "targetUserId"          TEXT,
  "fallbackPermission"    TEXT,
  "summary"               TEXT NOT NULL,
  "actionPath"            TEXT NOT NULL,
  "routingStatus"         TEXT NOT NULL DEFAULT 'PENDING',
  "routingAttempts"       INTEGER NOT NULL DEFAULT 0,
  "nextRoutingAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "routedAt"              TIMESTAMP(3),
  "lastRoutingError"      TEXT,
  "occurredAt"            TIMESTAMP(3) NOT NULL,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StaffNotificationEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StaffNotificationReceipt" (
  "id"        TEXT NOT NULL,
  "tenantKey" TEXT NOT NULL DEFAULT 'geleoteka',
  "eventId"   TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "readAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StaffNotificationReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StaffNotificationDelivery" (
  "id"                TEXT NOT NULL,
  "tenantKey"         TEXT NOT NULL DEFAULT 'geleoteka',
  "eventId"           TEXT NOT NULL,
  "channel"           TEXT NOT NULL,
  "destinationKey"    TEXT NOT NULL,
  "status"            "StaffNotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts"          INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseOwner"        TEXT,
  "leaseUntil"        TIMESTAMP(3),
  "providerMessageId" TEXT,
  "lastErrorCode"     TEXT,
  "sentAt"            TIMESTAMP(3),

  CONSTRAINT "StaffNotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramDestination" (
  "id"             TEXT NOT NULL,
  "tenantKey"      TEXT NOT NULL DEFAULT 'geleoteka',
  "kind"           TEXT NOT NULL,
  "userId"         TEXT,
  "chatId"         TEXT NOT NULL,
  "telegramUserId" TEXT,
  "label"          TEXT,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "verifiedAt"     TIMESTAMP(3) NOT NULL,
  "disabledAt"     TIMESTAMP(3),

  CONSTRAINT "TelegramDestination_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramLinkToken" (
  "id"              TEXT NOT NULL,
  "tenantKey"       TEXT NOT NULL DEFAULT 'geleoteka',
  "userId"          TEXT,
  "purpose"         TEXT NOT NULL,
  "tokenHash"       TEXT NOT NULL,
  "expiresAt"       TIMESTAMP(3) NOT NULL,
  "usedAt"          TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TelegramLinkToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramUpdateReceipt" (
  "id"          TEXT NOT NULL,
  "tenantKey"   TEXT NOT NULL DEFAULT 'geleoteka',
  "updateId"    TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TelegramUpdateReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffNotificationEvent_tenantKey_id_key"
  ON "StaffNotificationEvent"("tenantKey", "id");
CREATE UNIQUE INDEX "StaffNotificationEvent_tenantKey_dedupeKey_key"
  ON "StaffNotificationEvent"("tenantKey", "dedupeKey");
CREATE INDEX "StaffNotificationEvent_routing_due_idx"
  ON "StaffNotificationEvent"("tenantKey", "routingStatus", "nextRoutingAt");
CREATE INDEX "StaffNotificationEvent_tenantKey_occurredAt_idx"
  ON "StaffNotificationEvent"("tenantKey", "occurredAt");
CREATE INDEX "StaffNotificationEvent_tenantKey_type_occurredAt_idx"
  ON "StaffNotificationEvent"("tenantKey", "type", "occurredAt");
CREATE INDEX "StaffNotificationEvent_tenantKey_sourceType_sourceId_idx"
  ON "StaffNotificationEvent"("tenantKey", "sourceType", "sourceId");

CREATE UNIQUE INDEX "StaffNotificationReceipt_tenant_event_user_key"
  ON "StaffNotificationReceipt"("tenantKey", "eventId", "userId");
CREATE INDEX "StaffNotificationReceipt_user_read_created_idx"
  ON "StaffNotificationReceipt"("tenantKey", "userId", "readAt", "createdAt");

CREATE UNIQUE INDEX "StaffNotificationDelivery_tenant_event_channel_dest_key"
  ON "StaffNotificationDelivery"("tenantKey", "eventId", "channel", "destinationKey");
CREATE INDEX "StaffNotificationDelivery_status_due_idx"
  ON "StaffNotificationDelivery"("tenantKey", "status", "nextAttemptAt");
CREATE INDEX "StaffNotificationDelivery_tenantKey_leaseUntil_idx"
  ON "StaffNotificationDelivery"("tenantKey", "leaseUntil");

CREATE UNIQUE INDEX "TelegramDestination_tenantKey_chatId_key"
  ON "TelegramDestination"("tenantKey", "chatId");
CREATE UNIQUE INDEX "TelegramDestination_tenantKey_userId_kind_key"
  ON "TelegramDestination"("tenantKey", "userId", "kind");
CREATE INDEX "TelegramDestination_tenantKey_kind_isActive_idx"
  ON "TelegramDestination"("tenantKey", "kind", "isActive");

CREATE UNIQUE INDEX "TelegramLinkToken_tenantKey_tokenHash_key"
  ON "TelegramLinkToken"("tenantKey", "tokenHash");
CREATE INDEX "TelegramLinkToken_tenantKey_expiresAt_usedAt_idx"
  ON "TelegramLinkToken"("tenantKey", "expiresAt", "usedAt");

CREATE UNIQUE INDEX "TelegramUpdateReceipt_tenantKey_updateId_key"
  ON "TelegramUpdateReceipt"("tenantKey", "updateId");
CREATE INDEX "TelegramUpdateReceipt_tenantKey_processedAt_idx"
  ON "TelegramUpdateReceipt"("tenantKey", "processedAt");

ALTER TABLE "StaffNotificationReceipt"
  ADD CONSTRAINT "StaffNotificationReceipt_tenantKey_eventId_fkey"
  FOREIGN KEY ("tenantKey", "eventId")
  REFERENCES "StaffNotificationEvent"("tenantKey", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffNotificationDelivery"
  ADD CONSTRAINT "StaffNotificationDelivery_tenantKey_eventId_fkey"
  FOREIGN KEY ("tenantKey", "eventId")
  REFERENCES "StaffNotificationEvent"("tenantKey", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
