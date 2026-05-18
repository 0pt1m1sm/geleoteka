-- Add per-message read state on inbound communications.
ALTER TABLE "CommunicationLog" ADD COLUMN "readAt" TIMESTAMP(3);

-- Index supports the badge-adjacent `markRepliesRead` count+update pattern.
CREATE INDEX "CommunicationLog_customerUserId_channel_readAt_idx"
  ON "CommunicationLog"("customerUserId", "channel", "readAt");

-- Atomic dedup for auto-created follow-up tasks: at most one OPEN FOLLOW_UP
-- per (customerUserId, dealId). COALESCE collapses NULL dealId to a sentinel
-- UUID so two no-deal replies from the same customer dedupe correctly
-- (PostgreSQL treats NULLs as distinct in unique indexes by default).
-- The index is partial — closed/cancelled follow-ups for the same pair are
-- allowed, so a customer re-engaging after a closed task creates a new task.
CREATE UNIQUE INDEX "CrmTask_open_followup_unique"
  ON "CrmTask"("customerUserId", COALESCE("dealId", '00000000-0000-0000-0000-000000000000'))
  WHERE status = 'OPEN' AND kind = 'FOLLOW_UP';
