# Warehouse Phase 2 — Receiving (приёмка) + Putaway + Label Printing Implementation Plan

Created: 2026-05-23
Author: aleksandr.spiskov@gmail.com
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** On a supplier-order page a manager runs a scan-driven, **incremental** receiving session — scan or pick each PART line, enter a received quantity (partial allowed, over-order allowed with a warning), each receive writes an audited `RECEIPT` that raises on-hand and optionally puts the received quantity straight into a bin. The order status auto-advances `PARTIALLY_RECEIVED` → `RECEIVED` as lines fill; these two statuses are **auto-only** — they cannot be picked manually and the manual status changer never touches stock. From the receiving session (and the warehouse overview) the manager prints scannable HTML labels for items and bins.

## Out of Scope

- **Stocktake / инвентаризация** — Phase 3.
- **Bin-aware picking / отбор** — Phase 4 (aggregate `CONSUMPTION` still does not deduct bins; the Phase-1 `unplaced`/reconcile drift is unchanged here).
- **Reorder points / replenishment** — Phase 5.
- **Receiving non-PART lines** (CUSTOM/FEE/SERVICE) — they carry no `partId`, so they never produce stock; shown read-only.
- **Editing/undoing a receipt** — a wrong receive is corrected via the existing warehouse on-hand ADJUSTMENT (Phase 1), not a reverse-RECEIPT.
- **PDF/label-printer driver output** — labels are a browser-print HTML sheet (Ctrl+P), per the chosen approach.
- **Per-bin reserved / multi-warehouse** — unchanged from Phase 1.

## Approach

**Chosen:** Extend the existing host receiving surface — `app/actions/supplier-orders.ts` + the order detail page `app/(admin)/admin/suppliers/orders/[id]/page.tsx` — with incremental receive actions over `@/lib/wms/public` (`recordMovement` for RECEIPT, `placeStock` for optional putaway, `lookupByCode` for scan matching). Receiving granularity is tracked by a new `SupplierOrderItem.receivedQuantity`. **Replay-safety and concurrency use optimistic concurrency (compare-and-set), not a cumulative source id:** the client submits the `receivedQuantity` it last saw (`expectedReceived`), and the server applies the RECEIPT only after an atomic conditional `updateMany({ where: { id, receivedQuantity: expectedReceived }, data: { receivedQuantity: { increment: qty } } })`; `count === 0` means a stale/replayed/concurrent submit and the receive **fails closed** before `recordMovement` runs. The movement still carries a `${orderId}:${lineId}:${newReceived}` source id as a defensive secondary idempotency layer. Labels are a role-gated server page that renders `qrcode`-generated data-URL QR codes inside a Tailwind `print:` sheet (the admin chrome is already `print:hidden`, layout.tsx:12-19).

**Why:** Reuses the VERIFIED WMS chokepoint and the Phase-1 placement layer untouched (no `recordMovement`/`placeStock` rewrite) and keeps receiving where managers already manage POs — at the cost of one additive column, one new enum value, and removing the legacy "flip-to-RECEIVED fires RECEIPT" path so the canonical scan-receive flow can't double-count. The compare-and-set is chosen over a `SELECT … FOR UPDATE` row lock because it both serializes concurrent receives **and** makes a sequential browser retry fail closed (a row lock fixes divergence but a post-commit retry would still read the new value and double-apply); it is chosen over a client-generated idempotency UUID because the displayed `receivedQuantity` is already the natural compare token — no new column.

## Context for Implementer

- **WMS seam (do not violate):** host imports ONLY `@/lib/wms/public`; `lib/wms/**` stays host-agnostic (ESLint, `eslint.config.mjs`). Phase 2 adds **no** core code — it only consumes `recordMovement`, `placeStock`, `binsForItem`, `lookupByCode` and passes `tenantKey: TENANT_KEY` + `actorId(session)` from `@/lib/wms-host`. Mirror the existing call in `app/actions/supplier-orders.ts:127-134`.
- **RECEIPT idempotency:** `recordMovement` dedupes on `(tenantKey, sourceType, sourceId, reason)` (`schema.prisma:954`) — but note this only catches a *truly identical* source id, NOT a sequential retry (a retry reads the already-incremented `receivedQuantity`, computes a new cumulative, and would double-apply). The primary replay/concurrency guard is therefore the **compare-and-set on `receivedQuantity`** (see Approach), which fails closed before `recordMovement` is ever called. Legacy receipts used `id = ${orderId}:${item.id}`; Phase 2 uses `id = ${orderId}:${lineId}:${newReceived}` — a different scheme, so no collision with legacy rows.
- **Page role gate:** the order page uses `getSession()` + `redirect` (suppliers/orders/[id]/page.tsx:22-25); the labels page MUST follow the same pattern. Server **actions** keep `await requireRole(["ADMIN","MANAGER"])` and capture the session for `actorId` (warehouse.ts:50, 106).
- **Prisma typing:** generated client is `@ts-nocheck`; use explicit `select`/cast (see `app/actions/warehouse.ts`). Prisma client imports from `@/app/generated/prisma/client`; `db` from `@/lib/db`.
- **Migrations:** run `npx prisma migrate dev --name <name>` then `npx prisma generate`, then **restart `npm run dev`** (HTTPS :443) or server actions 500. In the generated migration, **omit any auto-emitted drop of `*_photos_gin_idx`** (recurring Prisma diff noise in this repo).
- **`qrcode` API:** `import QRCode from "qrcode"; await QRCode.toDataURL(text)` → PNG data URL (string) usable as `<img src>`. `^1.5.4` + `@types/qrcode` are installed but unused so far.
- **Next 16 App Router:** `params`/`searchParams` are `Promise<…>` + `await` (suppliers/orders/[id]/page.tsx:27).

## Runtime Environment

- **Start:** `npm run dev` (Next.js, HTTPS, port 443). **Health:** `https://localhost:443/admin/suppliers/orders` (admin session).
- **DB:** `postgresql://alex@localhost:5432/geleoteka`; seed admin `admin@geleoteka.ru` / `admin123`.
- **Migrate:** `npx prisma migrate dev --name supplier_order_receiving` → `npx prisma generate` → restart dev.

## Assumptions

- **Concurrency / replay handled by compare-and-set, not assumed away.** `receiveLine` applies the RECEIPT only when the atomic conditional `updateMany({ where: { id, receivedQuantity: expectedReceived }, … increment … })` matches one row. Concurrent receives and sequential retries that carry a stale `expectedReceived` get `count === 0` and fail closed before any movement — so `receivedQuantity` can never diverge from the applied RECEIPTs. The HID scan path (`scanReceiveLine`, qty 1) reads the current value as its own `expectedReceived`; a near-simultaneous double-scan is additionally guarded at the UI by the `isPending` lock (Task 3). — Task 2, 3.
- **Legacy terminal orders.** Orders already `RECEIVED`/`COMPLETED` before this migration have stock applied but `receivedQuantity = 0`; Task 1's backfill sets `receivedQuantity = quantity` for their PART lines so the UI doesn't invite a duplicate receive. `CANCELLED` orders are NOT backfilled (they may have been cancelled before any receipt — backfilling would falsely show them fully received); instead Task 3 renders the receiving panel read-only for terminal statuses. — Task 1, 3.
- Every PART line's `partId` has a `StockItem` (created at part creation, `app/actions/parts.ts`). — Task 2.

## Goal Verification

### Truths

1. Receiving a PART line raises that part's on-hand by exactly the received delta (audited `RECEIPT`), the order shows received-vs-ordered per line and auto-sits at `PARTIALLY_RECEIVED` until every PART line is received-in-full (then `RECEIVED`) — and `RECEIVED`/`PARTIALLY_RECEIVED` cannot be set from the status dropdown at all (auto-only), so no manual status change ever creates stock.
2. When a location is supplied during a receive, the received delta is placed into that bin in the same step and the part's `unplaced` drops accordingly; when omitted, the received stock stays unplaced for later Phase-1 putaway.
3. The labels sheet prints item labels whose QR carries the part's barcode/article and bin labels whose QR carries the normalized location, and scanning a printed item label in the warehouse scan box resolves that part.

## E2E Test Scenarios

### TS-001: Incremental scan-receive raises on-hand + status auto-advance
**Priority:** Critical · **Preconditions:** admin; an order in `ORDERED`/`IN_TRANSIT` with two PART lines (A qty 5 with a known barcode, B qty 2) on-hand A=N. · **Mapped Tasks:** 1, 2, 3

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open `/admin/suppliers/orders/<id>` | Receiving panel lists each PART line: ordered / received(0) / remaining |
| 2 | Set the scan-row qty to 3, type A's barcode, press Enter | Line A received = 3, remaining = 2; a `RECEIPT` of 3 for A appears in the warehouse feed after refresh; qty resets to 1 |
| 3 | On line A enter qty 2, «Принять» | Line A received = 5 (full), highlighted done; order status badge = `Частично получен` (B still open) |
| 4 | On line B enter qty 2, «Принять» | Line B full; order status auto-becomes `Получен`; `receivedAt` set |
| 5 | Open `/admin/warehouse`, find part A | On-hand = N + 5 |

### TS-002: Optional putaway during receive
**Priority:** Critical · **Preconditions:** admin; an order with a PART line C qty 3, part C 0 placed. · **Mapped Tasks:** 2, 3

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | On line C enter qty 3 and location `A-1-1`, «Принять» | Line C received = 3 |
| 2 | Scan part C on `/admin/warehouse` | Bin `A-1-1` holds 3; «без места» (unplaced) for the received qty is 0 |
| 3 | Receive another line leaving the location blank | Received raises on-hand; that part's `unplaced` increases (not auto-placed) |

### TS-003: Over-receipt allowed with warning
**Priority:** High · **Preconditions:** admin; a PART line D qty 2. · **Mapped Tasks:** 2, 3

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | On line D enter qty 3, «Принять» | Accepted; received = 3, line flagged «сверх заказа»; on-hand rose by 3 |

### TS-004: «Получен» is auto-only — not manually selectable, no RECEIPT on manual status change (regression)
**Priority:** Critical · **Preconditions:** admin; a fresh order with PART line E qty 4, received 0, on-hand of E = N. · **Mapped Tasks:** 2, 3

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open the order's status dropdown | `Получен` and `Частично получен` are NOT in the options (only DRAFT/ORDERED/IN_TRANSIT/CUSTOMS/COMPLETED/CANCELLED) |
| 2 | Pick `В пути` (a manual status) | Saves; no RECEIPT fired; part E on-hand still = N, line E received still 0 |
| 3 | After receiving all of line E via the panel | Status badge auto-shows `Получен` (rendered read-only, not a select) |

### TS-005: Item + bin label printing
**Priority:** High · **Preconditions:** admin; part A has a barcode; received lines from TS-001. · **Mapped Tasks:** 4

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | From the receiving panel click «Печать этикеток принятого» | `/admin/warehouse/labels?part=…` opens showing one QR label card per received part (name + article/barcode) |
| 2 | In the bin-label generator add location `A-1-1`, submit | A bin label card with a QR for `A-1-1` appears |
| 3 | Click «Печать» (or Ctrl+P) | Print preview shows only the label grid — admin sidebar/header are hidden |
| 4 | On `/admin/warehouse`, type part A's barcode (the value its label QR encodes) in the scan box | Part A resolves in the scan box |

## E2E Results

Verified in Chrome against the running dev server (https://localhost:443) with a seeded supplier order (2 PART lines, one barcoded). DB assertions confirm stock/bin/status.

| Scenario | Priority | Result | Notes |
|----------|----------|--------|-------|
| TS-001 | Critical | PASS | Scan resolved barcode → line A; received increments; status auto → «Частично получен»; on-hand A rose to 6 (deltas 1+4+1, cumulative source ids `:1`/`:5`/`:6`) |
| TS-002 | Critical | PASS | Receive line B with location `R-1-1` → `StockBin` R-1-1 = 2; receive without location stays unplaced |
| TS-003 | High | PASS | Line A received 6/5 with «сверх заказа» flag; on-hand reflects 6 |
| TS-004 | Critical | PASS | `Получен`/`Частично получен` absent from the status dropdown; order auto-set to «Получен» (read-only badge); manual status change fires no RECEIPT (guard + isReceivingStatus test) |
| TS-005 | High | PASS | Labels page renders item QR (barcode `4601234567890`) + bin QR (`A-1-1`); the encoded barcode resolves via `/api/stock/lookup` (loop closed); print button + bin generator present; admin chrome `print:hidden` |

## Progress Tracking

- [x] Task 1: Schema — `receivedQuantity` + `PARTIALLY_RECEIVED` enum + backfill migration
- [x] Task 2: Incremental receive actions (RECEIPT + optional putaway + status automation) + neutralize bulk flip + verify
- [x] Task 3: Receiving panel on the order detail page (scan + per-line receive) + status labels
- [x] Task 4: Label printing — print sheet page + item & bin labels + triggers

## Implementation Tasks

### Task 1: Schema — `receivedQuantity` + `PARTIALLY_RECEIVED` enum + backfill migration

**Objective:** Track per-line received progress and a partial-receipt status, additively. Add `SupplierOrderItem.receivedQuantity` and a `PARTIALLY_RECEIVED` value to `SupplierOrderStatus`, then backfill already-`RECEIVED` orders so their PART lines show `receivedQuantity = quantity`. Verified by migration apply + `prisma validate`.

**Files:**
- Modify: `prisma/schema.prisma` — add `receivedQuantity Int @default(0)` to `model SupplierOrderItem` (after `quantity`, schema.prisma:1153); add `PARTIALLY_RECEIVED` to `enum SupplierOrderStatus` between `CUSTOMS` and `RECEIVED` (schema.prisma:54-62).
- Create: `prisma/migrations/<ts>_supplier_order_receiving/migration.sql` (via the migrate command) — append an idempotent backfill after the generated DDL, covering BOTH terminal-received statuses (an order that advanced `RECEIVED → COMPLETED` still has its stock applied and must not appear re-receivable):
  `UPDATE "SupplierOrderItem" soi SET "receivedQuantity" = soi."quantity" FROM "SupplierOrder" so WHERE soi."orderId" = so."id" AND so."status" IN ('RECEIVED', 'COMPLETED') AND soi."type" = 'PART';`
  Do NOT backfill `CANCELLED` orders — they may have been cancelled before any receipt, so `receivedQuantity = quantity` would be a false claim; Task 3 makes terminal orders read-only instead.

**Key Decisions / Notes:**
- Additive only: `receivedQuantity` has `@default(0)` (`server_default` satisfied) so the column is safe on existing rows; the enum add is non-breaking.
- Run `npx prisma migrate dev --name supplier_order_receiving` then `npx prisma generate`, then **restart the dev server**.
- **Omit any auto-emitted `DROP INDEX … _photos_gin_idx`** from the generated migration before applying (repo-specific Prisma diff noise).
- `Trivial:` no — schema + data migration; but no application logic here (logic is Task 2).

**Definition of Done:**
- [ ] `npx prisma validate` passes; the migration applies cleanly on the dev DB
- [ ] `receivedQuantity` and `PARTIALLY_RECEIVED` exist on the generated client
- [ ] After migrate, PART lines of pre-existing `RECEIVED` and `COMPLETED` orders have `receivedQuantity = quantity` (backfill); `CANCELLED` and all other lines = 0
- [ ] Verify: `npx prisma migrate dev --name supplier_order_receiving` then `npx prisma validate` exit 0

### Task 2: Incremental receive actions (RECEIPT + optional putaway + status automation) + neutralize bulk flip + verify

**Objective:** Add host server actions that receive a PART line incrementally — each call writes a `RECEIPT` for the just-received delta via `recordMovement`, bumps `receivedQuantity`, optionally `placeStock`s the delta into a bin, and recomputes the order status (`PARTIALLY_RECEIVED`/`RECEIVED`). Remove the legacy RECEIPT-on-status-flip so scan-receive is the only stock path. Verified by TS-001–004 and `scripts/verify-warehouse.ts`.

**Files:**
- Create: `lib/warehouse/wms-error-message.ts` — export the `wmsErrorMessage(e): string | null` switch currently inlined in `app/actions/warehouse.ts:24-38` (maps `WmsError.code` → Russian). Host-side helper (it imports `WmsError` from `@/lib/wms/public`, which is allowed for host code).
- Modify: `app/actions/warehouse.ts` — replace the inline `wmsErrorMessage` with an import from `@/lib/warehouse/wms-error-message` (orphan cleanup; behaviour unchanged).
- Modify: `app/actions/supplier-orders.ts` —
  - Add `receiveLine(orderId, lineId, qty, expectedReceived, location?): Promise<ReceiveResult>`: `const session = await requireRole(["ADMIN","MANAGER"])`; reject non-integer/`qty <= 0` and non-integer/negative `expectedReceived`. Wrap the whole `db.$transaction(async (tx) => …)` in a `try/catch` (the catch is OUTSIDE the tx, so a throw rolls back automatically). Inside the tx:
    1. Read the line (`id, orderId, partId, type, quantity, receivedQuantity`); if `type !== "PART"` or `!partId` → throw a sentinel handled below (`{ error: "Можно принимать только запчасти" }`).
    2. **Compare-and-set (the replay/concurrency guard):** `const cas = await tx.supplierOrderItem.updateMany({ where: { id: lineId, receivedQuantity: expectedReceived }, data: { receivedQuantity: { increment: qty } } })`. If `cas.count === 0` → the row's `receivedQuantity` no longer equals `expectedReceived` (a concurrent receive or a stale/replayed submit) → fail closed: return `{ error: "Позиция изменилась — обновите страницу", stale: true }` and apply NOTHING. Because the conditional update is atomic, only one of N racing/replayed calls can match.
    3. `const newReceived = expectedReceived + qty`. `await recordMovement(tx, { item:{itemId:partId}, reason:"RECEIPT", qty, source:{ type:"SupplierOrder", id:\`${orderId}:${lineId}:${newReceived}\` }, actorId: actorId(session), tenantKey: TENANT_KEY })`.
    4. If `location?.trim()` → `await placeStock(tx, { itemId: partId, location, qty, actorId: actorId(session), tenantKey: TENANT_KEY })`.
    5. **Re-read all of this order's PART lines inside the same `tx`** (`tx.supplierOrderItem.findMany({ where:{ orderId, type:"PART" }, select:{ quantity, receivedQuantity } })`), pass them to `computeOrderStatus`, and `tx.supplierOrder.update` the `status` (+ `receivedAt` when it becomes `RECEIVED`) only if it changed.
    Return `{ error: null, received: newReceived, ordered: quantity, overReceived: newReceived > quantity, status }`. **In the `catch`:** map a `WmsError` to its Russian message (reuse the `wmsErrorMessage` switch from `app/actions/warehouse.ts:24-38` — extract it to a small shared host helper, e.g. `lib/warehouse/wms-error-message.ts`, and import it in both files) and the non-PART sentinel to its message; return `{ error: <message> }`. Rethrow anything unmapped (genuine DB error) so it isn't masked.
  - Add `scanReceiveLine(orderId, code, qty = 1, location?): Promise<ReceiveResult & { matchedLineId?: string }>`: role-gate; resolve the code to an `itemId` (= partId) by **mirroring the lookup route exactly** (route.ts:28-39): `const view = await lookupByCode(db, code, TENANT_KEY); let itemId = view?.itemId ?? null;` then the host article fallback `if (!itemId) { const byArticle = await db.part.findFirst({ where: { article: code, isActive: true }, select: { id: true } }); itemId = byArticle?.id ?? null; }`. Note `lookupByCode(client, code, tenantKey)` takes the **client first** and resolves barcode/gtin only (lookup.ts:11-17); article is a host fallback. If `!itemId` → `{ error: "Код не найден" }`; find the order's PART line with `partId === itemId` (prefer one with `receivedQuantity < quantity`), reading its current `receivedQuantity`; if none → `{ error: "Эта позиция не в заказе" }`; delegate to `receiveLine(orderId, line.id, qty, line.receivedQuantity, location)` — passing the just-read value as `expectedReceived`. (Resolution is a plain `db` read; `receiveLine` opens its own `$transaction` for the write, and its compare-and-set fails closed if the value moved between this read and the write — a near-simultaneous double-scan is additionally blocked by the Task 3 `isPending` UI lock.)
  - Add a private `computeOrderStatus(lines)` helper: `every PART line receivedQuantity >= quantity` → `RECEIVED`; else if `some receivedQuantity > 0` → `PARTIALLY_RECEIVED`; else leave the current status untouched. (Only auto-advance forward; never downgrade a manual `COMPLETED`/`CANCELLED`.)
  - **Modify `updateSupplierOrderStatus`:** delete the `enteringReceived` RECEIPT-firing loop (supplier-orders.ts:116-136), the `items` sub-select used only for it, AND the `receivedAt` stamp (now set by `receiveLine` when it auto-advances to `RECEIVED`). **Reject manual transitions into the auto-only statuses:** if `newStatus` is `RECEIVED` or `PARTIALLY_RECEIVED`, return without changing anything (these are set only by receiving). The function now just persists the other manual statuses (DRAFT/ORDERED/IN_TRANSIT/CUSTOMS/COMPLETED/CANCELLED). Add a one-line comment: receiving status + stock are owned exclusively by `receiveLine`.
- Modify: `scripts/verify-warehouse.ts` — add receiving cases (cleanup after): (a) incremental receive fires one `RECEIPT` of the delta and `receivedQuantity` bumps; (b) two receives reach `PARTIALLY_RECEIVED` then `RECEIVED` with `receivedAt` set; (c) over-receipt (`qty > remaining`) is accepted and on-hand reflects it; (d) optional `location` places the delta into the bin (`binsForItem` shows it); (e) **a replayed/stale submit fails closed**: call `receiveLine` once (received 0→3), then call it again with the SAME `expectedReceived = 0` → returns `{ stale: true }`, fires NO second `RECEIPT`, on-hand and `receivedQuantity` unchanged; (f) calling `updateSupplierOrderStatus(orderId,"RECEIVED")` fires **no** `RECEIPT`; (g) a non-PART (or no-`partId`) line receive returns a structured `{ error }` and writes nothing — proving the `catch` returns a message rather than throwing a 500. (The `placeStock`-throw rollback shares the same `try/catch` + single `$transaction`; it is not naturally forceable post-RECEIPT, so it is a code-review guarantee, not a scripted case.)

**Key Decisions / Notes:**
- Mirror the existing RECEIPT call (`supplier-orders.ts:127-134`) — same `recordMovement` import, `tenantKey`, `actorId`. The changes are the `${orderId}:${lineId}:${newReceived}` `source.id` and the compare-and-set gate.
- Over-receipt is allowed by design (user decision): no `newReceived <= quantity` guard; surface `overReceived` for the UI warning. (Over-receipt still flows through the compare-and-set normally — `expectedReceived` is just the current value.)
- Putaway is optional: `placeStock` runs only when `location` is non-blank, inside the same `tx`, so RECEIPT + placement are atomic. A `placeStock` throw rolls back the whole receive AND is caught and returned as a structured `{ error }` (see step in the spec above) — never a 500.
- **Server-side terminal guard (defense-in-depth).** `applyReceive` reads the order status inside the tx (before the CAS) and rejects receiving when the order is `RECEIVED`/`COMPLETED`/`CANCELLED` — the UI read-only is only a client guard; a stale page or a direct action call must not raise stock on a closed order. The receive that COMPLETES an order still sees a non-terminal status at this point, then sets `RECEIVED` at the end. `orderId` is also included in the CAS `where`.
- **Replay/concurrency = compare-and-set, NOT a row lock.** The atomic `updateMany WHERE receivedQuantity = expectedReceived` is the single correctness mechanism: it serializes concurrent receives (only one matches) and makes a sequential browser retry fail closed (the retry's `expectedReceived` is now stale → `count === 0`). A `SELECT … FOR UPDATE` was rejected because it fixes concurrent divergence but a post-commit retry would still read the new value and double-apply. The recordMovement unique key remains as a defensive secondary layer only.
- ≤2 test surfaces: extend the single `scripts/verify-warehouse.ts` (no new file), matching the project's `verify-*` convention. `Why >0 new behaviour, 1 script:` all receiving behaviour is integration-verified through the one existing warehouse script.

**Definition of Done:**
- [ ] `receiveLine` writes one `RECEIPT` of the delta, bumps `receivedQuantity`, returns updated counters/status; non-PART/no-partId rejected
- [ ] A stale/replayed submit (`expectedReceived` no longer matches the row) fails closed: returns `{ stale: true }`, fires no `RECEIPT`, leaves on-hand and `receivedQuantity` unchanged
- [ ] A `placeStock` error (e.g. invalid location) returns `{ error: <message> }` to the caller (not a 500) and rolls back the RECEIPT
- [ ] Receiving on a terminal order (`RECEIVED`/`COMPLETED`/`CANCELLED`) is rejected server-side — no RECEIPT, no on-hand change
- [ ] Over-receipt (`qty` beyond remaining) is accepted and reported as `overReceived`
- [ ] A non-blank `location` places the received delta into that bin atomically with the RECEIPT
- [ ] Order status auto-advances to `PARTIALLY_RECEIVED` then `RECEIVED` (with `receivedAt`); `COMPLETED`/`CANCELLED` are never auto-downgraded
- [ ] `scanReceiveLine` resolves a code to a PART line on the order (passing the read `receivedQuantity` as `expectedReceived`) or returns a clear error
- [ ] `updateSupplierOrderStatus` no longer fires any `RECEIPT` and rejects manual transitions into `RECEIVED`/`PARTIALLY_RECEIVED` (auto-only)
- [ ] Verify: `npm run verify-warehouse` prints PASS (all receiving cases incl. the fail-closed-replay, placeStock-error, and no-RECEIPT-on-flip cases); `npm run lint` green

### Task 3: Receiving panel on the order detail page (scan + per-line receive) + status labels

**Objective:** Add a «Приёмка» panel to the supplier-order detail page: an auto-focusing scan input for continuous HID receiving plus a per-PART-line row showing ordered / received / remaining with a qty input, an optional location input, and a «Принять» button, calling the Task 2 actions and refreshing. Show the `PARTIALLY_RECEIVED` status everywhere it's labelled. Verified by TS-001–003.

**Files:**
- Create: `components/admin/SupplierOrderReceiving.tsx` — `"use client"`; props: the order's PART lines (`{ lineId, partId, description, article, barcode, ordered, received }[]`), `orderId`, and the order `status`. A single `useTransition` `isPending` gates BOTH input paths. A top scan row: a small qty number input (default 1, min 1) next to the scan input; Enter on the scan input → ignore if `isPending`, else `scanReceiveLine(orderId, code, qty)` using that qty (so one scan of a box barcode can receive N), then reset qty to 1 and refocus the scan input; on success `router.refresh()`, surface match/`Код не найдено`. An optional location input on this row applies to scanned receives too. Per line: ordered/received/remaining, a qty number input (default = remaining, min 1), an optional location text input, «Принять» → `receiveLine(orderId, lineId, qty, line.received /* = expectedReceived */, location)`; disable while `isPending`; on a `{ stale: true }` result show «Обновите страницу» and `router.refresh()` (the displayed `received` was stale); on success refresh; flag received ≥ ordered as done and received > ordered as «сверх заказа» (CSS-variable warning colour). A «Печать этикеток принятого» link to `/admin/warehouse/labels?part=<csv of received partIds>` (only lines with `received > 0`). Non-PART lines render read-only. **When `status` is terminal (`RECEIVED` / `COMPLETED` / `CANCELLED`) render the whole panel read-only** (no scan input, no «Принять») — a fully-received or closed order is not re-received here.
- Modify: `app/(admin)/admin/suppliers/orders/[id]/page.tsx` — extend the `items` include to also pull `receivedQuantity` and `part { name, article, stockItem { barcode } }`; replace the static items card (lines 63-89) with `<SupplierOrderReceiving orderId={order.id} status={order.status} lines={…PART lines…} />` (keep the read-only render for non-PART lines and the financial/logistics cards unchanged). The page shows status only via the changer, so no extra label map is needed here.
- Modify: `components/admin/SupplierOrderStatusChanger.tsx` — add `PARTIALLY_RECEIVED: "Частично получен"` to `LABELS`. **Remove `RECEIVED` and `PARTIALLY_RECEIVED` from the selectable `STATUSES`** (they are auto-only). When `currentStatus` is one of those two, render the label as a static read-only badge instead of the `<select>` (so an already-received order still displays its status but offers no manual receiving status); otherwise render the `<select>` with the manual statuses only.
- Modify: `app/(admin)/admin/suppliers/orders/page.tsx` and `app/(admin)/admin/suppliers/[id]/page.tsx` — add `PARTIALLY_RECEIVED: "Частично получен"` to their status-label maps (doc/UI sync; both currently map the other statuses).

**Key Decisions / Notes:**
- Reuse the scan UX from `components/admin/WarehouseScanBox.tsx` (keyboard-wedge: text input + Enter, auto/refocus, `useTransition`, `aria-live="polite"`). Location input doubles as a scan target for a printed bin label.
- **Both input paths share one `isPending` lock** — the scan Enter handler and the per-line «Принять» button are disabled/ignored while a receive is in flight, so a scanner double-Enter cannot fire two calls before the first resolves (UI complement to the server compare-and-set).
- Styling via CSS variables / existing component classes (`.input`, `.btn`, `.badge`) — no hardcoded hex (project conventions).
- The «Печать» link is the only coupling to Task 4; it's a plain `Link`, so Task 3 ships even before Task 4 lands (the route 404s until then — acceptable mid-implementation).

**Definition of Done:**
- [ ] Panel lists each PART line with ordered / received / remaining and a working qty + optional-location «Принять»
- [ ] The scan input receives by code continuously (auto-refocus), matching the scanned code to a line; unknown/foreign code shows a clear message
- [ ] The scan-row qty field lets one scan receive N at once (default 1, resets to 1 after each scan); a per-line qty input also receives a batch without scanning
- [ ] Receiving updates received counts and (with a location) placement, and refreshes; both the scan input and «Принять» are locked while pending (no double-apply)
- [ ] A `{ stale: true }` result shows «Обновите страницу» and refreshes instead of silently failing
- [ ] Terminal orders (`RECEIVED`/`COMPLETED`/`CANCELLED`) render the panel read-only (no scan input, no «Принять»)
- [ ] Over-received lines show a «сверх заказа» flag; `PARTIALLY_RECEIVED`/`RECEIVED` are absent from the status dropdown options and render as a read-only «Частично получен»/«Получен» badge; the label also shows in the orders list and the supplier page
- [ ] Verify: browser E2E TS-001, TS-002, TS-003 pass

### Task 4: Label printing — print sheet page + item & bin labels + triggers

**Objective:** Add a role-gated `/admin/warehouse/labels` page that renders a print-optimized grid of QR labels — item labels (QR = part barcode, else article) and bin labels (QR = normalized location) — from `?part=` / `?loc=` query params, with a print button and a bin-location generator form. QR images are generated server-side with `qrcode`. Verified by TS-005.

**Files:**
- Create: `app/(admin)/admin/warehouse/labels/page.tsx` — `export const dynamic = "force-dynamic"`; `getSession()` + `redirect("/login")` gate (mirror suppliers/orders/[id]/page.tsx:22-25); `searchParams: Promise<{ part?: string; loc?: string }>` then `await`; parse comma-separated `part` ids and `loc` strings. For parts: `db.part.findMany({ where:{ id:{ in } }, select:{ id, name, article, stockItem:{ select:{ barcode } } } })` → label `{ payload: barcode ?? article, title: name, sub: article }`. For locations: normalize (trim/upper) → label `{ payload: loc, title: loc, sub: "Ячейка" }`. Generate each QR via `await QRCode.toDataURL(payload)`; render `<LabelCard>`s in a grid using Tailwind `print:` utilities (e.g. `grid grid-cols-2 print:grid-cols-3 gap-2`, `break-inside-avoid`). Render `<LabelSheetControls defaultLoc params… />` above the grid (not printed: `print:hidden`).
- Create: `components/admin/LabelSheetControls.tsx` — `"use client"`; a «Печать» button calling `window.print()`; a bin-location generator: a text input (comma/space-separated locations) that on submit navigates to `/admin/warehouse/labels?…` merging the new `loc` values with existing `part`/`loc` params (`useRouter` + `URLSearchParams`). Wrapped in a `print:hidden` container.
- Modify: `components/admin/WarehouseOverview.tsx` — add a small per-row «этикетка» link → `/admin/warehouse/labels?part=<partId>` (item label on demand). CSS-variable styling, no hardcoded hex.

**Key Decisions / Notes:**
- The admin chrome is already `print:hidden` (layout.tsx:12-19) and `main` is `print:p-0`, so the label page only needs `print:` utilities on its own grid — **no `globals.css` change**.
- QR payload is the re-scannable code (user decision): item = `barcode ?? article` so scanning the printed label resolves in the Phase-1 scan box / `lookupByCode`; bin = normalized location so it resolves in the location lookup. `lookupByCode` resolves barcode/gtin in core and article via the host resolver — an article-only item still resolves.
- `QRCode.toDataURL` is awaited per label in the server component (small N — a page's worth of labels); no client-side QR lib, no new dependency.
- Use semantic `print` page sizing (`@page` not required; rely on Tailwind `print:` + `break-inside-avoid` per card). Each card: QR `<img>` + title + sub, fixed size via utility classes.

**Definition of Done:**
- [ ] `/admin/warehouse/labels?part=<id>` renders an item label whose QR encodes the part's barcode (or article when no barcode)
- [ ] `?loc=<code>` and the generator form render bin labels whose QR encodes the normalized location
- [ ] «Печать» (and Ctrl+P) shows only the label grid — sidebar/header hidden
- [ ] The «этикетка» link on the warehouse overview opens that part's label
- [ ] Scanning a printed item label's encoded value in the warehouse scan box resolves the part (closes the loop)
- [ ] Verify: browser E2E TS-005 passes; `npm run lint` green
