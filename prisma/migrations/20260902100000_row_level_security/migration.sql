-- Row Level Security: второй контур изоляции.
--
-- Шов в коде добавляет условие по арендатору в каждый запрос. Он защищает от
-- забывчивости, но не от обхода: сырой SQL и любой код, взявший клиент базы
-- напрямую, проходят мимо него. Политика живёт в базе и не зависит от того,
-- каким путём пришёл запрос.
--
-- ПОЧЕМУ FORCE, А НЕ ОТДЕЛЬНАЯ РОЛЬ. Приложение ходит в базу владельцем всех
-- таблиц (gen_user), а владельца RLS по умолчанию не касается. План предполагал
-- завести отдельную runtime-роль, но у неё нет прав на ALTER TABLE — а миграции
-- накатываются при старте приложения тем же пользователем, и роль без владения
-- их не применит. FORCE ROW LEVEL SECURITY решает ту же задачу без новой роли,
-- без смены строки подключения и без риска сломать выкат: политика начинает
-- действовать и на владельца.
--
-- ОТКАЗ ЗАКРЫТЫЙ. Не установлен app.tenant_id — предикат даёт NULL, строк нет.
-- Забытое условие возвращает пустоту, а не чужие данные: тихая утечка хуже
-- явной поломки.
--
-- ЛАЗ ДЛЯ ОБСЛУЖИВАНИЯ. Миграции с данными и разбор инцидентов идут под
-- app.rls_bypass = on, который надо написать руками. Это не дыра: RLS защищает
-- от забывчивости, а не от человека с доступом к базе, — и явный, видимый в
-- коде миграции лаз честнее, чем политика, которая молча пускает всех при
-- незаданной настройке.


ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AuditLog";
CREATE POLICY tenant_isolation ON "AuditLog"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "BlockedInterval" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BlockedInterval" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "BlockedInterval";
CREATE POLICY tenant_isolation ON "BlockedInterval"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "BlogPost" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BlogPost" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "BlogPost";
CREATE POLICY tenant_isolation ON "BlogPost"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "CMSBlock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CMSBlock" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CMSBlock";
CREATE POLICY tenant_isolation ON "CMSBlock"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "CommunicationLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommunicationLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CommunicationLog";
CREATE POLICY tenant_isolation ON "CommunicationLog"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "CrmTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CrmTask" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CrmTask";
CREATE POLICY tenant_isolation ON "CrmTask"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "CustomerContact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerContact" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CustomerContact";
CREATE POLICY tenant_isolation ON "CustomerContact"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "CustomerNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerNote" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CustomerNote";
CREATE POLICY tenant_isolation ON "CustomerNote"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "CustomerProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerProfile" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CustomerProfile";
CREATE POLICY tenant_isolation ON "CustomerProfile"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "CustomerTag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerTag" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CustomerTag";
CREATE POLICY tenant_isolation ON "CustomerTag"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "CustomerTagAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerTagAssignment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CustomerTagAssignment";
CREATE POLICY tenant_isolation ON "CustomerTagAssignment"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "Deal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Deal" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Deal";
CREATE POLICY tenant_isolation ON "Deal"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "EmailMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailMessage" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "EmailMessage";
CREATE POLICY tenant_isolation ON "EmailMessage"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "EmailVerificationToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailVerificationToken" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "EmailVerificationToken";
CREATE POLICY tenant_isolation ON "EmailVerificationToken"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "Estimate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Estimate" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Estimate";
CREATE POLICY tenant_isolation ON "Estimate"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "EstimateLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EstimateLine" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "EstimateLine";
CREATE POLICY tenant_isolation ON "EstimateLine"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "InboundAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InboundAttempt" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "InboundAttempt";
CREATE POLICY tenant_isolation ON "InboundAttempt"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "InboxMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InboxMessage" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "InboxMessage";
CREATE POLICY tenant_isolation ON "InboxMessage"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "JobLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JobLine" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "JobLine";
CREATE POLICY tenant_isolation ON "JobLine"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "LaborLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LaborLine" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "LaborLine";
CREATE POLICY tenant_isolation ON "LaborLine"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "LoyaltyAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoyaltyAccount" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "LoyaltyAccount";
CREATE POLICY tenant_isolation ON "LoyaltyAccount"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "LoyaltyTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoyaltyTransaction" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "LoyaltyTransaction";
CREATE POLICY tenant_isolation ON "LoyaltyTransaction"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "MailIdentity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MailIdentity" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "MailIdentity";
CREATE POLICY tenant_isolation ON "MailIdentity"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "MailboxSyncCursor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MailboxSyncCursor" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "MailboxSyncCursor";
CREATE POLICY tenant_isolation ON "MailboxSyncCursor"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "MasterProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MasterProfile" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "MasterProfile";
CREATE POLICY tenant_isolation ON "MasterProfile"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Notification";
CREATE POLICY tenant_isolation ON "Notification"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "OAuthAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OAuthAccount" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "OAuthAccount";
CREATE POLICY tenant_isolation ON "OAuthAccount"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "Part" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Part" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Part";
CREATE POLICY tenant_isolation ON "Part"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "PartCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartCategory" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PartCategory";
CREATE POLICY tenant_isolation ON "PartCategory"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "PartLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartLine" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PartLine";
CREATE POLICY tenant_isolation ON "PartLine"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "PartOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartOrder" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PartOrder";
CREATE POLICY tenant_isolation ON "PartOrder"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "PartOrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartOrderItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PartOrderItem";
CREATE POLICY tenant_isolation ON "PartOrderItem"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "PartRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartRequest" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PartRequest";
CREATE POLICY tenant_isolation ON "PartRequest"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "PartTrim" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartTrim" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PartTrim";
CREATE POLICY tenant_isolation ON "PartTrim"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "PasswordReset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordReset" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PasswordReset";
CREATE POLICY tenant_isolation ON "PasswordReset"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "RentalBooking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RentalBooking" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RentalBooking";
CREATE POLICY tenant_isolation ON "RentalBooking"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "RepairOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RepairOrder" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RepairOrder";
CREATE POLICY tenant_isolation ON "RepairOrder"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "RepairOrderPhoto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RepairOrderPhoto" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RepairOrderPhoto";
CREATE POLICY tenant_isolation ON "RepairOrderPhoto"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "RolePermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RolePermission" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RolePermission";
CREATE POLICY tenant_isolation ON "RolePermission"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "ScanEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScanEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ScanEvent";
CREATE POLICY tenant_isolation ON "ScanEvent"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "ScheduleException" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScheduleException" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ScheduleException";
CREATE POLICY tenant_isolation ON "ScheduleException"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "SeoSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SeoSnapshot" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SeoSnapshot";
CREATE POLICY tenant_isolation ON "SeoSnapshot"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "Service" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Service" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Service";
CREATE POLICY tenant_isolation ON "Service"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "ServiceBay" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServiceBay" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ServiceBay";
CREATE POLICY tenant_isolation ON "ServiceBay"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "Setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Setting" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Setting";
CREATE POLICY tenant_isolation ON "Setting"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "Slot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Slot" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Slot";
CREATE POLICY tenant_isolation ON "Slot"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "StaffNotificationDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffNotificationDelivery" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StaffNotificationDelivery";
CREATE POLICY tenant_isolation ON "StaffNotificationDelivery"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "StaffNotificationEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffNotificationEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StaffNotificationEvent";
CREATE POLICY tenant_isolation ON "StaffNotificationEvent"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "StaffNotificationOptOut" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffNotificationOptOut" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StaffNotificationOptOut";
CREATE POLICY tenant_isolation ON "StaffNotificationOptOut"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "StaffNotificationReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffNotificationReceipt" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StaffNotificationReceipt";
CREATE POLICY tenant_isolation ON "StaffNotificationReceipt"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "StockBin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockBin" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StockBin";
CREATE POLICY tenant_isolation ON "StockBin"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "StockBinMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockBinMovement" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StockBinMovement";
CREATE POLICY tenant_isolation ON "StockBinMovement"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "StockCountLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockCountLine" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StockCountLine";
CREATE POLICY tenant_isolation ON "StockCountLine"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "StockCountSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockCountSession" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StockCountSession";
CREATE POLICY tenant_isolation ON "StockCountSession"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "StockItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StockItem";
CREATE POLICY tenant_isolation ON "StockItem"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "StockLocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockLocation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StockLocation";
CREATE POLICY tenant_isolation ON "StockLocation"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "StockMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockMovement" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StockMovement";
CREATE POLICY tenant_isolation ON "StockMovement"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "SupplierOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupplierOrder" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SupplierOrder";
CREATE POLICY tenant_isolation ON "SupplierOrder"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "SupplierOrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupplierOrderItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SupplierOrderItem";
CREATE POLICY tenant_isolation ON "SupplierOrderItem"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "SupplierProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupplierProfile" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SupplierProfile";
CREATE POLICY tenant_isolation ON "SupplierProfile"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "TeamMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeamMember" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TeamMember";
CREATE POLICY tenant_isolation ON "TeamMember"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "TelegramDestination" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TelegramDestination" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TelegramDestination";
CREATE POLICY tenant_isolation ON "TelegramDestination"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "TelegramLinkToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TelegramLinkToken" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TelegramLinkToken";
CREATE POLICY tenant_isolation ON "TelegramLinkToken"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "TelegramPollState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TelegramPollState" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TelegramPollState";
CREATE POLICY tenant_isolation ON "TelegramPollState"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "TelegramSendAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TelegramSendAttempt" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TelegramSendAttempt";
CREATE POLICY tenant_isolation ON "TelegramSendAttempt"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "TelegramTestSendThrottle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TelegramTestSendThrottle" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TelegramTestSendThrottle";
CREATE POLICY tenant_isolation ON "TelegramTestSendThrottle"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "TelegramUpdateReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TelegramUpdateReceipt" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TelegramUpdateReceipt";
CREATE POLICY tenant_isolation ON "TelegramUpdateReceipt"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "UploadedImage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UploadedImage" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "UploadedImage";
CREATE POLICY tenant_isolation ON "UploadedImage"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "User";
CREATE POLICY tenant_isolation ON "User"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "Vacancy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vacancy" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Vacancy";
CREATE POLICY tenant_isolation ON "Vacancy"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "Vehicle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vehicle" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Vehicle";
CREATE POLICY tenant_isolation ON "Vehicle"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "Warehouse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Warehouse" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Warehouse";
CREATE POLICY tenant_isolation ON "Warehouse"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

ALTER TABLE "WorkingHours" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkingHours" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "WorkingHours";
CREATE POLICY tenant_isolation ON "WorkingHours"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');
