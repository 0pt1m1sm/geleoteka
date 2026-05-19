-- Add EMAIL channel to the ReferralSource enum so customers created from
-- inbound email (via /admin/crm/inbox → Create customer) can be tagged
-- with a meaningful marketing source instead of NULL or WALK_IN.
ALTER TYPE "ReferralSource" ADD VALUE 'EMAIL';
