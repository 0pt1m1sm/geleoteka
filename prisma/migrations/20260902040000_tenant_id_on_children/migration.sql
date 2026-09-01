-- Фаза EXPAND, часть вторая: арендатор у дочерних строк и СОСТАВНЫЕ внешние
-- ключи (родитель + арендатор).
--
-- Смысл составного ключа: одна колонка `tenantId` у ребёнка — всего лишь
-- пометка, которую код может проставить неверно. Ключ (parentId, tenantId) →
-- (id, tenantId) делает привязку строки к родителю ЧУЖОГО арендатора
-- невозможной на уровне базы, независимо от аккуратности кода. Ради этого
-- родителю добавляется уникальность (id, tenantId) — избыточная при первичном
-- ключе id, но необходимая как цель ссылки.
--
-- Поведение при удалении копируется с существующей связи: подменять каскад на
-- запрет значило бы тихо изменить смысл удаления родителя.
--
-- Значение детям берётся ОТ РОДИТЕЛЯ, а не умолчанием: умолчание одинаково для
-- всех и на одном арендаторе выглядит правильным, но при первом же чужом
-- сервисе привязало бы его строки к нам.
--
-- ПОРЯДОК ЗАПОЛНЕНИЯ ТОПОЛОГИЧЕСКИЙ: StockItem сам дочерний, и его строки
-- обязаны получить арендатора раньше, чем StockMovement возьмёт значение от
-- него. Первая версия шла по алфавиту и упала на копии боевой схемы.

-- ── 1. Колонки ────────────────────────────────────────────────────────────

ALTER TABLE "CustomerContact" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
ALTER TABLE "CustomerNote" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
ALTER TABLE "CustomerTagAssignment" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
ALTER TABLE "EmailVerificationToken" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
ALTER TABLE "EstimateLine" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
ALTER TABLE "JobLine" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
ALTER TABLE "LaborLine" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
ALTER TABLE "LoyaltyTransaction" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
ALTER TABLE "MasterProfile" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
ALTER TABLE "OAuthAccount" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
ALTER TABLE "PartLine" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
ALTER TABLE "PartOrderItem" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
ALTER TABLE "PartTrim" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
ALTER TABLE "PasswordReset" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
ALTER TABLE "RepairOrderPhoto" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
ALTER TABLE "StaffNotificationDelivery" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
ALTER TABLE "StaffNotificationReceipt" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
ALTER TABLE "StockBin" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
ALTER TABLE "StockBinMovement" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
ALTER TABLE "StockCountLine" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
ALTER TABLE "StockItem" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
ALTER TABLE "StockLocation" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
ALTER TABLE "SupplierOrderItem" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
ALTER TABLE "SupplierProfile" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';

-- ── 2. Заполнение от родителя, сверху вниз ────────────────────────────────

-- CustomerContact ← User
UPDATE "CustomerContact" c SET "tenantId" = p."tenantId" FROM "User" p
  WHERE c."userId" = p."id" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "CustomerContact" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- CustomerNote ← User
UPDATE "CustomerNote" c SET "tenantId" = p."tenantId" FROM "User" p
  WHERE c."customerUserId" = p."id" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "CustomerNote" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- CustomerProfile ← User
UPDATE "CustomerProfile" c SET "tenantId" = p."tenantId" FROM "User" p
  WHERE c."userId" = p."id" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "CustomerProfile" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- CustomerTagAssignment ← CustomerTag
UPDATE "CustomerTagAssignment" c SET "tenantId" = p."tenantId" FROM "CustomerTag" p
  WHERE c."tagId" = p."id" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "CustomerTagAssignment" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- EmailVerificationToken ← User
UPDATE "EmailVerificationToken" c SET "tenantId" = p."tenantId" FROM "User" p
  WHERE c."userId" = p."id" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "EmailVerificationToken" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- EstimateLine ← Estimate
UPDATE "EstimateLine" c SET "tenantId" = p."tenantId" FROM "Estimate" p
  WHERE c."estimateId" = p."id" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "EstimateLine" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- JobLine ← RepairOrder
UPDATE "JobLine" c SET "tenantId" = p."tenantId" FROM "RepairOrder" p
  WHERE c."repairOrderId" = p."id" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "JobLine" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- LaborLine ← JobLine
UPDATE "LaborLine" c SET "tenantId" = p."tenantId" FROM "JobLine" p
  WHERE c."jobLineId" = p."id" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "LaborLine" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- LoyaltyTransaction ← LoyaltyAccount
UPDATE "LoyaltyTransaction" c SET "tenantId" = p."tenantId" FROM "LoyaltyAccount" p
  WHERE c."accountId" = p."id" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "LoyaltyTransaction" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- MasterProfile ← User
UPDATE "MasterProfile" c SET "tenantId" = p."tenantId" FROM "User" p
  WHERE c."userId" = p."id" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "MasterProfile" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- OAuthAccount ← User
UPDATE "OAuthAccount" c SET "tenantId" = p."tenantId" FROM "User" p
  WHERE c."userId" = p."id" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "OAuthAccount" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- PartLine ← JobLine
UPDATE "PartLine" c SET "tenantId" = p."tenantId" FROM "JobLine" p
  WHERE c."jobLineId" = p."id" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "PartLine" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- PartOrderItem ← PartShipment
UPDATE "PartOrderItem" c SET "tenantId" = p."tenantId" FROM "PartOrder" p
  WHERE c."orderId" = p."id" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "PartOrderItem" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- PartTrim ← Part
UPDATE "PartTrim" c SET "tenantId" = p."tenantId" FROM "Part" p
  WHERE c."partId" = p."id" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "PartTrim" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- PasswordReset ← User
UPDATE "PasswordReset" c SET "tenantId" = p."tenantId" FROM "User" p
  WHERE c."userId" = p."id" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "PasswordReset" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- RepairOrderPhoto ← RepairOrder
UPDATE "RepairOrderPhoto" c SET "tenantId" = p."tenantId" FROM "RepairOrder" p
  WHERE c."repairOrderId" = p."id" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "RepairOrderPhoto" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- StaffNotificationDelivery ← StaffNotificationEvent
UPDATE "StaffNotificationDelivery" c SET "tenantId" = p."tenantId" FROM "StaffNotificationEvent" p
  WHERE c."eventId" = p."id" AND c."tenantKey" = p."tenantKey" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "StaffNotificationDelivery" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- StaffNotificationReceipt ← StaffNotificationEvent
UPDATE "StaffNotificationReceipt" c SET "tenantId" = p."tenantId" FROM "StaffNotificationEvent" p
  WHERE c."eventId" = p."id" AND c."tenantKey" = p."tenantKey" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "StaffNotificationReceipt" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- StockBin ← Warehouse
UPDATE "StockBin" c SET "tenantId" = p."tenantId" FROM "Warehouse" p
  WHERE c."warehouseId" = p."id" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "StockBin" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- StockCountLine ← StockCountSession
UPDATE "StockCountLine" c SET "tenantId" = p."tenantId" FROM "StockCountSession" p
  WHERE c."sessionId" = p."id" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "StockCountLine" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- StockItem ← Warehouse
UPDATE "StockItem" c SET "tenantId" = p."tenantId" FROM "Warehouse" p
  WHERE c."warehouseId" = p."id" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "StockItem" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- StockLocation ← Warehouse
UPDATE "StockLocation" c SET "tenantId" = p."tenantId" FROM "Warehouse" p
  WHERE c."warehouseId" = p."id" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "StockLocation" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- StockMovement ← StockItem
UPDATE "StockMovement" c SET "tenantId" = p."tenantId" FROM "StockItem" p
  WHERE c."itemId" = p."id" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "StockMovement" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- SupplierOrderItem ← SupplierOrder
UPDATE "SupplierOrderItem" c SET "tenantId" = p."tenantId" FROM "SupplierOrder" p
  WHERE c."orderId" = p."id" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "SupplierOrderItem" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- SupplierProfile ← User
UPDATE "SupplierProfile" c SET "tenantId" = p."tenantId" FROM "User" p
  WHERE c."userId" = p."id" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "SupplierProfile" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- StockBinMovement ← StockItem
UPDATE "StockBinMovement" c SET "tenantId" = p."tenantId" FROM "StockItem" p
  WHERE c."itemId" = p."id" AND c."tenantId" IS DISTINCT FROM p."tenantId";
UPDATE "StockBinMovement" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;

-- ── 3. Индексы ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "CustomerContact_tenantId_idx" ON "CustomerContact"("tenantId");
CREATE INDEX IF NOT EXISTS "CustomerNote_tenantId_idx" ON "CustomerNote"("tenantId");
CREATE INDEX IF NOT EXISTS "CustomerProfile_tenantId_idx" ON "CustomerProfile"("tenantId");
CREATE INDEX IF NOT EXISTS "CustomerTagAssignment_tenantId_idx" ON "CustomerTagAssignment"("tenantId");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_tenantId_idx" ON "EmailVerificationToken"("tenantId");
CREATE INDEX IF NOT EXISTS "EstimateLine_tenantId_idx" ON "EstimateLine"("tenantId");
CREATE INDEX IF NOT EXISTS "JobLine_tenantId_idx" ON "JobLine"("tenantId");
CREATE INDEX IF NOT EXISTS "LaborLine_tenantId_idx" ON "LaborLine"("tenantId");
CREATE INDEX IF NOT EXISTS "LoyaltyTransaction_tenantId_idx" ON "LoyaltyTransaction"("tenantId");
CREATE INDEX IF NOT EXISTS "MasterProfile_tenantId_idx" ON "MasterProfile"("tenantId");
CREATE INDEX IF NOT EXISTS "OAuthAccount_tenantId_idx" ON "OAuthAccount"("tenantId");
CREATE INDEX IF NOT EXISTS "PartLine_tenantId_idx" ON "PartLine"("tenantId");
CREATE INDEX IF NOT EXISTS "PartOrderItem_tenantId_idx" ON "PartOrderItem"("tenantId");
CREATE INDEX IF NOT EXISTS "PartTrim_tenantId_idx" ON "PartTrim"("tenantId");
CREATE INDEX IF NOT EXISTS "PasswordReset_tenantId_idx" ON "PasswordReset"("tenantId");
CREATE INDEX IF NOT EXISTS "RepairOrderPhoto_tenantId_idx" ON "RepairOrderPhoto"("tenantId");
CREATE INDEX IF NOT EXISTS "StaffNotificationDelivery_tenantId_idx" ON "StaffNotificationDelivery"("tenantId");
CREATE INDEX IF NOT EXISTS "StaffNotificationReceipt_tenantId_idx" ON "StaffNotificationReceipt"("tenantId");
CREATE INDEX IF NOT EXISTS "StockBin_tenantId_idx" ON "StockBin"("tenantId");
CREATE INDEX IF NOT EXISTS "StockBinMovement_tenantId_idx" ON "StockBinMovement"("tenantId");
CREATE INDEX IF NOT EXISTS "StockCountLine_tenantId_idx" ON "StockCountLine"("tenantId");
CREATE INDEX IF NOT EXISTS "StockItem_tenantId_idx" ON "StockItem"("tenantId");
CREATE INDEX IF NOT EXISTS "StockLocation_tenantId_idx" ON "StockLocation"("tenantId");
CREATE INDEX IF NOT EXISTS "StockMovement_tenantId_idx" ON "StockMovement"("tenantId");
CREATE INDEX IF NOT EXISTS "SupplierOrderItem_tenantId_idx" ON "SupplierOrderItem"("tenantId");
CREATE INDEX IF NOT EXISTS "SupplierProfile_tenantId_idx" ON "SupplierProfile"("tenantId");

-- ── 4. Уникальность (id, tenantId) у родителей ────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerTag_id_tenantId_key" ON "CustomerTag"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "Estimate_id_tenantId_key" ON "Estimate"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "JobLine_id_tenantId_key" ON "JobLine"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "LoyaltyAccount_id_tenantId_key" ON "LoyaltyAccount"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "Part_id_tenantId_key" ON "Part"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "PartOrder_id_tenantId_key" ON "PartOrder"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "RepairOrder_id_tenantId_key" ON "RepairOrder"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "StaffNotificationEvent_id_tenantId_key" ON "StaffNotificationEvent"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "StockCountSession_id_tenantId_key" ON "StockCountSession"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "StockItem_id_tenantId_key" ON "StockItem"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierOrder_id_tenantId_key" ON "SupplierOrder"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_id_tenantId_key" ON "User"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "Warehouse_id_tenantId_key" ON "Warehouse"("id", "tenantId");

-- ── 5. Составные внешние ключи ────────────────────────────────────────────

ALTER TABLE "CustomerContact" DROP CONSTRAINT IF EXISTS "CustomerContact_tenant_parent_fkey";
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_tenant_parent_fkey"
  FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerNote" DROP CONSTRAINT IF EXISTS "CustomerNote_tenant_parent_fkey";
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_tenant_parent_fkey"
  FOREIGN KEY ("customerUserId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerProfile" DROP CONSTRAINT IF EXISTS "CustomerProfile_tenant_parent_fkey";
ALTER TABLE "CustomerProfile" ADD CONSTRAINT "CustomerProfile_tenant_parent_fkey"
  FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerTagAssignment" DROP CONSTRAINT IF EXISTS "CustomerTagAssignment_tenant_parent_fkey";
ALTER TABLE "CustomerTagAssignment" ADD CONSTRAINT "CustomerTagAssignment_tenant_parent_fkey"
  FOREIGN KEY ("tagId", "tenantId") REFERENCES "CustomerTag"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailVerificationToken" DROP CONSTRAINT IF EXISTS "EmailVerificationToken_tenant_parent_fkey";
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_tenant_parent_fkey"
  FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EstimateLine" DROP CONSTRAINT IF EXISTS "EstimateLine_tenant_parent_fkey";
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_tenant_parent_fkey"
  FOREIGN KEY ("estimateId", "tenantId") REFERENCES "Estimate"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobLine" DROP CONSTRAINT IF EXISTS "JobLine_tenant_parent_fkey";
ALTER TABLE "JobLine" ADD CONSTRAINT "JobLine_tenant_parent_fkey"
  FOREIGN KEY ("repairOrderId", "tenantId") REFERENCES "RepairOrder"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LaborLine" DROP CONSTRAINT IF EXISTS "LaborLine_tenant_parent_fkey";
ALTER TABLE "LaborLine" ADD CONSTRAINT "LaborLine_tenant_parent_fkey"
  FOREIGN KEY ("jobLineId", "tenantId") REFERENCES "JobLine"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LoyaltyTransaction" DROP CONSTRAINT IF EXISTS "LoyaltyTransaction_tenant_parent_fkey";
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_tenant_parent_fkey"
  FOREIGN KEY ("accountId", "tenantId") REFERENCES "LoyaltyAccount"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MasterProfile" DROP CONSTRAINT IF EXISTS "MasterProfile_tenant_parent_fkey";
ALTER TABLE "MasterProfile" ADD CONSTRAINT "MasterProfile_tenant_parent_fkey"
  FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OAuthAccount" DROP CONSTRAINT IF EXISTS "OAuthAccount_tenant_parent_fkey";
ALTER TABLE "OAuthAccount" ADD CONSTRAINT "OAuthAccount_tenant_parent_fkey"
  FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PartLine" DROP CONSTRAINT IF EXISTS "PartLine_tenant_parent_fkey";
ALTER TABLE "PartLine" ADD CONSTRAINT "PartLine_tenant_parent_fkey"
  FOREIGN KEY ("jobLineId", "tenantId") REFERENCES "JobLine"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PartOrderItem" DROP CONSTRAINT IF EXISTS "PartOrderItem_tenant_parent_fkey";
ALTER TABLE "PartOrderItem" ADD CONSTRAINT "PartOrderItem_tenant_parent_fkey"
  FOREIGN KEY ("orderId", "tenantId") REFERENCES "PartOrder"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PartTrim" DROP CONSTRAINT IF EXISTS "PartTrim_tenant_parent_fkey";
ALTER TABLE "PartTrim" ADD CONSTRAINT "PartTrim_tenant_parent_fkey"
  FOREIGN KEY ("partId", "tenantId") REFERENCES "Part"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PasswordReset" DROP CONSTRAINT IF EXISTS "PasswordReset_tenant_parent_fkey";
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_tenant_parent_fkey"
  FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RepairOrderPhoto" DROP CONSTRAINT IF EXISTS "RepairOrderPhoto_tenant_parent_fkey";
ALTER TABLE "RepairOrderPhoto" ADD CONSTRAINT "RepairOrderPhoto_tenant_parent_fkey"
  FOREIGN KEY ("repairOrderId", "tenantId") REFERENCES "RepairOrder"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffNotificationDelivery" DROP CONSTRAINT IF EXISTS "StaffNotificationDelivery_tenant_parent_fkey";
ALTER TABLE "StaffNotificationDelivery" ADD CONSTRAINT "StaffNotificationDelivery_tenant_parent_fkey"
  FOREIGN KEY ("eventId", "tenantId") REFERENCES "StaffNotificationEvent"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffNotificationReceipt" DROP CONSTRAINT IF EXISTS "StaffNotificationReceipt_tenant_parent_fkey";
ALTER TABLE "StaffNotificationReceipt" ADD CONSTRAINT "StaffNotificationReceipt_tenant_parent_fkey"
  FOREIGN KEY ("eventId", "tenantId") REFERENCES "StaffNotificationEvent"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockBin" DROP CONSTRAINT IF EXISTS "StockBin_tenant_parent_fkey";
ALTER TABLE "StockBin" ADD CONSTRAINT "StockBin_tenant_parent_fkey"
  FOREIGN KEY ("warehouseId", "tenantId") REFERENCES "Warehouse"("id", "tenantId")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "StockBinMovement" DROP CONSTRAINT IF EXISTS "StockBinMovement_tenant_parent_fkey";
ALTER TABLE "StockBinMovement" ADD CONSTRAINT "StockBinMovement_tenant_parent_fkey"
  FOREIGN KEY ("itemId", "tenantId") REFERENCES "StockItem"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockCountLine" DROP CONSTRAINT IF EXISTS "StockCountLine_tenant_parent_fkey";
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_tenant_parent_fkey"
  FOREIGN KEY ("sessionId", "tenantId") REFERENCES "StockCountSession"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockItem" DROP CONSTRAINT IF EXISTS "StockItem_tenant_parent_fkey";
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_tenant_parent_fkey"
  FOREIGN KEY ("warehouseId", "tenantId") REFERENCES "Warehouse"("id", "tenantId")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "StockLocation" DROP CONSTRAINT IF EXISTS "StockLocation_tenant_parent_fkey";
ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_tenant_parent_fkey"
  FOREIGN KEY ("warehouseId", "tenantId") REFERENCES "Warehouse"("id", "tenantId")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_tenant_parent_fkey";
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenant_parent_fkey"
  FOREIGN KEY ("itemId", "tenantId") REFERENCES "StockItem"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierOrderItem" DROP CONSTRAINT IF EXISTS "SupplierOrderItem_tenant_parent_fkey";
ALTER TABLE "SupplierOrderItem" ADD CONSTRAINT "SupplierOrderItem_tenant_parent_fkey"
  FOREIGN KEY ("orderId", "tenantId") REFERENCES "SupplierOrder"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierProfile" DROP CONSTRAINT IF EXISTS "SupplierProfile_tenant_parent_fkey";
ALTER TABLE "SupplierProfile" ADD CONSTRAINT "SupplierProfile_tenant_parent_fkey"
  FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;
