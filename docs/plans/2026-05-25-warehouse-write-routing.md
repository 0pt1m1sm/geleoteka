# Per-Warehouse WRITE Routing Fix Plan

Created: 2026-05-25
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Bugfix

## Summary

**Symptom:** With the warehouse switcher set to a non-default warehouse (`?wh=<id>`), every stock-changing operation in the UI (adjust, order-receive, blind-receive, putaway/place, transfer, remove, pick, pack, stocktake) still writes to the default warehouse (MAIN). You cannot add/move/count stock *into* a 2nd warehouse via the UI.

**Trigger:** Switch the active warehouse to NORTH (or any non-MAIN) on `/admin/warehouse?wh=<id>`, then receive/adjust/place a part. The write lands in MAIN; NORTH stays empty.

**Root Cause:** The active `?wh` is never threaded into the write path. Two layers drop it:
1. **Action layer** resolves the default unconditionally — `app/actions/warehouse.ts:131,154,234` (`placeIntoBin`/`transferBetweenBins`/`removeFromBinAction` pass `await defaultWarehouseId(tx)` to the WMS op), `app/actions/stocktake.ts:97` (`createCountSessionAction`).
2. **Host-side lib layer** resolves the default internally — `lib/warehouse/adjust.ts:28` (`applyAdjustment`), `lib/warehouse/scan-receive.ts:53,94` (`applyScanReceiveOrderLine`/`applyBlindReceive`), `lib/warehouse/receive.ts:111,123` (`applyReceive`), `lib/warehouse/pick.ts:100,145` (`openPickLinesForOrder`/`applyPickLine`), `lib/warehouse/pack.ts:126,173` (`openPackLinesForOrder`/`applyPackLine`), `lib/warehouse/scan-router.ts:163,220` (`resolvePart`/`resolveLocation` reads).

The WMS core ops (`recordMovement`, `consumeStock`, `placeStock`, `transferStock`, `removeFromBin`, `createCountSession`) **already accept an explicit `warehouseId`** — proven by `scripts/verify-multiwarehouse.ts`. This is UI/action/host-lib param wiring, NOT a core change. `lib/wms` stays host-agnostic; `recordMovement` is never rewritten.

## Investigation

- `/admin/warehouse/page.tsx:27` already resolves `warehouseId = resolveWarehouseId(sp.wh, warehouses)` and renders `<WarehouseSwitcher current={warehouseId}>`, but passes the id to **read** components only (`WarehouseOverview`). The write components — `WarehouseScanBox` (line 57), `WarehouseLocationLookup`, `WarehouseLocationsAdmin` — are rendered with **no warehouse prop**, so they call write actions with no warehouse, and the actions/lib fall back to MAIN.
- `app/actions/warehouses.ts:54 resolveWarehouseId(wh, warehouses?)` is the existing tenant-guarded resolver: it validates `wh` is a real warehouse id for the tenant, else falls back to default. This is the security re-validation boundary — actions must call it on any client-supplied `wh` (a forged id falls back to default, never escapes the tenant).
- `WarehouseSwitcher` drives `?wh=<id>` (a warehouse **id**, not code) and hides itself when only one warehouse exists.
- The picking/packing/stocktake pages currently have **no switcher and never read `?wh`**.
- `scripts/verify-multiwarehouse.ts` confirms: per-`(part,warehouse)` stock rows, `recordMovement`/`consumeStock` touch only the targeted warehouse, same source id applies independently per warehouse, location block is per-warehouse. So the data layer fully supports routing today.
- tsx (esbuild) strips types without type-checking → a verify script can pass a new trailing `warehouseId` arg to the *current* (un-fixed) lib functions; the arg is silently ignored at runtime and the write lands in MAIN. That is the runtime RED.

## Behavior Contract

**Given:** A tenant with ≥2 warehouses (MAIN default + a non-default, e.g. WH2), and a part with independent stock rows per warehouse.
**When:** A stock-changing host-lib op / server action is invoked with the non-default warehouse selected (`warehouseId = WH2` / `wh = WH2.id`).
**Currently (bug):** The write resolves `defaultWarehouseId` and mutates MAIN's `StockItem`/`StockMovement`/bins; WH2 is untouched.
**Expected (fix):** The write mutates WH2's `StockItem`/`StockMovement`/bins; MAIN's on-hand and bins are unchanged. With no warehouse supplied, behaviour is identical to today (resolves to MAIN) — full backward compatibility.
**Anti-regression:** All existing WMS verify scripts must still pass unchanged: `verify-multiwarehouse`, `verify-warehouse`, `verify-scan-receiving`, `verify-picking`, `verify-packing`, `verify-stocktake`, `verify-replenishment`, `verify-valuation`, `verify-stock-analysis`, `verify-qr-scanning`, `verify-landed-cost`. `tsc --noEmit` = 0 errors, `eslint` clean, `npm run build` exit 0. The no-`wh` default path (every current caller and the entire single-warehouse flow) keeps targeting MAIN.

### Completeness probe
- **Empty / foreign `wh`:** `resolveWarehouseId("")` and `resolveWarehouseId("<not-a-real-id>")` both fall back to the default → no write escapes the tenant and no crash. Covered by an action-level assertion in the verify script.
- **Order-backed receipt CAS:** the receive CAS is keyed on `receivedQuantity`, independent of warehouse — routing to WH2 does not weaken the replay guard (the RECEIPT movement's idempotency unique already includes `warehouseId`, per Phase 6). Covered.
- **Pick/pack consume:** consuming a full line from a WH2 bin must not touch MAIN bins for the same part. Covered.

## Fix Approach

**Chosen:** Thread an optional `warehouseId?: string` parameter end-to-end, defaulting to `defaultWarehouseId(client)` when absent.

**Why:** It is the source-level fix at every place the default is currently hardcoded, and the optional-with-default shape keeps every existing caller (single-warehouse flows, all verify scripts) byte-for-byte compatible — no core change, no `recordMovement` rewrite. The rejected alternative (a request-scoped "active warehouse" context/AsyncLocalStorage) would couple `lib/wms-host` to a request lifecycle and is far more invasive than the data already-present `?wh` → prop → arg path.

**Files:**
- Host-side lib (add optional `warehouseId`, fall back to `defaultWarehouseId(client)`):
  - `lib/warehouse/adjust.ts` — `applyAdjustment(..., warehouseId?)`
  - `lib/warehouse/receive.ts` — `ApplyReceiveInput.warehouseId?`
  - `lib/warehouse/scan-receive.ts` — `ScanReceiveOrderInput.warehouseId?`, `BlindReceiveInput.warehouseId?` (thread to `assertLocationUsable` + `applyReceive`)
  - `lib/warehouse/pick.ts` — `openPickLinesForOrder(..., warehouseId?)`, `ApplyPickLineInput.warehouseId?`
  - `lib/warehouse/pack.ts` — `openPackLinesForOrder(..., warehouseId?)`, `ApplyPackLineInput.warehouseId?`
  - `lib/warehouse/scan-router.ts` — `ScanContext.warehouseId?`, thread to `resolvePart`/`resolveLocation` (read coherence)
- Action layer (add trailing `wh?: string`, resolve via `resolveWarehouseId(wh)`, pass resolved id down + into the placement read-backs):
  - `app/actions/warehouse.ts` — `adjustStock`, `getPlacement`, `placeIntoBin`, `transferBetweenBins`, `removeFromBinAction`, `scanReceiveOrderLine`, `blindReceive`, `lookupLocation`, `listLocationsAction`, `setLocationBlockedAction`
  - `app/actions/picking.ts` — `getOpenPickLines`, `pickRepairOrderLine`
  - `app/actions/packing.ts` — `getOpenPackLines`, `packOrderLine`
  - `app/actions/stocktake.ts` — `createCountSessionAction`
- Scan API route: `app/api/warehouse/scan/route.ts` — read `warehouseId` from POST body, validate via `resolveWarehouseId`, pass into `resolveScan` ctx.
- UI (supply the active warehouse):
  - `app/(admin)/admin/warehouse/page.tsx` — pass `warehouseId` to `WarehouseScanBox`, `WarehouseLocationLookup`, `WarehouseLocationsAdmin`.
  - `components/admin/WarehouseScanBox.tsx` — accept `warehouseId` prop; thread into the scan fetch body, `getPlacement`, `adjustStock`, `placeIntoBin`, `transferBetweenBins`, `scanReceiveOrderLine`, `blindReceive`, putaway.
  - `components/admin/WarehouseLocationLookup.tsx`, `WarehouseLocationsAdmin.tsx` — accept `warehouseId` prop; thread into their action calls.
  - `app/(admin)/admin/warehouse/picking/[id]/page.tsx` + `components/admin/PickBox.tsx` — read `?wh`, render switcher, thread `warehouseId` into `getOpenPickLines` + `pickRepairOrderLine`.
  - `app/(admin)/admin/warehouse/packing/[id]/page.tsx` + `components/admin/PackBox.tsx` — same for `getOpenPackLines` + `packOrderLine`.
  - `app/(admin)/admin/warehouse/stocktake/page.tsx` + `components/admin/StocktakeNewSession.tsx` — read `?wh`, render switcher, thread `warehouseId` into `createCountSessionAction`.

**Strategy:** Mirror the established Phase-6 read pattern (`page resolves warehouseId via resolveWarehouseId → prop → child`). On the write side the child passes the id back as the last action argument; the action re-validates it with `resolveWarehouseId(wh)` (defense-in-depth: never trust a client-supplied id) and passes the validated id to the lib op. Lib ops use `const warehouseId = explicit ?? await defaultWarehouseId(client)`.

**Defense-in-depth:**
- **Entry point (action):** `resolveWarehouseId(wh)` rejects any `wh` not belonging to the tenant → falls back to default. A forged/foreign id can never write to another tenant's warehouse.
- **Business logic (lib):** `warehouseId ?? defaultWarehouseId` keeps the single-warehouse contract intact; the WMS core's per-`(part,warehouseId)` uniqueness and per-warehouse location guards remain the final integrity gate.

**Tests:** `scripts/verify-warehouse-write-routing.ts` (NEW) — see Task 1. Existing verify scripts are the anti-regression suite.

## Verification Scenario

### TS-001: Write into a non-default warehouse via the UI
**Preconditions:** Dev server on HTTPS:443; logged in as `admin@geleoteka.ru`. A 2nd warehouse exists (create one via the Warehouse admin card if needed). A known part exists.

| Step | Action | Expected Result (after fix) |
|------|--------|-----------------------------|
| 1 | On `/admin/warehouse`, set the switcher to the 2nd warehouse (URL gains `?wh=<id>`). | Switcher shows the 2nd warehouse; overview is scoped to it. |
| 2 | Scan/resolve a part; the card shows on-hand for the 2nd warehouse. | Quantity reflects the 2nd warehouse (0 if empty), not MAIN. |
| 3 | Blind-receive N units into ПРИЁМКА. | Card on-hand rises by N; movement recorded against the 2nd warehouse. |
| 4 | Switch back to MAIN (`?wh` cleared/MAIN id). | The part's MAIN on-hand is unchanged by step 3 — the receipt did not leak into MAIN. |
| 5 | Place/transfer the received stock between bins while on the 2nd warehouse. | Placement updates for the 2nd warehouse; MAIN bins unchanged. |

## Tasks

- [x] Task 1: Write Reproducing Test (RED)
- [x] Task 2: Implement Fix at Root Cause
- [x] Task 3: Quality Gate

### Task 1: Write Reproducing Test (RED)

**Objective:** Encode the Behavior Contract as a failing tsx verify script BEFORE the fix.
**Files:** `scripts/verify-warehouse-write-routing.ts` (new), mirroring `scripts/verify-multiwarehouse.ts` (fixtures prefixed `VERIFY-WWR-`, throwaway 2nd warehouse created + dropped).
**Entry point:** The host-side lib functions that currently hardcode the default (the true root cause) + a `resolveWarehouseId` action-boundary check:
- `applyAdjustment(tx, part, 7, actor, note, key, WH2)` → assert WH2 on-hand 7, MAIN 0.
- `applyBlindReceive(tx, {partId, qty:4, location, idempotencyKey, actorId, warehouseId: WH2})` → assert WH2 on-hand 11, MAIN 0.
- `applyScanReceiveOrderLine`/`applyReceive` with `warehouseId: WH2` against a fixture supplier-order PART line → assert RECEIPT lands in WH2, MAIN unchanged.
- `applyPickLine`/`applyPackLine` with `warehouseId: WH2` (build the minimal RO+APPROVED-estimate / part-order fixture as the existing verify-picking/packing scripts do) → assert CONSUMPTION debits WH2 bin, MAIN bin for the same part unchanged. *(Include only if the fixture mirrors an existing verify script cheaply; otherwise assert pick/pack via the shared param symmetry + leave to live E2E and document the decision in the script header.)*
- `resolveWarehouseId(WH2.id)` === WH2.id; `resolveWarehouseId("forged-id")` === MAIN id (tenant guard).
**DoD:** Script exists, runs, and FAILS before the fix (the first WH2-on-hand assertion fails because the un-fixed lib ignores the extra arg and writes to MAIN). Named `verify-warehouse-write-routing.ts`.
**Verify:** `npx tsx scripts/verify-warehouse-write-routing.ts` — must print FAIL / exit 1.

### Task 2: Implement Fix at Root Cause

**Objective:** Thread optional `warehouseId`/`wh` end-to-end so the verify script passes and the UI routes writes to the active warehouse.
**Files:** All files listed under Fix Approach.
**Strategy:** Optional param with `?? defaultWarehouseId(client)` fallback in lib; `resolveWarehouseId(wh)` re-validation in actions; `warehouseId` prop + `?wh` switcher in UI. No change to `lib/wms` core; `recordMovement` untouched.
**DoD:** `scripts/verify-warehouse-write-routing.ts` PASSES. Every existing verify script still PASSES (anti-regression). Diff touches the root-cause files (host-lib + actions) and the UI wiring. No `defaultWarehouseId`-hardcoded write remains on a path that has an active-warehouse source.
**Verify:** `npx tsx scripts/verify-warehouse-write-routing.ts` — must PASS.

### Task 3: Quality Gate

**Objective:** Type check + lint + build clean; full WMS verify-script suite green; live E2E (TS-001).
**DoD:** `tsc --noEmit` 0 errors; `eslint` clean; `npm run build` exit 0; all `tsx scripts/verify-*.ts` pass (env-gated `verify-resend-receiving-path` excepted); live Chrome E2E of TS-001 confirms a write lands in the 2nd warehouse and MAIN is untouched. No perf regression (write actions are manual, low-frequency; `resolveWarehouseId` adds one bounded `warehouse.findMany` per write — acceptable).
**Verify:** `npx tsc --noEmit && npx eslint . && npm run build` then the verify-script loop + Chrome E2E.
