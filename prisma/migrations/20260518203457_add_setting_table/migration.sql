-- CreateTable: Setting — runtime-mutable key/value store for integration
-- secrets and feature flags. Read via lib/settings.ts with env-var fallback.
CREATE TABLE "Setting" (
  "id"              TEXT NOT NULL,
  "key"             TEXT NOT NULL,
  "value"           TEXT NOT NULL,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  "updatedByUserId" TEXT,

  CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");
CREATE INDEX "Setting_key_idx" ON "Setting"("key");

ALTER TABLE "Setting" ADD CONSTRAINT "Setting_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
