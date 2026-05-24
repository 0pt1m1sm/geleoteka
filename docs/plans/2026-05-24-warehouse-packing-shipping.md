# WMS Phase 4b — Packing / упаковка + отгрузка Implementation Plan

Created: 2026-05-24
Author: aleksandr.spiskov@gmail.com
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** A warehouse worker opens an outbound part-order, scans a parcel (box) then scans each part from its bin; the system verifies every scanned part belongs to the order (WRONG_ITEM otherwise), consumes it bin-aware, and lets the worker confirm shipment (status → SHIPPED) once all required lines are fulfilled. Covers both retail cart orders (already stock-consumed at sale → instantly shippable) and CRM estimate-dispatched orders (bin-aware picked during the flow — the customer-order picking deferred from Phase 4). Also closes the `WRONG_OBJECT_TYPE` gap so the standalone scanner recognizes `WMS:ORDER:` and `WMS:BOX:` codes.

## Out of Scope

- **Multi-box parcels / parcel-grouping table.** The chosen model is single-box; the BOX scan is audit-only (a `ScanEvent`, no stored box→line mapping). A `Parcel` table is explicitly deferred until an order genuinely needs multiple boxes.
- **Per-unit serialization.** Quantity-aggregate model only (project-wide constraint).
- **Changing the retail point-of-sale consume timing.** Retail orders keep consuming at sale (`createPartOrder`); 4b does not move that to pick time.
- **The existing admin status dropdown** (`OrderStatusChanger` → `updatePartOrderStatus`) stays for manual overrides and coexists with the scan-ship path. Note: its consumption guard IS updated (Task 2) to be line-aware so partial packing cannot bypass full fulfillment — but the dropdown UI/behavior is otherwise unchanged.

## Approach

**Chosen:** Collapsed, movement-derived pack/ship on `PartShipment`, mirroring the Phase 4 `pick.ts`/`picking.ts` split — a new host-side `lib/warehouse/pack.ts` (domain) + `app/actions/packing.ts` (actions) + a dedicated `/admin/warehouse/packing` UI, plus minimal `resolveScan` wiring for `ORDER`/`BOX`.

**Why:** Reuses the proven Phase 4 primitives (`consumeStock`, derive-state-from-`CONSUMPTION`-movements, `ScanEvent` audit, the `${orderId}:${lineKey}` source triple) so no new schema is needed — "packed" = a CONSUMPTION movement exists for the line's source triple. The pack scan IS the bin-aware pick: it consumes against the **same** source triple the existing dispatch path uses (`PartShipment:${orderId}:${lineKey}`), so a later manual dispatch is an idempotent no-op. Zero schema change also avoids the `prisma migrate dev` reset footgun. Cost: the BOX scan is audit-only (no authoritative box→line store), and retail lines (consumed at sale) count as already-packed — both accepted per the design decisions.

## Context for Implementer

`PartShipment` has two creation paths that diverge in how lines and consumption work — the unified line model in Task 1 is the linchpin that hides this from the UI:

- **Retail cart** (`app/actions/part-orders.ts` `createPartOrder`): creates `PartOrderItem` rows, consumes stock **at sale** with source `PartShipment:${orderId}:${partId}` (lineKey = `partId`), deal stays `IN_PROGRESS` (no APPROVED estimate).
- **CRM estimate-approval dispatch** (`lib/crm/internal/dispatch-fulfillment.ts`): creates the `PartShipment` (status PROCESSING) with **no** `PartOrderItem` and **no** consumption; lines come from the deal's APPROVED estimate PART lines; consumption is deferred to dispatch with source `PartShipment:${orderId}:${estimateLineId}` (lineKey = `estimateLineId`).

So: **the order's required lines = `PartOrderItem` rows if any exist, else the APPROVED estimate PART lines**, and a line's lineKey is `partId` (retail) or estimate-line id (CRM). A line is "fulfilled/packed" iff a `CONSUMPTION` movement exists for `sourceType="PartShipment"`, `sourceId="${orderId}:${lineKey}"`. This exactly matches both existing consume paths, so retail lines read as already-fulfilled and the bin-aware pack of a CRM line makes the manual dispatch path a no-op.

## Assumptions

- A retail order never has two `PartOrderItem` rows with the same `partId` (cart aggregates qty per part) — Task 1 keys retail lines by `partId`, so duplicate partIds would collide. Holds for `createPartOrder` (one row per cart line, distinct parts).
- Every CRM-dispatched `PartShipment` whose stock is unconsumed has an APPROVED estimate with PART lines (that's what `dispatchFulfillment` requires) — Tasks 1, verify-packing scenario (b).
- A CRM estimate MAY have two PART lines for the same `partId` (split quantities). This is fine: CRM lines are keyed by the unique `estimateLineId`, and the UI selects a specific line — `applyPackLine` receives an explicit `lineKey` and packs THAT line, never resolving the line from the scanned part alone. No ambiguity. (`dealId` is non-null on every `PartShipment` — `schema.prisma:1160` + both creators set it — so the CRM estimate query never dereferences a null dealId.)

## Goal Verification

### Truths

1. After scanning a parcel and every required part from its bin for a CRM-dispatched order, the order's status becomes SHIPPED and `Σbins` for each picked part still equals on-hand (no drift) — cross-task: domain consume (T1) + action/ship gate (T2) + UI (T3), verified end-to-end by TS-001.
2. A part that is not on the open order cannot be packed: the scan is rejected (WRONG_ITEM), no CONSUMPTION movement is written, and a `rejected` ScanEvent is recorded — TS-002 + verify-packing scenario (d).

## E2E Test Scenarios

### TS-001: CRM order — pack each line then ship
**Priority:** Critical
**Preconditions:** Logged in as admin; `scripts/seed-packing-e2e.ts` has created a CRM `PartShipment` (PROCESSING, APPROVED estimate with ≥2 PART lines, no PartOrderItem) with those parts placed in known bins.
**Mapped Tasks:** Task 1, Task 2, Task 3

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/admin/warehouse/packing` | The seeded order appears in "Заказы к упаковке" with an open-line count |
| 2 | Click the order | Pack page lists each open line with its bins; a box field and per-line bin+part inputs are shown |
| 3 | Enter/scan a box code | Box accepted (audit); no error |
| 4 | For line 1, fill its bin + correct part article, click "Упаковать" | Success message; line 1 drops from the open list |
| 5 | Repeat for the remaining line(s) | All lines drop; a "Подтвердить отгрузку" (ship) control becomes enabled |
| 6 | Click "Подтвердить отгрузку" | Order leaves the packing list; its `PartShipment.status` is SHIPPED (verify via psql) |

### TS-002: Wrong part is rejected
**Priority:** High
**Preconditions:** Same seeded CRM order, on its pack page.
**Mapped Tasks:** Task 1, Task 2, Task 3

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For an open line, enter its bin but a part article that is NOT on the order, click "Упаковать" | Inline error "Запчасть не из этого заказа"; line stays open; no stock change (verify no new CONSUMPTION movement via psql) |

### TS-003: Retail order ships without picking
**Priority:** Medium
**Preconditions:** `seed-packing-e2e.ts` also created a retail `PartShipment` (PROCESSING, with PartOrderItem rows, already consumed at sale).
**Mapped Tasks:** Task 1, Task 2, Task 3

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open the retail order on the pack page | Shows all lines already fulfilled ("всё подобрано"); ship control enabled with no open lines |
| 2 | Enter a box code and click "Подтвердить отгрузку" | Status → SHIPPED (verify via psql) |

### TS-004: Standalone scanner recognizes ORDER and BOX
**Priority:** Medium
**Preconditions:** On `/admin/warehouse` (scan box visible); a seeded order number known.
**Mapped Tasks:** Task 4

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | In the scan box, submit `WMS:ORDER:<orderNumber>` | An order card renders (number, status, line progress) with a "Упаковать →" link to the pack page — NOT a "не поддерживается" rejection |
| 2 | Submit `WMS:BOX:TEST-BOX-1` | A box card renders echoing the code — NOT a rejection |

### TS-005: Orders page links to the warehouse packing queue
**Priority:** Medium
**Preconditions:** Seeded CRM order (PROCESSING) + at least one SHIPPED order exist.
**Mapped Tasks:** Task 2, Task 3

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/admin/orders` | The PROCESSING order shows "упаковано 0/N" and an "Упаковка →" link; a SHIPPED order shows neither |
| 2 | Click "Упаковка →" on the PROCESSING order | Lands on `/admin/warehouse/packing/<id>` for that order |
| 3 | Pack one line, return to `/admin/orders` | The indicator reflects progress (e.g. "упаковано 1/N") |

## E2E Results

| Scenario | Priority | Result | Fix Attempts | Notes |
|----------|----------|--------|--------------|-------|
| TS-001 | Critical | PASS | 0 | CRM order PO-0003: box scan + both lines packed bin-aware → SHIPPED; psql confirmed status=SHIPPED and Σbins===on-hand (A 3/3, B 2/2, no drift) |
| TS-002 | High | PASS | 0 | Off-order part → "Запчасть не из этого заказа", line stays, ScanEvent pack/RAW/REJECTED/WRONG_ITEM recorded, no CONSUMPTION movement |
| TS-003 | Medium | PASS | 0 | Retail PO-0004: all lines fulfilled at sale → shipped with nothing to pack |
| TS-004 | Medium | PASS | 0 | WMS:ORDER:PO-0001 → order card + "Упаковка →" link; WMS:BOX:TEST-BOX-1 → box echo card; unknown order → "Не найдено" (404) |
| TS-005 | Medium | PASS | 0 | /admin/orders: PROCESSING order shows "упаковано 0/1" + "Упаковка →" link; SHIPPED orders show neither |

## Progress Tracking

- [x] Task 1: Pack domain — `lib/warehouse/pack.ts` (unified required lines, open-line derivation, bin-aware pack, ship gate) + `scripts/verify-packing.ts`
- [x] Task 2: Pack server actions — `app/actions/packing.ts` (list, open lines, pack line, box-scan audit, ship) with role gate + ScanEvent audit
- [x] Task 3: Packing UI — list + `[id]` pack pages, `PackingOrderList` + `PackBox` components, warehouse-index link, `/admin/orders` cross-link + progress, `scripts/seed-packing-e2e.ts`
- [x] Task 4: Wire `WMS:ORDER`/`WMS:BOX` in `resolveScan` + minimal render in `WarehouseScanBox`

## Implementation Tasks

### Task 1: Pack domain logic — unified lines, bin-aware pack, ship gate

**Objective:** Create the host-side packing domain that mirrors `lib/warehouse/pick.ts` but targets `PartShipment` and unifies the two order shapes (retail `PartOrderItem` vs CRM APPROVED-estimate lines). It derives a line's "fulfilled" state from existing CONSUMPTION movements and packs an open line by consuming it bin-aware against the shared `PartShipment:${orderId}:${lineKey}` source triple. Verified by `scripts/verify-packing.ts`.

**Files:**

- Create: `lib/warehouse/pack.ts`
- Create: `scripts/verify-packing.ts`

**Key Decisions / Notes:**

- Mirror `lib/warehouse/pick.ts:69-152` structure. `PackError` with code `"WRONG_ITEM"` (host concept, NOT a `WmsError` — same seam rule as `pick.ts:21`).
- `requiredLines(client, orderId)`: read `partShipment` (`select: id, status, dealId, items: {select:{partId, quantity}}`). If `items.length > 0` → lines `{lineKey: partId, partId, requiredQty: quantity}` (retail; lineKey = partId to match the sale source `orderId:partId` in `app/actions/part-orders.ts:138`). Else → read APPROVED estimate PART lines exactly like `lib/fulfillment/consume-parts.ts:30-39` → lines `{lineKey: estLine.id, partId, requiredQty: Math.round(qty)}`. Return `null` when the order is missing.
- `PACKABLE_STATUSES = new Set(["PROCESSING"])` — the security gate (mirror `pick.ts:41` `PICKABLE_STATUSES`). The check lives INSIDE `requiredLines` (NOT only in `applyPackLine`): `requiredLines` returns `null` when the order is missing OR not PROCESSING, so `openPackLinesForOrder`/`applyPackLine`/`isFullyPacked` all inherit the gate and a direct mutation against a CANCELLED/SHIPPED order id cannot consume. (Mirrors how `pick.ts:53` gates inside `approvedPartLines`.)
- `openPackLinesForOrder(client, orderId)`: required lines minus those already consumed. "Consumed" = a `CONSUMPTION` movement exists with `tenantKey=TENANT_KEY, sourceType="PartShipment", sourceId startsWith \`${orderId}:\`` whose suffix === `lineKey` (mirror `pick.ts:76-92`). Attach `bins` via `binsForItem(client, partId, TENANT_KEY)`.
- `applyPackLine(client, {orderId, lineKey, partId, location, actorId})`: the `lineKey` is supplied by the caller/UI (the worker selected a specific line row — mirrors `PickBox` per-line `pick(line)`), NOT derived from the scanned part. Find the open line BY `lineKey`; if missing or `line.partId !== partId` → throw `PackError("WRONG_ITEM", "Запчасть не из этого заказа")`. This disambiguates CRM estimates with two PART lines for the same part — each is packed via its own `lineKey`. Else `consumeStock(client, { item:{itemId:partId}, qty: line.requiredQty, source:{type:"PartShipment", id:\`${orderId}:${lineKey}\`}, fromLocation: location, actorId, tenantKey: TENANT_KEY })`. Pass a `$transaction` client from the caller (atomic check+consume), exactly like `pick.ts:134-152`.
- `isFullyPacked(client, orderId)`: `true` iff `requiredLines` is non-null and every line is consumed (open list empty). Drives the ship gate.
- `packProgress(client, orderId): { packed: number; required: number }`: `required` = required-line count, `packed` = consumed-line count (derived from the same consumed-set). Returns `{packed:0, required:0}` for a missing/non-PROCESSING order. Used by Task 2's list and Task 3's `/admin/orders` cross-link so the count logic lives in one place.
- Quantity is ALWAYS server-derived (`requiredQty`), never client-supplied — the Codex-critical rule from Phase 4 (`pick.ts` docstring). Re-packing a consumed line is a safe no-op via `consumeStock`'s source-triple pre-check.
- `scripts/verify-packing.ts` (run `npx tsx scripts/verify-packing.ts`): build fixtures inline like `verify-picking.ts`. Scenarios: (a) retail order → openPackLines empty (consumed at sale); (b) CRM order → openPackLines = all estimate PART lines; (c) pack happy → consumes bin-aware, line drops, movement at `PartShipment:orderId:estLineId`; (d) WRONG_ITEM → throws, no movement; (e) INSUFFICIENT_BIN bubbles from consumeStock + rolls back (no movement); (f) re-pack same line → no double consume; (g) `isFullyPacked` false with open lines, true after all packed; (h) cross-check: after bin-aware pack of a CRM line, `consumeApprovedEstimateParts` (the dispatch path) consumes nothing extra (shared source triple = idempotent); (i) non-PROCESSING (CANCELLED) order → applyPackLine refuses / openPackLines empty; (j) partial-pack-then-dispatch top-up: a 2-line CRM order, pack line 1 only → `isFullyPacked` false; then run `consumeApprovedEstimateParts` (simulating the manual dispatch path Task 2 fixes) → line 2 is consumed, line 1 is a no-op (already packed), every part's `Σbins === on-hand` (no drift), and `isFullyPacked` becomes true.

**Definition of Done:**

- [ ] `openPackLinesForOrder` returns all APPROVED-estimate PART lines for a CRM order with no prior consumption, and empty for a retail order already consumed at sale
- [ ] `applyPackLine` consumes the full server-derived qty from the scanned bin and writes one CONSUMPTION movement at `PartShipment:${orderId}:${lineKey}`; a wrong part throws `PackError("WRONG_ITEM")` and writes no movement
- [ ] After bin-aware packing a CRM line, `consumeApprovedEstimateParts` for the same order is a no-op (no extra movement, no extra bin deduction)
- [ ] Verify: `npx tsx scripts/verify-packing.ts` (all scenarios pass)

### Task 2: Pack server actions — list, pack, box-scan audit, ship

**Objective:** Thin `"use server"` wrappers over Task 1, mirroring `app/actions/picking.ts`. Role-gated to ADMIN/MANAGER/WAREHOUSE_WORKER, each scan writes exactly one `ScanEvent`, and shipment is gated on full packing.

**Files:**

- Create: `app/actions/packing.ts`
- Modify: `app/actions/part-order-admin.ts`

**Key Decisions / Notes:**

- **Dispatch-guard fix (must_fix — Codex high).** Partial packing breaks the existing `alreadyConsumed` guard (`part-order-admin.ts:34-38`): once ONE CRM line is packed, a CONSUMPTION movement exists, so the coarse "any movement → skip consume" guard would make a manual `updatePartOrderStatus(orderId,"SHIPPED")` skip `consumeApprovedEstimateParts` entirely — leaving the remaining lines un-consumed but the order marked SHIPPED (under-consumption + bin drift). Fix: replace the `alreadyConsumed` count with `fullyConsumed = await isFullyPacked(db, orderId)` (Task 1, keyed by the unified line model — retail by partId, CRM by estimate-line id), and run `consumeApprovedEstimateParts` when `enteringDispatched && !fullyConsumed`. Effect: a fully-consumed order (retail at sale, or CRM fully packed) still skips; a partially-packed CRM order tops up the remaining APPROVED-estimate lines at dispatch — each already-packed line is an idempotent per-line no-op (the existing comment confirms per-line source-triple idempotency is the real backstop), so no double-consume. The check runs while the order is still PROCESSING (before the tx update), so `requiredLines`' PACKABLE gate is satisfied. Retail orders have no APPROVED estimate → `consumeApprovedEstimateParts` is a no-op regardless. Verified by verify-packing scenario (j).
- Mirror `app/actions/picking.ts` wholesale: `PACK_ROLES = ["ADMIN","MANAGER","WAREHOUSE_WORKER"]`, `resolveItemCode`/`resolveLocationCode` helpers (copy from `picking.ts:18-36`), `parseScanCode` + `recordScanEvent` audit per scan.
- `listOrdersNeedingPacking(): PackOrderSummary[]` — `partShipment.findMany({where:{status:"PROCESSING"}, orderBy:{createdAt:"asc"}})`; per order use `packProgress(...)`. Include ALL PROCESSING orders (retail ones are fully fulfilled but still need shipping); summary carries `orderNumber`, `contactName`, `packed`, `required`.
- `getPackProgress(orderId): {packed, required}` — thin wrapper over Task 1's `packProgress`, role-gated, for the `/admin/orders` cross-link (Task 3).
- `getOpenPackLines(orderId): OpenPackLine[]` — wrapper over Task 1.
- `packOrderLine(orderId, lineKey, rawPartCode, rawLocationCode): {error, requiredQty?}` — mirror `pickRepairOrderLine` (`picking.ts:100-153`): resolve part + location, `db.$transaction(tx => applyPackLine(tx, ...))`, ScanEvent `action="pack"` (SUCCESS/REJECTED/ERROR), `revalidatePath` the pack pages. `PackError`/`WmsError` → REJECTED with mapped message via `wmsErrorMessage`.
- `recordPackBoxScan(orderId, rawBoxCode): {error}` — audit-only: parse, write a `ScanEvent` `action="pack"`, `parsedObjectType="BOX"`. No state change (single-box, no parcel table). Returns ok unless the code is empty/unparseable.
- `shipPackedOrder(orderId): {error}` — `requireRole(PACK_ROLES)`. **TOCTOU-safe (should_fix — Claude #3):** the full-packed gate is re-checked INSIDE the status-update transaction, not just before it. `db.$transaction(tx => { if (!(await isFullyPacked(tx, orderId))) throw …; re-read status === PROCESSING; tx.partShipment.update status="SHIPPED" })`. A cheap pre-check before the tx can short-circuit the common "still open" case for a friendly `{error:"Не все позиции упакованы"}`, but the authoritative gate is the in-tx re-check (catch the thrown guard and map to the same error). Then create the customer `Notification` (mirror `part-order-admin.ts:57-79`, SHIPPED label "Отправлен") if `userId` set. NOTE: no consume call here — the in-tx gate guarantees all lines are already consumed (retail at sale, CRM at pack), so the `consumeApprovedEstimateParts` backstop would be a pure no-op. `revalidatePath`. The ~12-line notification duplication is accepted to avoid refactoring the working `updatePartOrderStatus` dispatch path.

**Definition of Done:**

- [ ] `listOrdersNeedingPacking` returns PROCESSING orders only, with correct open/required counts for both retail and CRM orders
- [ ] `packOrderLine` writes exactly one ScanEvent per attempt (SUCCESS on pick, REJECTED on WRONG_ITEM/INSUFFICIENT_BIN) and consumes bin-aware on success
- [ ] `shipPackedOrder` refuses (`error` set, status unchanged) when open lines remain — gate re-checked inside the tx — and sets status SHIPPED + notifies when fully packed
- [ ] `updatePartOrderStatus` no longer skips consumption for a partially-packed CRM order: after packing 1 of N lines, a manual SHIPPED transition consumes the remaining lines (verify-packing scenario (j) covers the underlying top-up)
- [ ] Verify: `npx tsc --noEmit` clean for the new file; behavior covered by TS-001/002/003

### Task 3: Packing UI — list + pack pages, components, index link, E2E seed

**Objective:** A `/admin/warehouse/packing` list and `/admin/warehouse/packing/[id]` pack page mirroring the picking UI, with a `PackBox` that scans box + per-line bin/part and a ship button, plus the "Упаковка →" link on the warehouse index and an E2E seed script.

**Files:**

- Create: `app/(admin)/admin/warehouse/packing/page.tsx`
- Create: `app/(admin)/admin/warehouse/packing/[id]/page.tsx`
- Create: `components/admin/PackingOrderList.tsx`
- Create: `components/admin/PackBox.tsx`
- Create: `scripts/seed-packing-e2e.ts`
- Modify: `app/(admin)/admin/warehouse/page.tsx`
- Modify: `app/(admin)/admin/orders/page.tsx`

**Key Decisions / Notes:**

- `packing/page.tsx` mirrors `picking/page.tsx`: `requireRole(["ADMIN","MANAGER","WAREHOUSE_WORKER"])`, `force-dynamic`, `PageHeader eyebrow="Запчасти" title="Упаковка"`, `<PackingOrderList orders={...} />`.
- `packing/[id]/page.tsx` mirrors `picking/[id]/page.tsx`: load the `partShipment` (orderNumber, status, contactName), `notFound()` if missing, fetch open lines, render `<PackBox orderId={id} orderNumber={...} lines={...} hasOpen={...} />`.
- `PackingOrderList.tsx` — presentational, mirror `PickingOrderList.tsx`; badge = `orderNumber`, link to `/admin/warehouse/packing/${id}`, show `упаковано: packed / required`.
- `app/(admin)/admin/orders/page.tsx` (cross-link — no new status; PROCESSING already = "in the warehouse queue"): for each order whose `status === "PROCESSING"`, render a small "упаковано X/Y" indicator + an "Упаковка →" `Link` to `/admin/warehouse/packing/${order.id}`, near the `OrderStatusChanger`. Compute X/Y by calling `getPackProgress(order.id)` ONLY for PROCESSING orders (the active queue is small — bounds the extra queries; SHIPPED/COMPLETED/CANCELLED orders get no progress call). This is the visible handoff the manager sees; the warehouse worker still works from the packing queue.
- `PackBox.tsx` — mirror `PickBox.tsx` (`useRouter().refresh()` as `refreshRouter`, NOT `useProgressRouter`; per-line `bin`/`part` state + `Упаковать` button → `packOrderLine`). Add: a single box-code input at the top with a "Подтвердить короб" that calls `recordPackBoxScan` (audit). When `lines.length === 0` show "Все позиции упакованы". A "Подтвердить отгрузку" button (calls `shipPackedOrder`) — enabled only when no open lines remain; on success `refreshRouter.refresh()` (order leaves list / page shows shipped). Inline error/success alerts like `PickBox`.
- `page.tsx` (warehouse index): add a third link next to "Отбор →": `<Link href="/admin/warehouse/packing" className="btn btn-secondary inline-flex w-fit min-h-[44px]">Упаковка →</Link>`.
- `scripts/seed-packing-e2e.ts` (run `npx tsx scripts/seed-packing-e2e.ts`, support `--clean`): create (1) a CRM `PartShipment` PROCESSING via a deal + APPROVED estimate with ≥2 PART lines and NO PartOrderItem, parts placed in known bins (use existing placement helpers / `placeStock`); (2) a retail `PartShipment` PROCESSING with PartOrderItem rows already consumed at sale (call `createPartOrder` or replicate). Print the order numbers for the E2E run. Mirror `scripts/seed-picking-e2e.ts`.
- All styling via existing CSS classes (`.card`, `.btn`, `.badge`, `.alert-error`, `.alert-success`, CSS vars) — no hardcoded hex.

**Definition of Done:**

- [ ] `/admin/warehouse/packing` lists PROCESSING orders; clicking opens the per-order pack page
- [ ] Packing a CRM order line-by-line drops lines and enables the ship button; shipping sets status SHIPPED (TS-001)
- [ ] Wrong part shows the inline WRONG_ITEM error and keeps the line (TS-002); retail order is shippable with no open lines (TS-003)
- [ ] "Упаковка →" link appears on `/admin/warehouse`
- [ ] Each PROCESSING order on `/admin/orders` shows "упаковано X/Y" + an "Упаковка →" link to its pack page; non-PROCESSING orders show neither (TS-005)
- [ ] Verify: TS-001/002/003/005 pass via Chrome DevTools MCP on dev HTTPS:443 with psql status confirmation

### Task 4: Wire WMS:ORDER and WMS:BOX in the standalone scanner

**Objective:** Stop `resolveScan` rejecting `ORDER`/`BOX` with `WRONG_OBJECT_TYPE`; resolve `ORDER` to an order card (number, status, line progress, link to the pack page) and `BOX` to a simple echo card, and render both minimally in `WarehouseScanBox`.

**Files:**

- Modify: `lib/warehouse/scan-router.ts`
- Modify: `components/admin/WarehouseScanBox.tsx`

**Key Decisions / Notes:**

- `scan-router.ts`: add `OrderCard` (`kind:"order"`, `orderId`, `orderNumber`, `status`, `requiredCount`, `packedCount`) and `BoxCard` (`kind:"box"`, `code`) to the `ScanCard` union. In `resolveScan`, replace the `case "ORDER": case "BOX":` reject block (`scan-router.ts:106-114`): for `ORDER` resolve the `PartShipment` by `orderNumber` (then by id fallback) + counts via Task 1's `requiredLines`/open derivation → `log("SUCCESS")`, 200 OrderCard; unknown order → `log("REJECTED","UNKNOWN_CODE")`, 404. For `BOX` → `log("SUCCESS")`, 200 BoxCard echoing the code (boxes are not registered entities).
- `WarehouseScanBox.tsx`: extend the local `ScanData` union with the two new kinds; in `handleScan`, branch on `kind === "order"` / `kind === "box"` to set new state; render a compact order card (number, status badge, `packedCount/requiredCount`, a `Link`/anchor "Упаковать →" to `/admin/warehouse/packing/${orderId}`) and a box card (just the code). Keep it minimal — do not add pack controls here (the dedicated pack page owns the flow). Clear the new state on part/location scans (and vice-versa) to match existing single-card behavior.
- Keep the audit-writer invariant: `resolveScan` remains the single ScanEvent writer for the standalone endpoint.

**Definition of Done:**

- [ ] `WMS:ORDER:<number>` returns a 200 order card (not 422 WRONG_OBJECT_TYPE) and the scan box shows it with a working "Упаковать →" link
- [ ] `WMS:BOX:<code>` returns a 200 box card echoing the code
- [ ] An unknown order number returns 404 with a `rejected` ScanEvent
- [ ] Verify: TS-004 passes via Chrome DevTools MCP; `npx tsc --noEmit` clean
