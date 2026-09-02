-- Составные ключи для ССЫЛОК МЕЖДУ КОРНЕВЫМИ сущностями арендатора.
--
-- Прошлая миграция закрыла связи «родитель — ребёнок». Живой тест показал, что
-- этого мало: смета — корневая сущность, и привязать её к сделке ЧУЖОГО
-- арендатора база позволяла. Таких ссылок в схеме 52 — сделка на клиента,
-- наряд на сделку, строка сметы на товар, бронь на машину.
--
-- Правило то же: ключ (ссылка + арендатор) → (id + арендатор). Пока
-- арендаторов один, ни одна строка не изменится; смысл в том, что при втором
-- сервисе перекрёстная привязка станет невозможной на уровне базы, а не на
-- уровне аккуратности кода.
--
-- ON DELETE у необязательных ссылок — SET NULL с УКАЗАНИЕМ КОЛОНКИ
-- (PostgreSQL 15+): обнулять надо только саму ссылку. Обнуление пары вместе с
-- арендатором вычистило бы владельца строки при удалении того, на кого она
-- ссылалась, — то есть лечение хуже болезни.

-- ── 1. Уникальность (id, tenantId) у всех целей ссылок ────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS "CommunicationLog_id_tenantId_key" ON "CommunicationLog"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "Deal_id_tenantId_key" ON "Deal"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "EmailMessage_id_tenantId_key" ON "EmailMessage"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "Estimate_id_tenantId_key" ON "Estimate"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "Part_id_tenantId_key" ON "Part"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "PartCategory_id_tenantId_key" ON "PartCategory"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "RepairOrder_id_tenantId_key" ON "RepairOrder"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceBay_id_tenantId_key" ON "ServiceBay"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "StockItem_id_tenantId_key" ON "StockItem"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_id_tenantId_key" ON "User"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "Vehicle_id_tenantId_key" ON "Vehicle"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "Warehouse_id_tenantId_key" ON "Warehouse"("id", "tenantId");

-- ── 2. Составные ключи ────────────────────────────────────────────────────

-- BlogPost.authorId → User
ALTER TABLE "BlogPost" DROP CONSTRAINT IF EXISTS "BlogPost_authorId_tenant_fkey";
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_authorId_tenant_fkey"
  FOREIGN KEY ("authorId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE SET NULL ("authorId") ON UPDATE CASCADE;

-- CommunicationLog.authorUserId → User
ALTER TABLE "CommunicationLog" DROP CONSTRAINT IF EXISTS "CommunicationLog_authorUserId_tenant_fkey";
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_authorUserId_tenant_fkey"
  FOREIGN KEY ("authorUserId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE SET NULL ("authorUserId") ON UPDATE CASCADE;

-- CommunicationLog.customerUserId → User
ALTER TABLE "CommunicationLog" DROP CONSTRAINT IF EXISTS "CommunicationLog_customerUserId_tenant_fkey";
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_customerUserId_tenant_fkey"
  FOREIGN KEY ("customerUserId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- CommunicationLog.dealId → Deal
ALTER TABLE "CommunicationLog" DROP CONSTRAINT IF EXISTS "CommunicationLog_dealId_tenant_fkey";
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_dealId_tenant_fkey"
  FOREIGN KEY ("dealId", "tenantId") REFERENCES "Deal"("id", "tenantId")
  ON DELETE SET NULL ("dealId") ON UPDATE CASCADE;

-- CommunicationLog.emailMessageId → EmailMessage
ALTER TABLE "CommunicationLog" DROP CONSTRAINT IF EXISTS "CommunicationLog_emailMessageId_tenant_fkey";
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_emailMessageId_tenant_fkey"
  FOREIGN KEY ("emailMessageId", "tenantId") REFERENCES "EmailMessage"("id", "tenantId")
  ON DELETE SET NULL ("emailMessageId") ON UPDATE CASCADE;

-- CrmTask.customerUserId → User
ALTER TABLE "CrmTask" DROP CONSTRAINT IF EXISTS "CrmTask_customerUserId_tenant_fkey";
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_customerUserId_tenant_fkey"
  FOREIGN KEY ("customerUserId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE SET NULL ("customerUserId") ON UPDATE CASCADE;

-- CrmTask.dealId → Deal
ALTER TABLE "CrmTask" DROP CONSTRAINT IF EXISTS "CrmTask_dealId_tenant_fkey";
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_dealId_tenant_fkey"
  FOREIGN KEY ("dealId", "tenantId") REFERENCES "Deal"("id", "tenantId")
  ON DELETE SET NULL ("dealId") ON UPDATE CASCADE;

-- CrmTask.lastInboundCommLogId → CommunicationLog
ALTER TABLE "CrmTask" DROP CONSTRAINT IF EXISTS "CrmTask_lastInboundCommLogId_tenant_fkey";
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_lastInboundCommLogId_tenant_fkey"
  FOREIGN KEY ("lastInboundCommLogId", "tenantId") REFERENCES "CommunicationLog"("id", "tenantId")
  ON DELETE SET NULL ("lastInboundCommLogId") ON UPDATE CASCADE;

-- CrmTask.ownerUserId → User
ALTER TABLE "CrmTask" DROP CONSTRAINT IF EXISTS "CrmTask_ownerUserId_tenant_fkey";
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_ownerUserId_tenant_fkey"
  FOREIGN KEY ("ownerUserId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE SET NULL ("ownerUserId") ON UPDATE CASCADE;

-- CustomerTagAssignment.customerUserId → User
ALTER TABLE "CustomerTagAssignment" DROP CONSTRAINT IF EXISTS "CustomerTagAssignment_customerUserId_tenant_fkey";
ALTER TABLE "CustomerTagAssignment" ADD CONSTRAINT "CustomerTagAssignment_customerUserId_tenant_fkey"
  FOREIGN KEY ("customerUserId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Deal.customerUserId → User
ALTER TABLE "Deal" DROP CONSTRAINT IF EXISTS "Deal_customerUserId_tenant_fkey";
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_customerUserId_tenant_fkey"
  FOREIGN KEY ("customerUserId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Deal.ownerUserId → User
ALTER TABLE "Deal" DROP CONSTRAINT IF EXISTS "Deal_ownerUserId_tenant_fkey";
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_ownerUserId_tenant_fkey"
  FOREIGN KEY ("ownerUserId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE SET NULL ("ownerUserId") ON UPDATE CASCADE;

-- Deal.vehicleId → Vehicle
ALTER TABLE "Deal" DROP CONSTRAINT IF EXISTS "Deal_vehicleId_tenant_fkey";
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_vehicleId_tenant_fkey"
  FOREIGN KEY ("vehicleId", "tenantId") REFERENCES "Vehicle"("id", "tenantId")
  ON DELETE SET NULL ("vehicleId") ON UPDATE CASCADE;

-- Estimate.dealId → Deal
ALTER TABLE "Estimate" DROP CONSTRAINT IF EXISTS "Estimate_dealId_tenant_fkey";
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_dealId_tenant_fkey"
  FOREIGN KEY ("dealId", "tenantId") REFERENCES "Deal"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Estimate.parentEstimateId → Estimate
ALTER TABLE "Estimate" DROP CONSTRAINT IF EXISTS "Estimate_parentEstimateId_tenant_fkey";
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_parentEstimateId_tenant_fkey"
  FOREIGN KEY ("parentEstimateId", "tenantId") REFERENCES "Estimate"("id", "tenantId")
  ON DELETE SET NULL ("parentEstimateId") ON UPDATE CASCADE;

-- Estimate.preparedByUserId → User
ALTER TABLE "Estimate" DROP CONSTRAINT IF EXISTS "Estimate_preparedByUserId_tenant_fkey";
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_preparedByUserId_tenant_fkey"
  FOREIGN KEY ("preparedByUserId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE SET NULL ("preparedByUserId") ON UPDATE CASCADE;

-- EstimateLine.partId → Part
ALTER TABLE "EstimateLine" DROP CONSTRAINT IF EXISTS "EstimateLine_partId_tenant_fkey";
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_partId_tenant_fkey"
  FOREIGN KEY ("partId", "tenantId") REFERENCES "Part"("id", "tenantId")
  ON DELETE SET NULL ("partId") ON UPDATE CASCADE;

-- InboxMessage.assignedToUserId → User
ALTER TABLE "InboxMessage" DROP CONSTRAINT IF EXISTS "InboxMessage_assignedToUserId_tenant_fkey";
ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_assignedToUserId_tenant_fkey"
  FOREIGN KEY ("assignedToUserId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE SET NULL ("assignedToUserId") ON UPDATE CASCADE;

-- InboxMessage.emailMessageId → EmailMessage
ALTER TABLE "InboxMessage" DROP CONSTRAINT IF EXISTS "InboxMessage_emailMessageId_tenant_fkey";
ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_emailMessageId_tenant_fkey"
  FOREIGN KEY ("emailMessageId", "tenantId") REFERENCES "EmailMessage"("id", "tenantId")
  ON DELETE SET NULL ("emailMessageId") ON UPDATE CASCADE;

-- InboxMessage.linkedCommunicationLogId → CommunicationLog
ALTER TABLE "InboxMessage" DROP CONSTRAINT IF EXISTS "InboxMessage_linkedCommunicationLogId_tenant_fkey";
ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_linkedCommunicationLogId_tenant_fkey"
  FOREIGN KEY ("linkedCommunicationLogId", "tenantId") REFERENCES "CommunicationLog"("id", "tenantId")
  ON DELETE SET NULL ("linkedCommunicationLogId") ON UPDATE CASCADE;

-- LaborLine.technicianUserId → User
ALTER TABLE "LaborLine" DROP CONSTRAINT IF EXISTS "LaborLine_technicianUserId_tenant_fkey";
ALTER TABLE "LaborLine" ADD CONSTRAINT "LaborLine_technicianUserId_tenant_fkey"
  FOREIGN KEY ("technicianUserId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE SET NULL ("technicianUserId") ON UPDATE CASCADE;

-- LoyaltyAccount.userId → User
ALTER TABLE "LoyaltyAccount" DROP CONSTRAINT IF EXISTS "LoyaltyAccount_userId_tenant_fkey";
ALTER TABLE "LoyaltyAccount" ADD CONSTRAINT "LoyaltyAccount_userId_tenant_fkey"
  FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- LoyaltyTransaction.repairOrderId → RepairOrder
ALTER TABLE "LoyaltyTransaction" DROP CONSTRAINT IF EXISTS "LoyaltyTransaction_repairOrderId_tenant_fkey";
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_repairOrderId_tenant_fkey"
  FOREIGN KEY ("repairOrderId", "tenantId") REFERENCES "RepairOrder"("id", "tenantId")
  ON DELETE SET NULL ("repairOrderId") ON UPDATE CASCADE;

-- MailIdentity.userId → User
ALTER TABLE "MailIdentity" DROP CONSTRAINT IF EXISTS "MailIdentity_userId_tenant_fkey";
ALTER TABLE "MailIdentity" ADD CONSTRAINT "MailIdentity_userId_tenant_fkey"
  FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE SET NULL ("userId") ON UPDATE CASCADE;

-- Notification.userId → User
ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_userId_tenant_fkey";
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_tenant_fkey"
  FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Part.categoryId → PartCategory
ALTER TABLE "Part" DROP CONSTRAINT IF EXISTS "Part_categoryId_tenant_fkey";
ALTER TABLE "Part" ADD CONSTRAINT "Part_categoryId_tenant_fkey"
  FOREIGN KEY ("categoryId", "tenantId") REFERENCES "PartCategory"("id", "tenantId")
  ON DELETE SET NULL ("categoryId") ON UPDATE CASCADE;

-- PartLine.partId → Part
ALTER TABLE "PartLine" DROP CONSTRAINT IF EXISTS "PartLine_partId_tenant_fkey";
ALTER TABLE "PartLine" ADD CONSTRAINT "PartLine_partId_tenant_fkey"
  FOREIGN KEY ("partId", "tenantId") REFERENCES "Part"("id", "tenantId")
  ON DELETE SET NULL ("partId") ON UPDATE CASCADE;

-- PartShipment.dealId → Deal
ALTER TABLE "PartOrder" DROP CONSTRAINT IF EXISTS "PartOrder_dealId_tenant_fkey";
ALTER TABLE "PartOrder" ADD CONSTRAINT "PartOrder_dealId_tenant_fkey"
  FOREIGN KEY ("dealId", "tenantId") REFERENCES "Deal"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- PartShipment.userId → User
ALTER TABLE "PartOrder" DROP CONSTRAINT IF EXISTS "PartOrder_userId_tenant_fkey";
ALTER TABLE "PartOrder" ADD CONSTRAINT "PartOrder_userId_tenant_fkey"
  FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE SET NULL ("userId") ON UPDATE CASCADE;

-- PartOrderItem.partId → Part
ALTER TABLE "PartOrderItem" DROP CONSTRAINT IF EXISTS "PartOrderItem_partId_tenant_fkey";
ALTER TABLE "PartOrderItem" ADD CONSTRAINT "PartOrderItem_partId_tenant_fkey"
  FOREIGN KEY ("partId", "tenantId") REFERENCES "Part"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- PartRequest.handledById → User
ALTER TABLE "PartRequest" DROP CONSTRAINT IF EXISTS "PartRequest_handledById_tenant_fkey";
ALTER TABLE "PartRequest" ADD CONSTRAINT "PartRequest_handledById_tenant_fkey"
  FOREIGN KEY ("handledById", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE SET NULL ("handledById") ON UPDATE CASCADE;

-- RentalBooking.dealId → Deal
ALTER TABLE "RentalBooking" DROP CONSTRAINT IF EXISTS "RentalBooking_dealId_tenant_fkey";
ALTER TABLE "RentalBooking" ADD CONSTRAINT "RentalBooking_dealId_tenant_fkey"
  FOREIGN KEY ("dealId", "tenantId") REFERENCES "Deal"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- RentalBooking.userId → User
ALTER TABLE "RentalBooking" DROP CONSTRAINT IF EXISTS "RentalBooking_userId_tenant_fkey";
ALTER TABLE "RentalBooking" ADD CONSTRAINT "RentalBooking_userId_tenant_fkey"
  FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE SET NULL ("userId") ON UPDATE CASCADE;

-- RentalBooking.vehicleId → Vehicle
ALTER TABLE "RentalBooking" DROP CONSTRAINT IF EXISTS "RentalBooking_vehicleId_tenant_fkey";
ALTER TABLE "RentalBooking" ADD CONSTRAINT "RentalBooking_vehicleId_tenant_fkey"
  FOREIGN KEY ("vehicleId", "tenantId") REFERENCES "Vehicle"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- RepairOrder.dealId → Deal
ALTER TABLE "RepairOrder" DROP CONSTRAINT IF EXISTS "RepairOrder_dealId_tenant_fkey";
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_dealId_tenant_fkey"
  FOREIGN KEY ("dealId", "tenantId") REFERENCES "Deal"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- RepairOrder.masterUserId → User
ALTER TABLE "RepairOrder" DROP CONSTRAINT IF EXISTS "RepairOrder_masterUserId_tenant_fkey";
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_masterUserId_tenant_fkey"
  FOREIGN KEY ("masterUserId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE SET NULL ("masterUserId") ON UPDATE CASCADE;

-- RepairOrder.userId → User
ALTER TABLE "RepairOrder" DROP CONSTRAINT IF EXISTS "RepairOrder_userId_tenant_fkey";
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_userId_tenant_fkey"
  FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- RepairOrder.vehicleId → Vehicle
ALTER TABLE "RepairOrder" DROP CONSTRAINT IF EXISTS "RepairOrder_vehicleId_tenant_fkey";
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_vehicleId_tenant_fkey"
  FOREIGN KEY ("vehicleId", "tenantId") REFERENCES "Vehicle"("id", "tenantId")
  ON DELETE SET NULL ("vehicleId") ON UPDATE CASCADE;

-- RepairOrderPhoto.uploadedById → User
ALTER TABLE "RepairOrderPhoto" DROP CONSTRAINT IF EXISTS "RepairOrderPhoto_uploadedById_tenant_fkey";
ALTER TABLE "RepairOrderPhoto" ADD CONSTRAINT "RepairOrderPhoto_uploadedById_tenant_fkey"
  FOREIGN KEY ("uploadedById", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE SET NULL ("uploadedById") ON UPDATE CASCADE;

-- Setting.updatedByUserId → User
ALTER TABLE "Setting" DROP CONSTRAINT IF EXISTS "Setting_updatedByUserId_tenant_fkey";
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_updatedByUserId_tenant_fkey"
  FOREIGN KEY ("updatedByUserId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE SET NULL ("updatedByUserId") ON UPDATE CASCADE;

-- Slot.bayId → ServiceBay
ALTER TABLE "Slot" DROP CONSTRAINT IF EXISTS "Slot_bayId_tenant_fkey";
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_bayId_tenant_fkey"
  FOREIGN KEY ("bayId", "tenantId") REFERENCES "ServiceBay"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Slot.repairOrderId → RepairOrder
ALTER TABLE "Slot" DROP CONSTRAINT IF EXISTS "Slot_repairOrderId_tenant_fkey";
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_repairOrderId_tenant_fkey"
  FOREIGN KEY ("repairOrderId", "tenantId") REFERENCES "RepairOrder"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- StockBin.itemId → StockItem
ALTER TABLE "StockBin" DROP CONSTRAINT IF EXISTS "StockBin_itemId_tenant_fkey";
ALTER TABLE "StockBin" ADD CONSTRAINT "StockBin_itemId_tenant_fkey"
  FOREIGN KEY ("itemId", "tenantId") REFERENCES "StockItem"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- StockCountSession.warehouseId → Warehouse
ALTER TABLE "StockCountSession" DROP CONSTRAINT IF EXISTS "StockCountSession_warehouseId_tenant_fkey";
ALTER TABLE "StockCountSession" ADD CONSTRAINT "StockCountSession_warehouseId_tenant_fkey"
  FOREIGN KEY ("warehouseId", "tenantId") REFERENCES "Warehouse"("id", "tenantId")
  ON DELETE NO ACTION ON UPDATE CASCADE;

-- StockItem.partId → Part
ALTER TABLE "StockItem" DROP CONSTRAINT IF EXISTS "StockItem_partId_tenant_fkey";
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_partId_tenant_fkey"
  FOREIGN KEY ("partId", "tenantId") REFERENCES "Part"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- StockMovement.warehouseId → Warehouse
ALTER TABLE "StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_warehouseId_tenant_fkey";
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_warehouseId_tenant_fkey"
  FOREIGN KEY ("warehouseId", "tenantId") REFERENCES "Warehouse"("id", "tenantId")
  ON DELETE NO ACTION ON UPDATE CASCADE;

-- SupplierOrder.userId → User
ALTER TABLE "SupplierOrder" DROP CONSTRAINT IF EXISTS "SupplierOrder_userId_tenant_fkey";
ALTER TABLE "SupplierOrder" ADD CONSTRAINT "SupplierOrder_userId_tenant_fkey"
  FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE NO ACTION ON UPDATE CASCADE;

-- SupplierOrderItem.partId → Part
ALTER TABLE "SupplierOrderItem" DROP CONSTRAINT IF EXISTS "SupplierOrderItem_partId_tenant_fkey";
ALTER TABLE "SupplierOrderItem" ADD CONSTRAINT "SupplierOrderItem_partId_tenant_fkey"
  FOREIGN KEY ("partId", "tenantId") REFERENCES "Part"("id", "tenantId")
  ON DELETE SET NULL ("partId") ON UPDATE CASCADE;

-- UploadedImage.createdById → User
ALTER TABLE "UploadedImage" DROP CONSTRAINT IF EXISTS "UploadedImage_createdById_tenant_fkey";
ALTER TABLE "UploadedImage" ADD CONSTRAINT "UploadedImage_createdById_tenant_fkey"
  FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE SET NULL ("createdById") ON UPDATE CASCADE;

-- User.managerUserId → User
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_managerUserId_tenant_fkey";
ALTER TABLE "User" ADD CONSTRAINT "User_managerUserId_tenant_fkey"
  FOREIGN KEY ("managerUserId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE SET NULL ("managerUserId") ON UPDATE CASCADE;

-- User.referredById → User
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_referredById_tenant_fkey";
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_tenant_fkey"
  FOREIGN KEY ("referredById", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE NO ACTION ON UPDATE CASCADE;

-- Vehicle.ownerUserId → User
ALTER TABLE "Vehicle" DROP CONSTRAINT IF EXISTS "Vehicle_ownerUserId_tenant_fkey";
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_ownerUserId_tenant_fkey"
  FOREIGN KEY ("ownerUserId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE SET NULL ("ownerUserId") ON UPDATE CASCADE;
