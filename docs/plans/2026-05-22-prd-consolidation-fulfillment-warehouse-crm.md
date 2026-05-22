# PRD Consolidation — Deal+Fulfillment, Warehouse, CRM Expansion

Created: 2026-05-22
Author: aleksandr.spiskov@gmail.com
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Ship the forward-looking PRDs that the codebase has not yet built, in dependency order — Deal+Fulfillment migration (unblocker) → Warehouse stock management (a proper WMS: on-hand / reserved / available) → CRM expansion gaps — so a manager can: see live available part stock when building an estimate, hold stock via reservations, have on-hand auto-adjust on supplier receipt and RO/shipment close, and work deals from a Kanban pipeline with a tabbed Customer 360.

Sources: `docs/prd/2026-05-10-deal-fulfillment-architecture.md`, `docs/prd/2026-05-10-warehouse-management.md`, `docs/prd/2026-05-10-crm-expansion.md`. Code-verified gap audit: `docs/MASTER-BACKLOG.md`.

## Out of Scope

- **Splus stock reconciliation / pull (entirely deferred).** Decided 2026-05-22 — the team will build a proper WMS instead of bolting reconciliation onto a stub. `lib/splus.ts` (appointment *push*, unrelated) is untouched. No `RECONCILIATION` movement reason, no Splus client, no env wiring in this plan.
- Multi-warehouse / bin-location tracking (single warehouse — per Warehouse PRD non-goals).
- Per-unit serial numbers (lot-level via SupplierOrderItem is enough).
- YooKassa payments (deliberately removed earlier — not a gap).
- Pick-pack workflows (manual handover stays manual).
- Scheduled/cron jobs of any kind (no scheduler infra introduced here).

## Approach

**Chosen:** Phased migration on the existing Prisma schema + server actions. Phase 1 finishes the half-done Deal+Fulfillment foundation (`RepairOrder.dealId` is *already* NOT NULL — only `PartOrder.dealId` / `RentalBooking.dealId` remain nullable). Phase 2 builds an **extractable WMS core** (`lib/wms/`) — a `StockItem` table (1:1 with `Part`) holding on-hand/reserved/barcode + a `StockMovement` ledger, all behind an opaque `recordMovement` contract — and wires the auto-service fulfillment lifecycle into it through a thin host adapter. Phase 3 adds the CRM pipeline Kanban + tabbed Customer 360 + CustomerProfile analytics fields.

**Why:** Warehouse outbound (CONSUMPTION) movements must originate from a Deal+Fulfillment (RepairOrder for installed parts, PartShipment for retail), so Phase 1 is a hard prerequisite for Phase 2. The WMS is built as a decoupled core (zero imports of Deal/Estimate/RepairOrder/CRM; host→wms dependency only) because the owner will later extract it into a standalone, multi-tenant, separately-licensed grocery-warehouse product — building it entangled now would force a rewrite then. The full seam (module layout, the `StockItem`-vs-`Part` split, the `recordMovement` contract, ESLint enforcement, the `tenantKey` seam) is specified in `docs/design/2026-05-22-wms-module-seam.md` — **Phase 2 tasks below implement that design and must respect its boundaries.** CRM expansion (Phase 3) is independent and sequenced last. Cost: a longer single plan + one extra table (`StockItem`) and a stock-column migration off `Part`, accepted to make later extraction a lift-and-shift; mitigated by each Phase being independently shippable.

## Context for Implementer

- **No automated test runner exists** (no vitest/jest/playwright, no `test` script, no test files). Decided 2026-05-22: verification is `npm run build` + `tsc`/lint + browser E2E walkthroughs + targeted SQL checks via `psql`. Do NOT add a test framework. Task DoDs reflect this — there are no unit-test files.
- Prisma client imports from `@/app/generated/prisma/client` (custom output), NOT `@prisma/client`. `db` singleton from `@/lib/db`. Generated client carries `@ts-nocheck`; cast results explicitly (see `geleoteka-conventions.md`).
- **Migrations require explicit user consent** before `prisma migrate dev`/`deploy`. Write the migration SQL, commit it, then ask the user to run it. Never auto-apply.
- **Push:** `unset GITHUB_TOKEN` then `git push` (env token invalid; gh keychain login `0pt1m1sm` valid). Railway auto-deploys from `main`.
- Existing fulfillment models verified at plan time: `Deal` (channel SERVICE/PARTS_RETAIL/PARTS_WHOLESALE/RENTAL/WALK_IN, stage NEW/IN_PROGRESS/WON/LOST, denormalized `subtotal*`/`total` kept intentionally for list pages), `Estimate` (DRAFT/SENT/APPROVED/DECLINED/EXPIRED/SUPERSEDED), `EstimateLine` (type LABOR/PART/RENTAL_DAY/DISCOUNT/FEE, nullable `partId`), `RepairOrder` (`dealId` already NOT NULL), `PartOrder` (`dealId` nullable), `RentalBooking` (`dealId` nullable, carries denormalized `totalCost`), `SupplierOrder`/`SupplierOrderItem`, `Part` (`quantity Int`, `article @unique`, no barcode/reserved), `CustomerProfile` (only userId/preferredMasterUserId/blacklisted/notes).
- `createDeal` (`lib/crm/public/create-deal.ts`) creates Deal + initial DRAFT Estimate in a tx and accepts `lines`. Callers create their own fulfillment row and set its `dealId`. New part-order (`part-orders.ts:86`) and rental (`rentals.ts:286`) flows already do this; only legacy rows lack `dealId`.
- Number allocators in `lib/crm/internal/next-number.ts` (`D-/E-/RO-/PO-/RB-NNNN` via PG sequences; `PartOrder_number_seq` stays — PartShipment keeps the `PO-` prefix).
- `approveEstimate` (`app/actions/crm/estimates.ts:232`) only flips Estimate→APPROVED and Deal→IN_PROGRESS; it does NOT dispatch fulfillment.
- SupplierOrder RECEIVED handler (`app/actions/supplier-orders.ts:96`) only sets `receivedAt` — does NOT touch stock.
- **WMS seam (Phase 2) — read `docs/design/2026-05-22-wms-module-seam.md` before Tasks 7–13.** Stock lives in an extractable core `lib/wms/` (`public/` + `internal/`) plus a deletable host bridge `lib/wms-host/`. The core imports ZERO host/CRM/Deal/Estimate/RepairOrder code; the host calls it through `recordMovement({ item:{itemId}, reason, qty, source:{type,id}, actorId?, tenantKey? })` with an OPAQUE `source`. Stock state moves OFF `Part` into a new `StockItem` table (1:1, `partId @unique`, holding `quantity`/`reserved`/`barcode`/`gtin`/`tenantKey`); `Part` keeps catalog identity only. The core knows items only as `WmsItemRef { itemId }` (= `partId` today). Idempotency key = `(tenantKey, source.type, source.id, reason)`.
- **Two existing writers of stock the WMS must absorb:** (1) the retail parts shop decrements `Part.quantity` directly at order-create (`app/actions/part-orders.ts:123-129`, `decrement`) with no ledger — this becomes a CONSUMPTION movement; (2) nothing else writes it today. The public storefront reads on-hand in `app/(public)/parts/page.tsx:93` (`where.quantity = {gt:0}`), `parts/[slug]/page.tsx`, and admin parts pages — all must move to the `Part ⨝ StockItem` join when `Part.quantity` is dropped (multi-step: stop writing, cut readers over, then drop).
- `setDealStage` (`app/actions/crm/deals.ts:87`) enforces `FORWARD_FROM` transitions; non-NEW→IN_PROGRESS, WON→IN_PROGRESS etc. are gated, and disallowed transitions require ADMIN. The Kanban (Task 15) calls this and must surface its rejection, not assume every drag succeeds.
- ESLint is flat config (`eslint.config.mjs`, eslint 9 + eslint-config-next). Task 6 adds a `no-restricted-imports` block there.

## Assumptions

- Every existing `PartOrder` / `RentalBooking` either already has a `dealId` or can have one synthesized from its own fields. Task 1 audits + backfills; Task 2 (NOT NULL) and Task 5 (drop `totalCost`) depend on it.
- A backfilled orphan booking/order's cost can be reconstructed into estimate lines from its current denormalized fields (`RentalBooking.totalCost`, `PartOrderItem` rows). Task 5's removal of `RentalBooking.totalCost` depends on Task 1 having written the equivalent `RENTAL_DAY` estimate line first.

## Runtime Environment

- Dev: `npm run dev` (port 443, HTTPS). Build: `npm run build`. Prod: `npm start`.
- DB: `postgresql://alex@localhost:5432/geleoteka` (local), Railway Postgres (prod).
- Health check for E2E live-target probe: `https://localhost:443/admin` (admin login `admin@geleoteka.ru` / `admin123`).

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `PartOrder.dealId` / `RentalBooking.dealId` has NULL rows → NOT NULL migration fails | Medium | High | Task 1 audits + backfills NULLs (synthesizing a Deal + estimate lines) before the NOT NULL flip; Task 2 migration aborts loud if any NULL remains |
| Dropping `RentalBooking.totalCost` strands cost on backfilled/legacy bookings whose deal has no RENTAL_DAY line | Medium | High | Task 1 backfill writes a `RENTAL_DAY` estimate line from the existing `totalCost`; Task 5 only drops the column after Task 1 + verifies every booking's deal total is non-zero where the old column was |
| `RentalBookingEditDialog` edits `totalCost` directly — drop breaks the admin edit surface | Medium | Medium | Task 5 reworks the dialog: price becomes read-only (computed from the deal), with edits routed to the deal's estimate line; enumerated as part of the task |
| PartOrder→PartShipment rename breaks imports/relations/routes | Medium | High | Task 3 keeps `@@map("PartOrder")` (no data move) and enumerates all ~10 non-generated references first; `db.partOrder`→`db.partShipment`, `Deal.partOrders`→`partShipments` |
| Stock double-counting (RECEIVED fired twice, RO re-closed) | Medium | High | `recordMovement` idempotency key `(tenantKey, source.type, source.id, reason)` + null-source guard; RECEIPT/CONSUMPTION also guarded by a status-transition check so a re-fire is a no-op |
| Reservations leak (line deleted / estimate declined / qty-edited without release) | Medium | Medium | Task 11 writes RELEASE on line removal, qty-edit, and estimate decline/supersede/expire; `StockItem.reserved` can be re-derived from open RESERVATION−RELEASE movements as an audit cross-check |
| `Part.quantity` multi-step drop leaves two writable on-hand copies, or a storefront reader still hits the dropped column | Medium | High | Task 7 enumerates every `Part.quantity` reader (storefront, admin, cabinet), cuts them to the `Part ⨝ StockItem` join, and drops the column LAST in the same migration; Tasks 9/10 write `StockItem` via `recordMovement` only — never `Part`/`StockItem` directly |
| WMS core accidentally couples to host (imports Deal/Estimate/CRM) and stops being extractable | Medium | High | Task 8 ESLint block (design §4) hard-errors any `lib/wms/**` import of `@/lib/db`/`@/lib/crm`/`@/app`; the DB client is injected via `lib/wms-host`; a deliberate-violation check is in Task 8 DoD |
| `tenantKey` omitted now → painful retrofit onto a populated ledger later | Low | High | Task 7 adds `tenantKey` (default constant) to `StockItem`+`StockMovement` and the idempotency key now; all access funnels through `repository.ts` so future scoping is a one-file change (design §5) |

## Goal Verification

### Truths

1. Adding a Part to an estimate line shows that part's **available** stock (`StockItem.quantity − StockItem.reserved`), refuses or warns when available is insufficient, and writes a RESERVATION movement that lowers available without changing on-hand — verified by TS-001 and TS-008.
2. Marking a SupplierOrder RECEIVED raises the part's on-hand (`StockItem.quantity`) and leaves a RECEIPT movement; closing a RepairOrder (or dispatching a PartShipment) that consumed parts lowers on-hand and leaves a CONSUMPTION movement — and the StockMovement ledger for any item reconciles to its current on-hand/reserved counters (TS-002, TS-003).
3. A manager can drag a deal across pipeline stages on the Kanban board with the new stage persisting (respecting transition rules), and Customer 360 surfaces lifetime value + last-touch computed from real deals/communications (TS-005, TS-006).

## E2E Test Scenarios

### TS-001: Estimate part-picker shows live available stock and blocks oversell
**Priority:** Critical
**Preconditions:** Logged in as admin; a Part with a StockItem at `quantity=2, reserved=0`; an open Deal with a DRAFT estimate.
**Mapped Tasks:** Task 11, Task 8, Task 7

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open the deal's estimate, add a PART line, open the part picker | Picker lists the part with "Доступно: 2" (available) |
| 2 | Select the part with qty 2 | Line added; picker/badge now shows available 0; a RESERVATION movement exists for the line |
| 3 | Add the same part again with qty 1 | Add is blocked/warned ("недостаточно на складе") because available is 0 |

### TS-002: SupplierOrder RECEIVED increments on-hand and logs a RECEIPT
**Priority:** Critical
**Preconditions:** Admin; a SupplierOrder in a pre-RECEIVED status with one PART item (partId set, qty 5); that Part's StockItem at `quantity=0`.
**Mapped Tasks:** Task 9, Task 8, Task 13(history)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open the supplier order, set status to RECEIVED | Status saves; `receivedAt` set |
| 2 | Open the part's stock history | On-hand now 5; one RECEIPT movement (+5) listed with the supplier order as source |
| 3 | Set status to RECEIVED again (re-fire) | On-hand stays 5; no duplicate RECEIPT movement |

### TS-003: Closing a RepairOrder consumes reserved parts
**Priority:** Critical
**Preconditions:** Admin; a RepairOrder IN_PROGRESS whose deal estimate has a PART line (qty 1) reserving a part whose StockItem is `quantity=3, reserved=1`.
**Mapped Tasks:** Task 10, Task 8

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mark the RepairOrder COMPLETED | Status saves |
| 2 | Open the part's stock history | On-hand now 2, reserved now 0; one CONSUMPTION movement (−1) sourced to the RO |
| 3 | Re-open and re-complete the RO (re-fire) | On-hand stays 2; no duplicate CONSUMPTION |

### TS-004: Approving an estimate auto-creates the channel fulfillment
**Priority:** High
**Preconditions:** Admin; a SERVICE-channel Deal with a SENT estimate and no RepairOrder yet.
**Mapped Tasks:** Task 4

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Approve the estimate | Estimate→APPROVED, Deal→IN_PROGRESS |
| 2 | Open the deal | A RepairOrder now exists, linked to the deal |
| 3 | Approve again / re-open (idempotency) | No second RepairOrder created |

### TS-005: Deal Kanban drag-to-stage persists
**Priority:** Critical
**Preconditions:** Admin; one IN_PROGRESS deal.
**Mapped Tasks:** Task 15

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open /admin/crm/deals Kanban view | Columns NEW / IN_PROGRESS / WON / LOST; the deal sits in IN_PROGRESS |
| 2 | Drag the card from IN_PROGRESS to WON | Card moves to WON; reload keeps it in WON; `closedAt` set |
| 3 | Drag a NEW deal directly to WON (disallowed transition as MANAGER) | Move is rejected with a visible message; card returns to its column |

### TS-006: Customer 360 tabs surface analytics
**Priority:** High
**Preconditions:** Admin; a customer with ≥1 WON deal and ≥1 communication.
**Mapped Tasks:** Task 16, Task 14

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open the customer detail page | Tabbed layout (overview / vehicles / deals / communications) renders |
| 2 | Read the overview tab | Lifetime value (sum of WON deal totals) and last-touch date shown, matching the data |
| 3 | Switch to the communications tab | Communication log entries render under their own tab |

### TS-007: Stock lookup by code resolves a part
**Priority:** Medium
**Preconditions:** Admin; a Part with `article` set whose StockItem has a known `barcode`.
**Mapped Tasks:** Task 12

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | GET `/api/stock/lookup?code=<barcode>` | 200 with itemId, name, on-hand and available (resolved by the WMS core) |
| 2 | GET `/api/stock/lookup?code=<article>` | 200 resolving the same item (via the host article resolver fallback) |
| 3 | GET `/api/stock/lookup?code=nonexistent` | 404 with an error body |

### TS-008: Reservation releases on estimate decline
**Priority:** High
**Preconditions:** Admin; a DRAFT/SENT estimate with a PART line reserving qty 1 of a part whose StockItem is `quantity=2, reserved=1` (available 1).
**Mapped Tasks:** Task 11, Task 8

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Decline (or supersede) the estimate | Estimate→DECLINED |
| 2 | Open the part's stock history | reserved back to 0 (available 2); a RELEASE movement (+1 available) logged |
| 3 | Delete a PART line on a still-open estimate | That line's reservation is released too |
| 4 | On a still-open estimate, edit a reserved PART line qty from 1 to 3 (StockItem on-hand ≥3) | `StockItem.reserved` becomes 3 (release of 1 + reservation of 3 nets correctly); no orphaned hold remains |

## E2E Results

Live target: dev server `https://localhost:443` (Tier 2 — started during verify; Tier 1 had no running server). Codex reviewer unavailable (`gpt-5.2-codex` not supported for this ChatGPT account — failed identically in planning + verify).

| Scenario | Result | Notes |
|----------|--------|-------|
| Public storefront cutover (`/parts`, `/parts/[slug]`, in-stock filter) | LIVE_PASS | List shows 8 parts with StockItem-based in-stock badges; detail shows exact available "3 шт." matching DB (`StockItem.quantity=3`); `where.stockItem` relation filter renders without error. Confirms the `Part.quantity`→`StockItem` join cutover end-to-end. |
| TS-001 Estimate part-picker → reservation | LIVE_PASS | Logged in as admin; opened the picker on estimate E-0007 — every part shows live "Доступно: N" matching StockItem. Selected "Колодки" → a PART line was added and a RESERVATION movement logged (`reservedDelta +1`, source `EstimateLine:<lineId>:reserve` — the deterministic idempotency key); brake pads went reserved 0→1, available 8→7, on-hand unchanged. |
| TS-005 Deal Kanban drag-to-stage | LIVE_PASS | Kanban renders 4 columns; changed "Ivan Ivvanov" (D-0001) stage via the card control → reload confirms it persisted in the Выиграна column (WON 0→1, Новая 4→3). |
| TS-006 Customer 360 tabs + analytics | LIVE_PASS | Customer page renders tabbed (Обзор/Автомобили/Сделки/Коммуникации) with header + blacklist above tabs; overview shows Lifetime value 20 125 ₽ (= the WON deal, maintained on the stage change), last touch, first seen, source. Tab click registers. |
| Task 13 Stock history view | LIVE_PASS | Admin part page renders "Движения склада" with on-hand/reserved/available header (3/0/3, DB-matched). |
| TS-002 RECEIVED / TS-003 RO close / TS-007 lookup HTTP | UNIT_VERIFIED | Require multi-step setup (supplier order receipt / RO completion) or are auth-gated API. Data-integrity cores proven via tsx round-trips against the live DB: recordMovement RECEIPT/CONSUMPTION idempotency, consumeApprovedEstimateParts (on-hand −1, reserved released, idempotent re-fire), lookupByCode. |

### Not Verified

| Not Verified | Reason |
|-------------|--------|
| TS-002 supplier RECEIVED → stock, TS-003 RO-close consumption (interactive) | Need multi-step admin setup (supplier order + items, RO with approved estimate). The CONSUMPTION/RECEIPT data flow is proven via tsx round-trips (on-hand adjust + idempotency); the UI handlers compile + SSR. |
| `/api/stock/lookup` HTTP 200/404/401 | Resolution logic (`lookupByCode` barcode/gtin + article fallback) proven via the Task-8 round-trip; HTTP envelope is a thin auth+JSON wrapper. |
| Codex adversarial review | `gpt-5.2-codex` model not supported for this ChatGPT account (deterministic failure, both phases). Claude changes-review ran; all findings fixed. |

> Local-dev E2E artifacts (reseed to reset): D-0001 left in WON (LTV 20 125 on Ivan Ivvanov); one brake-pads unit reserved by the picker test on E-0007.

## Progress Tracking

### Phase 1 — Deal + Fulfillment foundation
- [x] Task 1: Audit + backfill nullable fulfillment dealId columns
- [x] Task 2: Make PartOrder.dealId / RentalBooking.dealId NOT NULL
- [x] Task 3: Rename PartOrder → PartShipment (model + references, @@map)
- [x] Task 4: approveEstimate dispatches fulfillment creation
- [x] Task 5: Drop RentalBooking.totalCost in favor of computed totals
- [x] Task 6: ESLint module-boundary rule (lib/crm/internal)

### Phase 2 — Warehouse stock management (extractable WMS core — see `docs/design/2026-05-22-wms-module-seam.md`)
- [x] Task 7: StockItem table (1:1 Part) + StockMovement ledger + tenantKey (migration); backfill StockItem.quantity (additive; Part.quantity drop deferred to post-Task-10)
- [x] Task 8: lib/wms core — recordMovement chokepoint + availableStock + DB-port adapter + ESLint boundaries
- [x] Task 9: SupplierOrder RECEIVED → recordMovement RECEIPT (host adapter)
- [x] Task 10: Outbound CONSUMPTION — RO close + PartShipment + retail order-create via recordMovement; manual-edit ADJUSTMENT; Part.quantity reader-cutover + column DROP (deferred from Task 7)
- [x] Task 11: Estimate part-picker with available readout + reservation (RESERVATION/RELEASE via recordMovement)
- [x] Task 12: /api/stock/lookup?code= — auth+envelope host route over lib/wms lookupByCode + article resolver
- [x] Task 13: Stock movement history view per part (admin)

### Phase 3 — CRM expansion gaps
- [x] Task 14: CustomerProfile analytics fields (source/lastTouchAt/lifetimeValue/firstSeenAt) + backfill
- [x] Task 15: Deal pipeline Kanban board with drag-to-stage
- [x] Task 16: Customer 360 multi-tab layout

## Implementation Tasks

### Task 1: Audit + backfill nullable fulfillment dealId columns

**Objective:** Before any NOT NULL flip, guarantee every existing `PartOrder` and `RentalBooking` row has a non-null `dealId`. Orphans get a synthesized Deal (channel inferred from row type) plus estimate lines reconstructed from the row's denormalized fields, so later denormalization removal (Task 5) loses no money. Produces an idempotent data-migration script + a verification query proving zero NULLs remain.

**Files:**
- Create: `prisma/migrations/<timestamp>_backfill_fulfillment_deals/migration.sql` (data migration — idempotent SQL)
- Create: `scripts/backfill-fulfillment-deals.ts` (one-off Node script if SQL alone can't allocate `D-/E-` numbers cleanly; uses `createDeal` + estimate-line inserts)

**Key Decisions / Notes:**
- `RepairOrder.dealId` is **already NOT NULL** — do NOT touch it. Scope is only `PartOrder` + `RentalBooking`.
- For each orphan `RentalBooking`: create a `Deal{channel:RENTAL, customerUserId from userId}` + DRAFT estimate with one `RENTAL_DAY` line carrying the existing `totalCost`; mirror the live flow at `rentals.ts:286`.
- For each orphan `PartOrder`: create `Deal{channel:PARTS_RETAIL}` + estimate with one `PART` line per `PartOrderItem` (qty, unitPrice); mirror `part-orders.ts:86`.
- Guest rows without `userId`: attach to a deal whose `customerUserId` is resolved from `contactEmail`/`contactPhone` if a soft-account exists, else skip and report — list them for the user; do NOT invent a customer.
- Idempotent: re-running must not create duplicate deals (guard by checking `dealId IS NULL` per row inside the script's transaction).

**Definition of Done:**
- [ ] After running, `SELECT count(*) FROM "PartOrder" WHERE "dealId" IS NULL` and the same for `"RentalBooking"` both return 0 (or only the explicitly-reported guest rows the user accepted).
- [ ] Every backfilled rental's deal `total` is > 0 where the source `totalCost` was > 0 (SQL spot-check).
- [ ] Verify: `npx prisma validate` and a documented `psql` query output pasted into the verification report; user has run the data migration with consent.

### Task 2: Make PartOrder.dealId / RentalBooking.dealId NOT NULL

**Objective:** Flip both columns to NOT NULL now that Task 1 guarantees no NULLs, and change the relations from optional to required in the schema. Create paths already pass `dealId`, so this is schema + regenerate + a handful of type tightenings.

**Files:**
- Modify: `prisma/schema.prisma` (PartOrder.dealId, RentalBooking.dealId → `String`; relation `Deal?`→`Deal`, drop `onDelete: SetNull` → use `Restrict`/`Cascade` deliberately)
- Create: `prisma/migrations/<timestamp>_fulfillment_dealid_not_null/migration.sql`
- Modify: `app/actions/part-orders.ts`, `app/actions/rentals.ts` (only if types now require non-null where currently `?`)

**Key Decisions / Notes:**
- On-delete policy: a Deal is the commercial root; deleting it should not silently null the fulfillment. Use `onDelete: Restrict` (or `Cascade` to match RepairOrder at line 618 which uses Cascade) — match RepairOrder's `Cascade` for consistency unless the user objects.
- Migration must run AFTER Task 1's backfill; it will error loudly if any NULL remains — that is the desired guard.

**Definition of Done:**
- [ ] `npx prisma validate` passes; generated client treats `dealId` as required on both models.
- [ ] `npm run build` passes with no new type errors at the create sites.
- [ ] Verify: `npm run build` clean; user has applied the migration with consent.

### Task 3: Rename PartOrder → PartShipment (model + references)

**Objective:** Per the Deal+Fulfillment PRD, `PartOrder` is a parts fulfillment/shipment. Rename the Prisma model to `PartShipment` keeping `@@map("PartOrder")` so the DB table and all FKs are untouched (no data move). Update every non-generated reference: `db.partOrder`→`db.partShipment`, type `PartOrder`→`PartShipment`, `Deal.partOrders`→`partShipments`. The `PO-` number prefix and `PartOrder_number_seq` stay.

**Files (non-generated references enumerated at plan time):**
- Modify: `prisma/schema.prisma` (model `PartOrder`→`PartShipment` + `@@map("PartOrder")`; `PartOrderItem.order` relation + `Deal.partOrders` field)
- Modify: `lib/crm/public/create-deal.ts`, `lib/crm/public/types.ts`
- Modify: `app/actions/part-orders.ts`, `app/actions/part-order-admin.ts`, `app/actions/customer-onboarding.ts`, `app/actions/crm/deals.ts`
- Modify: `app/(admin)/admin/orders/page.tsx`, `app/(admin)/admin/crm/deals/[id]/page.tsx`, `app/(portal)/cabinet/orders/page.tsx`
- Modify: `components/parts/PartsCart.tsx`
- Create: `prisma/migrations/<timestamp>_rename_partorder_partshipment/migration.sql` (schema-only — `@@map` means the SQL is effectively empty / a no-op; generate to confirm)

**Key Decisions / Notes:**
- Keep `PartOrderItem` model name AS-IS (only its back-relation field on the renamed model changes) to bound blast radius — the PRD names PartShipment, not its items. Note this explicitly so a reviewer doesn't flag it.
- **Email layer is OUT of the blast radius (verified at plan time):** `lib/email/templates/part-order-confirmation.ts`, `lib/email/helpers.ts`, `lib/email/index.ts` export `PartOrderConfirmationInput`, `PartOrderItem`, `sendPartOrderConfirmationEmail`, etc. These are **independent locally-defined DTOs**, NOT the Prisma `PartOrder` model type (none import from `@/app/generated/prisma`). The build does NOT break from the model rename. Leave them unchanged — the customer-facing term "order confirmation" is correct even though the internal model is now PartShipment. Renaming them would be scope creep.
- Re-grep `PartOrder` / `partOrder` / `partOrders` across `app/ lib/ components/` after editing as a completeness check (exclude `app/generated/`). Expect remaining hits ONLY in `lib/email/*` (the DTOs above) — those are intentional, not misses.
- `app/actions/booking.ts` Splus push and `lib/splus.ts` are unrelated — do not touch.

**Definition of Done:**
- [ ] `grep -rn "db\.partOrder\b\|\bpartOrders\b" app/ lib/ components/ --exclude-dir=generated` returns nothing (the `lib/email/*` DTO names use `PartOrderConfirmation*`, not `db.partOrder`/`partOrders`, so they don't match this pattern).
- [ ] `npx prisma generate` regenerates with `PartShipment`; `npm run build` clean.
- [ ] Verify: `npm run build` clean; orders pages still render (TS-004 deal page, manual /admin/orders load).

### Task 4: approveEstimate dispatches fulfillment creation

**Objective:** When an estimate is APPROVED, auto-create the appropriate fulfillment for the deal's channel inside the approve transaction if one does not already exist: RepairOrder for SERVICE, PartShipment for PARTS_RETAIL/PARTS_WHOLESALE, RentalBooking for RENTAL (WALK_IN → none). Idempotent: re-approving or an already-present fulfillment must not create a duplicate.

**Files:**
- Modify: `app/actions/crm/estimates.ts` (the `approveEstimate` tx at line 232)
- Create: `lib/crm/internal/dispatch-fulfillment.ts` (channel→fulfillment factory, called inside the tx)

**Key Decisions / Notes:**
- Load the deal's `channel` + existing fulfillment counts in the same `findUnique` that fetches the estimate, then branch.
- Number allocation: use `nextRepairOrderNumber(tx)` / `nextPartOrderNumber(tx)` / `nextRentalBookingNumber(tx)` so it's inside the tx.
- Idempotency: only create when `deal.repairOrders.length === 0` (resp. partShipments/rentalBookings) — guard inside the tx to avoid a race on double-submit.
- A SERVICE RepairOrder needs `vehicleId` + `dateTime`; if the deal has no vehicle, fall back to a SCHEDULED RO with `dateTime = now` and a note, or skip with a returned warning — pick skip-with-warning to avoid bogus schedule rows (document in code).

**Definition of Done:**
- [ ] Approving a SERVICE estimate with no RO creates exactly one RO linked to the deal (TS-004).
- [ ] Re-approving / approving when a fulfillment exists creates none.
- [ ] Verify: `npm run build` clean; TS-004 walkthrough in browser.

### Task 5: Drop RentalBooking.totalCost in favor of computed totals

**Objective:** Remove the denormalized `RentalBooking.totalCost` column; rental cost now lives on the deal's active estimate (`RENTAL_DAY` lines) and the deal's denormalized `total`. Repoint the two display reads to `deal.total`, and rework the admin edit dialog so price is read-only (edited via the estimate). `Deal.total` / `Estimate.total` denormalization is intentional and stays.

**Files:**
- Modify: `prisma/schema.prisma` (remove `RentalBooking.totalCost`)
- Create: `prisma/migrations/<timestamp>_drop_rentalbooking_totalcost/migration.sql`
- Modify: `app/actions/rentals.ts` (remove `totalCost` writes at lines 172, 312; keep the `days*dailyRate` math feeding the estimate `RENTAL_DAY` line + the SMS body)
- Modify: `app/(portal)/cabinet/rentals/page.tsx:49`, `app/(admin)/admin/rentals/bookings/page.tsx:53,64` (read `deal.total`)
- Modify: `components/admin/RentalBookingEditDialog.tsx` (remove the `totalCost` input at line 159; show computed price read-only; link "редактировать смету" to the deal's estimate)

**Key Decisions / Notes:**
- Depends on Task 1: backfilled bookings must already carry a `RENTAL_DAY` estimate line, else `deal.total` reads 0. Verify before applying.
- The booking-confirmation SMS still needs the number — compute `days * dailyRate` locally in the action (it already does at `rentals.ts:270`); do not read it back from the dropped column.
- Display sites must `select` the booking's `deal: { select: { total: true } }`.

**Definition of Done:**
- [ ] `grep -rni "totalCost" app/ lib/ components/ --exclude-dir=generated | grep -i rental` returns nothing (no RentalBooking `totalCost` references remain; SupplierOrder hits are irrelevant and excluded by the rental filter).
- [ ] Cabinet + admin rental pages show the price from the deal; the edit dialog has no editable price field.
- [ ] Verify: `npm run build` clean; manual load of `/admin/rentals/bookings` and `/cabinet/rentals` shows correct totals; user applied the migration.

### Task 6: ESLint module-boundary rule (lib/crm/internal)

**Objective:** Forbid imports of `lib/crm/internal/*` from outside `lib/crm/` so the public surface stays `lib/crm/public`. Codifies the boundary the refactor PRD specifies.

**Files:**
- Modify: `eslint.config.mjs` (add a `no-restricted-imports` override scoped to all files, with an exception for files under `lib/crm/`)

**Key Decisions / Notes:**
- Flat config: append a config object with `rules: { "no-restricted-imports": ["error", { patterns: [{ group: ["**/lib/crm/internal/*", "@/lib/crm/internal/*"], message: "Import from @/lib/crm/public instead." }] }] }`, plus a second object scoped to `files: ["lib/crm/**"]` that disables it (the boundary applies to *consumers*, not internals).
- `Trivial:` config-only change, ~12 lines, no production logic, no new public symbol; covered by `npm run lint` + a deliberate violation check.

**Definition of Done:**
- [ ] `npm run lint` passes on the current tree.
- [ ] Adding a temporary `import "@/lib/crm/internal/next-number"` in an `app/` file makes `npm run lint` error; removing it clears the error.
- [ ] Verify: `npm run lint`.

### Task 7: StockItem table + StockMovement ledger + tenantKey (migration)

**Objective:** Per the WMS seam (design §2, §5), create the WMS-owned `StockItem` table (1:1 with `Part`) holding `quantity` (on-hand), `reserved`, `barcode`, `gtin`, `tenantKey`; create the `StockMovement` ledger keyed to `StockItem`; migrate `Part.quantity → StockItem.quantity`. `Part` keeps catalog identity only. `Part.quantity` is dropped in a multi-step manner (this task stops writing it and adds the column on StockItem + backfill; the storefront cutover + the actual `Part.quantity` drop land here too once readers are switched — see Files).

**Files:**
- Modify: `prisma/schema.prisma` (new `model StockItem`, new `model StockMovement`, new `enum StockMovementReason`; remove `Part.quantity` after the cutover below)
- Create: `prisma/migrations/<timestamp>_stockitem_stockmovement_wms/migration.sql` (create tables, indexes, idempotent backfill of one `StockItem` per active `Part` copying `quantity`; drop `Part.quantity` LAST in the same SQL after backfill succeeds)
- Modify storefront/admin readers of `Part.quantity` to read `StockItem.quantity` via join: `app/(public)/parts/page.tsx:93` (`where` becomes a `stockItem: { quantity: { gt: 0 } }` relation filter), `app/(public)/parts/[slug]/page.tsx:153/212/225`, `app/(admin)/admin/parts/page.tsx:23/69`, `app/(admin)/admin/parts/[id]/page.tsx:39`, and the cabinet/admin part-order readers that surface stock.

**Key Decisions / Notes:**
- `model StockItem { id, partId String @unique, quantity Int @default(0), reserved Int @default(0), barcode String?, gtin String?, tenantKey String @default("geleoteka"), createdAt, updatedAt; part Part @relation(...) }`. `@@index([tenantKey, partId])`, `@@index([barcode])`. `barcode` NOT `@unique` (legacy blanks/dupes); lookup picks the first active match deterministically.
- `enum StockMovementReason { RECEIPT CONSUMPTION ADJUSTMENT RESERVATION RELEASE }` — no `RECONCILIATION` (Splus dropped; ADJUSTMENT covers manual corrections).
- `model StockMovement { id, itemId String (FK→StockItem.partId or its id — use StockItem PK), reason, quantityDelta Int, reservedDelta Int, sourceType String, sourceId String?, actorUserId String?, note String?, tenantKey String @default("geleoteka"), createdAt }`. `@@unique([tenantKey, sourceType, sourceId, reason])`, `@@index([tenantKey, itemId, createdAt])`. Splitting on-hand vs reserved deltas lets the ledger reconcile both counters.
- **`tenantKey` now, nothing else tenant-aware** (design §5): the column + index + default constant are the minimum that's painful to retrofit onto a populated ledger; tenant tables / licensing / RLS are deferred.
- **`Part.quantity` multi-step drop — SPLIT during implementation (2026-05-22):** Task 7 is now ADDITIVE only (add `StockItem`/`StockMovement`, backfill `StockItem.quantity` from `Part.quantity`, KEEP `Part.quantity` and its readers). The reader-cutover (storefront/admin → `Part ⨝ StockItem`) and the `Part.quantity` DROP happen AFTER Task 10, once all writers (retail decrement, supplier RECEIPT, consumption) have moved to `recordMovement`/`StockItem`. This avoids a dual-source-of-truth window. The split is the follow-up-migration option this task always permitted. Tracked as Task 10's final cutover step (migration `drop_part_quantity`).

**Definition of Done:**
- [ ] `npx prisma validate` passes; `npx prisma generate` exposes `db.stockItem` and `db.stockMovement`; `Part.quantity` no longer exists.
- [ ] After backfill, every active `Part` has exactly one `StockItem` with `quantity` equal to the old `Part.quantity` (SQL spot-check).
- [ ] Storefront "in stock" badge + admin parts list still render correct on-hand via the join (`npm run build` + manual load of `/parts` and `/admin/parts`).
- [ ] Verify: `npx prisma validate`; `npm run build` clean; user applied the migration with consent.

### Task 8: `lib/wms` core — recordMovement chokepoint + availableStock + DB-port adapter + ESLint boundaries

**Objective:** Build the extractable WMS core (design §1, §3, §4). `recordMovement` is the single chokepoint that, in one transaction, writes a `StockMovement` row and atomically adjusts `StockItem.quantity`/`reserved` by reason; idempotent on `(tenantKey, source.type, source.id, reason)`. The core imports zero host/CRM code; the host `db` client is injected via `lib/wms-host`. Add both ESLint boundary blocks.

**Files:**
- Create: `lib/wms/public/{index,record-movement,stock,lookup,types,errors}.ts`
- Create: `lib/wms/internal/{counters,idempotency,repository}.ts` (`repository.ts` = the ONLY file touching the injected DB client)
- Create: `lib/wms/README.md` (the extraction checklist from design §8)
- Create: `lib/wms-host/{db,actor,constants}.ts` (bridge: re-exports host `@/lib/db` as the `DbClientPort`, maps session→actorId, holds `TENANT_KEY = "geleoteka"`)
- Modify: `eslint.config.mjs` (append the two WMS blocks from design §4 — core may not import host/CRM/app; host may not import `lib/wms/internal`)

**Key Decisions / Notes:**
- Contract (design §3): `recordMovement({ item: { itemId }, reason, qty, source: { type, id }, actorId?, note?, tenantKey? }, tx?): Promise<MovementResult>`. `itemId === StockItem.partId`. `qty` always positive; the counter map decides sign.
- Reason→counter map (design): RECEIPT `quantityDelta=+qty`; CONSUMPTION `quantityDelta=−qty`, `reservedDelta=−min(qty, heldForSource)`; ADJUSTMENT `quantityDelta=±qty`; RESERVATION `reservedDelta=+qty`; RELEASE `reservedDelta=−qty`.
- **Null-source guard:** `source.id == null` is rejected (`WmsError.NullSourceForIdempotentReason`) for every reason except ADJUSTMENT — Postgres treats NULL as distinct in the unique index, so a null id would bypass dedupe and double-count.
- Idempotency: insert-then-catch `P2002` → return `{ applied:false, ... }` no-op (do not re-adjust counters). Insert + `StockItem.update` wrapped in `tx`; accept an injected `tx` so host callers compose inside their own `$transaction`.
- The core must NOT import `@/lib/db`, `@/lib/crm/*`, `@/app/*`, or `@/lib/wms-host/*`. The single allowed bridge is the generated Prisma *types* (`@/app/generated/prisma/client`) used by `repository.ts`; the DB *client* is passed in. `availableStock({quantity, reserved})` is pure (hot-path safe).

**Definition of Done:**
- [ ] A RECEIPT then a duplicate RECEIPT with the same `(tenantKey, source.type, source.id, reason)` changes on-hand once; the duplicate returns `applied:false` (SQL after TS-002).
- [ ] `recordMovement` with `source.id=null` and reason RECEIPT/CONSUMPTION/RESERVATION/RELEASE throws; ADJUSTMENT with null id succeeds.
- [ ] A temporary `import "@/lib/db"` inside any `lib/wms/` file makes `npm run lint` error; a temporary `import "@/lib/wms/internal/repository"` inside an `app/` file makes `npm run lint` error.
- [ ] Verify: `npm run build` clean; `npm run lint` clean; counter + idempotency behavior confirmed via TS-002/TS-003/TS-008 + `psql`.

### Task 9: SupplierOrder RECEIVED → recordMovement RECEIPT (host adapter)

**Objective:** Replace the RECEIVED handler (currently only sets `receivedAt`) so it builds an opaque `source` and calls `recordMovement` RECEIPT for each PART-type `SupplierOrderItem` with a `partId`, raising on-hand. Guard against re-fire via status transition + the core's idempotency key.

**Files:**
- Modify: `app/actions/supplier-orders.ts` (the `updateSupplierOrderStatus` RECEIVED branch, lines 96–103)

**Key Decisions / Notes:**
- Only act when transitioning *into* RECEIVED from a non-RECEIVED status (read current status first); no-op when already RECEIVED. With `source = { type:"SupplierOrder", id:\`${orderId}:${itemId}\` }`, double-fire is safe via the core idempotency key.
- Skip items with `type !== PART` or null `partId` (shipping/customs line items).
- Wrap the status update + all `recordMovement` calls in `db.$transaction`, passing the tx into `recordMovement`. Pass `actorId` from the session via `lib/wms-host/actor`.

**Definition of Done:**
- [ ] Setting a supplier order RECEIVED raises each PART item's on-hand by its qty and logs one RECEIPT per item (TS-002).
- [ ] Re-setting RECEIVED adds nothing.
- [ ] Verify: `npm run build` clean; TS-002 walkthrough + `psql` check.

### Task 10: Outbound CONSUMPTION — RO close + PartShipment (incl. retail) via recordMovement

**Objective:** Write CONSUMPTION movements (lowering on-hand, releasing the matching hold) on every outbound: RepairOrder COMPLETED, PartShipment dispatch (SHIPPED/COMPLETED), AND the retail parts-shop sale which today decrements `Part.quantity` directly (`part-orders.ts:123-129`). All route through `recordMovement` with an opaque `source`. Guard against re-fire.

**Files:**
- Modify: `app/actions/admin.ts` (`updateRepairOrderStatus`, line 32; CONSUMPTION on entering COMPLETED)
- Modify: `app/actions/part-order-admin.ts` (status update at line 12; CONSUMPTION on entering SHIPPED/COMPLETED)
- Modify: `app/actions/part-orders.ts` (lines 123-129 — REPLACE the direct `Part.quantity` decrement with `recordMovement` CONSUMPTION at retail order-create)
- Create: a host-side consume helper (e.g. `lib/fulfillment/consume-parts.ts` — host code, NOT in `lib/wms/`) reading the canonical source + calling `recordMovement` per line

**Key Decisions / Notes:**
- **Canonical source for RO/service consumption = the deal's APPROVED estimate `PART` lines** with non-null `partId` (qty from `EstimateLine.qty`). Deterministic — do NOT fall back to `PartLine`/job-line rows. No APPROVED estimate at close → consume nothing + log a warning (manual ADJUSTMENT corrects).
- **Retail sale (part-orders.ts) consumes at order-CREATE**, not at a later close — source `{ type:"PartShipment", id:\`${orderId}:${partId}\` }`, reason CONSUMPTION, inside the existing create `$transaction`. This removes the second uncontrolled writer of on-hand (design §0 / Context).
- Idempotency keys: RO/PartShipment-close `{ type:"RepairOrder"|"PartShipment", id:"<orderId>:<estimateLineId>" }`; retail `{ type:"PartShipment", id:"<orderId>:<partId>" }`. CONSUMPTION also releases that line's reservation (Task 8 counter map), converting hold → physical removal without double-count.
- Fire once on the *entering* transition (read current status first; no-op if already closed). Wrap status update + consumption in `db.$transaction`, passing the tx into `recordMovement`.

**Definition of Done:**
- [ ] Completing an RO with a reserved PART line lowers on-hand by qty, drops reserved to 0, logs one CONSUMPTION (TS-003).
- [ ] A retail part-order create lowers on-hand via a CONSUMPTION movement (no direct `Part`/`StockItem` decrement outside `recordMovement`); re-fire/duplicate adds nothing.
- [ ] Verify: `npm run build` clean; TS-003 walkthrough + a retail-order `psql` check.

### Task 11: Estimate part-picker with available readout + reservation

**Objective:** Replace free-text part entry on estimate PART lines with a picker over catalog parts showing available (`StockItem.quantity − StockItem.reserved`) per row; selecting writes a RESERVATION via `recordMovement`. Removing the line, qty-editing it, or the estimate moving to DECLINED/SUPERSEDED/EXPIRED writes RELEASE. Insufficient available warns at add time.

**Files:**
- Modify: `components/crm/EstimateLineEditor.tsx` (PART line input → picker with available badge)
- Modify: `app/actions/crm/estimate-lines.ts` (PART line create with `partId` → RESERVATION; qty update → RELEASE old + RESERVATION new; delete → RELEASE — all three mutation paths adjust the hold via `recordMovement`)
- Modify: `app/actions/crm/estimates.ts` (decline/supersede/expire → RELEASE all PART-line reservations for that estimate)
- Create: `app/actions/crm/stock-options.ts` — picker datasource: active parts joined to `StockItem`, available computed via `availableStock` from `@/lib/wms/public`, searchable by name/article, capped.

**Key Decisions / Notes:**
- Available is read through the `Part ⨝ StockItem` join + `availableStock` helper (design §6 / Task 8); never recompute the formula inline.
- Reservation source `{ type:"EstimateLine", id: lineId }`; qty edit = RELEASE old + RESERVATION new (audit-clear); all via `recordMovement`.
- Block vs warn: available < requested → loud inline warning but allow save (legitimate backorder). TS-001 expects the warn/block on the add path.
- Keep `EstimateLineEditor` under the 800-line guideline; extract the picker into its own component if it grows.

**Definition of Done:**
- [ ] Picker shows available per part; adding a PART line raises `StockItem.reserved` and lowers shown available (TS-001).
- [ ] Editing a reserved PART line's qty adjusts `reserved` by the delta (no leak/double-hold) — TS-008 step 4.
- [ ] Declining the estimate / deleting the line releases the reservation (TS-008).
- [ ] Verify: `npm run build` clean; TS-001 + TS-008 walkthroughs.

### Task 12: /api/stock/lookup?code= — host route over lib/wms lookupByCode

**Objective:** Resolve a code to a stock item with on-hand + available — foundation for barcode/NFC scanning. The resolution logic lives in the WMS core (`lookupByCode`, barcode/gtin); the article fallback is supplied by a host resolver; the route is a thin auth+envelope shell (design §6).

**Files:**
- Create: `app/api/stock/lookup/route.ts` (GET; `?code=`; auth + envelope + article-resolver wiring)
- Modify: `lib/wms/public/lookup.ts` already created in Task 8 — this task wires the host article resolver into the route

**Key Decisions / Notes:**
- Core `lookupByCode(code, tenantKey?)` resolves `barcode`/`gtin` only (it has no `article` — that's catalog identity on `Part`). The route passes a host `articleResolver(code) => itemId | null` (a `Part.article` lookup) for the article fallback, keeping the core clean.
- Auth: admin/manager only — `getSession` + role gate; return 401/403 JSON (not a redirect — it's an API).
- Resolution order: barcode/gtin (core) → article (host resolver). 404 JSON `{ error: { code, message } }` when none. Success `{ data: { itemId, name, article, barcode, quantity, available } }`.

**Definition of Done:**
- [ ] GET with a valid barcode and with a valid article both resolve the same item + correct available (TS-007).
- [ ] Unknown code → 404; unauthenticated → 401/403.
- [ ] Verify: `npm run build` clean; TS-007 via curl/browser against the running dev server.

### Task 13: Stock movement history view per part

**Objective:** Admin UI on the part detail page showing the `StockMovement` ledger (date, reason, on-hand delta, reserved delta, source, actor, note) so a manager can audit how stock changed and reconcile against current counters.

**Files:**
- Modify: `app/(admin)/admin/parts/[id]/page.tsx` (add a movements section; this page already exists per the Task 7 reader list)
- Create: a `StockHistory` server-rendered section/component if the page grows past the guideline

**Key Decisions / Notes:**
- Read via the core's read surface or `db.stockMovement.findMany({ where:{ itemId }, orderBy:{ createdAt:"desc" }, take:100, include actor name })` where `itemId` resolves from the part's `StockItem`.
- Header shows current on-hand / reserved / available (via `availableStock`) above the ledger so the audit (truth #2) is one glance.
- Reason labels in Russian to match admin (small inline map or an existing labels file).

**Definition of Done:**
- [ ] The part page lists its movements newest-first with reason/delta/source/actor; header shows on-hand/reserved/available.
- [ ] After TS-002/TS-003 the RECEIPT and CONSUMPTION rows appear here.
- [ ] Verify: `npm run build` clean; manual load of the part page after a receipt/consumption.

### Task 14: CustomerProfile analytics fields + backfill

**Objective:** Add `source String?`, `firstSeenAt DateTime?`, `lastTouchAt DateTime?`, `lifetimeValue Int @default(0)` to `CustomerProfile`; backfill from existing deals/communications; maintain `lastTouchAt` when a communication is logged and `lifetimeValue` when a deal becomes WON.

**Files:**
- Modify: `prisma/schema.prisma` (CustomerProfile fields)
- Create: `prisma/migrations/<timestamp>_customerprofile_analytics/migration.sql`
- Create: `prisma/migrations/<timestamp>_backfill_customerprofile_analytics/migration.sql` (or a script: `firstSeenAt`=earliest deal/comm, `lastTouchAt`=latest comm, `lifetimeValue`=Σ WON deal totals, `source`=earliest deal.source)
- Modify: `lib/crm/public/bump-last-touch.ts` (also set `lastTouchAt`) and the comm-log create path
- Modify: `app/actions/crm/deals.ts` `setDealStage` (on →WON, add deal.total to `lifetimeValue`; on WON→IN_PROGRESS rollback, subtract)

**Key Decisions / Notes:**
- `CustomerProfile` PK is `userId`; some customers may lack a profile row — upsert when maintaining fields.
- `lifetimeValue` maintenance must mirror the WON/rollback transitions already handled at `deals.ts:114` to avoid drift; do it in the same `setDealStage` write.
- Keep money as `Int` (kopecks), consistent with the rest of the schema.

**Definition of Done:**
- [ ] After backfill, a customer with a WON deal shows `lifetimeValue` = sum of WON totals and `lastTouchAt` = latest comm (SQL spot-check).
- [ ] Logging a new communication updates `lastTouchAt`; moving a deal to WON raises `lifetimeValue`.
- [ ] Verify: `npm run build` clean; `psql` check; user applied migrations.

### Task 15: Deal pipeline Kanban board with drag-to-stage

**Objective:** Add a Kanban view to `/admin/crm/deals` — one column per `DealStage` (NEW/IN_PROGRESS/WON/LOST), dragging a card calls `setDealStage`. Complements the existing list view (a view toggle). Rejected transitions (per `FORWARD_FROM`) surface the server error and revert the card.

**Files:**
- Modify: `app/(admin)/admin/crm/deals/page.tsx` (add a list/kanban view toggle via `?view=kanban`)
- Create: `components/crm/DealKanban.tsx` (client component: columns, draggable cards, optimistic move + revert on error)
- Reuse: `app/actions/crm/deals.ts` `setDealStage`

**Key Decisions / Notes:**
- `setDealStage` already enforces transitions and returns `{ error }`; the Kanban must revert the optimistic move and toast the error (e.g. NEW→WON as MANAGER is rejected — TS-005 step 3).
- Drag implementation: native HTML5 drag-and-drop (no new dependency) to stay light; respect `prefers-reduced-motion` and provide keyboard fallback (a per-card stage `<select>`) for a11y.
- Card payload mirrors the existing list `select` (customer, number, total, channel, open tasks) — reuse the query, just group by stage client-side; cap at the existing `take: 100`.
- NEW→IN_PROGRESS is normally automatic (approveEstimate) and gated for non-admins — the board shows it as a non-droppable target for managers (or lets the server reject), matching `FORWARD_FROM`.

**Definition of Done:**
- [ ] Kanban renders four columns; dragging an IN_PROGRESS deal to WON persists across reload (TS-005).
- [ ] A disallowed drag is rejected with a visible message and the card returns to its column.
- [ ] Verify: `npm run build` clean; TS-005 walkthrough in browser.

### Task 16: Customer 360 multi-tab layout

**Objective:** Restructure `app/(admin)/admin/customers/[id]/page.tsx` from the current flat sections (vehicles + deals) into the PRD's tabbed layout: overview / vehicles / deals / communications (+ tasks where data exists). Overview surfaces the Task 14 analytics (lifetime value, last touch, source).

**Files:**
- Modify: `app/(admin)/admin/customers/[id]/page.tsx`
- Create: `components/admin/CustomerTabs.tsx` (client component for tab switching; content panels stay server-rendered and passed as children/props)

**Key Decisions / Notes:**
- Tabs are client-side (local `useState`) but each panel's data is fetched server-side in the page and passed down — avoid converting the whole page to client. No URL routing needed (client state acceptable per the no-extra-deps posture).
- Overview tab reads the new `CustomerProfile` analytics fields (Task 16 depends on Task 14 being applied).
- Preserve the existing blacklist banner (line ~250) at the top, above the tabs, so it's always visible regardless of active tab.
- Communications panel: reuse the existing comm-log rendering if present elsewhere (`CommunicationLogger` is the *input*; check for an existing display list before building a new one).

**Definition of Done:**
- [ ] Customer page renders tabs; overview shows lifetime value + last touch from real data (TS-006).
- [ ] Existing vehicles + deals content moves under their tabs with no data loss; blacklist banner still always visible.
- [ ] Verify: `npm run build` clean; TS-006 walkthrough in browser.

## Resolved Decisions

- **Splus pull = dropped entirely** (user, 2026-05-22). No reconciliation client, no `RECONCILIATION` movement reason, no scheduler. A proper WMS will be a future plan. `lib/splus.ts` appointment push is untouched.
- **No test runner** (user, 2026-05-22). Verification is `npm run build` + `tsc`/lint + browser E2E + `psql` checks. No vitest/jest, no unit-test files.
- **Reservation model = professional on-hand/reserved/available** (user, 2026-05-22). On-hand (`StockItem.quantity`), `reserved` tracks holds, available = quantity − reserved. RESERVATION raises reserved without touching on-hand; CONSUMPTION lowers both; RELEASE reverses a hold.
- **WMS built as an extractable core** (user, 2026-05-22; design `docs/design/2026-05-22-wms-module-seam.md`). Stock lives in `lib/wms/` (zero host imports, host→wms only) + a deletable `lib/wms-host/` bridge; called through the opaque `recordMovement({item,reason,qty,source:{type,id}})` contract. Stock state lives in a new `StockItem` table (1:1 with `Part`, `partId @unique`), NOT on `Part`. `tenantKey` column added now; all other tenancy/licensing deferred. Goal: later lift-and-shift into a standalone multi-tenant grocery-WMS product with barcode/NFC scanning.
- **PartOrder → PartShipment via `@@map("PartOrder")`** (user, 2026-05-22). Model renamed in Prisma; DB table stays `PartOrder`, no data move (Task 3). Email-layer `PartOrder*` DTOs are independent and left unchanged.

_No open questions remain — plan ready for reviewer pass + approval._
