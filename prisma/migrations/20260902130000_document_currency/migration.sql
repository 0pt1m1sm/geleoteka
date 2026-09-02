-- Валюта на денежных документах.
--
-- Документ выставлен в валюте на момент выставления. Если сервис сменит
-- валюту — переезд, деноминация, вступление в еврозону, — выставленные сметы,
-- сделки, заказ-наряды и заказы поставщику обязаны остаться в своей. Валюты
-- одного арендатора для этого мало.
--
-- Колонка НЕОБЯЗАТЕЛЬНАЯ намеренно. `NULL` читается как «не записано» —
-- значит берём текущую валюту арендатора, и это верно для всех строк, которые
-- были до миграции. Обязательная колонка с умолчанием была бы хуже: умолчание
-- в многоарендной базе не может зависеть от арендатора, и второй сервис в евро
-- молча получал бы рубли на каждой забытой вставке. Отсутствующее значение
-- честнее неверного.
--
-- Заполнение берёт валюту у ВЛАДЕЮЩЕГО арендатора, а не из литерала: код
-- валюты в тексте миграции означал бы, что мы снова знаем ответ за всех.

ALTER TABLE "Deal"          ADD COLUMN IF NOT EXISTS "currency" TEXT;
ALTER TABLE "Estimate"      ADD COLUMN IF NOT EXISTS "currency" TEXT;
ALTER TABLE "RepairOrder"   ADD COLUMN IF NOT EXISTS "currency" TEXT;
ALTER TABLE "SupplierOrder" ADD COLUMN IF NOT EXISTS "currency" TEXT;

UPDATE "Deal" d          SET "currency" = t."currency" FROM "Tenant" t WHERE d."tenantId" = t."id" AND d."currency" IS NULL;
UPDATE "Estimate" e      SET "currency" = t."currency" FROM "Tenant" t WHERE e."tenantId" = t."id" AND e."currency" IS NULL;
UPDATE "RepairOrder" r   SET "currency" = t."currency" FROM "Tenant" t WHERE r."tenantId" = t."id" AND r."currency" IS NULL;
UPDATE "SupplierOrder" s SET "currency" = t."currency" FROM "Tenant" t WHERE s."tenantId" = t."id" AND s."currency" IS NULL;
