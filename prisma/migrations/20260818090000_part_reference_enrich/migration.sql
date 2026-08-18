-- Обогащение справочника номенклатуры для фильтров «по агрегату» и «по модели»:
-- группа берётся из категории связанного товара, применяемость — из кодов
-- кузова (W463, X166, …) в названии/описании товара. Идемпотентно: трогает
-- только записи без группы / без моделей.
UPDATE "PartReference" r
SET "groupName" = c.name
FROM "Part" p
JOIN "PartCategory" c ON c.id = p."categoryId"
WHERE r."groupName" IS NULL
  AND upper(regexp_replace(p.article, '[^A-Za-z0-9А-Яа-яЁё]', '', 'g')) = r.oem;

UPDATE "PartReference" r
SET "models" = sub.codes
FROM (
  SELECT upper(regexp_replace(p.article, '[^A-Za-z0-9А-Яа-яЁё]', '', 'g')) AS oem,
         ARRAY(
           SELECT DISTINCT m[1]
           FROM regexp_matches(
             upper(p.name || ' ' || coalesce(p.description, '')),
             '\y([WXCRVS][0-9]{3})\y',
             'g'
           ) m
         ) AS codes
  FROM "Part" p
) sub
WHERE r.oem = sub.oem
  AND (r."models" IS NULL OR r."models" = '{}')
  AND sub.codes <> '{}';
