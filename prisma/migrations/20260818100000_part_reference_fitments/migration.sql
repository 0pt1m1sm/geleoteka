-- Консолидация применяемости справочника в одну модель данных:
-- строковый массив PartReference.models заменяется FK-таблицей
-- PartReferenceFitment → VehicleGeneration (та же ось каталога, что и
-- «Совместимые варианты» товара через PartTrim).
CREATE TABLE IF NOT EXISTS "PartReferenceFitment" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,

    CONSTRAINT "PartReferenceFitment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PartReferenceFitment_referenceId_fkey" FOREIGN KEY ("referenceId")
      REFERENCES "PartReference"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PartReferenceFitment_generationId_fkey" FOREIGN KEY ("generationId")
      REFERENCES "VehicleGeneration"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PartReferenceFitment_referenceId_generationId_key"
  ON "PartReferenceFitment"("referenceId", "generationId");
CREATE INDEX IF NOT EXISTS "PartReferenceFitment_generationId_idx"
  ON "PartReferenceFitment"("generationId");

-- Бэкфилл 1: уже извлечённые строковые коды → поколения каталога по коду.
-- id детерминирован (prf_<ref>_<gen>), поэтому повторный прогон — no-op.
INSERT INTO "PartReferenceFitment" ("id", "referenceId", "generationId")
SELECT DISTINCT 'prf_' || r.id || '_' || g.id, r.id, g.id
FROM "PartReference" r
CROSS JOIN LATERAL unnest(r."models") AS c(code)
JOIN "VehicleGeneration" g ON upper(g.code) = upper(c.code)
ON CONFLICT DO NOTHING;

-- Бэкфилл 2: коды кузова из текста товара расширенным паттерном
-- ([CHNRVWX][0-9]{3}[A-Z]? — первый проход не знал H/N и суффикса «A»).
INSERT INTO "PartReferenceFitment" ("id", "referenceId", "generationId")
SELECT DISTINCT 'prf_' || r.id || '_' || g.id, r.id, g.id
FROM "PartReference" r
JOIN "Part" p
  ON upper(regexp_replace(p.article, '[^A-Za-z0-9А-Яа-яЁё]', '', 'g')) = r.oem
CROSS JOIN LATERAL (
  SELECT DISTINCT m[1] AS code
  FROM regexp_matches(
    upper(p.name || ' ' || coalesce(p.description, '')),
    '\y([CHNRVWX][0-9]{3}[A-Z]?)\y',
    'g'
  ) m
) codes
JOIN "VehicleGeneration" g ON upper(g.code) = codes.code
ON CONFLICT DO NOTHING;

-- Бэкфилл 3: структурные «Совместимые варианты» товара
-- (PartTrim → VehicleTrim → VehicleGeneration).
INSERT INTO "PartReferenceFitment" ("id", "referenceId", "generationId")
SELECT DISTINCT 'prf_' || r.id || '_' || t."generationId", r.id, t."generationId"
FROM "PartReference" r
JOIN "Part" p
  ON upper(regexp_replace(p.article, '[^A-Za-z0-9А-Яа-яЁё]', '', 'g')) = r.oem
JOIN "PartTrim" pt ON pt."partId" = p.id
JOIN "VehicleTrim" t ON t.id = pt."trimId"
ON CONFLICT DO NOTHING;

-- Строковая колонка больше не нужна — единственный источник применяемости
-- теперь fitments.
ALTER TABLE "PartReference" DROP COLUMN IF EXISTS "models";
