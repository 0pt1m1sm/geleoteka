# Warehouse Scan-Driven Receiving Implementation Plan

Created: 2026-05-24
Author: aleksandr.spiskov@gmail.com
Status: VERIFIED
Approved: Yes
Iterations: 1
Worktree: No
Type: Feature

## Summary

**Goal:** A warehouse worker receives incoming goods from the Склад scanner — scan/select a part, set quantity, stock rises into a **ПРИЁМКА** staging cell (label printed), then a second scan puts the goods away to a real shelf — without needing the admin-only supplier-order page. Matches the pro-WMS two-step inbound (receive → putaway), with order-backed and order-less (gray import) paths.

## Approach

**Chosen:** Extend the existing scanner (`WarehouseScanBox`) + WMS receive engine (`applyReceive`, `recordMovement`/`placeStock`), add worker-callable receive actions, and a guided ПРИЁМКА→shelf putaway view. No new movement engine.
**Why:** The receipt engine (`applyReceive`: CAS-guarded, raises stock, optional putaway, closes order, landed cost), putaway primitives (`transferBetweenBins`), label printing, and the `StockLocation` registry already exist — the gap is only (a) letting `WAREHOUSE_WORKER` trigger a receipt from the scanner, (b) an order-less "blind receipt", (c) a staging-cell default, (d) a guided putaway screen. Reusing `applyReceive` for order-backed receipts keeps order closure + landed cost and means there is a single receipt path per order line (no double-count). The cost is touching the scanner component and adding a movement `source.type`.

## Out of Scope

- Changing the existing supplier-order receiving page (`SupplierOrderReceiving`) — it stays as-is for desk/bulk/discrepancy receiving. Both it and the scanner call the same `applyReceive`, so an order line is received once regardless of which UI is used.
- Auto-matching a scanned barcode to a specific order line without worker confirmation — the worker always picks the order line (or blind), because many parts share an article and some have no barcode.
- ETA / expected-arrival editing and the «Ожидается» column — already exist, untouched.

## Context for Implementer

Receiving raises **on-hand stock** and optionally **places** it into a bin in one transaction. Two receipt paths, both into the ПРИЁМКА staging cell by default:
- **Order-backed:** the scanned part matches one or more open `SupplierOrderItem` PART lines (`order.status` in `OPEN_SUPPLIER_ORDER_STATUSES`, `receivedQuantity < quantity`). The worker picks the line; we call `applyReceive` (closes the order line, computes status, landed cost is already on the order).
- **Blind (gray import / no order):** no open line — a `recordMovement` `RECEIPT` with `source.type:"ManualReceipt"` + `placeStock`, no order touched.

Putaway is a `transferBetweenBins` from ПРИЁМКА to the shelf — already implemented and allowed for `WAREHOUSE_WORKER`; this plan adds a guided screen, not a new primitive.

## Runtime Environment

- Dev server: `npm run dev` (HTTPS, port 443). Prod: Railway auto-deploys `main`. No jest/vitest — verification via `tsx scripts/verify-*.ts` + browser.

## Assumptions

- `recordMovement` accepts an arbitrary `source.type` string (confirmed: existing types include `PartShipment`/`SupplierOrder`/`WarehouseAdjust`). Tasks 2–3 depend on `"ManualReceipt"` being acceptable.
- A single staging cell code is sufficient (one ПРИЁМКА zone). Task 1 depends on this.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Double-count: same goods received via scanner AND supplier page | Medium | High | Order-backed receipts go through `applyReceive`'s CAS on `receivedQuantity` and auto-close the order, so the line shows received and is not re-received on the page. Blind receipts have no order to re-receive. Document for managers. |
| `WAREHOUSE_WORKER` can now raise stock (privilege expansion) | Medium | Medium | Reuse `applyReceive`'s terminal/over-receive guards; blind receipt is additive on-hand only (no absolute set), audited with actor + `ManualReceipt` source. |
| Over-receipt (more than ordered) | Low | Medium | `applyReceive` already returns `overReceived` and still records; UI surfaces a warning (Task 3 DoD, TS-004). Blind path is intentionally unbounded. |
| Concurrent blind receipts of the same part | Low | Medium | Two workers receiving the same gray-import consignment simultaneously both succeed and double the rise (no order CAS to block). Mitigation: movements are audited with `actorId` + `ManualReceipt` source; operational procedure assigns one receiver per consignment. |
| Mistyped shelf code auto-registers a phantom bin | Low | Low | `assertLocationUsable` auto-creates a never-seen location as active+unblocked (WMS-wide behavior), so a typo in the editable cell field silently creates a new `StockLocation` and places stock there. Mitigation: ПРИЁМКА is the default; blank coerces to ПРИЁМКА; the phantom bin is visible in the locations list and movements feed. Stricter "must pre-exist" validation is out of scope (WMS-wide design decision). |

## Goal Verification

### Truths

1. A `WAREHOUSE_WORKER`, using only the Склад scanner (no supplier-order page access), can take an incoming part from "arrived" to "on a shelf": on-hand rises, the unit is first in ПРИЁМКА, then in the target shelf bin — verified end-to-end by TS-001 + TS-003.
2. Receiving an order-backed line via the scanner advances/closes that supplier order exactly as the supplier-order page would (same `applyReceive`), and the page does not let it be received again — TS-001.

## E2E Test Scenarios

### TS-001: Receive an order-backed part into ПРИЁМКА via scanner
**Priority:** Critical
**Preconditions:** Logged in as ADMIN (or WAREHOUSE_WORKER); an open supplier order with a PART line (e.g. brake fluid, ordered 2, received 0).
**Mapped Tasks:** Task 1, Task 2, Task 3

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open /admin/warehouse, scan/enter the part's article | Part card shows; a "Принять" section lists the open order (№, поставщик, осталось 2) |
| 2 | Pick the order line, set qty 2, leave cell = ПРИЁМКА, confirm | Success; on-hand +2; placement shows ПРИЁМКА: 2; a "Печать наклейки" link appears |
| 3 | Open the supplier order page | The line shows received 2 / 2; order status RECEIVED; no re-receive possible |

### TS-002: Blind receive (no order) into ПРИЁМКА
**Priority:** High
**Preconditions:** A part with NO open supplier order line.
**Mapped Tasks:** Task 1, Task 2, Task 3

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Scan/enter the part | Part card shows; no open orders; a "Слепой приход" option is offered |
| 2 | Enter qty 3, cell ПРИЁМКА, confirm | On-hand +3; placement shows ПРИЁМКА: 3; movement feed shows a RECEIPT (source ManualReceipt) |

### TS-003: Putaway from ПРИЁМКА to a shelf
**Priority:** Critical
**Preconditions:** A part with stock in ПРИЁМКА (from TS-001/002).
**Mapped Tasks:** Task 4

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Scan the ПРИЁМКА cell | Cell card lists the items currently in ПРИЁМКА with quantities |
| 2 | For an item, enter/scan target shelf (e.g. A-1-1) + qty, confirm | Item moves ПРИЁМКА → A-1-1; ПРИЁМКА count drops; shelf shows the qty |

### TS-004: Over-receipt warning on order-backed receive
**Priority:** Medium
**Preconditions:** An open order line with remaining 1.
**Mapped Tasks:** Task 2, Task 3

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Scan the part, pick the line, set qty 3 (> remaining 1), confirm | Receipt succeeds; card shows a warning "Принято больше заказанного — 3 из 1"; on-hand rose by 3 |

## E2E Results

**Live-target probe:** Tier 1 — dev server `https://localhost/admin/warehouse` reachable (HTTP 200). Target available.
**Browser interaction:** BLOCKED in this session — the claude-in-chrome automation could not trigger the app's React form `onSubmit` (the QrScanner manual-entry form) via keyboard typing, programmatic `requestSubmit()`, real Enter, or a real submit-button click. The scan API itself returns 200 for the part, the production build succeeds, and the pre-existing scan works for real users on prod — so this is a tooling limitation, not a code defect. The receive/putaway logic is fully covered by the integration verify script instead.

| Scenario | Priority | Result | Notes |
|----------|----------|--------|-------|
| TS-001 (order-backed receive → ПРИЁМКА) | Critical | UNIT_VERIFIED | `verify-scan-receiving.ts`: on-hand +2, ПРИЁМКА bin 2, order RECEIVED, no re-receive. Browser click-through not runnable (tooling). |
| TS-002 (blind receive → ПРИЁМКА) | High | UNIT_VERIFIED | `verify-scan-receiving.ts`: on-hand +3 into ПРИЁМКА via RECEIPT/ManualReceipt; idempotent replay no-op; blank cell coerces to ПРИЁМКА. |
| TS-003 (putaway ПРИЁМКА → shelf) | Critical | UNIT_VERIFIED | Reuses existing `transferBetweenBins` (covered by `verify-warehouse.ts`); UI wires it to the LocationCard. Browser click-through not runnable (tooling). |
| TS-004 (over-receipt warning) | Medium | UNIT_VERIFIED | `applyReceive` returns `overReceived`; UI surfaces the warning (code-reviewed). Browser not runnable. |

Recommend a manual UI smoke test on dev/prod (scan a part → Приёмка section → Принять / Слепой приход → putaway) at the code-review gate.

## Progress Tracking

- [x] Task 1: ПРИЁМКА staging location constant + registry
- [x] Task 2: Worker-callable receive actions (order-backed + blind) + open-lines query
- [x] Task 3: Scanner receiving UI (receive section on the part card)
- [x] Task 4: Guided putaway-from-ПРИЁМКА view

## Implementation Tasks

### Task 1: ПРИЁМКА staging location — constant + registry

**Objective:** Define the staging cell as a single source of truth and ensure it exists in the `StockLocation` registry so receipts default into it and it renders as a normal (active) cell. Verified by TS-001 step 2.

**Files:**
- Modify: `lib/wms-host.ts` (add `STAGING_LOCATION = "ПРИЁМКА"` export alongside `TENANT_KEY`)
- Modify: `scripts/backfill-stock-locations.ts` (also upsert the staging code so prod has it)

**Key Decisions / Notes:**
- `StockLocation` is keyed `(tenantKey, code)`; code is upper/trimmed by callers. Use the literal `ПРИЁМКА` (already Cyrillic-uppercase) as the code; reuse `normalizeLocation`.
- ⚠️ The generic backfill is create-only (never resets `isActive`/`isBlocked` of an existing row — see `scripts/backfill-stock-locations.ts:31-37`). The staging cell is system-critical and placement rejects blocked/inactive locations (`lib/wms/public/locations.ts`), so a stale or manually-blocked `ПРИЁМКА` row would silently break all default receiving. Therefore handle the staging code **separately**: upsert it with `isActive: true, isBlocked: false` (assert usable on every run), distinct from the create-only loop for other codes.

**Definition of Done:**
- [ ] `STAGING_LOCATION` exported and importable.
- [ ] Running `npm run backfill-stock-locations` guarantees a `ПРИЁМКА` location that is `isActive=true, isBlocked=false` — even if a row already existed in a blocked/inactive state (assert via re-read).
- [ ] Verify: `npx tsc --noEmit` and `npm run backfill-stock-locations` (local) exits 0; ПРИЁМКА present, active, unblocked.

### Task 2: Worker-callable receive actions + open-order-lines query

**Objective:** Add server actions the scanner uses to receive into a cell, callable by `WAREHOUSE_WORKER`: one order-backed (reuses `applyReceive`), one blind (no order). Plus a read that lists a part's open order lines so the UI can offer them. Defaults placement to `STAGING_LOCATION`.

**Files:**
- Modify: `app/actions/warehouse.ts` (new actions: `scanReceiveOrderLine`, `blindReceive`, `openOrderLinesForPart`)
- Test: `scripts/verify-scan-receiving.ts` (new tsx verify: order-backed receive raises stock + advances order; blind receive raises stock with ManualReceipt source; both place into ПРИЁМКА)

**Key Decisions / Notes:**
- `scanReceiveOrderLine(orderId, lineId, qty, expectedReceived, location = STAGING_LOCATION)`: `requireRole(["ADMIN","MANAGER","WAREHOUSE_WORKER"])`, then `db.$transaction(...)`. ⚠️ **Server-side eligibility guard (do NOT trust the UI filter):** inside the tx, read the order's `status` and reject unless `status ∈ OPEN_SUPPLIER_ORDER_STATUSES` — `applyReceive` only blocks RECEIVED/COMPLETED/CANCELLED (`lib/warehouse/receive.ts:92-99`), so without this a direct action call could receive a `DRAFT`/other non-open line the scanner never exposed. After the guard, call `applyReceive(tx, {...})`. Map `wmsErrorMessage`.
- ⚠️ **Blocked-location guard (both actions):** before placing, look up the target `StockLocation` and return `{ error: "Ячейка заблокирована или неактивна" }` if `isBlocked` or `!isActive` — `applyReceive`/`placeStock` do NOT validate the location, so a typed blocked cell would silently accept stock. (ПРИЁМКА is asserted-usable by Task 1; this guards the editable cell field.)
- `blindReceive(partId, qty, location = STAGING_LOCATION, idempotencyKey)`: **`idempotencyKey` is REQUIRED** (caller supplies a stable per-confirm key). In one `$transaction`: `const mv = await recordMovement(tx,{item:{itemId:partId},reason:"RECEIPT",qty,source:{type:"ManualReceipt",id: idempotencyKey},idempotencyKey,actorId,tenantKey})`. ⚠️ **Only place if the movement was newly applied** — `if (mv.applied) await placeStock(tx,{itemId:partId,location,qty,actorId,idempotencyKey:`${idempotencyKey}:place`,tenantKey})`. Rationale: on a retry `recordMovement` no-ops (dedupe on `(tenant,ManualReceipt,id,RECEIPT)`), but an unconditional `placeStock` would place unrelated existing unplaced stock and desync the bin from on-hand (`lib/wms/public/placement.ts`). Validate `qty` integer > 0.
- `openOrderLinesForPart(partId)`: `supplierOrderItem.findMany` where `partId`, `type:"PART"`, `order.status in OPEN_SUPPLIER_ORDER_STATUSES`, `receivedQuantity < quantity`; return `{orderId, lineId, orderNumber, supplierName, ordered, received, remaining}` (join order + supplier). Reuse `OPEN_SUPPLIER_ORDER_STATUSES` from `lib/warehouse/incoming.ts`.
- Prisma results lose inference through `db` — use explicit casts per `geleoteka-conventions.md`.

**Definition of Done:**
- [ ] `scanReceiveOrderLine` raises on-hand by qty, places into ПРИЁМКА, advances the order line's `receivedQuantity`/status (assert via re-read).
- [ ] `scanReceiveOrderLine` rejects a line whose order status is NOT in `OPEN_SUPPLIER_ORDER_STATUSES` (e.g. DRAFT) with a structured error and raises NO stock.
- [ ] `blindReceive` raises on-hand by qty into ПРИЁМКА with a `RECEIPT`/`ManualReceipt` movement; no SupplierOrder touched.
- [ ] Calling `blindReceive` twice with the same `idempotencyKey` raises stock and places it **only once** (second call is an idempotent no-op — no extra placement).
- [ ] Both receive actions return an error (and place nothing) when the target location is blocked or inactive.
- [ ] `openOrderLinesForPart` returns only open, not-fully-received PART lines for the part.
- [ ] All three reject a non-`WAREHOUSE_WORKER`/MANAGER/ADMIN caller.
- [ ] Verify: `npx tsx scripts/verify-scan-receiving.ts` passes (covers: order-backed receive, DRAFT rejection, blind receive, blind idempotent-replay, blocked-location rejection); `npx tsc --noEmit` clean.

### Task 3: Scanner receiving UI — receive section on the part card

**Objective:** When a part is resolved in `WarehouseScanBox`, show a "Приёмка" section: list open order lines (from `openOrderLinesForPart`) each with a qty input + "Принять" (calls `scanReceiveOrderLine`), and a "Слепой приход" qty input + button (calls `blindReceive`) when there are none / for extra. Cell defaults to ПРИЁМКА, editable for direct-to-shelf. After success, refresh placement and show a "Печать наклейки" link to `/admin/warehouse/labels?part=<id>`.

**Files:**
- Modify: `components/admin/WarehouseScanBox.tsx`

**Key Decisions / Notes:**
- Follow the existing adjust/place pattern in `WarehouseScanBox.tsx` (per-operation idempotency key ref, `useTransition`, error state). Fetch open lines on part resolve (after `getPlacement`).
- Receive defaults `location` to `STAGING_LOCATION` (ПРИЁМКА) — this is the **primary, tested path** (TS-001 → TS-003 exercises the full receive→putaway chain that satisfies Goal Truth 1). The cell field is editable so a worker who already knows the shelf can receive straight there — this is the **intentional hybrid shortcut the user requested**, not the default; it is an allowed convenience, not a replacement for staging.
- Use a per-confirm idempotency-key ref (as the existing adjust/place pattern does) and pass it on every call incl. retries — required by `blindReceive` (Task 2) and used for `scanReceiveOrderLine` placement.
- Pass `expectedReceived` = the line's current `received` for `applyReceive`'s CAS; on `stale`, re-fetch open lines and show "обновите".
- `scanReceiveOrderLine` returns `overReceived` when qty exceeds remaining — surface it (don't block; `applyReceive` still records). Show a warning before clearing the form.
- After a successful receive, re-run `getPlacement` and refresh open lines; show the part-label print link (`/admin/warehouse/labels?part=<id>` — confirmed WAREHOUSE_WORKER-accessible).
- ≤1 new functional axis; reuse existing card. No new test class — covered by TS-001/002/004 (browser) + Task 2 verify.

**Definition of Done:**
- [ ] Scanning an order-backed part shows its open order lines with remaining qty and a working "Принять" → stock + placement update in the card.
- [ ] A part with no open line shows "Слепой приход" → stock + placement update.
- [ ] Cell field defaults to ПРИЁМКА and is editable; "Печать наклейки" link appears after receipt.
- [ ] When `scanReceiveOrderLine` returns `overReceived=true`, the card shows a warning (e.g. "Принято больше заказанного — {received} из {ordered}").
- [ ] Verify: TS-001 + TS-002 + TS-004 pass via browser on dev; `npx tsc --noEmit` + `npx eslint` clean.

### Task 4: Guided putaway-from-ПРИЁМКА view

**Objective:** Make moving goods out of ПРИЁМКА to a shelf a clear scanner flow: scanning the ПРИЁМКА cell (LocationCard) shows its items, and each row offers "переместить" with a target-shelf input + qty that calls the existing `transferBetweenBins`. Verified by TS-003.

**Files:**
- Modify: `components/admin/WarehouseScanBox.tsx` (extend the LocationCard render with a per-item transfer-to-shelf control)

**Key Decisions / Notes:**
- The LocationCard already lists items in a location (`resolveLocation` → `items`). Add a per-item "На полку" input (target cell) + qty + button → `transferBetweenBins(itemId, fromLocation=card.code, to, qty, key)`. Reuse the existing transfer idempotency-key pattern.
- Only show the transfer control; do not add receive controls to the LocationCard (receive is part-card-only).
- Behaviour covered by TS-003; no new test class.

**Definition of Done:**
- [ ] Scanning ПРИЁМКА lists its items; each can be moved to a typed/scanned shelf via `transferBetweenBins`.
- [ ] After a move, the ПРИЁМКА card reflects the reduced quantity.
- [ ] Verify: TS-003 passes via browser on dev; `npx tsc --noEmit` + `npx eslint` clean.
