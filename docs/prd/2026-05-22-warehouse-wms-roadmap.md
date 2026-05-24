# Warehouse / WMS Roadmap

Created: 2026-05-22
Author: aleksandr.spiskov@gmail.com
Status: ROADMAP (drives future `/spec` plans)
Originating PRDs: `docs/prd/2026-05-22-warehouse-module-barcode.md`, `docs/prd/2026-05-23-qr-phone-scanning.md`
WMS seam: `docs/design/2026-05-22-wms-module-seam.md`

## Purpose

The barcode PRD shipped the WMS *engine* (StockItem/StockMovement aggregate ledger, reservations, `recordMovement`, `lookupByCode`). This roadmap sequences the path from "stock is visible per-part" to a **full-fledged warehouse-management system** with physical bin locations, while preserving the extraction seam (`lib/wms` stays host-agnostic and multi-tenant-ready).

## Architectural spine (holds across all phases)

- **`StockItem` is the authoritative aggregate** — total `quantity` (on-hand) and `reserved`. `recordMovement` is the single chokepoint for aggregate changes and is **never** rewritten by the location work.
- **`StockBin` is a placement layer over the aggregate** — it records WHERE the already-counted on-hand sits. `Σ StockBin.quantity ≤ StockItem.quantity`; `unplaced = quantity − Σbins`. Placement ops move stock *within* the item (unplaced↔bin, bin↔bin) and never change the aggregate.
- All core DB access funnels through `lib/wms/internal/repository.ts`; everything is `tenantKey`-scoped; the core imports zero host code (ESLint-enforced).

## Phone QR-Scanning workstream (folded in 2026-05-23)

The QR phone-scanning PRD (`docs/prd/2026-05-23-qr-phone-scanning.md`) is incorporated here.

**⚖️ Model decision (2026-05-23): keep the quantity-aggregate model.** The PRD's per-physical-unit
serialized model (§8.1/§26 — one tracked row per used part, each with its own `qr_code`/
`warehouse_status`/`location` and a received→…→shipped lifecycle) is **NOT adopted**. QR and
scanning operate at **`Part` (SKU) + order-line + `StockBin`** level. Consequences that constrain
every scan plan below:

- **No per-unit status column.** "Where/what state" is expressed through the existing
  `StockMovement` ledger + `StockBin` placement + order/order-line status — not a single
  `warehouse_status` per item. PRD statuses map to *movements/order state*, not unique units.
- **Pick/pack/ship operate on order lines (Part + qty).** "Wrong item" (`WRONG_ITEM`) = scanned
  `Part` ≠ any open line's `Part` — extends the existing `scanReceiveLine` match pattern.
- **No per-unit `PickTask`/`Package` entities required.** Picking ties into the existing
  fulfillment `CONSUMPTION` path at order-line granularity (Phase 4); packing/shipping extend the
  existing order/`PartShipment` status rather than introducing serialized package rows. Add a
  light package grouping only if a single order needs multiple parcels.

**Net-new pieces this workstream adds (model-independent, so they land regardless):**

1. **Phone-camera QR scanner component** — `getUserMedia` + `BarcodeDetector` (fallback lib),
   manual-entry fallback, 1 s duplicate-scan guard. Replaces/augments the current HID/text scan box.
2. **Typed QR format** `WMS:PART:<article>` / `WMS:LOC:<code>` / `WMS:ORDER:<number>` /
   `WMS:BOX:<code>` + a parser. Upgrades the current plain-barcode/article label payload; lets one
   scan endpoint route by object type. Retrofits onto the already-shipped item/bin labels.
3. **`ScanEvent` table** (§8.6) — append-only raw scan audit incl. failures (`success`/`rejected`/
   `error`), with `user_id`, `raw_code`, parsed type/id, `error_code`. Independent of the agg/unit
   choice; underpins the §20 analytics + §16 audit.
4. **`warehouse_worker` role** — add to `UserPermissionRole` (currently `ADMIN/MANAGER/CLIENT/NONE`)
   + the §7 permission matrix.
5. **`idempotency_key` on all write scan endpoints** — receiving already uses a compare-and-set;
   generalize to a stored key (`DUPLICATE_OPERATION`).
6. **Bin `is_active` / `is_blocked`** flags (§8.2) — `StockBin`/location currently has no block flag
   (`LOCATION_BLOCKED` validation needs it).

**PRD operation → phase mapping** (under the aggregate model):

| PRD op | Where it lands |
|---|---|
| §10.1 приёмка, §10.2 putaway, §10.3 move, §15 labels | **Shipped** (Phase 1–2) — retrofit camera scanner + typed QR |
| §10.7 инвентаризация (cycle-count, found/missing/unexpected) | **Phase 3** (stocktake) |
| §10.4 подбор + `WRONG_ITEM` block | **Phase 4** (bin-aware picking, order-line match) |
| §10.5 упаковка, §10.6 отгрузка | **Phase 4b** (extend order/shipment status) |
| Camera scanner, typed QR, `ScanEvent`, `warehouse_worker`, idempotency, bin-block | **Phase 2.5** (foundation — below; precedes 3/4) |

Suggested `/spec` slicing: **Phase 2.5 first** (scanner + typed QR + ScanEvent + role + bin-block),
then Phase 3 (инвентаризация), then Phase 4/4b (pick/pack/ship). Each is one `/spec`.

## Phases

### Phase 2.5 — Phone QR-scanning foundation (folded-in PRD; precedes Phase 3)
- Phone-camera QR scanner component + typed `WMS:TYPE:ID` format & parser (retrofit onto shipped item/bin labels); `ScanEvent` audit table; `warehouse_worker` role + permission matrix; generalized `idempotency_key`; `StockBin.is_active`/`is_blocked`. Camera-scan retrofits the already-shipped putaway/move/receive flows; no model change (stays quantity-aggregate).

### Phase 1 — Warehouse module + multi-bin placement foundation  ← THIS PLAN
`docs/plans/2026-05-22-warehouse-admin-module.md`

- «Склад» admin section: stock overview (search, pagination, low-stock highlight), barcode-HID scan box (lookup + inline on-hand ADJUSTMENT), cross-part movements feed, barcode/GTIN assignment.
- **Multi-bin foundation:** `StockBin` + `StockBinMovement` (WMS-owned); core ops `placeStock` / `transferStock` / `removeFromBin` with the `Σbins ≤ quantity` invariant; per-item bin breakdown + `unplaced` shown in overview & scan; putaway and bin-to-bin transfer from the warehouse UI; location search and location-centric lookup ("what's in A-12-3?").

### Phase 2 — Receiving (приёмка) + putaway
- Scan-receive against a `SupplierOrder` (PO): RECEIPT raises the aggregate, then guided putaway places the received qty into bins. Closes the "received but unplaced" loop from Phase 1.
- Label printing for items **and** bins (the `qrcode` dep is already present).

### Phase 3 — Stocktake / инвентаризация ← SHIPPED
`docs/plans/2026-05-24-warehouse-stocktake.md` (VERIFIED)

- Structured count sessions: generate a count sheet (per location/zone/full/part), scan each cell + its items (informed — system qty shown), capture counted-vs-system, post variances as bulk per-part ADJUSTMENT movements with a session audit. Supersedes the Phase-1 one-off adjust as the disciplined recount path.
- **Folded-in PRD §10.7:** scan-a-bin then scan-its-items; classify `found`/`missing`/`unexpected`/`unknown`; **no auto write-off** — variances reviewed and posted by a manager (ADMIN/MANAGER gate; workers count). Posting is **bins-are-truth** (per part Σ(counted−system) ADJUSTMENT + each counted bin reconciled), **blocks on drift** (any in-scope cell changed/removed/newly-created since generation), and refuses to post on top of pre-existing reconcile drift. `StockCountSession`/`StockCountLine` tables; `lib/wms/public/stocktake.ts`; `app/actions/stocktake.ts`; `/admin/warehouse/stocktake`.

### Phase 4 — Bin-aware picking / отбор (closes the Phase-1 drift)
- Outbound consumption deducts from a chosen bin, so `Σbins` tracks the aggregate exactly (eliminates the Phase-1 over-placement drift). Scan-to-pick for repair/customer orders; ties into the existing fulfillment `CONSUMPTION` path. (Scan-into-estimate, deferred earlier, fits here.)
- **Folded-in PRD §10.4:** open an order → scan bin → scan part; the scanned `Part` must match an open order line, else block with `WRONG_ITEM` + a `rejected` `ScanEvent` (order-line granularity, not per-unit).

### Phase 4b — Packing / упаковка + отгрузка (folded-in PRD §10.5/§10.6)
- Pack: scan order → scan parcel → scan part; verify the part belongs to the order, then advance order/`PartShipment` status. Ship: scan order/parcel → verify all required lines packed → confirm → `shipped` (drives the existing order status). Optional light parcel-grouping row only if one order needs multiple boxes; otherwise reuse `PartShipment`.

### Phase 5 — Replenishment / дозаказ
- Per-item reorder point (min/max) + a "to reorder" report feeding `SupplierOrder`. The Phase-1 fixed low-stock threshold is the seed; this makes it per-item and actionable.

### Phase 6 — Reports, transfers-at-scale, multi-warehouse
- Stock valuation, movement export, dead-stock / ABC analysis. Multi-warehouse (multiple physical sites) — the `tenantKey` discriminator and the placement layer are designed to extend here. Optional: warehouse-operator role, tablet-optimized scan UI.

## Phase-1 known limitation (closed by Phase 4)

Aggregate `CONSUMPTION` (e.g. fulfillment) does **not** deduct from bins in Phase 1, so after a consume `Σbins` can exceed `quantity`. Phase 1 defines `unplaced = max(0, quantity − Σbins)` and surfaces a "needs reconcile" flag when `Σbins > quantity`; Phase 4 (bin-aware picking) removes the drift at its source.
