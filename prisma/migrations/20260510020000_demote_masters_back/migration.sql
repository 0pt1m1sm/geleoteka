-- Roll back the MASTER role assignments. Masters work in splus (the
-- shop's existing system), not on the website — they don't need a
-- portal. Customer communication / status changes / photo uploads are
-- the manager's responsibility. The MASTER enum value stays in the
-- type definition (Postgres can't drop enum values cleanly without
-- type rebuild) but no row uses it after this UPDATE.
UPDATE "User"
SET "permissionRole" = 'CLIENT'
WHERE "permissionRole" = 'MASTER';
