-- Арендаторы платформы. Первая веха мультиарендности: таблица заводится
-- аддитивно, существующий код её не замечает.
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Tenant_key_key" ON "Tenant"("key");
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");

-- Текущая установка — первая строка. Вставка идемпотентна: миграция может
-- накатываться на базу, где сид уже отработал.
INSERT INTO "Tenant" ("id", "key", "name", "status", "createdAt", "updatedAt")
VALUES ('tenant_geleoteka', 'geleoteka', 'Гелеотека', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
