-- Personal notification preferences are opt-out only. An employee without a
-- row keeps receiving every category allowed by their effective role rights.
--
-- IMPORTANT: unrelated indexes are not changed by this migration.

CREATE TABLE "StaffNotificationOptOut" (
  "id"        TEXT NOT NULL,
  "tenantKey" TEXT NOT NULL DEFAULT 'geleoteka',
  "userId"    TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StaffNotificationOptOut_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffNotificationOptOut_tenant_user_event_key"
  ON "StaffNotificationOptOut"("tenantKey", "userId", "eventType");
CREATE INDEX "StaffNotificationOptOut_tenant_user_idx"
  ON "StaffNotificationOptOut"("tenantKey", "userId");
