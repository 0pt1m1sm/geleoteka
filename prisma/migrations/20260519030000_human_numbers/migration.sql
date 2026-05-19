-- Human-readable numbers for Deal / Estimate / RepairOrder.
-- One PG sequence per type — concurrent inserts get unique values.
-- See lib/crm/internal/next-number.ts for the application-side allocators.

CREATE SEQUENCE IF NOT EXISTS "Deal_number_seq" START 1;
CREATE SEQUENCE IF NOT EXISTS "Estimate_number_seq" START 1;
CREATE SEQUENCE IF NOT EXISTS "RepairOrder_number_seq" START 1;

-- Backfill: assign sequential numbers (oldest createdAt first) so historical
-- order in the UI matches numeric order. Then bump each sequence past the
-- last-used value so post-migration inserts continue from there.

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt", id) AS rn FROM "Deal"
)
UPDATE "Deal" d
SET "number" = 'D-' || lpad(r.rn::text, 4, '0')
FROM ranked r
WHERE d.id = r.id AND d."number" IS NULL;

SELECT setval(
  '"Deal_number_seq"',
  GREATEST((SELECT COUNT(*) FROM "Deal"), 1),
  TRUE
);

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt", id) AS rn FROM "Estimate"
)
UPDATE "Estimate" e
SET "number" = 'E-' || lpad(r.rn::text, 4, '0')
FROM ranked r
WHERE e.id = r.id AND e."number" IS NULL;

SELECT setval(
  '"Estimate_number_seq"',
  GREATEST((SELECT COUNT(*) FROM "Estimate"), 1),
  TRUE
);

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt", id) AS rn FROM "RepairOrder"
)
UPDATE "RepairOrder" ro
SET "roNumber" = 'RO-' || lpad(r.rn::text, 4, '0')
FROM ranked r
WHERE ro.id = r.id AND ro."roNumber" IS NULL;

SELECT setval(
  '"RepairOrder_number_seq"',
  GREATEST((SELECT COUNT(*) FROM "RepairOrder"), 1),
  TRUE
);
