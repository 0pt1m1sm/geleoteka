-- Сквозная нить смет к номенклатуре: EstimateLine.referenceId → PartReference.
-- Строка «под заказ» из справочника (partId = null) больше не теряет связь.
ALTER TABLE "EstimateLine" ADD COLUMN IF NOT EXISTS "referenceId" TEXT;

DO $$ BEGIN
  ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_referenceId_fkey"
    FOREIGN KEY ("referenceId") REFERENCES "PartReference"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "EstimateLine_referenceId_idx" ON "EstimateLine"("referenceId");

-- Бэкфилл: строки с товаром наследуют его номенклатуру. Идемпотентно.
UPDATE "EstimateLine" el
SET "referenceId" = p."referenceId"
FROM "Part" p
WHERE el."referenceId" IS NULL
  AND el."partId" = p.id
  AND p."referenceId" IS NOT NULL;
