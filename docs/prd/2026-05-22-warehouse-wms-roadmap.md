# Warehouse / WMS Roadmap

Created: 2026-05-22
Author: aleksandr.spiskov@gmail.com
Status: ROADMAP (drives future `/spec` plans)
Originating PRD: `docs/prd/2026-05-22-warehouse-module-barcode.md`
WMS seam: `docs/design/2026-05-22-wms-module-seam.md`

## Purpose

The barcode PRD shipped the WMS *engine* (StockItem/StockMovement aggregate ledger, reservations, `recordMovement`, `lookupByCode`). This roadmap sequences the path from "stock is visible per-part" to a **full-fledged warehouse-management system** with physical bin locations, while preserving the extraction seam (`lib/wms` stays host-agnostic and multi-tenant-ready).

## Architectural spine (holds across all phases)

- **`StockItem` is the authoritative aggregate** — total `quantity` (on-hand) and `reserved`. `recordMovement` is the single chokepoint for aggregate changes and is **never** rewritten by the location work.
- **`StockBin` is a placement layer over the aggregate** — it records WHERE the already-counted on-hand sits. `Σ StockBin.quantity ≤ StockItem.quantity`; `unplaced = quantity − Σbins`. Placement ops move stock *within* the item (unplaced↔bin, bin↔bin) and never change the aggregate.
- All core DB access funnels through `lib/wms/internal/repository.ts`; everything is `tenantKey`-scoped; the core imports zero host code (ESLint-enforced).

## Phases

### Phase 1 — Warehouse module + multi-bin placement foundation  ← THIS PLAN
`docs/plans/2026-05-22-warehouse-admin-module.md`

- «Склад» admin section: stock overview (search, pagination, low-stock highlight), barcode-HID scan box (lookup + inline on-hand ADJUSTMENT), cross-part movements feed, barcode/GTIN assignment.
- **Multi-bin foundation:** `StockBin` + `StockBinMovement` (WMS-owned); core ops `placeStock` / `transferStock` / `removeFromBin` with the `Σbins ≤ quantity` invariant; per-item bin breakdown + `unplaced` shown in overview & scan; putaway and bin-to-bin transfer from the warehouse UI; location search and location-centric lookup ("what's in A-12-3?").

### Phase 2 — Receiving (приёмка) + putaway
- Scan-receive against a `SupplierOrder` (PO): RECEIPT raises the aggregate, then guided putaway places the received qty into bins. Closes the "received but unplaced" loop from Phase 1.
- Label printing for items **and** bins (the `qrcode` dep is already present).

### Phase 3 — Stocktake / инвентаризация
- Structured count sessions: generate a count sheet (optionally per location/zone), scan each item/bin, capture counted-vs-system, post variances as bulk ADJUSTMENT movements with a session audit. Cycle counts. Supersedes the Phase-1 one-off adjust as the disciplined recount path.

### Phase 4 — Bin-aware picking / отбор (closes the Phase-1 drift)
- Outbound consumption deducts from a chosen bin, so `Σbins` tracks the aggregate exactly (eliminates the Phase-1 over-placement drift). Scan-to-pick for repair/customer orders; ties into the existing fulfillment `CONSUMPTION` path. (Scan-into-estimate, deferred earlier, fits here.)

### Phase 5 — Replenishment / дозаказ
- Per-item reorder point (min/max) + a "to reorder" report feeding `SupplierOrder`. The Phase-1 fixed low-stock threshold is the seed; this makes it per-item and actionable.

### Phase 6 — Reports, transfers-at-scale, multi-warehouse
- Stock valuation, movement export, dead-stock / ABC analysis. Multi-warehouse (multiple physical sites) — the `tenantKey` discriminator and the placement layer are designed to extend here. Optional: warehouse-operator role, tablet-optimized scan UI.

## Phase-1 known limitation (closed by Phase 4)

Aggregate `CONSUMPTION` (e.g. fulfillment) does **not** deduct from bins in Phase 1, so after a consume `Σbins` can exceed `quantity`. Phase 1 defines `unplaced = max(0, quantity − Σbins)` and surfaces a "needs reconcile" flag when `Σbins > quantity`; Phase 4 (bin-aware picking) removes the drift at its source.
