-- Editable role permissions.
--
-- Access was hardcoded: 186 `requireRole([...])` calls across 72 files plus a
-- role check in the proxy, with no way to answer "what may a manager open?"
-- other than by reading the source. This table is where that answer lives once
-- an admin changes it.
--
-- Starts EMPTY on purpose. A role with no rows falls back to the defaults in
-- lib/permissions.ts, which reproduce the hardcoded behaviour exactly, so this
-- migration changes nothing on its own — no access is gained or lost until
-- somebody edits a role on /admin/roles. Saving writes a row per permission,
-- granted or not, so "nothing ticked" stays distinguishable from "never set".
--
-- ADMIN is never written here: a role that can edit roles must not be able to
-- lock itself out, so it is short-circuited in code before this table is read.
--
-- tenantKey per the standing rule for new tables, with the uniqueness composite
-- from the start so the future multi-tenant split needs no second migration.

CREATE TABLE "RolePermission" (
  "id"         TEXT NOT NULL,
  "tenantKey"  TEXT NOT NULL DEFAULT 'geleoteka',
  "role"       TEXT NOT NULL,
  "permission" TEXT NOT NULL,
  "allowed"    BOOLEAN NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RolePermission_tenantKey_role_permission_key"
  ON "RolePermission"("tenantKey", "role", "permission");

CREATE INDEX "RolePermission_tenantKey_role_idx"
  ON "RolePermission"("tenantKey", "role");
