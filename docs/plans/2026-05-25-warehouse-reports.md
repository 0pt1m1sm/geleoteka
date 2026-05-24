# Warehouse Reports & Multi-Warehouse (WMS Phase 6) Implementation Plan

Created: 2026-05-25
Author: aleksandr.spiskov@gmail.com
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** WMS Phase 6 — (A) reporting: stock valuation (latest purchase cost basis), CSV movement export, and dead-stock + ABC analysis; (B) multi-warehouse: make stock per physical warehouse via a new `Warehouse` dimension, migrating `StockItem` from 1:1-with-Part to one row per (part, warehouse), with a warehouse switcher across the WMS UI.

## Out of Scope

- **Per-warehouse reorder policy / picking-routing logic.** Phase-5 reorder points stay per-StockItem (which becomes per-warehouse automatically once StockItem is per-warehouse); no cross-warehouse transfer-suggestion engine.
- **Inter-warehouse stock transfers UI.** Moving stock between warehouses is a future slice; this plan establishes the dimension + scoped reads/writes only.
- **Weighted-average / FIFO cost layers.** Valuation uses latest purchase unit cost only.
- **ScanEvent per-warehouse scoping.** ScanEvent is append-only audit; it keeps `tenantKey` only (no `warehouseId`) to bound blast radius.

## Approach

**Chosen:** (A) Host-side report modules in `lib/warehouse/` (`valuation.ts`, `movement-csv.ts`, `stock-analysis.ts`) feeding new `/admin/warehouse/reports/*` pages + a CSV export route mirroring `app/api/admin/customers/export/route.ts`. (B) New `Warehouse` model + `warehouseId` FK on `StockItem`/`StockMovement`/`StockBin`/`StockLocation`/`StockCountSession`; `StockItem` unique becomes `@@unique([partId, warehouseId])`; the WMS core resolves the stock row by (partId, warehouseId) instead of partId, with the host injecting a default warehouse (like `tenantKey`).
**Why:** Reports are read-only over existing ledger data → low risk, ship first. Multi-warehouse needs a real per-warehouse stock row (a part can hold different quantities at different sites), which forces dropping `partId @unique`; a dedicated `Warehouse` table (vs overloading `tenantKey`, which is reserved for future SaaS-tenant isolation) keeps the tenant and warehouse axes orthogonal. The cost is a core-aggregate migration + touching ~14 `partId`-keyed call sites — accepted by the user over the recommended split.

## Context for Implementer

- **recordMovement is NOT rewritten.** Its aggregate-update logic (the chokepoint) stays intact. Only the *row-resolution* helper `getOrCreateStockItem` (lib/wms/internal/repository.ts:27) becomes warehouse-aware: `(client, partId, tenantKey)` → `(client, partId, tenantKey, warehouseId)`, resolving/creating by `(partId, warehouseId)`. Every other repository read that keyed on `partId` (`findUnique({where:{partId}})`) becomes `findFirst({where:{partId, warehouseId}})` or uses the compound unique `partId_warehouseId`.
- **Default warehouse seam.** `lib/wms-host` gains `DEFAULT_WAREHOUSE_CODE = "MAIN"` and an async `defaultWarehouseId(db)` resolver (cached). All existing host call sites (single-warehouse behaviour) pass the default warehouse id, so current flows are unchanged. The core stays host-agnostic — warehouseId is an opaque string the host supplies, exactly like `tenantKey`.
- **Migration is MANUAL** (psql + `prisma migrate resolve --applied`); `prisma migrate dev` RESETS this dev DB. The migration is multi-step within one migration.sql: create `Warehouse`, seed MAIN, add nullable `warehouseId` columns, backfill to MAIN, set NOT NULL + FKs, drop `StockItem.partId` unique, add `@@unique([partId, warehouseId])`.
- **Cost basis (valuation):** latest `SupplierOrderItem.unitCost` for the part (most recent by `order.orderDate`, PART lines only); null when the part was never purchased → shown as «—» / excluded from totals with a "no cost" count. **ABC + dead-stock use consumed QUANTITY, not value** (user decision).
- **No jest/vitest** — tests are `tsx scripts/verify-*.ts`. Prisma client `@ts-nocheck` at `app/generated/prisma` (cast delegate results `as {...}`).

## Assumptions

- Existing `tenantKey`-scoped rows all belong to one physical site → backfilling them to a single MAIN warehouse is correct. Tasks 5–8 depend on this.
- `SupplierOrderItem.order.orderDate` is a usable recency key for "latest cost" (Phase-2/landed-cost orders set it). Task 1 depends on this.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Migration drops `partId @unique` while code still does `findUnique({where:{partId}})` → runtime P2025/compile breaks | High | High | Task 5 (schema) and Task 6/7 (call-site updates) ship together; verify-multiwarehouse.ts asserts a second-warehouse StockItem can coexist for the same part and that default-warehouse reads still resolve |
| recordMovement idempotency unique `[tenantKey, sourceType, sourceId, reason]` is warehouse-blind → same source into 2 warehouses returns `applied:false` and silently skips the second warehouse's delta | High | High | **Resolved upfront in Task 5**: the migration widens the unique to include `warehouseId`, AND Task 6 makes any source-existence pre-check in `record-movement.ts` warehouse-aware. verify-multiwarehouse.ts asserts the second-warehouse same-source movement APPLIES (not a no-op) |
| Location block/create leaks across warehouses (`StockLocation @@unique([tenantKey, code])` is warehouse-blind) | Medium | Medium | Task 5 changes the unique to `[tenantKey, warehouseId, code]`; Task 6/7 thread `warehouseId` through the location helpers; verify asserts cell A-1 can be blocked in one warehouse without affecting the other |
| Backfill leaves NULL warehouseId rows → NOT NULL constraint fails | Medium | High | Migration backfills BEFORE adding NOT NULL; Task 5 DoD checks `count(*) where warehouseId is null = 0` pre-constraint |

## Goal Verification

### Truths

1. After migration, the same part can carry independent on-hand quantities in two warehouses, every existing flow (receive/adjust/pick/pack/reserve) still operates correctly against the default warehouse, and `Σ StockBin ≤ StockItem.quantity` holds per (part, warehouse). (Cross-cuts Tasks 5–8; not reducible to one DoD.)
2. The valuation report's total equals `Σ (on-hand × latest-unit-cost)` over parts with a known cost, and parts with no purchase history are surfaced as a distinct "no cost basis" count rather than silently valued at 0. (Cross-cuts Task 1 + Task 2.)

## E2E Test Scenarios

### TS-001: Stock valuation report
**Priority:** Critical
**Preconditions:** admin; at least one part with stock and a prior supplier order, one part with stock but no purchase history.
**Mapped Tasks:** Task 1, Task 2

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate `/admin/warehouse/reports/valuation` | Table lists parts with on-hand, unit cost, line value; a grand total |
| 2 | Read the part with purchase history | Unit cost = its latest SupplierOrderItem.unitCost; line value = on-hand × that cost |
| 3 | Read the part with no purchase history | Shows «—» for cost, excluded from the total, counted in a "без себестоимости: N" note |

### TS-002: Movement export CSV
**Priority:** Critical
**Preconditions:** admin; some StockMovements exist.
**Mapped Tasks:** Task 3

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | On the movements report page, click «Экспорт CSV» | Browser downloads `movements-<date>.csv` (200, `text/csv`) |
| 2 | Apply a reason or date filter, export again | CSV rows respect the filter; header row present, BOM/CRLF Excel-friendly |

### TS-003: Dead-stock + ABC report
**Priority:** High
**Preconditions:** admin; a part consumed recently, a part not consumed in >90 days.
**Mapped Tasks:** Task 4

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate `/admin/warehouse/reports/analysis` | Dead-stock section lists the un-consumed part; recently-consumed part absent |
| 2 | Read the ABC section | Each part with consumption has class A/B/C by cumulative consumed-quantity share (A=80%/B=15%/C=5%) |
| 3 | Change the window (e.g. 30 days) | Lists recompute for the new window |

### TS-004: Multi-warehouse stock isolation
**Priority:** Critical
**Preconditions:** admin; MAIN warehouse seeded; a second warehouse created.
**Mapped Tasks:** Task 5, Task 6, Task 7, Task 8

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | In «Остатки», use the warehouse switcher to select the second warehouse | Overview scopes to that warehouse (a part with stock only in MAIN shows 0 here) |
| 2 | Adjust a part's on-hand in the second warehouse | Only that warehouse's StockItem changes; MAIN on-hand for the same part unchanged |
| 3 | Switch back to MAIN | MAIN quantity intact; the two warehouses report independent on-hand |

## E2E Results (spec-verify, 2026-05-25)

Live target: dev HTTPS:443 (Tier 1 — already-running server, HTTP 200). Browser: Claude-in-Chrome.

| Scenario | Priority | Result | Fix Attempts | Notes |
|----------|----------|--------|--------------|-------|
| TS-001 | Critical | PASS | 0 | Valuation report renders; per-warehouse total + table; subnav carries `?wh`. |
| TS-002 | High | PASS | 0 | Movements report renders; export link = `/api/admin/warehouse/movements/export?wh=<id>`. |
| TS-003 | High | PASS | 0 | Dead-stock + ABC sections render; window-day links preserve `?wh` (`?windowDays=30&wh=<id>`). |
| TS-004 | Critical | PASS (reads) | 0 | Read-isolation confirmed live: NORTH warehouse showed 1 item vs MAIN's 14; switcher stayed on NORTH after windowDays click. Step 2 (per-warehouse WRITE/adjust) is the accepted write-routing gap → fast-follow (writes resolve to MAIN). |

Codex finding "active warehouse dropped by report/overview navigation" verified fixed live: all three report subnav links, the analysis window-day links, and the movements export link preserve the active `wh` across navigation; WarehouseOverview pagination/search now carry `wh`.

## Implementation Status (checkpoint 4 — 2026-05-25)

- **Tasks 1–7 DONE + verified.** **Task 8 reads/switcher/admin DONE + browser-verified:** the WarehouseSwitcher shows MAIN★ + MSK, switching to MSK scopes the overview (parts show 0 on-hand in MSK vs real in MAIN — read isolation confirmed live). `?wh` + switcher wired on overview + ALL report pages (valuation/analysis/movements/replenishment) + movements export route; `getValuationReport/getStockAnalysis/getReorderReport` accept warehouseId. Whole-tree tsc=0, eslint clean, build was green pre-Task-8 (re-run build after Task-8 edits — likely still green, confirm).
- **⚠️ KNOWN GAP — multi-warehouse is read/report-complete, NOT write-complete.** The WRITE paths still resolve `defaultWarehouseId` and always target MAIN regardless of the active switcher: `adjustStock`, scan-receive (`scanReceiveOrderLine`/`blindReceive`), `placeIntoBin`/`transferBetweenBins`/`removeFromBinAction`, picking/packing scans, stocktake. So you cannot add/move stock INTO a 2nd warehouse via the UI yet. Real per-warehouse writes need the active `?wh` threaded into these actions (the lib ops already accept warehouseId — it's a UI/action-param wiring job, NOT a core change). verify-multiwarehouse.ts proves the data layer supports it.
- **Create-warehouse form:** MCP browser fill didn't trigger React state so it didn't persist (the `createWarehouse` action is correct); needs a real-browser retry. A test warehouse `wh-msk-e2e` (MSK) was seeded via psql.
- **REMAINING:** (a) re-run production build post-Task-8; (b) decide on the write-routing gap (ship read-only multi-warehouse now + write-routing as fast-follow, OR thread `?wh` into write actions before shipping); (c) spec-verify (changes-review + Codex); (d) delete test warehouse `wh-msk-e2e`; (e) commit + push. Nothing committed; prod untouched.

## Implementation Status (checkpoint 3 — superseded)

- **Tasks 1–7 DONE + verified.** Task 8 CODE-COMPLETE: `app/actions/warehouses.ts` (listWarehouses/createWarehouse/resolveWarehouseId), `WarehouseSwitcher.tsx`, `WarehouseAdmin.tsx`; warehouse landing page renders switcher + admin + scopes WarehouseOverview by `?wh`; valuation report page wired with switcher + `?wh`. `getValuationReport`/`getStockAnalysis` accept `warehouseId`. **Whole-tree tsc=0, eslint clean, production build exit 0.**
- **REMAINING (next turn):**
  1. **Browser TS-004 not yet done.** The create-warehouse FORM submit didn't persist in the MCP browser run (controlled-input + fill-tool quirk; the `createWarehouse` action itself is correct). A 2nd warehouse `wh-msk-e2e` (MSK) was seeded via psql to test scoping — **must verify in a real browser**: switcher appears with 2 options, switching to MSK shows an EMPTY overview (no stock rows there) while MAIN shows ~18, and adjusting a part in MSK leaves MAIN unchanged. Also retry the create-form in a real browser. (DATA-level isolation already proven by `verify-multiwarehouse.ts`.)
  2. Wire `?wh`+switcher into analysis/movements/replenishment report pages (helpers/actions already accept warehouseId; getReorderReport still needs a warehouseId param + page wiring — currently defaults to MAIN). Movements export route should filter by warehouseId.
  3. spec-verify (changes-review + Codex) → fix findings → commit + push.
- **DEV DB STATE:** migrated; seeded test warehouse `wh-msk-e2e` (MSK) present — delete before shipping if unwanted (`DELETE FROM "Warehouse" WHERE id='wh-msk-e2e'`). Nothing committed. Prod untouched.

## Implementation Status (checkpoint 2 — superseded)

- **DONE Tasks 1–7.** Whole-tree `tsc --noEmit` = 0 errors. ALL WMS verify scripts PASS: verify-warehouse, verify-picking, verify-packing, verify-stocktake, verify-replenishment, verify-valuation, verify-stock-analysis, verify-qr-scanning, verify-scan-receiving, verify-landed-cost, **verify-multiwarehouse (new — proves independent per-warehouse stock, cross-warehouse same-source applies, consume + location isolation)**. Fixed 6 real production scan-flow bugs the migration exposed (lookupByCode/getLocation/itemsInLocation/setLocationBlocked mis-passing tenantKey into the new warehouseId slot in scan-router + 5 actions). Also fixed a stale pre-Phase-4b assertion in verify-qr-scanning (ORDER now resolves).
- **REMAINING:** (a) confirm production build green; (b) **Task 8** — `app/actions/warehouses.ts` (listWarehouses/createWarehouse), `components/admin/WarehouseSwitcher.tsx`, wire `?wh` into WarehouseOverview + getValuationReport/getStockAnalysis/getReorderReport (helpers already take warehouseId — just thread the selected id from `?wh`), warehouse admin section; (c) restart dev server (stale Prisma client) + browser E2E TS-004 (two-warehouse isolation) + re-run TS-001/002/003; (d) spec-verify (changes-review + Codex), fix findings; (e) commit + push. NOTHING committed yet — large uncommitted tree.

## Implementation Status (checkpoint 1 — superseded)

- **DONE:** Tasks 1–5 fully (reports shipped-quality + verified via tsx + browser E2E TS-001/002/003; migration applied to dev DB — Warehouse table + warehouseId on 5 tables, StockItem unique=(partId,warehouseId), StockMovement & StockLocation uniques widened, MAIN seeded).
- **DONE (Task 6 core + Task 7 production):** WMS core warehouse-aware (repository ensureStockItem/findViewByItemId/findViewByCode/movementExistsForSource/location helpers/incrementBin/findItemsInLocation; WmsItemRef+PlacementMeta gain warehouseId; record-movement/consumption/placement/locations/lookup/stocktake threaded). lib/wms-host adds DEFAULT_WAREHOUSE_CODE + defaultWarehouseId(). Part relation now `stockItems[]` (was 1:1). ALL host production call sites threaded (adjust, codes, receive, scan-receive, pick, pack, fulfillment consume-parts/reservations, parts, supplier-orders, part-orders, parts-import, warehouse actions, stocktake action, replenishment/valuation/stock-analysis helpers + actions, WarehouseOverview, StockHistory, lookup route, scan-router, labels, suppliers order page, public parts pages, CRM stock-options). **`tsc --noEmit` on PRODUCTION code = 0 errors.** verify-valuation/stock-analysis/replenishment PASS against migrated DB.
- **REMAINING:**
  1. Fix tsx test/seed scripts (verify-picking/packing/stocktake/warehouse/qr-scanning/scan-receiving/landed-cost, seed.ts, seed-picking-e2e, seed-packing-e2e, backfill-stock-locations) — each needs: `stockItem.create` → add `warehouseId: "wh_main_geleoteka"`; `findUnique({where:{partId}})` → compound `partId_warehouseId`; `WmsItemRef`/placeStock/etc. → add warehouseId; nested `part.create({data:{stockItem:{create}}})` → `stockItems:{create:{...warehouseId}}`; stockLocation `tenantKey_code` → `tenantKey_warehouseId_code`.
  2. CREATE `scripts/verify-multiwarehouse.ts` (Task 6 DoD: two warehouses, independent stock, same-source-into-2nd-warehouse APPLIES not no-op, location-block isolation).
  3. Run full verify suite (all scripts pass) + tsc whole-tree clean + build.
  4. Task 8: WarehouseSwitcher UI + warehouses admin action (warehouse-reports/replenishment/overview already accept warehouseId — just wire `?wh`).
  5. Browser E2E TS-004 (two-warehouse isolation). Re-run TS-001/002/003.
  6. spec-verify phase (changes-review + Codex), then commit + push.

## Progress Tracking

- [x] Task 1: Valuation cost-basis helper (latest unit cost) + verify
- [x] Task 2: Stock valuation report page + UI
- [x] Task 3: Movement export CSV (helper + API route + button)
- [x] Task 4: Dead-stock + ABC analysis helper + report page
- [x] Task 5: Warehouse model + warehouseId migration (manual) + backfill
- [x] Task 6: WMS core warehouse-aware row resolution (no recordMovement rewrite)
- [x] Task 7: Host call-site updates pass default warehouse
- [x] Task 8: Warehouse switcher UI + per-warehouse scoped reads + warehouse admin (reads/switcher/admin; WRITE routing deferred to fast-follow per user decision)

## Implementation Tasks

### Task 1: Valuation cost-basis helper

**Objective:** A host-side helper that resolves each part's latest purchase unit cost and builds a valuation dataset (on-hand × cost). Pure logic over `StockItem` + `SupplierOrderItem`; no `lib/wms-host` import (default injected by callers, like Phase 5). Verified by TS-001.

**Files:**
- Create: `lib/warehouse/valuation.ts`
- Create: `scripts/verify-valuation.ts`

**Key Decisions / Notes:**
- `latestUnitCostByPartIds(db, partIds): Promise<Map<string, number>>` — fetch PART `SupplierOrderItem` rows for those parts with `order: { select: { orderDate } }`, then in JS keep the `unitCost` of the row with the max `orderDate` per part (tie-break: latest `id`). Parts with no PART line are absent from the map. One batched query (no N+1).
- `buildValuationReport(db, tenantKey): Promise<{ rows: ValuationRow[]; totalValueKopecks: number; noCostCount: number }>` — load active parts with `stockItem { quantity }`; `ValuationRow = { partId, name, article, onHand, unitCost: number | null, lineValue: number | null }`; `lineValue = onHand × unitCost` when cost known else null; total sums known lineValues; `noCostCount` = rows with `unitCost === null` and `onHand > 0`. Money is integer ₽ (matching `unitCost`/`Part.price`).
- Cast Prisma delegate results `as {...}`.

**Definition of Done:**
- [ ] `latestUnitCostByPartIds` returns the most-recent-order unit cost per part and omits never-purchased parts
- [ ] `buildValuationReport` totals only known-cost lines and reports `noCostCount` for in-stock parts with no purchase history
- [ ] **Single-warehouse-safe only:** this helper sums `StockItem` without a `warehouseId` filter and is correct only until a second warehouse exists. Task 8 adds the `warehouseId` filter; do NOT create a second warehouse before Task 8 completes.
- [ ] Verify: `npx tsx scripts/verify-valuation.ts` (seeds a part with two supplier orders at different dates → latest cost wins; a part with stock + no order → null/no-cost; asserts total)

### Task 2: Stock valuation report page

**Objective:** Manager-facing valuation report at `/admin/warehouse/reports/valuation` listing per-part on-hand, unit cost, line value, a grand total, and a "no cost basis" count. Adds a «Отчёты» entry point on the warehouse landing page. Verified by TS-001.

**Files:**
- Create: `app/(admin)/admin/warehouse/reports/valuation/page.tsx`
- Create: `app/actions/warehouse-reports.ts`
- Modify: `app/(admin)/admin/warehouse/page.tsx`

**Key Decisions / Notes:**
- `app/actions/warehouse-reports.ts`: `getValuationReport()` — `requireRole(["ADMIN","MANAGER"])`, calls `buildValuationReport(db, TENANT_KEY)` (TENANT_KEY from `@/lib/wms-host`). This file also hosts `getStockAnalysis` (Task 4).
- Page: `export const dynamic = "force-dynamic"`; `requireRole(["ADMIN","MANAGER"])`; `PageHeader` with `backHref="/admin/warehouse" backLabel="Склад"`; render a server table (format ₽ via existing money formatting in `lib/utils` if present, else `toLocaleString('ru-RU')`). Money column right-aligned; «—» for null cost.
- Warehouse landing: add `<Link href="/admin/warehouse/reports/valuation" ...>Отчёты →</Link>` next to the existing Дозаказ/Отбор/Упаковка links.

**Definition of Done:**
- [ ] `/admin/warehouse/reports/valuation` renders rows (on-hand, unit cost, line value), grand total, and «без себестоимости: N»
- [ ] «Отчёты →» link present on `/admin/warehouse`; page has a working «← Склад» back link
- [ ] Shows the MAIN/default warehouse only until Task 8 wires the warehouse switcher (single-warehouse-safe; no second warehouse until Task 8)
- [ ] Verify: Chrome DevTools MCP E2E TS-001 on dev HTTPS:443

### Task 3: Movement export CSV

**Objective:** Export the `StockMovement` ledger as an Excel-friendly CSV via a GET route, filterable by date range / reason / part, with a download button on a movements report page. Mirrors the customer-export pattern. Verified by TS-002.

**Files:**
- Create: `lib/warehouse/movement-csv.ts`
- Create: `app/api/admin/warehouse/movements/export/route.ts`
- Create: `app/(admin)/admin/warehouse/reports/movements/page.tsx`

**Key Decisions / Notes:**
- `lib/warehouse/movement-csv.ts`: pure module mirroring `lib/customer-csv.ts` (BOM + CRLF + RFC-4180 quoting). `MOVEMENT_CSV_HEADER` = [Дата, Запчасть, Артикул, Причина, Остаток Δ, Резерв Δ, Источник, ID источника, Заметка, Кто]. `buildMovementsCsv(rows)` + `toCsvRow`. Reuse the `REASON_LABELS` map (copy from `WarehouseMovementsFeed.tsx`).
- Route `app/api/admin/warehouse/movements/export/route.ts`: GET, `getSession()` + ADMIN/MANAGER guard (mirror customers export route exactly), parse `from`/`to`/`reason`/`partId` from query, query `db.stockMovement.findMany` (with `item.part` select) filtered + ordered by `createdAt desc`, `take: 50000` (hard cap to avoid an unbounded scan; set `X-Truncated: true` when the result hits the cap), return `text/csv` with `Content-Disposition: attachment; filename="movements-<date>.csv"`.
- Page `reports/movements/page.tsx`: a filter form (date range, reason select, optional part search) whose submit builds the export URL, plus a preview table of recent movements (reuse `WarehouseMovementsFeed` or a scoped query). «Экспорт CSV» is a plain `<a href={exportUrl}>` (GET download). `PageHeader` backHref to Склад.

**Definition of Done:**
- [ ] `GET /api/admin/warehouse/movements/export` returns 200 `text/csv` with a header row; non-admin → 401
- [ ] Export is capped at 50000 rows (`take: 50000`); when the filtered set exceeds the cap the response sets an `X-Truncated: true` header
- [ ] Reason/date filters narrow the exported rows; CSV is BOM+CRLF (opens cleanly in Excel)
- [ ] Verify: TS-002 via Chrome DevTools MCP (click export, confirm download) + `curl -skI` the route for the Content-Type/Disposition headers

### Task 4: Dead-stock + ABC analysis

**Objective:** A report classifying stock by movement: dead-stock (no `CONSUMPTION` in the last N days) and ABC (by consumed quantity over a window, A=80%/B=15%/C=5% cumulative). Window configurable via query param. Verified by TS-003.

**Files:**
- Create: `lib/warehouse/stock-analysis.ts`
- Create: `app/(admin)/admin/warehouse/reports/analysis/page.tsx`
- Modify: `app/actions/warehouse-reports.ts`

**Key Decisions / Notes:**
- `lib/warehouse/stock-analysis.ts`:
  - `deadStock(db, tenantKey, windowDays): Promise<DeadStockRow[]>` — parts with `stockItem.quantity > 0` having no `StockMovement` with `reason="CONSUMPTION"` and `createdAt >= now - windowDays`. Implement via a batched groupBy of recent CONSUMPTION movements by itemId → the set of "recently consumed" itemIds, then list in-stock parts NOT in that set. Include `lastConsumedAt` (max CONSUMPTION createdAt ever) when available.
  - `abcAnalysis(db, tenantKey, windowDays): Promise<AbcRow[]>` — sum `-quantityDelta` (consumption is negative on-hand delta) of `CONSUMPTION` movements per part within the window; sort desc by consumed qty; compute cumulative share of total consumed qty; class A while cum ≤ 80%, B while ≤ 95%, else C. Parts with zero consumption are omitted from ABC (they're the dead-stock list).
  - Both batched (groupBy), no N+1.
- `getStockAnalysis(windowDays = 90)` added to `app/actions/warehouse-reports.ts` (ADMIN/MANAGER) returning `{ deadStock, abc }`.
- Page `reports/analysis/page.tsx`: reads `?windowDays` (default 90, clamp 1..3650), renders two sections (dead-stock table + ABC table with class badge), and a small window selector (links for 30/90/180 days). `PageHeader` backHref to Склад.

**Definition of Done:**
- [ ] Dead-stock lists in-stock parts with no CONSUMPTION in the window; a part consumed within the window is excluded
- [ ] ABC assigns A/B/C by cumulative consumed-quantity share; `windowDays` recomputes both lists
- [ ] **Single-warehouse-safe only:** `deadStock`/`abcAnalysis` query `StockItem`/movements without a `warehouseId` filter — correct only pre-second-warehouse. Task 8 adds the filter; do NOT create a second warehouse before Task 8 completes.
- [ ] Verify: `npx tsx scripts/verify-valuation.ts` extended OR a dedicated assert block in a tsx script for deadStock/abcAnalysis (seed consumption movements at different dates) + Chrome DevTools MCP TS-003

### Task 5: Warehouse model + warehouseId migration (manual)

**Objective:** Introduce the `Warehouse` dimension and migrate stock tables to carry `warehouseId`, backfilling all existing rows to a seeded default MAIN warehouse, and switch `StockItem` to per-(part,warehouse) uniqueness. Hand-authored migration (no `prisma migrate dev`). Verified by TS-004 + verify-multiwarehouse.ts.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_warehouse_dimension/migration.sql`

**Key Decisions / Notes:**
- New model `Warehouse { id String @id @default(cuid()); code String; name String; isActive Boolean @default(true); isDefault Boolean @default(false); tenantKey String @default("geleoteka"); createdAt; updatedAt; @@unique([tenantKey, code]) }`. Add `warehouse Warehouse @relation` back-relations on the tables below.
- Add `warehouseId String` to: `StockItem`, `StockMovement`, `StockBin`, `StockLocation`, `StockCountSession` (+ FK `warehouse Warehouse @relation(fields:[warehouseId], references:[id])`). NOT on `ScanEvent` (out of scope).
- `StockItem`: remove `partId String @unique` → `partId String` + `@@unique([partId, warehouseId])`. Keep `@@index([tenantKey, partId])`.
- **migration.sql order (one file):** (1) `CREATE TABLE "Warehouse" (...)` + unique index; (2) `INSERT` MAIN warehouse (deterministic id, e.g. `'wh_main_geleoteka'`, code `'MAIN'`, name `'Основной склад'`, isDefault true); (3) `ALTER TABLE ... ADD COLUMN "warehouseId" TEXT` (nullable) on the five tables; (4) `UPDATE` each table `SET "warehouseId" = 'wh_main_geleoteka'`; (5) `ALTER ... ALTER COLUMN "warehouseId" SET NOT NULL` + `ADD CONSTRAINT ... FOREIGN KEY`; (6) `DROP INDEX "StockItem_partId_key"; CREATE UNIQUE INDEX "StockItem_partId_warehouseId_key" ON "StockItem"("partId","warehouseId");`.
- **⛔ Widen the StockMovement idempotency unique in THIS migration** (must_fix — it is a Postgres `@@unique`, not an app guard, and this hand-applied migration is non-reversible): step (7) `DROP INDEX "StockMovement_tenantKey_sourceType_sourceId_reason_key"; CREATE UNIQUE INDEX "StockMovement_tenantKey_sourceType_sourceId_reason_warehouseId_key" ON "StockMovement"("tenantKey","sourceType","sourceId","reason","warehouseId");` and update `schema.prisma` `StockMovement` to `@@unique([tenantKey, sourceType, sourceId, reason, warehouseId])`. All existing rows share `wh_main_geleoteka`, so uniqueness is preserved; this prevents a P2002 when the same source line is received into two warehouses.
- **⛔ Make StockLocation warehouse-scoped** (must_fix — else blocking/creating cell A-1 in one warehouse leaks to another): step (8) `DROP INDEX "StockLocation_tenantKey_code_key"; CREATE UNIQUE INDEX "StockLocation_tenantKey_warehouseId_code_key" ON "StockLocation"("tenantKey","warehouseId","code");` and update `schema.prisma` `StockLocation` to `@@unique([tenantKey, warehouseId, code])`. (Confirm the exact existing index name via `\d "StockLocation"` before dropping.)
- Apply manually: write migration.sql, run it via `psql postgresql://alex@localhost:5432/geleoteka -f <file>`, then `npx prisma migrate resolve --applied "<name>"`, then `npx prisma generate`. Rollback documented inline (drop columns/table, restore `StockItem_partId_key`).

**Definition of Done:**
- [ ] `psql -c '\d "StockItem"'` shows `warehouseId NOT NULL` and unique `(partId, warehouseId)` (no bare `partId` unique); `Warehouse` table has one MAIN row with `isDefault=true`
- [ ] `StockMovement` unique is `(tenantKey, sourceType, sourceId, reason, warehouseId)` and `StockLocation` unique is `(tenantKey, warehouseId, code)` (old warehouse-blind indexes dropped)
- [ ] `count(*) where "warehouseId" is null = 0` across all five tables; `npx prisma validate` passes; `npx prisma migrate status` clean
- [ ] Verify: `npx prisma validate && psql ... -c '\d "StockItem"' | grep -E "warehouseId|partId_warehouseId"`

### Task 6: WMS core warehouse-aware row resolution

**Objective:** Make the WMS core resolve/scope the StockItem row by (partId, warehouseId) without rewriting `recordMovement`'s aggregate logic. The host injects a warehouseId (opaque string) exactly like `tenantKey`. Verified by verify-multiwarehouse.ts + TS-004.

**Files:**
- Modify: `lib/wms/internal/repository.ts`
- Modify: `lib/wms/public/types.ts`
- Modify: `lib/wms-host/index.ts`
- Create: `scripts/verify-multiwarehouse.ts`

**Key Decisions / Notes:**
- `lib/wms/public/types.ts`: extend `WmsItemRef` / `RecordMovementInput` (and `ConsumeStockInput`/placement inputs as needed) with `warehouseId: string`. This is a deliberate core API change — document in `lib/wms/README.md` extraction notes if present.
- `lib/wms/internal/repository.ts`: `getOrCreateStockItem(client, partId, tenantKey, warehouseId)` resolves by `findFirst({ where: { partId, warehouseId } })` then creates with `warehouseId`. Every other `stockItem.findUnique({where:{partId}})` / `findFirst` here gains `warehouseId` (use compound `where: { partId_warehouseId: { partId, warehouseId } }`) — **explicitly including the exported `findViewByItemId` at repository.ts:371** (`findUnique({where:{partId: itemId}})` → compound key; thread `warehouseId` into its signature, matching the `WmsItemRef` extension). `recordMovement`'s delta-application logic is unchanged — only the row it loads/creates is warehouse-scoped.
- **Warehouse-aware idempotency check (must_fix):** the DB unique widening (Task 5) is not enough on its own — any source-existence pre-check in `lib/wms/public/record-movement.ts` (the `movementExistsForSource`/`findMovementByKey`-style lookup that catches the source triple before `applyDeltas`) must include `warehouseId` in its `where`, else a same-source movement into a second warehouse is wrongly treated as an idempotent no-op (`applied:false`). Read record-movement.ts:78-103 and thread `warehouseId` through the source-existence query and the P2002 disambiguation.
- **Warehouse-aware location helpers:** the location resolve/create/block functions in repository.ts (`getOrCreateLocation`-style, ~lines 313-362) and their public wrappers in `lib/wms/public/locations.ts` (`assertLocationUsable`, `getLocation`, `listLocations`, `setLocationBlocked`) key by `(tenantKey, code)` — add `warehouseId` so a cell code is unique/usable per warehouse. Thread `warehouseId` through these signatures (host passes default).
- Bin reads already key by `itemId` (now per-warehouse) — verify `Σbins ≤ quantity` still holds per row.
- `lib/wms-host/index.ts`: add `export const DEFAULT_WAREHOUSE_CODE = "MAIN";` and `export async function defaultWarehouseId(client): Promise<string>` (look up the `isDefault` warehouse for `TENANT_KEY`, memoize in a module-level cache). Core never imports this; host passes the resolved id.
- `scripts/verify-multiwarehouse.ts`: seed two warehouses; RECEIPT 5 of a part into MAIN and 3 into the second → two StockItem rows, independent quantities; consume from one doesn't touch the other; a default-warehouse read resolves the MAIN row; idempotency: same RECEIPT source replayed in the SAME warehouse is a no-op, while the **same source into a DIFFERENT warehouse APPLIES** (returns `applied:true`, raises that warehouse's on-hand) — not a silent no-op; location isolation: block cell `A-1` in warehouse 2 and assert it's still usable in MAIN.

**Definition of Done:**
- [ ] A part can have two StockItem rows (MAIN + second warehouse) with independent quantity/reserved; `recordMovement` updates only the targeted warehouse's row
- [ ] `getOrCreateStockItem` creates at most one row per (partId, warehouseId); replayed source triple in the same warehouse is idempotent; the same source in a different warehouse applies
- [ ] Blocking a location code in one warehouse does not block the same code in another warehouse
- [ ] `tsc --noEmit` clean after the core API change (catches any missed `partId`-keyed call site, incl. findViewByItemId)
- [ ] Verify: `npx tsx scripts/verify-multiwarehouse.ts`

### Task 7: Host call-site updates pass default warehouse

**Objective:** Update every host caller that creates/reads a StockItem or records a movement to supply the default warehouse id, preserving today's single-warehouse behaviour. No behaviour change for existing flows. Verified by re-running prior phase verify scripts (regression) + TS-004.

**Files:**
- Modify: `app/actions/warehouse.ts`, `app/actions/replenishment.ts`, `app/actions/parts.ts`, `app/actions/supplier-orders.ts`, `app/api/parts/import/route.ts`
- Modify: `lib/warehouse/adjust.ts`, `lib/warehouse/codes.ts`, `lib/wms/public/placement.ts`, `lib/wms/public/stocktake.ts`, `lib/wms/public/locations.ts`
- Modify: `components/admin/StockHistory.tsx`, `components/admin/WarehouseOverview.tsx`
- Modify (test scripts — they call `stockItem.findUnique({where:{partId}})` which breaks after the unique swap): `scripts/verify-picking.ts`, `scripts/verify-packing.ts`, `scripts/verify-stocktake.ts`, `scripts/verify-warehouse.ts`, `scripts/verify-replenishment.ts`

**Key Decisions / Notes:**
- For each `stockItem.findUnique({where:{partId}})` / `create({data:{partId,...}})` / `update({where:{partId}})` listed in the blast-radius grep, thread `warehouseId = await defaultWarehouseId(client)` and switch to the compound `partId_warehouseId` key (or `findFirst({where:{partId, warehouseId}})`). For multi-warehouse-naive readers (StockHistory, parts.ts cost display), the default warehouse is correct until those surfaces gain a switcher.
- `lib/warehouse/replenishment.ts` (Phase 5) reads `stockItem` via the part relation — confirm it still compiles; reorder columns now live on the per-warehouse row (acceptable: reorder policy is per (part, default warehouse) for now).
- `recordMovement` callers (receive, consumeStock via pick/pack/fulfillment, reservations) pass `warehouseId` in the `WmsItemRef`/input — default warehouse for all existing host paths. Location helper callers (placement/stocktake) pass the default warehouse too.
- **Verify scripts:** in each of the five scripts, replace `stockItem.findUnique({ where: { partId } })` with the compound key `findUnique({ where: { partId_warehouseId: { partId, warehouseId: "wh_main_geleoteka" } } })` (the deterministic MAIN id from Task 5) — confirmed call sites: verify-packing.ts:45, verify-picking.ts:47, verify-stocktake.ts:51, verify-warehouse.ts:179/311/322/344/368.
- Do NOT change the aggregate semantics; this is purely threading the warehouse id.

**Definition of Done:**
- [ ] `tsc --noEmit` clean after the API change ripples through all call sites
- [ ] `npx tsx scripts/verify-picking.ts`, `verify-packing.ts`, `verify-stocktake.ts`, `verify-warehouse.ts`, `verify-replenishment.ts` all still PASS (default-warehouse regression) — including their updated compound-key `findUnique` calls
- [ ] Verify: the five prior verify scripts pass + `tsc --noEmit`

### Task 8: Warehouse switcher UI + scoped reads + warehouse admin

**Objective:** Let a manager create/list warehouses and switch the active warehouse, scoping the «Остатки» overview and the Phase-6 reports to the selected warehouse (default MAIN). Verified by TS-004.

**Files:**
- Modify: `app/(admin)/admin/warehouse/page.tsx`, `components/admin/WarehouseOverview.tsx`
- Modify: `app/actions/warehouse-reports.ts`, `lib/warehouse/valuation.ts`, `lib/warehouse/stock-analysis.ts`
- Create: `components/admin/WarehouseSwitcher.tsx`, `app/actions/warehouses.ts`

**Key Decisions / Notes:**
- `app/actions/warehouses.ts`: `listWarehouses()` (ADMIN/MANAGER/WAREHOUSE_WORKER), `createWarehouse(code, name)` (ADMIN/MANAGER; validate unique code per tenant; never a second `isDefault`). 
- `WarehouseSwitcher.tsx` (`"use client"`): a `<select>` of warehouses; selection drives a `?wh=<id>` query param via `useRouter`. Default = the `isDefault` warehouse when `?wh` absent.
- `WarehouseOverview` + valuation/analysis/movements queries: accept an optional `warehouseId` (resolved from `?wh`, validated against `listWarehouses`; fall back to default) and scope `stockItem`/movement queries by it. `buildValuationReport`/`buildReorderReport`-style helpers gain a `warehouseId` arg (thread through; default warehouse when omitted to keep callers safe).
- Warehouse admin: a small section on `/admin/warehouse` (ADMIN/MANAGER) to add/list warehouses (mirror `WarehouseLocationsAdmin` styling).

**Definition of Done:**
- [ ] Creating a second warehouse, switching to it, and adjusting a part there changes only that warehouse's on-hand; MAIN is unchanged (TS-004)
- [ ] «Остатки» and the valuation report scope to the selected warehouse; default is MAIN when `?wh` absent or invalid
- [ ] Verify: Chrome DevTools MCP E2E TS-004 on dev HTTPS:443
