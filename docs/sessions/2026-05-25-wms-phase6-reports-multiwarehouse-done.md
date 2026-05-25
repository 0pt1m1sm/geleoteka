# WMS Phase 6 — Reports + Multi-Warehouse — DONE & SHIPPED

**Date:** 2026-05-25
**Status:** ✅ VERIFIED + shipped to prod (commit `63ad753`, pushed to `main` → Railway auto-deploy runs `prisma migrate deploy`)
**Plan:** `docs/plans/2026-05-25-warehouse-reports.md` (Status: VERIFIED)
**Memory:** observation #13353

The WMS is now feature-complete. Phase 5 (replenishment) shipped as `94102b8`; Phase 6 (this) as `63ad753`. Two tracked fast-follows remain (see below) — neither blocks the WMS being usable today.

---

## What shipped in Phase 6

### Reports (multi-warehouse-aware reads)
| Report | Route | Helper |
|--------|-------|--------|
| Stock valuation | `/admin/warehouse/reports/valuation?wh=` | `lib/warehouse/valuation.ts` |
| Movement CSV export | `/admin/warehouse/reports/movements?wh=` + `GET /api/admin/warehouse/movements/export?wh=&from=&to=&reason=` | `lib/warehouse/movement-csv.ts` |
| Dead-stock + ABC | `/admin/warehouse/reports/analysis?windowDays=&wh=` | `lib/warehouse/stock-analysis.ts` |

- **Valuation** = on-hand × latest purchase unit-cost (`SupplierOrderItem.unitCost`, PART type only). Parts with no purchase history are surfaced as a "no cost basis" count — **never silently valued at 0**. `latestUnitCostByPartIds` has a deterministic tie-break `orderBy: [{ order: { orderDate: "asc" } }, { id: "asc" }]`.
- **ABC** classified by consumed **quantity** (A=80% / B=15% / C=5% cumulative). **Dead-stock** = no `CONSUMPTION` movement in N days.

### Multi-warehouse dimension
- New `Warehouse` model. Default: `id=wh_main_geleoteka`, `code=MAIN`, `isDefault=true`.
- `warehouseId` FK on **StockItem, StockMovement, StockBin, StockLocation, StockCountSession**.
- `StockItem` unique → **`(partId, warehouseId)`**; `Part → StockItem` is now **1:many** (`Part.stockItems[]`).
- `StockMovement` unique widened to `(tenantKey, sourceType, sourceId, reason, warehouseId)`; `StockLocation` unique `(tenantKey, warehouseId, code)`.
- `defaultWarehouseId(client)` resolver in `lib/wms-host/index.ts` — module-level cache, **process-lifetime** (change `isDefault` ⇒ restart server). `lib/wms` core stays host-agnostic; the host adapter injects `warehouseId`.

### UI / actions
- `components/admin/WarehouseSwitcher.tsx` (uses `useProgressRouter`, var `nav` for ESLint), `WarehouseAdmin.tsx`, `ReportsNav.tsx`.
- `app/actions/warehouses.ts`: `listWarehouses`, `createWarehouse`, `resolveWarehouseId(wh, warehouses?)` — optional pre-fetched list param avoids a redundant 2nd Warehouse query (reused across 5 pages + export route).
- **`?wh` preserved across**: all 3 report subnav links, analysis window-day links, movements export link, and `WarehouseOverview` pagination (`buildHref`) + search (hidden `wh` input). *(This was the Codex review finding "active warehouse dropped by navigation" — fixed and E2E-confirmed live.)*

---

## Migration — applied MANUALLY (do not repeat blindly)

`prisma/migrations/20260525013449_warehouse_dimension/` — applied to dev via **psql + `prisma migrate resolve --applied 20260525013449_warehouse_dimension`**.

⛔ **NEVER run `prisma migrate dev`** — it resets the dev DB over Phase-3 stocktake checksum drift. Create migrations manually (psql `ALTER` + `migrate resolve --applied <name>`). Prod applies it via Railway's `prisma migrate deploy` on this deploy (backfill-before-NOT-NULL ordering verified safe).

---

## ⚠️ Known gap (accepted scope — NOT a bug)

**Per-warehouse WRITES are not routed.** `adjustStock`, scan-receive (`scanReceiveOrderLine`/`blindReceive`), `placeIntoBin`/`transferBetweenBins`/`removeFromBinAction`, picking/packing scans, and stocktake **all resolve `defaultWarehouseId` and target MAIN** regardless of the active `?wh` switcher. You cannot add/move stock *into* a 2nd warehouse via the UI yet.

The `lib/wms` ops **already accept `warehouseId`** — this is a UI/action-param wiring job, not a core change. `scripts/verify-multiwarehouse.ts` proves the data layer supports independent per-warehouse stock today.

---

## Pending tasks (for next sessions)

- **#35 (recommended next `/spec`)** — per-warehouse WRITE routing: thread the active `?wh` into the write actions listed above.
- **#34** — camera-scan button on picking/packing line forms (forms say "scan" but expose only manual fields; needs a `getUserMedia` camera button — hardware-scanner design is intentional, the camera path is the gap).

---

## Verification snapshot

- `tsc --noEmit` = 0, `eslint` clean, `npm run build` exit 0.
- All WMS `tsx scripts/verify-*.ts` pass (valuation, stock-analysis, multiwarehouse, replenishment, warehouse, packing, picking, scan-receiving, stocktake, qr-scanning, landed-cost).
- `verify-resend-receiving-path` FAILS but is **env-gated** (`RESEND_API_KEY` unset) and unrelated to the WMS.
- Live E2E on dev HTTPS:443: **TS-001/002/003 PASS**; **TS-004 read-isolation PASS** (NORTH warehouse = 1 item vs MAIN = 14; switcher persists across navigation). TS-004 step 2 (write) = the accepted gap above.

## Project facts
- Dev server: `npm run dev` → HTTPS:443. Admin `admin@geleoteka.ru` / `admin123`.
- DB: `postgresql://alex@localhost:5432/geleoteka`.
- Push: `env -u GITHUB_TOKEN git push origin main` (= prod deploy via Railway).
- Tests: `tsx scripts/verify-*.ts` only — **no jest/vitest**.
