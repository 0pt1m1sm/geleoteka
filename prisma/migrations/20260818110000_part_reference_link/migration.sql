-- Явная связь товара с номенклатурой: Part.referenceId → PartReference.
-- Разводит два названия: Part.name — витринное (интернет-магазин),
-- reference.name — официальное по каталогу производителя.
ALTER TABLE "Part" ADD COLUMN IF NOT EXISTS "referenceId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Part" ADD CONSTRAINT "Part_referenceId_fkey"
    FOREIGN KEY ("referenceId") REFERENCES "PartReference"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Part_referenceId_idx" ON "Part"("referenceId");

-- Бэкфилл по нормализованному артикулу (как создавался справочник).
-- Служебные коды (ПОДЗАКАЗ-*, VERIFY-*) остаются без связи — у них нет
-- настоящего номера производителя. Идемпотентно.
UPDATE "Part" p
SET "referenceId" = r.id
FROM "PartReference" r
WHERE p."referenceId" IS NULL
  AND upper(regexp_replace(p.article, '[^A-Za-z0-9А-Яа-яЁё]', '', 'g')) = r.oem;
