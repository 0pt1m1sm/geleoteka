-- Add MASTER value to UserPermissionRole enum.
-- Postgres requires the new value to be added before any rows can use it,
-- and ALTER TYPE ... ADD VALUE cannot run inside a transaction. Prisma
-- migrate runs each statement separately, so this works.
ALTER TYPE "UserPermissionRole" ADD VALUE 'MASTER' AFTER 'CLIENT';
