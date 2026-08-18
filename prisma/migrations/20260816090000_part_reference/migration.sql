-- Номенклатурный справочник запчастей (PartReference): выбор из списка в
-- сметах и при создании товара вместо ручного ввода артикулов.
CREATE TABLE IF NOT EXISTS "PartReference" (
    "id" TEXT NOT NULL,
    "oem" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL DEFAULT 'Mercedes-Benz',
    "groupName" TEXT,
    "models" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartReference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PartReference_oem_key" ON "PartReference"("oem");
CREATE INDEX IF NOT EXISTS "PartReference_name_idx" ON "PartReference"("name");

-- Бэкфилл из существующих товаров: только реальные артикулы, без служебных
-- кодов ПОДЗАКАЗ-* (позиции «под заказ») и VERIFY-* (тестовый мусор).
-- Идемпотентно: DISTINCT ON схлопывает дубли внутри выборки, ON CONFLICT —
-- повторные прогоны (id детерминирован от oem, конфликт всегда на той же строке).
INSERT INTO "PartReference" ("id", "oem", "name", "source", "createdAt", "updatedAt")
SELECT DISTINCT ON (norm.oem)
       'pref_' || norm.oem,
       norm.oem,
       p.name,
       'shop',
       now(),
       now()
FROM "Part" p
CROSS JOIN LATERAL (
  SELECT upper(regexp_replace(p.article, '[^A-Za-z0-9А-Яа-яЁё]', '', 'g')) AS oem
) norm
WHERE p.article !~* '^(ПОДЗАКАЗ|VERIFY)'
  AND norm.oem <> ''
ORDER BY norm.oem, p."createdAt"
ON CONFLICT DO NOTHING;
