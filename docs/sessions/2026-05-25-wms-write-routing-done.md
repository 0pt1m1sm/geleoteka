# WMS Phase 6 Fast-Follow — Per-Warehouse WRITE Routing — DONE & SHIPPED

**Date:** 2026-05-25
**Status:** ✅ VERIFIED + shipped to prod (commit `d7c7442`, `63ad753..d7c7442` pushed to `main` → Railway auto-deploy)
**Plan:** `docs/plans/2026-05-25-warehouse-write-routing.md` (Status: VERIFIED, Type: Bugfix)
**Memory:** observation #13380

Closes the accepted Phase-6 gap (task #35): "per-warehouse WRITES not routed." You can now receive / adjust / move / pick / pack / count stock **into a non-default warehouse** via the UI switcher.

---

## The bug

Every warehouse write action resolved `defaultWarehouseId` (directly in the action, or inside a host-lib helper) and silently targeted **MAIN** regardless of the active `?wh` switcher. The `lib/wms` core ops already accepted an explicit `warehouseId` (proven by `verify-multiwarehouse`) — the active warehouse was simply never threaded from the UI to the write path.

## The fix (pure param-threading — no core change)

An **optional `warehouseId` threaded end-to-end**, defaulting to `defaultWarehouseId(client)` when absent → every existing single-warehouse caller and verify script is byte-for-byte unchanged. `lib/wms` stays host-agnostic; `recordMovement` chokepoint untouched.

### Host-lib (optional `warehouseId`, `?? defaultWarehouseId(client)` fallback)
| File | Change |
|------|--------|
| `lib/warehouse/adjust.ts` | `applyAdjustment(..., warehouseId?)` |
| `lib/warehouse/receive.ts` | `ApplyReceiveInput.warehouseId?` |
| `lib/warehouse/scan-receive.ts` | `ScanReceiveOrderInput` / `BlindReceiveInput` `.warehouseId?` → `assertLocationUsable` + `applyReceive` |
| `lib/warehouse/pick.ts` | `openPickLinesForOrder(..., warehouseId?)` + `ApplyPickLineInput.warehouseId?` |
| `lib/warehouse/pack.ts` | `openPackLinesForOrder(..., warehouseId?)` + `ApplyPackLineInput.warehouseId?` |
| `lib/warehouse/scan-router.ts` | `ScanContext.warehouseId?` → `resolvePart` / `resolveLocation` (read coherence) |

### Actions (add trailing `wh?`, re-validate with `resolveWarehouseId(wh)`, thread down)
- `app/actions/warehouse.ts` — `adjustStock`, `getPlacement`, `placeIntoBin`, `transferBetweenBins`, `removeFromBinAction`, `scanReceiveOrderLine`, `blindReceive`, `lookupLocation`, `listLocationsAction`, `setLocationBlockedAction`
- `app/actions/picking.ts` — `getOpenPickLines`, `pickRepairOrderLine` (`resolveItemCode` now takes `warehouseId`)
- `app/actions/packing.ts` — `getOpenPackLines`, `packOrderLine` (`resolveItemCode` now takes `warehouseId`)
- `app/actions/stocktake.ts` — `createCountSessionAction` only (counts/posts are session-scoped; the session already stamps `warehouseId`)
- `app/api/warehouse/scan/route.ts` — reads `warehouseId` from the POST body → `resolveWarehouseId` → `resolveScan` ctx

**`resolveWarehouseId(wh)` is the security boundary:** validates the client-supplied id belongs to the tenant, else falls back to default. A forged/foreign id can never escape the tenant.

### UI (supply the active warehouse)
- Main warehouse page already had `WarehouseSwitcher`; now passes `warehouseId` into `WarehouseScanBox` (incl. the `/api/warehouse/scan` fetch body), `WarehouseLocationLookup`, `WarehouseLocationsAdmin` (effect dep `[warehouseId]`).
- Added `WarehouseSwitcher` + `?wh` reading to: `picking/[id]`, `packing/[id]`, and the **stocktake list** page (where the session is created). Their boxes (`PickBox`, `PackBox`, `StocktakeNewSession`) take a `warehouseId` prop and pass it to their actions.

## Key patterns (reuse for future multi-warehouse work)
- `resolveWarehouseId(wh, warehouses?)` in `app/actions/warehouses.ts` — tenant-guarded resolver. Pass a co-located `listWarehouses()` result to skip a 2nd query.
- `?wh` is a warehouse **ID** (not code). `WarehouseSwitcher` hides when only 1 warehouse exists.
- `defaultWarehouseId` in `lib/wms-host/index.ts` is **process-lifetime cached** (change `isDefault` ⇒ restart dev server).

## Verification
- **New test:** `scripts/verify-warehouse-write-routing.ts` — covers adjust, blind-receive, order-receive, pick, pack, and the `resolveWarehouseId` tenant guard. Genuine RED proven by revert-test (pre-fix adjust lands in MAIN, WH2 stays 0). tsx strips types so the extra `warehouseId` arg is ignored at runtime before the fix = real runtime RED.
- `tsc --noEmit` 0, `eslint` clean, `npm run build` exit 0.
- All 12 WMS `tsx scripts/verify-*.ts` pass (`verify-resend-receiving-path` excepted — env-gated, unrelated).
- **Live Chrome E2E (TS-001):** created a 2nd warehouse `SOUTH` via the UI admin card → switched to it (scan card showed on-hand **0** vs MAIN's 25 — read path is warehouse-aware) → blind-received 6. DB confirmed **SOUTH = 6** (RECEIPT/ManualReceipt in SOUTH's ПРИЁМКА bin), **MAIN = 25 untouched**.

## ⚠️ Dev-DB note
A test warehouse **SOUTH** (`id cmpkn6j4d00000ki8p1hetcs4`, 6 units of part `A000989690613`) remains in the dev DB — the auto-mode classifier denied cleanup (precious-DB guard). Harmless; it just keeps the switcher visible. Remove manually if desired (delete its stockBin/stockMovement/stockItem/stockLocation/stockCountSession rows, then the warehouse row).

---

## Remaining (the LAST tracked WMS item)

**Task #34 — camera-scan button on picking/packing line forms.** `PickBox.tsx` / `PackBox.tsx` expose only manual bin + part text inputs. `WarehouseScanBox` already uses `components/warehouse/QrScanner.tsx` (`{ onScan, busy }`, `@zxing/browser`, iOS-Safari-safe) as the live-camera path — mirror it. The hardware-scanner-into-text-field design is intentional; the **live-camera button** is the gap. After this, WMS is fully complete.

## Project facts
- Dev server: `npm run dev` → HTTPS:443. Admin `admin@geleoteka.ru` / `admin123`.
- DB: `postgresql://alex@localhost:5432/geleoteka`.
- Push: `env -u GITHUB_TOKEN git push origin main` (= prod deploy via Railway).
- Tests: `tsx scripts/verify-*.ts` only — **no jest/vitest**.
- ⛔ **NEVER `prisma migrate dev`** — resets the dev DB over Phase-3 stocktake checksum drift. Manual psql `ALTER` + `prisma migrate resolve --applied <name>` only.
