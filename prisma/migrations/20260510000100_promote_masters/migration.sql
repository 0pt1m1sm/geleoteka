-- Promote existing users with the isMaster flag from CLIENT (the previous
-- default) to the new MASTER role so they get routed to /master after login.
-- Skip ADMIN/MANAGER/NONE — admins who happen to also be technicians keep
-- the higher-privilege role.
UPDATE "User"
SET "permissionRole" = 'MASTER'
WHERE "isMaster" = true
  AND "permissionRole" = 'CLIENT';
