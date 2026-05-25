-- WMS integrity backstops (audit findings H1/M1 + H3).

-- H3: one PartOrderItem per (order, part). Duplicate part rows on one order
-- collapse to a single consumption source triple, so the second consume is an
-- idempotent no-op and the order ships short. The action layer also merges
-- duplicate cart lines; this is the DB-level guarantee. Name matches the
-- @@unique([orderId, partId]) on PartOrderItem so Prisma sees the schema in sync.
CREATE UNIQUE INDEX "PartOrderItem_orderId_partId_key" ON "PartOrderItem"("orderId", "partId");

-- H1/M1: on-hand can never be negative. The retail checkout re-checks
-- availability under a FOR UPDATE lock and consumeStock has a typed
-- INSUFFICIENT_STOCK floor; this CHECK is the ultimate backstop so no path
-- (incl. a concurrent race) can persist negative on-hand. Reserved is a hold
-- counter that the consumption floor keeps >= 0, so it is not constrained here.
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_quantity_nonneg" CHECK ("quantity" >= 0);
