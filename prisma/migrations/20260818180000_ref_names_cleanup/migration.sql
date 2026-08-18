-- Чистка названий справочника: применимость (кузова/годы), вшитая в название
-- источником («Выключатель фонарей заднего хода, 461 и ранний 463»),
-- переносится в отдельное поле notes — название остаётся каталожным, а
-- различительная информация не теряется. Идемпотентно: после переноса
-- название больше не матчится.

-- Хвост «, <кузов/годы>» в конце названия. Содержательные уточнения
-- (модификации 280GE/G500, «после шасси N», моторы, размеры, «без мотора»)
-- НЕ трогаем — они различают позиции.
DO $$
DECLARE
  tail text := ',\s*(461 и ранний 463|ранний W?46[0-9][A-Z]?|W46[0-9][A-Z]?|46[0-9]|19[0-9]{2}\s*[–-]\s*(?:19|20)[0-9]{2}|2002 и новее|1990\s*[–-]\s*(?:до\s*)?2001|1995\s*[–-]\s*2001)$';
  i int;
BEGIN
  -- два прохода: бывают двойные хвосты («…, 463, 2002 и новее»)
  FOR i IN 1..2 LOOP
    UPDATE "PartReference"
    SET "notes" = CASE
          WHEN "notes" IS NULL OR "notes" = '' THEN (regexp_match("name", tail))[1]
          ELSE (regexp_match("name", tail))[1] || '; ' || "notes"
        END,
        "name" = regexp_replace("name", tail, ''),
        "updatedAt" = now()
    WHERE "name" ~ tail;
  END LOOP;

  -- Скобочный вариант в конце: «… (W463)» / «… (W460/W461/W463)»
  UPDATE "PartReference"
  SET "notes" = CASE
        WHEN "notes" IS NULL OR "notes" = '' THEN (regexp_match("name", '\s*\((W46[0-9][A-Z]?(?:\s*/\s*W46[0-9][A-Z]?)*)\)$'))[1]
        ELSE (regexp_match("name", '\s*\((W46[0-9][A-Z]?(?:\s*/\s*W46[0-9][A-Z]?)*)\)$'))[1] || '; ' || "notes"
      END,
      "name" = regexp_replace("name", '\s*\((W46[0-9][A-Z]?(?:\s*/\s*W46[0-9][A-Z]?)*)\)$', ''),
      "updatedAt" = now()
  WHERE "name" ~ '\s*\(W46[0-9][A-Z]?(?:\s*/\s*W46[0-9][A-Z]?)*\)$';
END $$;

-- Два смешанных случая, где хвост не в конце названия — точечно.
UPDATE "PartReference"
SET "name" = 'Реле свечей накаливания (300GD/350GDT)',
    "notes" = CASE WHEN "notes" IS NULL OR "notes" = '' THEN '463' ELSE '463; ' || "notes" END,
    "updatedAt" = now()
WHERE "oem" = 'A0095459332' AND "name" = 'Реле свечей накаливания, 463 (300GD/350GDT)';

UPDATE "PartReference"
SET "name" = 'Вакуумный клапан замка зажигания',
    "notes" = CASE WHEN "notes" IS NULL OR "notes" = '' THEN 'W460 и ранние дизели W463' ELSE 'W460 и ранние дизели W463; ' || "notes" END,
    "updatedAt" = now()
WHERE "oem" = 'A0004600284' AND "name" = 'Вакуумный клапан замка зажигания, W460 и ранние дизели W463';
