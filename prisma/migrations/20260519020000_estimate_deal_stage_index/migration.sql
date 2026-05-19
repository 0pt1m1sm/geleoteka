-- Compound index on (dealId, stage) covers openOrCreateActiveEstimate:
--   findFirst({ where: { dealId, stage: 'DRAFT' } })
--   findFirst({ where: { dealId, stage: { not: 'SUPERSEDED' } } })
-- Previously Postgres picked one of the single-column indexes and
-- post-filtered the other predicate.
CREATE INDEX "Estimate_dealId_stage_idx" ON "Estimate"("dealId", "stage");
