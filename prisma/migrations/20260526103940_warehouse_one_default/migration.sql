-- At most one default warehouse per tenant. setDefaultWarehouse clears the old
-- default and sets the new one in one transaction; this partial unique index is
-- the concurrency backstop (two concurrent set-default → one fails P2002).
-- Partial/filtered unique indexes aren't expressible in the Prisma schema DSL,
-- so this lives only in the migration (like the StockItem CHECK).
CREATE UNIQUE INDEX "Warehouse_one_default_per_tenant" ON "Warehouse"("tenantKey") WHERE "isDefault" = true;
