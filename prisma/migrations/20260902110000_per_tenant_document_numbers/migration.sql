-- Нумерация документов на арендатора.
--
-- Было: пять глобальных последовательностей, одна на вид документа. У второго
-- сервиса номера продолжались бы с наших — первый его наряд оказался бы
-- RO-0412. Это и странно выглядит, и выдаёт чужой масштаб.
--
-- Стало: счётчик на пару (арендатор, вид документа). Выдача — атомарным
-- UPDATE ... RETURNING внутри той же транзакции, что и вставка строки.
--
-- Уникальность номера тоже становится составной: наряд № 42 существует у
-- каждого сервиса свой. Прежний глобальный индекс снимается и составной
-- создаётся В ОДНОЙ миграции — между двумя шагами база приняла бы дубли, а
-- разделить их потом было бы уже нечем.

CREATE TABLE IF NOT EXISTS "TenantCounter" (
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TenantCounter_pkey" PRIMARY KEY ("tenantId", "kind")
);

ALTER TABLE "TenantCounter" DROP CONSTRAINT IF EXISTS "TenantCounter_tenantId_fkey";
ALTER TABLE "TenantCounter" ADD CONSTRAINT "TenantCounter_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Изоляция: таблица принадлежит арендатору, значит живёт по тем же правилам.
ALTER TABLE "TenantCounter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantCounter" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TenantCounter";
CREATE POLICY tenant_isolation ON "TenantCounter"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.rls_bypass', true) = 'on');

-- Перенос текущих значений: счётчик продолжает с того места, где остановилась
-- последовательность, иначе новый документ получил бы уже занятый номер.
--
-- Лаз нужен, потому что политика выше уже действует, а установки арендатора у
-- миграции нет. SET, а не SET LOCAL: файл выполняется и вне транзакции тоже, и
-- тогда SET LOCAL молча ничего не делает — на этом первый прогон и споткнулся.
SET app.rls_bypass = 'on';

-- Арендаторы берутся ИЗ ТАБЛИЦЫ, а не пишутся ключом в текст: миграция должна
-- одинаково отработать и на установке с одним сервисом, и на любой другой.
INSERT INTO "TenantCounter" ("tenantId", "kind", "value")
SELECT t."id", k.kind, COALESCE((SELECT last_value FROM pg_sequences
    WHERE schemaname = 'public' AND sequencename = k.seq), 0)::int
FROM "Tenant" t CROSS JOIN (VALUES
    ('DEAL',           'Deal_number_seq'),
    ('ESTIMATE',       'Estimate_number_seq'),
    ('REPAIR_ORDER',   'RepairOrder_number_seq'),
    ('PART_ORDER',     'PartOrder_number_seq'),
    ('RENTAL_BOOKING', 'RentalBooking_number_seq')
) AS k(kind, seq)
ON CONFLICT ("tenantId", "kind") DO NOTHING;

RESET app.rls_bypass;

-- Уникальности: глобальную снять, составную создать — одним шагом.
DROP INDEX IF EXISTS "Deal_number_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Deal_tenantId_number_key" ON "Deal"("tenantId", "number");

DROP INDEX IF EXISTS "Estimate_number_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Estimate_tenantId_number_key" ON "Estimate"("tenantId", "number");

DROP INDEX IF EXISTS "RepairOrder_roNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "RepairOrder_tenantId_roNumber_key" ON "RepairOrder"("tenantId", "roNumber");

DROP INDEX IF EXISTS "PartOrder_orderNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "PartOrder_tenantId_orderNumber_key" ON "PartOrder"("tenantId", "orderNumber");

DROP INDEX IF EXISTS "RentalBooking_bookingNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "RentalBooking_tenantId_bookingNumber_key" ON "RentalBooking"("tenantId", "bookingNumber");
