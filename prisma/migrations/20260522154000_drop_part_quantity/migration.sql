-- Drop Part.quantity. On-hand now lives on StockItem.quantity (WMS core);
-- every reader/writer has been cut over (storefront, admin, checkout, supplier
-- receipt, RO/shipment consumption, manual edits via ADJUSTMENT). The StockItem
-- backfill (migration 20260522153000) already copied each Part's quantity.
ALTER TABLE "Part" DROP COLUMN "quantity";
