-- Фаза EXPAND: колонка арендатора на корневых сущностях сервиса.
--
-- Строго аддитивно: колонка необязательная, у неё умолчание на стороне базы,
-- существующие строки заполняются backfill-ом. Прежний код колонки не видит и
-- продолжает работать — это и есть смысл фазы.
--
-- Умолчание намеренно живёт ТОЛЬКО в базе и не объявлено в схеме Prisma:
-- в схеме оно означало бы «любая новая установка платформы принадлежит
-- Гелеотеке». Оно снимается в фазе contract, когда все записи станут явными.
-- Это осознанный дрейф, такой же, как GIN-индексы Part_photos_gin_idx.
--
-- Внешний ключ на Tenant ставится с ON DELETE RESTRICT: удаление арендатора,
-- у которого остались данные, обязано упираться в базу, а не зависеть от
-- аккуратности кода.
--
-- ВНИМАНИЕ: имена таблиц берутся с учётом @@map. Модель PartShipment живёт в
-- таблице PartOrder — первая версия этой миграции падала на несуществующей
-- таблице, и поймала это проверка против живой базы, а не тесты.


-- User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "User" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "User_tenantId_idx" ON "User"("tenantId");
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_tenantId_fkey";
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Setting
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "Setting" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "Setting_tenantId_idx" ON "Setting"("tenantId");
ALTER TABLE "Setting" DROP CONSTRAINT IF EXISTS "Setting_tenantId_fkey";
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CustomerTag
ALTER TABLE "CustomerTag" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "CustomerTag" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "CustomerTag_tenantId_idx" ON "CustomerTag"("tenantId");
ALTER TABLE "CustomerTag" DROP CONSTRAINT IF EXISTS "CustomerTag_tenantId_fkey";
ALTER TABLE "CustomerTag" ADD CONSTRAINT "CustomerTag_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Vehicle
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "Vehicle" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "Vehicle_tenantId_idx" ON "Vehicle"("tenantId");
ALTER TABLE "Vehicle" DROP CONSTRAINT IF EXISTS "Vehicle_tenantId_fkey";
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Service
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "Service" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "Service_tenantId_idx" ON "Service"("tenantId");
ALTER TABLE "Service" DROP CONSTRAINT IF EXISTS "Service_tenantId_fkey";
ALTER TABLE "Service" ADD CONSTRAINT "Service_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RepairOrder
ALTER TABLE "RepairOrder" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "RepairOrder" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "RepairOrder_tenantId_idx" ON "RepairOrder"("tenantId");
ALTER TABLE "RepairOrder" DROP CONSTRAINT IF EXISTS "RepairOrder_tenantId_fkey";
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ServiceBay
ALTER TABLE "ServiceBay" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "ServiceBay" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "ServiceBay_tenantId_idx" ON "ServiceBay"("tenantId");
ALTER TABLE "ServiceBay" DROP CONSTRAINT IF EXISTS "ServiceBay_tenantId_fkey";
ALTER TABLE "ServiceBay" ADD CONSTRAINT "ServiceBay_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Slot
ALTER TABLE "Slot" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "Slot" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "Slot_tenantId_idx" ON "Slot"("tenantId");
ALTER TABLE "Slot" DROP CONSTRAINT IF EXISTS "Slot_tenantId_fkey";
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- WorkingHours
ALTER TABLE "WorkingHours" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "WorkingHours" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "WorkingHours_tenantId_idx" ON "WorkingHours"("tenantId");
ALTER TABLE "WorkingHours" DROP CONSTRAINT IF EXISTS "WorkingHours_tenantId_fkey";
ALTER TABLE "WorkingHours" ADD CONSTRAINT "WorkingHours_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ScheduleException
ALTER TABLE "ScheduleException" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "ScheduleException" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "ScheduleException_tenantId_idx" ON "ScheduleException"("tenantId");
ALTER TABLE "ScheduleException" DROP CONSTRAINT IF EXISTS "ScheduleException_tenantId_fkey";
ALTER TABLE "ScheduleException" ADD CONSTRAINT "ScheduleException_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- BlockedInterval
ALTER TABLE "BlockedInterval" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "BlockedInterval" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "BlockedInterval_tenantId_idx" ON "BlockedInterval"("tenantId");
ALTER TABLE "BlockedInterval" DROP CONSTRAINT IF EXISTS "BlockedInterval_tenantId_fkey";
ALTER TABLE "BlockedInterval" ADD CONSTRAINT "BlockedInterval_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- LoyaltyAccount
ALTER TABLE "LoyaltyAccount" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "LoyaltyAccount" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "LoyaltyAccount_tenantId_idx" ON "LoyaltyAccount"("tenantId");
ALTER TABLE "LoyaltyAccount" DROP CONSTRAINT IF EXISTS "LoyaltyAccount_tenantId_fkey";
ALTER TABLE "LoyaltyAccount" ADD CONSTRAINT "LoyaltyAccount_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Notification
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "Notification" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "Notification_tenantId_idx" ON "Notification"("tenantId");
ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_tenantId_fkey";
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- UploadedImage
ALTER TABLE "UploadedImage" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "UploadedImage" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "UploadedImage_tenantId_idx" ON "UploadedImage"("tenantId");
ALTER TABLE "UploadedImage" DROP CONSTRAINT IF EXISTS "UploadedImage_tenantId_fkey";
ALTER TABLE "UploadedImage" ADD CONSTRAINT "UploadedImage_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CMSBlock
ALTER TABLE "CMSBlock" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "CMSBlock" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "CMSBlock_tenantId_idx" ON "CMSBlock"("tenantId");
ALTER TABLE "CMSBlock" DROP CONSTRAINT IF EXISTS "CMSBlock_tenantId_fkey";
ALTER TABLE "CMSBlock" ADD CONSTRAINT "CMSBlock_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SeoSnapshot
ALTER TABLE "SeoSnapshot" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "SeoSnapshot" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "SeoSnapshot_tenantId_idx" ON "SeoSnapshot"("tenantId");
ALTER TABLE "SeoSnapshot" DROP CONSTRAINT IF EXISTS "SeoSnapshot_tenantId_fkey";
ALTER TABLE "SeoSnapshot" ADD CONSTRAINT "SeoSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- BlogPost
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "BlogPost" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "BlogPost_tenantId_idx" ON "BlogPost"("tenantId");
ALTER TABLE "BlogPost" DROP CONSTRAINT IF EXISTS "BlogPost_tenantId_fkey";
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PartCategory
ALTER TABLE "PartCategory" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "PartCategory" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "PartCategory_tenantId_idx" ON "PartCategory"("tenantId");
ALTER TABLE "PartCategory" DROP CONSTRAINT IF EXISTS "PartCategory_tenantId_fkey";
ALTER TABLE "PartCategory" ADD CONSTRAINT "PartCategory_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Part
ALTER TABLE "Part" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "Part" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "Part_tenantId_idx" ON "Part"("tenantId");
ALTER TABLE "Part" DROP CONSTRAINT IF EXISTS "Part_tenantId_fkey";
ALTER TABLE "Part" ADD CONSTRAINT "Part_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PartRequest
ALTER TABLE "PartRequest" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "PartRequest" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "PartRequest_tenantId_idx" ON "PartRequest"("tenantId");
ALTER TABLE "PartRequest" DROP CONSTRAINT IF EXISTS "PartRequest_tenantId_fkey";
ALTER TABLE "PartRequest" ADD CONSTRAINT "PartRequest_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Warehouse
ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "Warehouse" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "Warehouse_tenantId_idx" ON "Warehouse"("tenantId");
ALTER TABLE "Warehouse" DROP CONSTRAINT IF EXISTS "Warehouse_tenantId_fkey";
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PartShipment → таблица PartOrder
ALTER TABLE "PartOrder" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "PartOrder" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "PartOrder_tenantId_idx" ON "PartOrder"("tenantId");
ALTER TABLE "PartOrder" DROP CONSTRAINT IF EXISTS "PartOrder_tenantId_fkey";
ALTER TABLE "PartOrder" ADD CONSTRAINT "PartOrder_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RentalBooking
ALTER TABLE "RentalBooking" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "RentalBooking" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "RentalBooking_tenantId_idx" ON "RentalBooking"("tenantId");
ALTER TABLE "RentalBooking" DROP CONSTRAINT IF EXISTS "RentalBooking_tenantId_fkey";
ALTER TABLE "RentalBooking" ADD CONSTRAINT "RentalBooking_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- TeamMember
ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "TeamMember" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "TeamMember_tenantId_idx" ON "TeamMember"("tenantId");
ALTER TABLE "TeamMember" DROP CONSTRAINT IF EXISTS "TeamMember_tenantId_fkey";
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Vacancy
ALTER TABLE "Vacancy" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "Vacancy" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "Vacancy_tenantId_idx" ON "Vacancy"("tenantId");
ALTER TABLE "Vacancy" DROP CONSTRAINT IF EXISTS "Vacancy_tenantId_fkey";
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SupplierOrder
ALTER TABLE "SupplierOrder" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "SupplierOrder" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "SupplierOrder_tenantId_idx" ON "SupplierOrder"("tenantId");
ALTER TABLE "SupplierOrder" DROP CONSTRAINT IF EXISTS "SupplierOrder_tenantId_fkey";
ALTER TABLE "SupplierOrder" ADD CONSTRAINT "SupplierOrder_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Deal
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "Deal" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "Deal_tenantId_idx" ON "Deal"("tenantId");
ALTER TABLE "Deal" DROP CONSTRAINT IF EXISTS "Deal_tenantId_fkey";
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Estimate
ALTER TABLE "Estimate" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "Estimate" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "Estimate_tenantId_idx" ON "Estimate"("tenantId");
ALTER TABLE "Estimate" DROP CONSTRAINT IF EXISTS "Estimate_tenantId_fkey";
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CommunicationLog
ALTER TABLE "CommunicationLog" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "CommunicationLog" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "CommunicationLog_tenantId_idx" ON "CommunicationLog"("tenantId");
ALTER TABLE "CommunicationLog" DROP CONSTRAINT IF EXISTS "CommunicationLog_tenantId_fkey";
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- InboxMessage
ALTER TABLE "InboxMessage" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "InboxMessage" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "InboxMessage_tenantId_idx" ON "InboxMessage"("tenantId");
ALTER TABLE "InboxMessage" DROP CONSTRAINT IF EXISTS "InboxMessage_tenantId_fkey";
ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- EmailMessage
ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "EmailMessage" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "EmailMessage_tenantId_idx" ON "EmailMessage"("tenantId");
ALTER TABLE "EmailMessage" DROP CONSTRAINT IF EXISTS "EmailMessage_tenantId_fkey";
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- MailboxSyncCursor
ALTER TABLE "MailboxSyncCursor" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "MailboxSyncCursor" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "MailboxSyncCursor_tenantId_idx" ON "MailboxSyncCursor"("tenantId");
ALTER TABLE "MailboxSyncCursor" DROP CONSTRAINT IF EXISTS "MailboxSyncCursor_tenantId_fkey";
ALTER TABLE "MailboxSyncCursor" ADD CONSTRAINT "MailboxSyncCursor_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- MailIdentity
ALTER TABLE "MailIdentity" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "MailIdentity" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "MailIdentity_tenantId_idx" ON "MailIdentity"("tenantId");
ALTER TABLE "MailIdentity" DROP CONSTRAINT IF EXISTS "MailIdentity_tenantId_fkey";
ALTER TABLE "MailIdentity" ADD CONSTRAINT "MailIdentity_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CrmTask
ALTER TABLE "CrmTask" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "CrmTask" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "CrmTask_tenantId_idx" ON "CrmTask"("tenantId");
ALTER TABLE "CrmTask" DROP CONSTRAINT IF EXISTS "CrmTask_tenantId_fkey";
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- InboundAttempt
ALTER TABLE "InboundAttempt" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "InboundAttempt" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "InboundAttempt_tenantId_idx" ON "InboundAttempt"("tenantId");
ALTER TABLE "InboundAttempt" DROP CONSTRAINT IF EXISTS "InboundAttempt_tenantId_fkey";
ALTER TABLE "InboundAttempt" ADD CONSTRAINT "InboundAttempt_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RolePermission
ALTER TABLE "RolePermission" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "RolePermission" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "RolePermission_tenantId_idx" ON "RolePermission"("tenantId");
ALTER TABLE "RolePermission" DROP CONSTRAINT IF EXISTS "RolePermission_tenantId_fkey";
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AuditLog
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "AuditLog" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_tenantId_fkey";
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- StaffNotificationEvent
ALTER TABLE "StaffNotificationEvent" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "StaffNotificationEvent" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "StaffNotificationEvent_tenantId_idx" ON "StaffNotificationEvent"("tenantId");
ALTER TABLE "StaffNotificationEvent" DROP CONSTRAINT IF EXISTS "StaffNotificationEvent_tenantId_fkey";
ALTER TABLE "StaffNotificationEvent" ADD CONSTRAINT "StaffNotificationEvent_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- StaffNotificationOptOut
ALTER TABLE "StaffNotificationOptOut" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "StaffNotificationOptOut" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "StaffNotificationOptOut_tenantId_idx" ON "StaffNotificationOptOut"("tenantId");
ALTER TABLE "StaffNotificationOptOut" DROP CONSTRAINT IF EXISTS "StaffNotificationOptOut_tenantId_fkey";
ALTER TABLE "StaffNotificationOptOut" ADD CONSTRAINT "StaffNotificationOptOut_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- TelegramDestination
ALTER TABLE "TelegramDestination" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "TelegramDestination" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "TelegramDestination_tenantId_idx" ON "TelegramDestination"("tenantId");
ALTER TABLE "TelegramDestination" DROP CONSTRAINT IF EXISTS "TelegramDestination_tenantId_fkey";
ALTER TABLE "TelegramDestination" ADD CONSTRAINT "TelegramDestination_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- TelegramLinkToken
ALTER TABLE "TelegramLinkToken" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "TelegramLinkToken" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "TelegramLinkToken_tenantId_idx" ON "TelegramLinkToken"("tenantId");
ALTER TABLE "TelegramLinkToken" DROP CONSTRAINT IF EXISTS "TelegramLinkToken_tenantId_fkey";
ALTER TABLE "TelegramLinkToken" ADD CONSTRAINT "TelegramLinkToken_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- TelegramUpdateReceipt
ALTER TABLE "TelegramUpdateReceipt" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "TelegramUpdateReceipt" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "TelegramUpdateReceipt_tenantId_idx" ON "TelegramUpdateReceipt"("tenantId");
ALTER TABLE "TelegramUpdateReceipt" DROP CONSTRAINT IF EXISTS "TelegramUpdateReceipt_tenantId_fkey";
ALTER TABLE "TelegramUpdateReceipt" ADD CONSTRAINT "TelegramUpdateReceipt_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- TelegramSendAttempt
ALTER TABLE "TelegramSendAttempt" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "TelegramSendAttempt" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "TelegramSendAttempt_tenantId_idx" ON "TelegramSendAttempt"("tenantId");
ALTER TABLE "TelegramSendAttempt" DROP CONSTRAINT IF EXISTS "TelegramSendAttempt_tenantId_fkey";
ALTER TABLE "TelegramSendAttempt" ADD CONSTRAINT "TelegramSendAttempt_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- TelegramPollState
ALTER TABLE "TelegramPollState" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "TelegramPollState" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "TelegramPollState_tenantId_idx" ON "TelegramPollState"("tenantId");
ALTER TABLE "TelegramPollState" DROP CONSTRAINT IF EXISTS "TelegramPollState_tenantId_fkey";
ALTER TABLE "TelegramPollState" ADD CONSTRAINT "TelegramPollState_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- TelegramTestSendThrottle
ALTER TABLE "TelegramTestSendThrottle" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "TelegramTestSendThrottle" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "TelegramTestSendThrottle_tenantId_idx" ON "TelegramTestSendThrottle"("tenantId");
ALTER TABLE "TelegramTestSendThrottle" DROP CONSTRAINT IF EXISTS "TelegramTestSendThrottle_tenantId_fkey";
ALTER TABLE "TelegramTestSendThrottle" ADD CONSTRAINT "TelegramTestSendThrottle_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ScanEvent
ALTER TABLE "ScanEvent" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "ScanEvent" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "ScanEvent_tenantId_idx" ON "ScanEvent"("tenantId");
ALTER TABLE "ScanEvent" DROP CONSTRAINT IF EXISTS "ScanEvent_tenantId_fkey";
ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- StockCountSession
ALTER TABLE "StockCountSession" ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_geleoteka';
UPDATE "StockCountSession" SET "tenantId" = 'tenant_geleoteka' WHERE "tenantId" IS NULL;
CREATE INDEX IF NOT EXISTS "StockCountSession_tenantId_idx" ON "StockCountSession"("tenantId");
ALTER TABLE "StockCountSession" DROP CONSTRAINT IF EXISTS "StockCountSession_tenantId_fkey";
ALTER TABLE "StockCountSession" ADD CONSTRAINT "StockCountSession_tenantId_fkey" FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
