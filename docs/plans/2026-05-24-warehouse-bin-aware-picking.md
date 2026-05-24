# Bin-Aware Picking (WMS Phase 4) Implementation Plan

Created: 2026-05-24
Author: aleksandr.spiskov@gmail.com
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Make outbound consumption deduct from `StockBin`s so `Σbins` tracks on-hand exactly — closing the Phase-1 over-placement drift at its source and unblocking stocktake on previously-drifted parts — and add a scan-to-pick workflow for repair orders that rejects a scanned part not on the order with `WRONG_ITEM`.

## Out of Scope

- **Phases 4b / 5 / 6** — packing/shipping, replenishment, reports/multi-warehouse. This spec is Phase 4 only (decomposition decided with the user; the other three follow as their own `/spec`s).
- **Customer part-order (`PartShipment`) scan-picking** — retail orders consume at point-of-sale (handled by the auto bin-deduct in Task 2); pulling their parts for shipment is packing, which belongs to Phase 4b. Scan-to-pick UI here targets **repair orders** only.
- **Per-unit / serialized picking** — the quantity-aggregate model holds (roadmap §model-decision). A pick records a quantity from a bin, not individual tracked units.
- **Multi-bin split on a single scan-pick line** — one scan-pick consumes the line quantity from ONE scanned bin; if that bin is short, it rejects (`INSUFFICIENT_BIN`) rather than spilling across bins. (The automatic server-side path in Task 2 DOES spill across bins; the human scan path is single-bin by design — the worker physically took it from one shelf.)

## Approach

**Chosen:** New `consumeStock` op in `lib/wms/public/consumption.ts` that composes the existing `recordMovement(CONSUMPTION)` chokepoint with bin deduction; the two existing consumption call sites switch to it; a host-side `lib/warehouse/pick.ts` + `app/actions/picking.ts` + a `/admin/warehouse/picking` page drive scan-to-pick for repair orders.
**Why:** Keeps `recordMovement` pure (the architectural spine forbids the location layer from rewriting it) by layering bin logic in a higher-level op — mirroring how `placement.ts` composes its own ops. Reusing the APPROVED-estimate source-triple `{type:"RepairOrder", id:"${roId}:${lineId}"}` makes an early pick idempotent against the eventual RO-COMPLETED close (no double consumption), at the cost of picking consuming stock at pick time rather than close time (correct WMS semantics: stock leaves the shelf when picked).

## Context for Implementer

**The consumption fan-in (what Task 2 must cover).** All outbound on-hand today flows through exactly three places, two of which share a helper:
- `lib/fulfillment/consume-parts.ts` → `consumeApprovedEstimateParts` — called on **RO COMPLETED** (`app/actions/admin.ts:57`, sourceType `"RepairOrder"`) and on **shipment dispatch** (`app/actions/part-order-admin.ts:43`, sourceType `"PartShipment"`). Movement source id = `${sourceId}:${estimateLineId}`.
- `app/actions/part-orders.ts:133` — retail **point-of-sale**, source `{type:"PartShipment", id:"${shipmentId}:${partId}"}`.

Switching `recordMovement(CONSUMPTION)` → `consumeStock` in `consume-parts.ts` (one call) and `part-orders.ts` (one call) covers all three entry points.

**Idempotency invariant that must not break.** `recordMovement` dedupes on `(tenantKey, sourceType, sourceId, reason)`. `consumeStock` calls `recordMovement` first and **only deducts bins when `result.applied === true`** — so a replayed consumption (RO close after an early scan-pick, a retried action) is a movement no-op AND a bin no-op. `part-order-admin.ts`'s `alreadyConsumed` guard (counts `CONSUMPTION` movements for the shipment) still works unchanged because `consumeStock` still writes a `CONSUMPTION` `StockMovement`.

**Seam rule.** `lib/wms` imports zero host code. `WRONG_ITEM` is an order-line concept (host knowledge), so it is NOT a `WmsError` — it is a pick-action rejection code + a `rejected` `ScanEvent` (mirrors how `scan-router.ts` emits `WRONG_OBJECT_TYPE` as a plain outcome code, not a `WmsError`). `INSUFFICIENT_BIN` stays a `WmsError` (raised by `consumeStock` for an explicit short bin).

## Assumptions

- A repair order's pickable parts are exactly its **APPROVED** estimate's `type:"PART"` lines with a non-null `partId` (same source `consumeApprovedEstimateParts` uses). — Tasks 3, 4 depend on this.
- A line is "already picked/consumed" iff a `CONSUMPTION` `StockMovement` exists for source `{type:"RepairOrder", id:"${roId}:${lineId}"}`. No new per-line status column is added. — Tasks 3, 4 depend on this.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `prisma migrate dev` sweeps unrelated `DROP INDEX Part_photos_gin_idx` / `Vehicle_photos_gin_idx` into the new enum migration (the documented Phase-3 gotcha) | Medium | High (prod loses GIN indexes) | Task 1 DoD: open the generated migration SQL, delete any `DROP INDEX` lines for the GIN indexes before it is considered done; verify the migration contains only the `ALTER TYPE … ADD VALUE 'PICK'`. |
| Switching the production consumption path (Task 2) double-consumes or skips consumption | Low | High (wrong stock/money) | `consumeStock` writes the same `CONSUMPTION` movement under the same source triple; bin deduct gated on `applied`. Verify script asserts single consumption across pick→close replay and that retail/RO flows still consume exactly once. |
| Auto FIFO bin-pull picks a blocked cell | Low | Low | Consumption removes stock that is leaving the building; a blocked cell must still be evacuable (same rationale as `transferStock` not guarding its source). No location guard on the pull — documented. |

## Goal Verification

### Truths

1. After any consumption that exceeds a part's unplaced on-hand, `binsForItem(part).reconcileNeeded` is `false` and `Σbins === quantity` (or `≤` when some on-hand remains unplaced) — drift no longer accrues, and a part that was previously drifted converges toward consistency as it is consumed.
2. A repair-order line picked via the scanner consumes its quantity from the scanned bin AND is gone from that order's open-pick list; when the RO is later marked COMPLETED, on-hand does not move again (single consumption end-to-end).

## E2E Test Scenarios

### TS-001: Scan-to-pick a repair-order line (happy path)
**Priority:** Critical
**Preconditions:** Logged in as admin. A repair order (status SCHEDULED/IN_PROGRESS) with an APPROVED estimate PART line for a part that has on-hand placed in a known bin (e.g. `B-1-1`).
**Mapped Tasks:** Task 3, Task 4

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/admin/warehouse/picking` | Page lists repair orders needing picking; the seeded RO appears |
| 2 | Open the seeded RO | Its open PART line(s) show with required qty and current bin location(s) |
| 3 | Enter/scan bin `B-1-1`, then enter/scan the matching part code, confirm the pick | Success state; the FULL line (server-derived `requiredQty`) is picked from `B-1-1`, the line disappears from the open list; on-hand dropped by `requiredQty` |

### TS-002: Wrong item rejected (WRONG_ITEM)
**Priority:** High
**Preconditions:** Same RO open in the picking page; a second part NOT on the order exists with a scannable code.
**Mapped Tasks:** Task 3, Task 4

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | In the open RO, scan bin `B-1-1`, then scan the part that is NOT on the order | Inline rejection: "запчасть не из этого заказа" (WRONG_ITEM); no stock change; the open line is unchanged |

### TS-003: Bin short rejected (INSUFFICIENT_BIN)
**Priority:** Medium
**Preconditions:** RO line requires qty 5; scanned bin holds 2 of that part.
**Mapped Tasks:** Task 3, Task 4

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Scan the under-stocked bin and the correct part, confirm the pick (line `requiredQty`=5, bin holds 2) | Inline rejection "В ячейке недостаточно остатка" (INSUFFICIENT_BIN); transaction rolls back — no consumption, on-hand unchanged; line stays open |

## E2E Results

Verified via Chrome DevTools MCP on dev (HTTPS:443); backend state confirmed via psql after each run.

| Scenario | Priority | Result | Fix Attempts | Notes |
|----------|----------|--------|--------------|-------|
| TS-001 | Critical | PASS | 0 | "Отобрано … × 2"; line cleared; on-hand 5→3, Σbins 5→3; one PICK + one CONSUMPTION(−2) movement |
| TS-002 | High | PASS | 0 | "Запчасть не из этого заказа" (WRONG_ITEM); no stock change; REJECTED ScanEvent written |
| TS-003 | Medium | PASS | 0 | "В ячейке недостаточно остатка" (INSUFFICIENT_BIN); tx rolled back, no consumption; REJECTED ScanEvent |

## Progress Tracking

- [x] Task 1: `consumeStock` core op + `PICK` bin-movement reason + oldest-first helper
- [x] Task 2: Route the three existing consumption entry points through `consumeStock`
- [x] Task 3: Host pick resolver + `pickRepairOrderLine` action (WRONG_ITEM, ScanEvent, idempotent vs close)
- [x] Task 4: Picking UI page + warehouse entry link + E2E

## Implementation Tasks

### Task 1: `consumeStock` core op + `PICK` bin-movement reason

**Objective:** Add the bin-aware consumption primitive. It records a `CONSUMPTION` movement through the existing chokepoint and, only when that movement is newly applied, deducts the bins so `Σbins` stays `≤ quantity`. Verified by the new `scripts/verify-picking.ts` core scenarios.

**Files:**
- Modify: `prisma/schema.prisma` (add `PICK` to `enum StockBinMovementReason`)
- Create: `prisma/migrations/<ts>_add_pick_bin_movement_reason/migration.sql` (via `prisma migrate dev`)
- Create: `lib/wms/public/consumption.ts` (the `consumeStock` op)
- Modify: `lib/wms/internal/repository.ts` (widen the handwritten `insertBinMovement` reason literal union `"PLACE"|"TRANSFER"|"REMOVE"` → add `"PICK"`; add `findBinsOldestFirst`)
- Create: `lib/wms/internal/tx.ts` — extract the `txCapable(client)` guard + `TxCapable` type currently private in `placement.ts:37-40` into a shared internal helper, and re-import it in both `placement.ts` and `consumption.ts` (avoids duplicating the self-wrap primitive). If extraction proves noisy, duplicating the 3-line helper in `consumption.ts` is an acceptable fallback.
- Modify: `lib/wms/public/index.ts` (export `consumeStock` + its input type)
- Modify: `lib/wms/public/types.ts` (add `ConsumeStockInput`)
- Create: `scripts/verify-picking.ts` + add `"verify-picking": "tsx scripts/verify-picking.ts"` to `package.json`

**Key Decisions / Notes:**
- `consumeStock(client, input)` where `input` = `{ item: WmsItemRef; qty: number; source: MovementSource; actorId?; note?; tenantKey?; fromLocation?: string }`.
- **Self-wrap for atomicity (Codex-high fix).** `consumeStock` MUST be atomic at the public boundary: the movement and the bin deduction(s) either all commit or all roll back. Mirror `placement.ts:37-40,104-113`: detect a transaction-capable base client via the `txCapable` helper and, if given one, run the whole body inside `client.$transaction(tx => consumeStockImpl(tx, ...))`; if already handed a tx client (no `$transaction`), compose with it directly. This guarantees an explicit-bin short (`INSUFFICIENT_BIN` thrown after `recordMovement`) rolls back the movement even when a caller mistakenly passes the base `db` — preventing the exact bin/on-hand divergence this phase eliminates. (The existing two call sites already pass a `tx`; self-wrap defends future/direct callers.)
- Algorithm: `const mv = await recordMovement(client, { ...input, reason: "CONSUMPTION" });` then `if (!mv.applied) return mv;`. Resolve the `StockItem` (`ensureStockItem`). **Explicit `fromLocation`:** `decrementBinIfEnough(item.id, fromLocation, qty)` → `false` throws `WmsError.insufficientBin()`; write one `PICK` `StockBinMovement` (`fromLocation`→null). **Auto path (no `fromLocation`):** compute `needed = max(0, Σbins − quantity)` using the post-movement on-hand — which `recordMovement` already returns as `mv.quantity`, so use that rather than re-reading the `StockItem` (avoids a redundant query and a read-after-write race); `Σbins` from `sumBins`. Pull `needed` from bins **oldest-first** (`findBinsOldestFirst`, `createdAt asc`): for each bin take `t = min(remaining, bin.quantity)`, call `decrementBinIfEnough(item.id, bin.location, t)` (always succeeds since `t ≤ bin.quantity`), write one `PICK` audit row (`fromLocation=bin.location`, `toLocation=null`, `quantity=t`), subtract `t` from `remaining`, stop when `remaining===0`. `needed ≤ Σbins` always holds, so the loop cannot under-fill. (Same READ-COMMITTED concurrency bound as `placement.ts` — accepted.) This both prevents new drift and shrinks pre-existing `Σbins>quantity` drift. See proof in Key Decisions of the plan discussion: invariant `Σbins ≤ quantity` is preserved.
- `findBinsOldestFirst(client, stockItemId, tenantKey)` returns `{ location, quantity }[]` ordered `createdAt: "asc"`, `quantity: { gt: 0 }` (distinct from existing `findBinsForItem` which orders `location asc` — do not change that one, it has other callers).
- `PICK` audit rows are unkeyed and gated on `mv.applied` (mirrors the unkeyed branch of `placement.ts` — mutate then `insertBinMovement`). A replay never re-pulls because `recordMovement` no-ops first.
- The `PICK` audit rows call `insertBinMovement` with `reason: "PICK"` — the handwritten literal union at `repository.ts:208` is load-bearing for compilation and MUST be widened before `tsc` will accept `consumption.ts`.
- **Drift case pulls MORE than `qty` — intentional.** When `Σbins > quantity` (pre-existing drift), `needed = Σbins − post-movement-quantity > qty`. The loop deducts the full excess (not just the consumed amount), healing the drift in one pass. Do NOT cap `needed` at `qty`. Worked example: on-hand 7, bin holds 10 (drift), consume 3 → post-movement quantity 4, `needed = max(0, 10−4) = 6`, pull 6 → `Σbins = 4 = quantity`, `reconcileNeeded = false`.
- ⛔ After `prisma migrate dev`, open the generated `migration.sql` and DELETE any `DROP INDEX "Part_photos_gin_idx"` / `"Vehicle_photos_gin_idx"` lines Prisma sweeps in (documented Phase-3 gotcha) so prod keeps the GIN indexes. The migration must contain only `ALTER TYPE "StockBinMovementReason" ADD VALUE 'PICK';`.

**Definition of Done:**
- [ ] `consumeStock` auto-path: consuming within unplaced leaves bins untouched; consuming beyond unplaced pulls the remainder oldest-first; `Σbins ≤ quantity` holds after.
- [ ] `consumeStock` on a part with pre-existing `Σbins>quantity` drift reduces `Σbins` toward `quantity` (drift heals, never grows). Concrete verify scenario: seed on-hand 7, place 10 in a bin (`Σbins=10 > quantity=7`), `consumeStock` qty 3 → assert `quantity=4`, `Σbins=4`, `reconcileNeeded=false`.
- [ ] `tsc --noEmit` passes with zero errors (proves the `insertBinMovement` reason union was widened to include `PICK`).
- [ ] `consumeStock` explicit `fromLocation` with a short bin throws `WmsError.insufficientBin()`; because it runs inside the caller's `$transaction`, the throw rolls the whole tx back — net effect is NO `CONSUMPTION` movement and NO bin change (the verify scenario asserts on-hand and bins are unchanged after the rejected call).
- [ ] Replayed `consumeStock` (same source triple) is a movement no-op AND writes no new `PICK` rows.
- [ ] Generated migration contains only the enum `ADD VALUE`; no GIN-index `DROP`.
- [ ] Verify: `npm run verify-picking` (scenarios a–f all pass)

### Task 2: Route the three existing consumption entry points through `consumeStock`

**Objective:** Switch the production consumption paths from `recordMovement(CONSUMPTION)` to `consumeStock` (auto bin-deduct), so every RO close, shipment dispatch, and retail sale now keeps bins consistent with on-hand. This is the change that actually closes the Phase-1 drift and unblocks stocktake's `RECONCILE_BLOCKED`.

**Files:**
- Modify: `lib/fulfillment/consume-parts.ts` (the `recordMovement` call → `consumeStock`)
- Modify: `app/actions/part-orders.ts` (the retail `recordMovement` call → `consumeStock`)
- Modify: `app/actions/part-order-admin.ts` (comment-only — clarify that `consumeStock` idempotency, not the `alreadyConsumed` guard, is the stock-correctness backstop)
- Modify: `scripts/verify-picking.ts` (add the through-the-helper scenarios)

**Key Decisions / Notes:**
- Both call sites already run inside `db.$transaction` and pass the `tx` — hand that same `tx` to `consumeStock`. No `fromLocation` (auto path).
- Preserve the exact `source` objects already in use — they are the idempotency identity and the `part-order-admin.ts` `alreadyConsumed` guard depends on the `CONSUMPTION` movement still being written under `{sourceType:"PartShipment", sourceId startsWith "${orderId}:"}`.
- **TOCTOU note (no code change needed for stock correctness):** `part-order-admin.ts:29-33` reads `alreadyConsumed` OUTSIDE the `$transaction`, so two concurrent dispatches could both pass it. Stock correctness is NOT guaranteed by that guard — it is guaranteed by `consumeStock`→`recordMovement`'s source-triple unique index (the second call sees `applied:false` and deducts nothing). The guard is a fast-path optimization only. Update its inline comment (lines 25-28) to state that idempotency is the true backstop, so a future maintainer does not remove `consumeStock`'s dedup believing the guard suffices.
- `Trivial:` does NOT apply — this changes production stock behavior; both call sites get behavioral coverage in the verify script.

**Definition of Done:**
- [ ] Consuming an estimate line whose part is fully placed (no unplaced) drops `Σbins` by the consumed qty (drift would previously have appeared) — asserted via `consumeApprovedEstimateParts`.
- [ ] A retail `createPartOrder`-style consumption beyond unplaced deducts bins; calling the consumption twice with the same source consumes once.
- [ ] Verify: `npm run verify-picking` (Task-1 scenarios still pass + the two call-site scenarios pass)

### Task 3: Host pick resolver + `pickRepairOrderLine` action

**Objective:** Add the host-side scan-to-pick logic for repair orders: list a repair order's open (un-consumed) APPROVED-estimate PART lines, and apply a pick that validates the scanned part against those lines (`WRONG_ITEM` if not), then consumes the line quantity from the scanned bin via `consumeStock`, logging a `ScanEvent` for every attempt.

**Files:**
- Create: `lib/warehouse/pick.ts` (`openPickLinesForOrder`, `applyPickLine`)
- Create: `app/actions/picking.ts` (`"use server"` actions: list orders needing picking, get open lines, `pickRepairOrderLine`)
- Modify: `lib/warehouse/wms-error-message.ts` only if a new `WmsError` code is surfaced (none expected — `WRONG_ITEM` is a plain action code, `INSUFFICIENT_BIN` already mapped)
- Modify: `scripts/verify-picking.ts` (pick scenarios g–i)

**Key Decisions / Notes:**
- `openPickLinesForOrder(client, repairOrderId)`: load the RO's deal's APPROVED estimate PART lines (`partId not null`), then exclude lines that already have a `CONSUMPTION` `StockMovement` at source `{sourceType:"RepairOrder", sourceId:"${repairOrderId}:${lineId}"}`. Return `{ lineId, partId, name, article, requiredQty, bins: BinPlacement[] }[]` (bins from `binsForItem` to suggest where to pick).
- `applyPickLine(client, { repairOrderId, lineId, partId, location })` — **NO client-supplied quantity** (Codex-critical fix). A pick consumes the FULL line at once. (1) Resolve the open line server-side and derive `requiredQty = Math.round(line.qty)` using the **same rounding rule** as `consume-parts.ts:44` so the pick delta is identical to what the RO close would have consumed; (2) verify `lineId` is an open line on this RO and its `partId === partId` → else `WRONG_ITEM`; (3) `consumeStock(client, { item:{itemId:partId}, qty: requiredQty, source:{type:"RepairOrder", id:"${repairOrderId}:${lineId}"}, fromLocation: location, actorId })`. The shared source triple makes the later RO-COMPLETED close idempotent — and because the picked qty EQUALS the close qty, the idempotent no-op never hides an under-consumption.
- **Why no partial picks:** "picked" is detected by CONSUMPTION-movement existence (Assumption 2), so consuming a partial qty would mark the line done and let the close no-op the remainder → permanent under-consumption. Full-line pick keeps the movement-existence flag honest. Partial picking would require a remaining-qty column (deferred; not in scope).
- `pickRepairOrderLine` action: `requireRole(["ADMIN","MANAGER","WAREHOUSE_WORKER"])`, wrap `applyPickLine` in `db.$transaction`, parse the scanned codes with `parseScanCode` (resolve part via `lookupByCode` + article fallback, mirroring `app/actions/stocktake.ts` `resolveItemCode`), and `recordScanEvent` exactly once: `SUCCESS` on pick, `REJECTED` with errorCode `WRONG_ITEM` / `INSUFFICIENT_BIN` (map the `WmsError` code) on rejection. Use `wmsErrorMessage` for the user message; `WRONG_ITEM` gets a literal Russian string in the action ("Запчасть не из этого заказа").
- Single verify class (`scripts/verify-picking.ts`) covers core + call-site + pick scenarios — parsimonious, matches the project's one-script-per-feature convention.

**Definition of Done:**
- [ ] `applyPickLine` with a part not on the order returns/raises `WRONG_ITEM`, writes a `REJECTED` ScanEvent, applies no stock change.
- [ ] `applyPickLine` happy path consumes exactly `requiredQty = Math.round(line.qty)` (server-derived, NOT client-supplied) from the named bin and removes the line from `openPickLinesForOrder`.
- [ ] Picking a line then marking the RO COMPLETED (`consumeApprovedEstimateParts`) results in exactly ONE `CONSUMPTION` movement for that line, and its delta equals the full line `requiredQty` (idempotent AND no under-consumption — asserts the consumed quantity, not just movement existence).
- [ ] Verify: `npm run verify-picking` (scenarios g–i pass)

### Task 4: Picking UI page + warehouse entry link

**Objective:** Build the `/admin/warehouse/picking` page so a worker selects a repair order needing picking, sees its open lines with suggested bins and required quantities, and picks each line by entering/scanning a bin + part (the full line `requiredQty` is consumed — no manual quantity field) — surfacing WRONG_ITEM / INSUFFICIENT_BIN inline. Add the entry link on the warehouse page.

**Files:**
- Create: `app/(admin)/admin/warehouse/picking/page.tsx` (server; `requireRole` ADMIN/MANAGER/WAREHOUSE_WORKER; lists orders needing picking)
- Create: `app/(admin)/admin/warehouse/picking/[id]/page.tsx` (one order's pick sheet) — or a single page with selection state; implementer picks the simpler structure consistent with the stocktake pages
- Create: `components/admin/PickingOrderList.tsx`, `components/admin/PickBox.tsx` (client components mirroring `StocktakeSessionList` / `StocktakeCountBox`)
- Modify: `app/(admin)/admin/warehouse/page.tsx` (add an "Отбор →" link next to the existing "Инвентаризация →" link)

**Key Decisions / Notes:**
- Follow the stocktake pages/components as the structural template (`StocktakeCountBox` for the scan-and-confirm interaction, `StocktakeSessionList` for the order list). Use design-system classes (`.btn`, `.card`, `.alert-error`, `.alert-success`) and CSS variables — no hardcoded hex.
- Use `useProgressRouter()` for navigation (lint rule: no variable named `router` with `.push`).
- Inline alerts for WRONG_ITEM / INSUFFICIENT_BIN from the action result; success advances the line to picked and refreshes the open list.
- Performance: the open-lines list is small (one order's lines); no memoization concerns beyond not recomputing on unrelated state.

**Definition of Done:**
- [ ] TS-001 passes via Chrome DevTools MCP on dev (HTTPS:443): pick a line, line clears, on-hand drops.
- [ ] TS-002 passes: scanning a wrong part shows the WRONG_ITEM alert, no stock change.
- [ ] TS-003 passes: under-stocked bin shows INSUFFICIENT_BIN alert, no consumption.
- [ ] "Отбор →" link appears on `/admin/warehouse` and routes to the picking page.

## Autonomous Decisions

- **Scan-to-pick targets repair orders only** (customer `PartShipment` picking deferred to Phase 4b). Rationale: retail orders consume at point-of-sale (covered by Task 2's auto-deduct); their physical pull is packing.
- **Picking consumes at pick time** (not a separate reserve-picked state), reusing the RO close source triple for idempotency. Rationale: stock physically leaves the shelf when picked; an extra status column would violate the no-per-unit-status model.
- **`WRONG_ITEM` is a host action code, not a `WmsError`** — keeps the WMS core free of order knowledge (seam rule), mirrors `scan-router.ts`'s `WRONG_OBJECT_TYPE`.
- **New `PICK` `StockBinMovementReason`** rather than reusing `REMOVE` — `REMOVE` means bin→unplaced (qty stays in aggregate); a pick removes from bin AND the aggregate already dropped, so an honest audit needs a distinct reason.
