-- Collapse DealStage 7 → 4. Mapping:
--   DRAFT / QUOTED                          → NEW
--   APPROVED / IN_FULFILLMENT / DELIVERED   → IN_PROGRESS
--   WON / LOST                              → unchanged
-- After this, Deal.stage stops duplicating Estimate.stage and fulfillment
-- statuses. Auto-transitions (approveEstimate → IN_PROGRESS) move it.

ALTER TYPE "DealStage" RENAME TO "DealStage_old";

CREATE TYPE "DealStage" AS ENUM ('NEW', 'IN_PROGRESS', 'WON', 'LOST');

ALTER TABLE "Deal" ALTER COLUMN "stage" DROP DEFAULT;
ALTER TABLE "Deal" ALTER COLUMN "stage" TYPE "DealStage" USING (
  CASE "stage"::text
    WHEN 'DRAFT'          THEN 'NEW'::"DealStage"
    WHEN 'QUOTED'         THEN 'NEW'::"DealStage"
    WHEN 'APPROVED'       THEN 'IN_PROGRESS'::"DealStage"
    WHEN 'IN_FULFILLMENT' THEN 'IN_PROGRESS'::"DealStage"
    WHEN 'DELIVERED'      THEN 'IN_PROGRESS'::"DealStage"
    WHEN 'WON'            THEN 'WON'::"DealStage"
    WHEN 'LOST'           THEN 'LOST'::"DealStage"
  END
);
ALTER TABLE "Deal" ALTER COLUMN "stage" SET DEFAULT 'NEW'::"DealStage";

DROP TYPE "DealStage_old";
