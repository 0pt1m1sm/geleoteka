-- One-off PROD backfill: link orphan RentalBooking rows (dealId IS NULL) to a
-- Deal before the NOT-NULL migration (20260522151507) runs. Raw SQL on purpose
-- — the Node backfill can't run pre-migration because the new Prisma client
-- writes CustomerProfile.lifetimeValue (a column prod doesn't have yet).
--
-- Scope verified on prod 2026-05-22: 0 PartOrder orphans, 2 RentalBooking
-- orphans (both guests, userId NULL). This handles RentalBooking only.
--
-- Idempotent: re-running processes only rows still NULL. Fully transactional —
-- any error aborts the whole thing (no partial writes). Run with:
--   psql "$DATABASE_URL" -f scripts/prod-backfill-guest-rentals.sql
-- Inspect the final "remaining_null" — it MUST be 0 before you push/deploy.

BEGIN;

DO $$
DECLARE
  b        RECORD;
  v_user   text;
  v_deal   text;
  v_est    text;
  v_email  text;
BEGIN
  FOR b IN SELECT * FROM "RentalBooking" WHERE "dealId" IS NULL LOOP
    v_email := lower(trim(b."contactEmail"));

    -- Resolve the customer: reuse an existing User matching the booking's
    -- email or phone; otherwise create a soft (guest) account from contact info.
    SELECT id INTO v_user
    FROM "User"
    WHERE email = v_email OR phone = b."contactPhone"
    ORDER BY "createdAt" ASC
    LIMIT 1;

    IF v_user IS NULL THEN
      v_user := gen_random_uuid()::text;
      INSERT INTO "User" (id, email, phone, name, "passwordHash", "isTempPassword",
                          "permissionRole", "isCustomer", "createdAt", "updatedAt")
      VALUES (v_user, v_email, b."contactPhone", b."contactName", NULL, true,
              'CLIENT', true, now(), now());
    END IF;

    -- Deal (RENTAL), denormalized totals seeded from the booking cost.
    v_deal := gen_random_uuid()::text;
    INSERT INTO "Deal" (id, "customerUserId", channel, source, stage,
                        "subtotalRental", total, number, "createdAt", "updatedAt")
    VALUES (v_deal, v_user, 'RENTAL'::"DealChannel", 'backfill', 'IN_PROGRESS'::"DealStage",
            b."totalCost", b."totalCost",
            'D-' || lpad(nextval('"Deal_number_seq"')::text, 4, '0'), now(), now());

    -- Initial DRAFT estimate with one RENTAL_DAY line carrying the cost.
    v_est := gen_random_uuid()::text;
    INSERT INTO "Estimate" (id, "dealId", stage, "subtotalRental", total, number,
                            "createdAt", "updatedAt")
    VALUES (v_est, v_deal, 'DRAFT'::"EstimateStage", b."totalCost", b."totalCost",
            'E-' || lpad(nextval('"Estimate_number_seq"')::text, 4, '0'), now(), now());

    INSERT INTO "EstimateLine" (id, "estimateId", "sortOrder", type, description,
                               qty, "unitPrice", total, "createdAt")
    VALUES (gen_random_uuid()::text, v_est, 0, 'RENTAL_DAY'::"DealLineType",
            'Аренда (восстановлено) ' || coalesce(b."bookingNumber", ''),
            1, b."totalCost", b."totalCost", now());

    UPDATE "RentalBooking" SET "dealId" = v_deal WHERE id = b.id;
  END LOOP;
END $$;

-- Must be 0. If not, do NOT commit — investigate.
SELECT count(*) AS remaining_null FROM "RentalBooking" WHERE "dealId" IS NULL;

COMMIT;
