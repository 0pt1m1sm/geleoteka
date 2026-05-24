# Warehouse Replenishment / Дозаказ (WMS Phase 5) Implementation Plan

Created: 2026-05-24
Author: aleksandr.spiskov@gmail.com
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** A manager sets per-item reorder points (min trigger + order-up-to) on stock items, opens a "к дозаказу" report listing every item whose net stock (available + incoming) has fallen to/below its trigger with a suggested order quantity, and from that report creates a DRAFT `SupplierOrder` pre-filled with those lines (manager picks the supplier).

## Out of Scope

- **Auto-creating supplier orders without a human.** There is no canonical `Part`→supplier mapping in the schema, so the system cannot decide whom to order from. The report feeds a DRAFT the manager completes (supplier + costs).
- **Per-supplier or per-warehouse reorder policies.** One reorder point pair per `StockItem` (single-tenant `tenantKey="geleoteka"`). Multi-warehouse is Phase 6.
- **Lead-time / consumption-rate forecasting.** Reorder points are manual thresholds, not computed from velocity.

## Approach

**Chosen:** Two nullable columns on `StockItem` (`reorderPoint`, `reorderUpTo`) + a host-side replenishment domain in `lib/warehouse/replenishment.ts` (mirrors `incoming.ts`/`pick.ts`/`pack.ts`), a report page under `/admin/warehouse/replenishment`, and reuse of the existing `createSupplierOrder` via a pre-filled new-order form.
**Why:** Reorder levels are a legitimate per-item WMS attribute and the core reads `StockItem` via explicit `select` clauses, so new columns are non-disruptive and the WMS core stays agnostic (it never reads them); a separate `ReorderPolicy` table would add a join and code for a single min/max pair (YAGNI). Reusing `createSupplierOrder` means zero new order-creation/cost logic.

## Context for Implementer

- **Seam:** `lib/wms` (core) must not learn about reorder points. All replenishment logic lives host-side in `lib/warehouse/replenishment.ts` and `app/actions/replenishment.ts`, reading `StockItem.reorderPoint`/`reorderUpTo` through the host `db`. The fixed default stays in `lib/wms-host` (`LOW_STOCK_THRESHOLD`).
- **Effective semantics (null = "use default"):**
  - `effectiveReorderPoint(item)` = `item.reorderPoint ?? LOW_STOCK_THRESHOLD`
  - `effectiveReorderUpTo(item)` = `item.reorderUpTo ?? effectiveReorderPoint(item)`
  - `net` = `availableStock(item)` + incoming (units owed on open supplier orders, from `incomingByPartIds`).
  - An item is "to reorder" iff `net <= effectiveReorderPoint`. For every included item, `suggestedQty = max(1, effectiveReorderUpTo − net)` — a clamp-to-1, so an item exactly at the point (where `effectiveReorderUpTo` defaults to the point and `effectiveReorderUpTo − net = 0`) still gets a 1-unit suggestion and is NEVER silently dropped. The clamp only bites at the `net == point && effectiveReorderUpTo == point` boundary (i.e. `reorderUpTo` unset or set equal to the point); whenever the manager sets `reorderUpTo > reorderPoint` the suggestion is the natural `upTo − net`.
  - **Invariant (do not break):** inclusion uses `<=` and matches the «Остатки» highlight's `<=` semantics, so "at or below the effective reorder point ⇒ appears in the report" holds with no zero-suggest exclusion. Do NOT reintroduce a `suggestedQty > 0` filter — that recreates the at-point hole Codex/spec-review flagged.
- **`lib/warehouse/replenishment.ts` has NO `@/lib/wms-host` import.** The default point is injected by callers (the action layer and `WarehouseOverview`), keeping the module a pure helper.
- **Incoming excludes DRAFT.** `incomingByPartIds` counts only `OPEN_SUPPLIER_ORDER_STATUSES` (`ORDERED`/`IN_TRANSIT`/`CUSTOMS`/`PARTIALLY_RECEIVED`) — DRAFT orders are not yet committed and contribute no incoming. Test fixtures must seed supplier orders as `ORDERED`, not `DRAFT`.
- **Migration is MANUAL.** `prisma migrate dev` RESETS this dev DB (Phase-3 stocktake checksum drift). Create the migration SQL by hand, apply it with `psql`, then `prisma migrate resolve --applied <name>`. Railway's pre-deploy `prisma migrate deploy` applies it in prod.
- **No jest/vitest.** Tests are `tsx scripts/verify-*.ts`. Prisma client is `@ts-nocheck` at `app/generated/prisma`; cast delegate results `as {...}`.

## Assumptions

- Railway pre-deploy runs `npx prisma migrate deploy`, so a hand-authored `migration.sql` marked `--applied` locally will be applied to prod on next deploy — Task 1 depends on this. (Confirmed in handover obs #13146.)

## Goal Verification

### Truths

1. Every item whose net stock (available + incoming) is at or below its effective reorder point appears in the report with a suggested quantity of at least 1 — including an item sitting exactly at the point; an item with enough incoming stock to clear the point does not appear. (Cross-cuts Task 2 logic + Task 4 report + Task 3 actions; not reducible to one DoD.)
2. Setting a per-item reorder point changes both the low-stock highlight in «Остатки» and the report's inclusion of that item, with no schema reset and no `Σbins`/aggregate change.

## E2E Test Scenarios

### TS-001: Set a per-item reorder point and see the highlight update
**Priority:** Critical
**Preconditions:** Logged in as admin; an item with available stock (e.g. "Фильтр воздушный W463A", available 15).
**Mapped Tasks:** Task 1, Task 5

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/admin/warehouse` | «Остатки» table renders; the item row is not highlighted (15 > default 3) |
| 2 | In that row, set reorder point (min) = 20, save | Row persists the value; row becomes low-stock highlighted (available 15 ≤ 20) |
| 3 | Reload the page | Reorder point 20 still shown; highlight persists |

### TS-002: Report lists below-point items with suggested quantity
**Priority:** Critical
**Preconditions:** The item from TS-001 has reorderPoint=20, reorderUpTo=30, available 15, no incoming.
**Mapped Tasks:** Task 2, Task 3, Task 4

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open `/admin/warehouse` and click «Дозаказ →» | Replenishment report page loads |
| 2 | Read the row for the item | Shows available 15, incoming 0, point 20, suggested 15 (= 30 − 15) |

### TS-003: Create a DRAFT supplier order from the report
**Priority:** Critical
**Preconditions:** At least one item in the report; at least one active supplier exists.
**Mapped Tasks:** Task 4, Task 6

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | On the report, select one or more items, click «Создать черновик заказа» | Navigates to `/admin/suppliers/orders/new` with the lines pre-filled (part + suggested qty) |
| 2 | Pick a supplier, set unit cost, submit | Order created; lands on the order detail page with status ЧЕРНОВИК (DRAFT) and the selected lines |

### TS-004: Incoming stock suppresses a suggestion
**Priority:** High
**Preconditions:** Item with reorderPoint=20, reorderUpTo=30, available 15, and an OPEN supplier order with 20 units of it owed (incoming).
**Mapped Tasks:** Task 2

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open the replenishment report | The item is absent (net = 15 + 20 = 35 > 20) |

## Progress Tracking

- [x] Task 1: Add reorderPoint/reorderUpTo to StockItem (manual migration)
- [x] Task 2: Replenishment domain in lib/warehouse/replenishment.ts
- [x] Task 3: Server actions — setReorderPolicy + getReorderReport
- [x] Task 4: Replenishment report page + UI + warehouse link
- [x] Task 5: Reorder-point inline editor in WarehouseOverview + per-item highlight
- [x] Task 6: SupplierOrderForm prefill + new-order page ?prefill param

## Implementation Tasks

### Task 1: Add reorder points to StockItem — manual migration

**Objective:** Persist two nullable integer columns on `StockItem` so each item can carry a per-item reorder trigger (`reorderPoint`) and order-up-to level (`reorderUpTo`). Null means "use the host default". Created as a hand-authored migration because `prisma migrate dev` resets this dev DB.

**Files:**
- Modify: `prisma/schema.prisma` (StockItem model)
- Create: `prisma/migrations/<timestamp>_stockitem_reorder_points/migration.sql`

**Key Decisions / Notes:**
- Add to `StockItem` (schema.prisma:924): `reorderPoint Int?` and `reorderUpTo Int?` (both nullable, no default — null = use `LOW_STOCK_THRESHOLD`). Place them after `reserved`.
- `migration.sql` content: `ALTER TABLE "StockItem" ADD COLUMN "reorderPoint" INTEGER, ADD COLUMN "reorderUpTo" INTEGER;`
- Apply manually (do NOT run `prisma migrate dev`):
  1. `TS=$(date +%Y%m%d%H%M%S); mkdir -p "prisma/migrations/${TS}_stockitem_reorder_points"` and write `migration.sql`.
  2. `psql postgresql://alex@localhost:5432/geleoteka -c 'ALTER TABLE "StockItem" ADD COLUMN "reorderPoint" INTEGER, ADD COLUMN "reorderUpTo" INTEGER;'`
  3. `npx prisma migrate resolve --applied "${TS}_stockitem_reorder_points"`
  4. `npx prisma generate`
- **Rollback** (if a prod deploy fails after the column is added): `psql postgresql://alex@localhost:5432/geleoteka -c 'ALTER TABLE "StockItem" DROP COLUMN IF EXISTS "reorderPoint", DROP COLUMN IF EXISTS "reorderUpTo";'` then `npx prisma migrate resolve --rolled-back "${TS}_stockitem_reorder_points"` then `npx prisma generate`.

**Definition of Done:**
- [ ] `psql postgresql://alex@localhost:5432/geleoteka -c '\d "StockItem"'` lists `reorderPoint` and `reorderUpTo` (both nullable integer)
- [ ] `npx prisma validate` passes and `npx prisma migrate status` shows no pending/failed migration
- [ ] Verify: `npx prisma validate && psql postgresql://alex@localhost:5432/geleoteka -c '\d "StockItem"' | grep -E "reorderPoint|reorderUpTo"`

### Task 2: Replenishment domain (host)

**Objective:** Pure host-side logic that computes the "to reorder" report from `StockItem` rows + incoming stock. Mirrors `lib/warehouse/incoming.ts`. The WMS core does not import this and is not imported by it (beyond `availableStock` from the public surface).

**Files:**
- Create: `lib/warehouse/replenishment.ts`
- Create: `scripts/verify-replenishment.ts`

**Key Decisions / Notes:**
- Exports: `effectiveReorderPoint(item, defaultPoint)`, `effectiveReorderUpTo(item, defaultPoint)`, and `buildReorderReport(db, tenantKey, defaultPoint)`.
- `buildReorderReport`: load active parts with their `stockItem` (`id, quantity, reserved, reorderPoint, reorderUpTo`); compute `net = availableStock(si) + incoming` using `incomingByPartIds(db, partIds)` (lib/warehouse/incoming.ts) — one batch groupBy, no N+1; return rows `{ partId, name, article, available, incoming, reorderPoint, reorderUpTo, suggestedQty }` for every item where `net <= effectiveReorderPoint`, with `suggestedQty = max(1, effectiveReorderUpTo − net)`, sorted by `name`. No `suggestedQty > 0` filter (see the Context invariant — that would re-hide at-point items).
- Use `availableStock` from `@/lib/wms/public`. Default point passed in by the caller (action passes `LOW_STOCK_THRESHOLD`) — keep this module free of `lib/wms-host` imports so it stays a pure helper.
- The verify script's test supplier order MUST be created with status `ORDERED` (not `DRAFT`) — `incomingByPartIds` ignores DRAFT, so a DRAFT fixture would count 0 incoming and silently break the incoming-covered assertion.
- Cast Prisma delegate results `as {...}` (@ts-nocheck client).

**Definition of Done:**
- [ ] `lib/warehouse/replenishment.ts` has NO import from `@/lib/wms-host` (default point is a function argument injected by callers)
- [ ] `buildReorderReport` includes an item when net ≤ point (suggested = `max(1, upTo − net)`), excludes it when incoming lifts net above the point
- [ ] An item exactly at the point with `reorderUpTo` unset is INCLUDED with `suggestedQty == 1` (not excluded)
- [ ] `effectiveReorderPoint`/`effectiveReorderUpTo` fall back to the default when columns are null, and `effectiveReorderUpTo` falls back to the effective point when only the point is set
- [ ] Verify: `npx tsx scripts/verify-replenishment.ts` (seeds a temp item with known stock + an `ORDERED` supplier order for incoming, asserts the four cases: below-point included, at-point-included-suggest-1, incoming-covered excluded, null-columns-use-default)

### Task 3: Server actions — setReorderPolicy + getReorderReport

**Objective:** Thin `"use server"` wrappers: persist a per-item reorder policy and fetch the report. Auth-gated, server-authoritative validation.

**Files:**
- Create: `app/actions/replenishment.ts`

**Key Decisions / Notes:**
- `setReorderPolicy(partId, reorderPoint, reorderUpTo)` — `requireRole(["ADMIN","MANAGER"])`. Accept `number | null` for each. Validate: integers ≥ 0; if both set, `reorderUpTo >= reorderPoint`; null clears the override. Update `db.stockItem` by `partId` (`where: { partId }`). Return `{ error: string | null }`.
- `getReorderReport()` — `requireRole(["ADMIN","MANAGER"])`. Calls `buildReorderReport(db, TENANT_KEY, LOW_STOCK_THRESHOLD)` (TENANT_KEY + LOW_STOCK_THRESHOLD from `@/lib/wms-host`). This action is the seam point that injects the host default.
- Follow the existing action style in `app/actions/warehouse.ts` (requireRole, plain return objects).

**Definition of Done:**
- [ ] `setReorderPolicy` rejects `reorderUpTo < reorderPoint` and negatives with an error message; accepts nulls to clear
- [ ] `getReorderReport` returns rows for items at/below their effective point
- [ ] Verify: covered by `scripts/verify-replenishment.ts` exercising `setReorderPolicy` validation paths + `getReorderReport` via a direct import (no HTTP)

### Task 4: Replenishment report page + UI + warehouse link

**Objective:** A manager-facing page listing items to reorder with a per-row suggested quantity, multi-select, and a «Создать черновик заказа» action that hands the selected lines to the new supplier-order form. Add a «Дозаказ →» link on the warehouse landing page.

**Files:**
- Create: `app/(admin)/admin/warehouse/replenishment/page.tsx`
- Create: `components/admin/ReplenishmentReport.tsx`
- Modify: `app/(admin)/admin/warehouse/page.tsx` (add «Дозаказ →» link)

**Key Decisions / Notes:**
- Page: `export const dynamic = "force-dynamic"`; `requireRole(["ADMIN","MANAGER"])` via `getSession()` + redirect pattern is not needed here since it's an action-backed page — use `requireRole` like `picking/page.tsx`. Render `PageHeader` with `backHref="/admin/warehouse" backLabel="Склад"` (consistent with the back-link work just shipped). Fetch rows via `getReorderReport()`.
- `ReplenishmentReport.tsx` (`"use client"`): table of rows with a checkbox per row (default checked), editable suggested-qty number input per row, and a «Создать черновик заказа» button. On click, build `/admin/suppliers/orders/new?prefill=<partId>:<qty>,<partId>:<qty>` from selected rows and navigate (`useProgressRouter().push`). Empty-state when no rows.
- Warehouse landing: add `<Link href="/admin/warehouse/replenishment" className="btn btn-secondary inline-flex w-fit min-h-[44px]">Дозаказ →</Link>` next to the existing Отбор/Упаковка links.

**Definition of Done:**
- [ ] Report page lists the report rows with available/incoming/point/suggested columns; empty-state text when nothing to reorder
- [ ] «Создать черновик заказа» builds the correct `?prefill=` URL from selected rows and navigates to the new-order form (TS-003 step 1)
- [ ] «Дозаказ →» link appears on `/admin/warehouse` and the report page has a working «← Склад» back link
- [ ] Verify: Chrome DevTools MCP E2E TS-002 + TS-003 step 1 on dev HTTPS:443

### Task 5: Reorder-point inline editor in WarehouseOverview + per-item highlight

**Objective:** Let a manager set/clear an item's reorder point and order-up-to directly in the «Остатки» table, and make the low-stock highlight use the per-item effective point instead of the fixed constant.

**Files:**
- Modify: `components/admin/WarehouseOverview.tsx`
- Create: `components/admin/ReorderPolicyCell.tsx`

**Key Decisions / Notes:**
- Extend the `WarehouseOverview` part query `select` to include `stockItem.reorderPoint` and `stockItem.reorderUpTo`. Change `const low = available <= LOW_STOCK_THRESHOLD` to use `effectiveReorderPoint(si, LOW_STOCK_THRESHOLD)` from `lib/warehouse/replenishment.ts` (so highlight matches the report). `WarehouseOverview` keeps the `LOW_STOCK_THRESHOLD` import from `@/lib/wms-host` and passes it as the `defaultPoint` argument — the import does NOT move into `replenishment.ts`.
- Add one column «Дозаказ» rendering `ReorderPolicyCell` (`"use client"`): shows `reorderPoint / reorderUpTo` (or «—» when unset = default), an inline edit affordance with two small number inputs, saves via `setReorderPolicy`, then `useRouter().refresh()` (server component re-render). For items with no `stockItem` row, the cell is disabled/«—».
- When `reorderUpTo` is unset or equals `reorderPoint`, show a small hint in the cell (e.g. «дозаказ до точки — укажите макс > точки для пополнения с запасом») so managers understand that without a higher `reorderUpTo` the suggestion is minimal (1 unit at the point). The item still appears in the report — the hint is about order size, not visibility.
- Performance: highlight uses a pure function; no extra queries (columns come from the existing single `findMany`).

**Definition of Done:**
- [ ] Setting reorderPoint=20 on an item with available 15 highlights its row and persists across reload (TS-001)
- [ ] The «Дозаказ» column shows the current point/up-to and clearing both reverts to default-driven highlight
- [ ] Verify: Chrome DevTools MCP E2E TS-001 on dev HTTPS:443

### Task 6: SupplierOrderForm prefill + new-order page ?prefill param

**Objective:** Let the new supplier-order form start with pre-filled PART lines so the report can hand off its selected items. Reuses `createSupplierOrder` unchanged — the manager picks the supplier and costs, then submits a DRAFT.

**Files:**
- Modify: `components/admin/SupplierOrderForm.tsx`
- Modify: `app/(admin)/admin/suppliers/orders/new/page.tsx`

**Key Decisions / Notes:**
- `SupplierOrderForm`: add optional prop `initialItems?: ItemRow[]`; use it as the initial `items` state (`useState<ItemRow[]>(initialItems ?? [<one empty PART row>])`). No other behavior change; submit path already creates a DRAFT (`SupplierOrder.status` defaults to DRAFT and `createSupplierOrder` does not set it).
- New-order page: read `searchParams.prefill` (string `partId:qty,partId:qty`). The param is **user-controlled** — parse defensively: split on `,` and take at most **100** entries; for each, split on `:`, require a non-empty `partId` that resolves in the already-fetched `partOptions`, and `qty = parseInt` clamped to **1..9999** (skip if `NaN`, `< 1`, or `> 9999`). Build `ItemRow { type: "PART", partId, description: name, quantity, unitCost: 0 }`. Pass surviving rows as `initialItems`; if none survive, fall back to the single empty PART row.
- Page is already a server component fetching `parts`; reuse that list for the lookup (no extra query).

**Definition of Done:**
- [ ] Opening `/admin/suppliers/orders/new?prefill=<partId>:5` pre-fills one PART line with that part and quantity 5
- [ ] Prefill entries with `qty > 9999`, `qty < 1`, malformed/unknown `partId`, or beyond the 100-entry cap are silently dropped; with no `prefill` the form behaves exactly as before (one empty line)
- [ ] Submitting a prefilled form creates a DRAFT order with the lines (TS-003 step 2)
- [ ] Verify: Chrome DevTools MCP E2E TS-003 on dev HTTPS:443
