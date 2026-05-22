# Warehouse (Склад) Admin Module — Phase 1 Implementation Plan

Created: 2026-05-22
Author: aleksandr.spiskov@gmail.com
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Phase 1 of the warehouse roadmap (`docs/prd/2026-05-22-warehouse-wms-roadmap.md`): a «Склад» admin section where a manager sees every part's on-hand/reserved/available with low-stock highlighting, scans a barcode (HID) or types an article to look up and adjust on-hand, watches a cross-part movements feed, assigns barcodes — **plus a multi-bin physical-location foundation**: stock is placed into named locations (`StockBin`), can be put away and moved between locations from the warehouse UI, and a location lookup answers "what's stored in A-12-3?". All as a host consumer of `@/lib/wms/public`.

## Out of Scope (deferred to later roadmap phases)

- **Receiving/putaway-on-receipt (приёмка)** — Phase 2. RECEIPT stays supplier-order-only; Phase 1 putaway is a manual placement of existing on-hand into bins.
- **Stocktake/inventory sessions** — Phase 3. Phase 1 has only one-off `adjustStock`.
- **Bin-aware picking (отбор)** — Phase 4. Aggregate `CONSUMPTION` does NOT deduct from bins in Phase 1 (see Assumptions — drift + reconcile flag).
- **Reorder points / replenishment** — Phase 5 (fixed low-stock threshold only here).
- **Label printing, reports, multi-warehouse, scan-into-estimate** — later phases.
- **Per-bin `reserved`** — `reserved` stays aggregate-only on `StockItem`; bins track on-hand placement only.
- **Cross-field code collision** (a barcode equal to another item's gtin) — uniqueness enforced per-field, matching the non-unique `StockItem_barcode_idx`.

## Approach

**Chosen:** Host-consumer pages under `app/(admin)/admin/warehouse/` over `@/lib/wms/public` and `GET /api/stock/lookup`. Aggregate on-hand edits go through `recordMovement` ADJUSTMENT exactly as `updatePart` already does (`app/actions/parts.ts:159`). **Multi-bin is a placement layer over the untouched aggregate ledger:** a new WMS-core `StockBin` table records WHERE the already-counted on-hand sits, with new core ops `placeStock`/`transferStock`/`removeFromBin` enforcing `Σbins ≤ StockItem.quantity`. `recordMovement` and all its existing consumers (fulfillment consume, reservations, supplier receiving, part adjust) are **not** touched.

**Why:** Reusing the aggregate ledger as truth means the multi-bin work adds capability without rewriting the VERIFIED chokepoint or risking the existing fulfillment/reservation flows — at the cost of a documented Phase-1 drift (aggregate consumption doesn't deduct bins; closed in Phase 4). The placement layer stays WMS-owned and extractable (FK only to `StockItem`).

## Decisions

**User-confirmed:**

- **Scan box scope:** show resolved item **+ inline on-hand adjust** (ADJUSTMENT). Not receiving.
- **Scanner placement:** «Склад» section only; scan-into-estimate is out of scope (Phase 4).
- **Physical location model:** **multi-bin** (`StockBin`, item × location × qty) — not single-bin.
- **Delivery:** roadmap doc (written) + **Phase 1 = base module + multi-bin foundation** (this plan).

**Autonomous defaults** (recommended; redirect at approval if wrong):

- **Low-stock rule:** fixed constant `LOW_STOCK_THRESHOLD` (no schema change); highlight when `available ≤ LOW_STOCK_THRESHOLD`.
- **Barcode assignment:** part edit page only, app-level uniqueness check.
- **Overview:** server-side search (`?q=`) + pagination (`?page=`), DB-side filtering.
- **Bin audit:** a dedicated `StockBinMovement` ledger (PLACE/TRANSFER/REMOVE) — because bin-to-bin transfers have no aggregate delta and would otherwise be unaudited in `StockMovement`.

## Context for Implementer

- **WMS seam (do not violate):** host imports ONLY `@/lib/wms/public`; `lib/wms/**` imports zero host code (ESLint `eslint.config.mjs:50-55`). All core Prisma access funnels through `lib/wms/internal/repository.ts` (the ONLY Prisma-touching core file; design §1). `StockBin`/`StockBinMovement` are WMS-owned and accessed only there. Everything is `tenantKey`-scoped (host passes `TENANT_KEY` from `@/lib/wms-host` — that file exists: `TENANT_KEY`, `wmsDb`, `actorId`).
- **Aggregate is truth:** `StockItem.quantity` (on-hand) / `reserved` are the authoritative counters; `recordMovement` is the single chokepoint (`lib/wms/public/record-movement.ts`). Bins are a breakdown of `quantity`, never an independent count. `unplaced = quantity − Σbins`.
- **Prisma typing:** generated client is `@ts-nocheck`; cast results / use explicit `select` interfaces (see `components/admin/StockHistory.tsx`, `app/api/stock/lookup/route.ts`). Prisma client imports from `@/app/generated/prisma/client`.
- **Page role gate:** `await requireRole(["ADMIN","MANAGER"])` at the top of server pages — it **redirects** to `/login` (does NOT throw; `lib/auth.ts:94-100`, checks `session.permissionRole`), matching every admin page (`app/(admin)/admin/parts/page.tsx:11`). The `geleoteka-conventions.md` "throws" note is stale.
- **ADJUSTMENT idempotency:** `recordMovement` dedupes on `(tenantKey, sourceType, sourceId, reason)`; Postgres treats NULL `sourceId` as distinct, so an ADJUSTMENT with `source.id = null` is never deduped — each manual adjust applies (mirrors `updatePart`).
- **Next 16 App Router:** `params`/`searchParams` are async (`Promise<…>` + `await`); see `app/(admin)/admin/customers/page.tsx:12-22`. Read `node_modules/next/dist/docs/` if unsure (AGENTS.md).

## Runtime Environment

- **Start:** `npm run dev` (Next.js, HTTPS, port 443). **Health:** `https://localhost:443/admin/warehouse` (admin session).
- **DB:** `postgresql://alex@localhost:5432/geleoteka`; seed admin `admin@geleoteka.ru` / `admin123`.
- **Migrate:** `npx prisma migrate dev --name <name>` then `npx prisma generate`.

## Assumptions

- **Phase-1 bin drift (closed in Phase 4).** Aggregate `CONSUMPTION` does not deduct from bins, so `Σbins` can exceed `quantity` after a consume. Defined `unplaced = max(0, quantity − Σbins)`; the UI shows a "needs reconcile" flag when `Σbins > quantity`. Tasks 8-10 depend on this definition.
- **Low concurrency per item.** `adjustStock` and the bin ops compute deltas from values read inside the transaction without row locks — simultaneous edits of the same item/bin could race. Acceptable for a single-warehouse tool.
- **Barcode-uniqueness TOCTOU (Task 6).** Check + write share a transaction but no row lock; two simultaneous identical assignments could both pass. Acceptable; the non-unique `StockItem_barcode_idx` won't catch it either.
- Every active `Part` has a `StockItem` (created at part creation, `app/actions/parts.ts:94`) or it's treated as 0 on-hand. `StockBin.itemId` FKs to `StockItem.id`.

## Goal Verification

### Truths

1. A manager opens «Склад» from the admin nav and sees every active part's on-hand / reserved / available, with low-stock items flagged, can search by name/article/barcode, and can page through results. *(Tasks 1, 2)*
2. Scanning or typing an existing code resolves the item and an inline on-hand adjustment writes an audited ADJUSTMENT whose new counters appear in the overview and movements feed after refresh. *(Tasks 3, 4, 5)*
3. Placed on-hand can be put away into a named location and moved between locations from the scan view; the per-item placement (bins + `unplaced`) and a location lookup ("what's in A-12-3?") reflect it, and the system never lets `Σbins` exceed on-hand. *(Tasks 7, 8, 9, 10)*

## E2E Test Scenarios

### TS-001: Stock overview, search, low-stock highlight
**Priority:** Critical · **Preconditions:** admin logged in; a part with available ≤ threshold and one above. · **Mapped Tasks:** 1, 2

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open `/admin`, expand «Запчасти» nav group | A «Склад» link to `/admin/warehouse` is present |
| 2 | Click «Склад» | Stock table: name, article, barcode, on-hand, reserved, available |
| 3 | Observe a part with available ≤ threshold | Row is highlighted as low-stock |
| 4 | Type an article fragment in search, submit | List narrows (name/article/barcode); URL has `?q=` |
| 5 | Click page 2 (if present) | Next page renders; URL has `?page=2`, `q` preserved |

### TS-002: Scan existing code + inline adjust
**Priority:** Critical · **Preconditions:** admin; a part with known barcode and on-hand N. · **Mapped Tasks:** 3, 4, 5

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load `/admin/warehouse` | Cursor auto-focused in the scan input |
| 2 | Type the barcode, press Enter | Item card: name, article, barcode, on-hand, available |
| 3 | Enter new on-hand M ≠ N, submit | Card shows on-hand = M; scan input refocuses |
| 4 | Look at movements feed | New ADJUSTMENT row for that part (delta = M − N) at top after refresh |
| 5 | Look at overview row | On-hand/available reflect M |

### TS-003: Scan unknown code
**Priority:** High · **Preconditions:** admin. · **Mapped Tasks:** 4

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Type a code matching no barcode/gtin/article, Enter | «Не найдено»; no item card |
| 2 | Observe input | Cleared and refocused |

### TS-004: Assign a barcode on the part edit page
**Priority:** High · **Preconditions:** admin; a code-less part + another part holding barcode `EXISTING`. · **Mapped Tasks:** 6

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open `/admin/parts/<id>` (code-less part) | Empty Barcode + GTIN fields |
| 2 | Enter a unique barcode, Save | Saved; reopening shows it |
| 3 | On `/admin/warehouse`, scan that barcode | Part resolves in scan box |
| 4 | Edit another part, set barcode = `EXISTING`, Save | Rejected with uniqueness error; not persisted |

### TS-005: Putaway + transfer between bins
**Priority:** Critical · **Preconditions:** admin; a part with on-hand ≥ 5 and 0 placed. · **Mapped Tasks:** 9, 8

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Scan the part on `/admin/warehouse` | Card shows on-hand and «без места: <all>» (unplaced) |
| 2 | In putaway, enter location `A-1-1` and qty 3, submit | Bin `A-1-1` shows 3; unplaced drops by 3 |
| 3 | Try to put away more than `unplaced` | Rejected with an "insufficient unplaced" error; no change |
| 4 | Transfer 2 from `A-1-1` to `B-2`, submit | `A-1-1` = 1, `B-2` = 2; on-hand unchanged |
| 5 | Try transfer with from == to | Rejected; no change |

### TS-006: Location-centric lookup + placement column + reconcile flag
**Priority:** High · **Preconditions:** admin; at least one part placed in `A-1-1` (from TS-005). · **Mapped Tasks:** 10

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | On `/admin/warehouse`, enter/scan location `A-1-1` in the location lookup | List of items stored in `A-1-1` with quantities |
| 2 | Observe overview placement column | Shows placed/unplaced per part |
| 3 | Force `Σbins > quantity` (place, then `adjustStock` down below placed) | That part's row shows a "needs reconcile" flag |

## Progress Tracking

- [x] Task 1: Nav entry + low-stock constant + warehouse page scaffold
- [x] Task 2: Stock overview table (server search + pagination + low-stock highlight)
- [x] Task 3: `adjustStock` server action (ADJUSTMENT) + verify script
- [x] Task 4: Scan box client component (lookup + inline adjust)
- [x] Task 5: Cross-part movements feed
- [x] Task 6: Barcode/GTIN assignment on part edit
- [x] Task 7: `StockBin` + `StockBinMovement` schema & migration
- [x] Task 8: WMS-core bin placement layer (place/transfer/remove + reads + invariants)
- [x] Task 9: Host bin actions + putaway/transfer UI in the scan view
- [x] Task 10: Location search + location-centric lookup + placement column + reconcile flag

## Implementation Tasks

### Task 1: Nav entry + low-stock constant + warehouse page scaffold

**Objective:** Add a «Склад» link to the admin nav and create the role-gated `/admin/warehouse` server page composing the regions (scan box, overview, movements feed, location lookup), with the host-side low-stock threshold constant. Verified by TS-001 steps 1-2.

**Files:**
- Modify: `lib/admin-nav.ts` — add `{ href: "/admin/warehouse", label: "Склад" }` to the `admin-group-parts` group's `items`.
- Modify: `lib/wms-host/index.ts` — add `export const LOW_STOCK_THRESHOLD = 3;` (host display policy; this file exists with `TENANT_KEY`/`wmsDb`/`actorId`).
- Create: `app/(admin)/admin/warehouse/page.tsx` — `export const dynamic = "force-dynamic"`; `await requireRole(["ADMIN","MANAGER"])`; `searchParams: Promise<{ q?: string; page?: string; loc?: string }>` then `await`; renders `PageHeader` + placeholders for scan box / overview / feed / location lookup (filled by later tasks).

**Key Decisions / Notes:**
- Nav is data-driven (`lib/admin-nav.ts:1-8`); «Склад» belongs under «Запчасти» (taxonomy comment `lib/admin-nav.ts:19-21`).
- Composition: scan box pinned top (operator-first), overview, location lookup, feed last. Use `PageHeader` from `@/components/ui`.

**Definition of Done:**
- [ ] «Склад» appears under «Запчасти» and links to `/admin/warehouse`
- [ ] Visiting as admin/manager renders the page; non-admin/anonymous redirects to `/login`
- [ ] `LOW_STOCK_THRESHOLD` exported from `@/lib/wms-host`
- [ ] Verify: `npm run lint` passes (WMS boundary green)

### Task 2: Stock overview table (server search + pagination + low-stock highlight)

**Objective:** Render a paginated, searchable table of active parts showing name, article, barcode, on-hand, reserved, available (`availableStock`), highlighting rows where `available ≤ LOW_STOCK_THRESHOLD`. Verified by TS-001.

**Files:**
- Create: `components/admin/WarehouseOverview.tsx` — async server component `{ q?: string; page: number }`; `db.part.findMany` (active) with `stockItem { quantity, reserved, barcode }`, DB-side case-insensitive `contains` on name/article/`stockItem.barcode`, `skip`/`take`, `count` for pages; renders table + `Pagination` whose `buildHref` preserves `q`.
- Modify: `app/(admin)/admin/warehouse/page.tsx` — replace overview placeholder with `<WarehouseOverview q={q} page={page} />`.

**Key Decisions / Notes:**
- Use `availableStock({ quantity, reserved })` from `@/lib/wms/public` for the available column.
- `PAGE_SIZE = 25` local const; `buildHref(page)` keeps `q` (mirror `components/ui/Pagination.tsx` API: `page`, `totalPages`, `buildHref`).
- Low-stock highlight via CSS-variable class (`var(--color-error)`) — no hardcoded hex.
- Placement summary column is added later (Task 10) — Task 2 stays aggregate-only so it ships independently.

**Definition of Done:**
- [ ] Lists active parts with name, article, barcode, on-hand, reserved, available
- [ ] `?q=` filters DB-side by name OR article OR barcode (case-insensitive)
- [ ] `?page=N` pages results; pagination preserves `q`
- [ ] Rows with `available ≤ LOW_STOCK_THRESHOLD` highlighted
- [ ] Verify: load `/admin/warehouse?q=<known-fragment>` in the browser; filtering + highlight correct (TS-001)

### Task 3: `adjustStock` server action (ADJUSTMENT) + verify script

**Objective:** Add a host server action that sets a part's on-hand to a target by writing an audited ADJUSTMENT (delta = target − current) through `recordMovement`, rejecting non-admins, negative/non-integer targets, and no-op edits. Provide the warehouse integration verify script. Verified by TS-002 and `scripts/verify-warehouse.ts`.

**Files:**
- Create: `app/actions/warehouse.ts` — `"use server"`; `adjustStock(partId, newQuantity, note?): Promise<{ error: string | null; quantity?: number; available?: number }>`. `const session = await requireRole(["ADMIN","MANAGER"])` (**capture the return** — `actorId(session)` stamps `actorUserId`); reject `newQuantity < 0` or non-integer; in `db.$transaction`, read current `stockItem.quantity`, compute `delta`; **if `delta === 0` return current counters (no-op) — this guard MUST precede the call because `recordMovement` THROWS `WmsError.invalidQty` on `qty === 0` for ADJUSTMENT** (`record-movement.ts:34-35`); else `recordMovement(tx, { item:{itemId:partId}, reason:"ADJUSTMENT", qty:delta, source:{type:"WarehouseAdjust", id:null}, actorId: actorId(session), note: note ?? "Warehouse adjust", tenantKey: TENANT_KEY })`; return updated counters.
- Create: `scripts/verify-warehouse.ts` — integration script (pattern: `scripts/verify-crm-task-unique.ts`, `import "dotenv/config"`, `assert`, cleanup): assert on-hand reconciles to target, a matching ADJUSTMENT `StockMovement` exists **with non-null `actorUserId`**, and no-op when target == current.
- Modify: `package.json` — add `"verify-warehouse": "tsx scripts/verify-warehouse.ts"`.

**Key Decisions / Notes:**
- Mirror `updatePart`'s ADJUSTMENT call (`app/actions/parts.ts:152-168`).
- `recordMovement` clamps reserved but not quantity; the `newQuantity < 0` guard prevents a negative *target*.
- **Negative-on-hand race guard (must_fix):** the read→compute-delta→`recordMovement` pattern has no row lock, so a concurrent CONSUMPTION between the read and the apply can make the applied delta drive on-hand below 0 (or below `reserved`). `recordMovement` returns the post-write `quantity`/`reserved`; **after the call, if `result.quantity < 0` OR `result.quantity < result.reserved`, throw inside the transaction to roll back** and return `{ error: "Остаток нельзя сделать отрицательным" }`. (Cheaper and sufficient here vs. a `SELECT … FOR UPDATE`; the existing `updatePart` shares the unguarded pattern but is low-frequency — HID scanning raises the odds, hence the explicit post-write guard.)
- **Double-apply by design:** `source.id = null` bypasses idempotency dedup, so each call is a live write — two rapid submits double-apply. The dedup layer is the UI pending-guard in Task 4 (do not add server idempotency here; absolute-set semantics need each apply to be live).

**Definition of Done:**
- [ ] Writes one ADJUSTMENT with delta = target − current; returns updated on-hand/available
- [ ] `newQuantity < 0`, non-integer, or non-admin → error, no movement
- [ ] `newQuantity === current` → no-op, no movement
- [ ] Post-write guard: if the applied movement would leave `quantity < 0` or `quantity < reserved`, the transaction rolls back and an error is returned (no partial write)
- [ ] Verify: `npm run verify-warehouse` prints PASS (incl. a case asserting the negative-result guard rolls back)

### Task 4: Scan box client component (lookup + inline adjust)

**Objective:** Add an auto-focusing scan input that accepts an HID keyboard-wedge scan (code + Enter), looks the code up via `GET /api/stock/lookup`, shows the resolved item + stock, offers an inline on-hand adjust calling `adjustStock`, and refocuses for continuous scanning. Verified by TS-002, TS-003.

**Files:**
- Create: `components/admin/WarehouseScanBox.tsx` — `"use client"`; `ref` auto-focus on mount + refocus after submit; form `onSubmit` → `fetch('/api/stock/lookup?code=' + encodeURIComponent(code))`; 200 → item card (name, article, barcode, on-hand, available) + number input + «Сохранить» → `adjustStock(partId, newQty)`; 404 → «Не найдено»; on success `router.refresh()`; ignore empty/whitespace.
- Modify: `app/(admin)/admin/warehouse/page.tsx` — replace scan placeholder with `<WarehouseScanBox />`.

**Key Decisions / Notes:**
- HID = keyboard wedge: text input + Enter; auto-focus + refocus is the core UX (PRD).
- `useTransition` for the adjust call; surface `{ error }` inline; `aria-live="polite"` for the result/«Не найдено».
- **Double-submit guard (should_fix):** because `adjustStock` has no server idempotency (null source — see Task 3), the UI is the dedup layer. Disable the «Сохранить» button while the adjust is pending (`isPending` from `useTransition`) and ignore re-submits until the result returns, so a scanner double-Enter cannot double-apply.
- The placement/putaway controls are added in Task 9 — Task 4 stays lookup+adjust.

**Definition of Done:**
- [ ] Input auto-focuses on load and refocuses after each scan
- [ ] Existing code + Enter → item card with name/article/barcode/on-hand/available
- [ ] Inline adjust updates on-hand and refreshes overview + feed
- [ ] «Сохранить» is disabled while pending; a rapid double-submit applies the adjustment only once
- [ ] Unknown code → «Не найдено», input cleared + refocused
- [ ] Verify: browser E2E TS-002 and TS-003 pass

### Task 5: Cross-part movements feed

**Objective:** Add a server-rendered feed of the most recent aggregate stock movements across ALL parts (warehouse-wide `StockHistory`): date, part, reason, on-hand/reserved deltas, source, actor. Verified by TS-002 step 4.

**Files:**
- Create: `components/admin/WarehouseMovementsFeed.tsx` — async server component; `db.stockMovement.findMany` `orderBy createdAt desc`, `take: 50`, select reason/deltas/source/note/actorUserId/createdAt + `item { part { name, article } }`; batch-resolve `actorUserId → user.name` (mirror `StockHistory.tsx:48-56`).
- Modify: `app/(admin)/admin/warehouse/page.tsx` — replace feed placeholder with `<WarehouseMovementsFeed />`.

**Key Decisions / Notes:**
- Mirror `components/admin/StockHistory.tsx` but cross-part (add part name/article column, drop the per-part `where`).
- Russian reason labels: RECEIPT→«Поступление», CONSUMPTION→«Списание», ADJUSTMENT→«Корректировка», RESERVATION→«Резерв», RELEASE→«Снятие резерва».
- Aggregate ledger only; bin movements (`StockBinMovement`) are shown in the scan/placement view (Task 9), not this feed.
- **Boundary note:** a host component reading `db.stockMovement` directly is intentional and matches the existing `StockHistory.tsx` pattern — the ESLint boundary (`eslint.config.mjs:50-75`) restricts *imports inside* `lib/wms/**` and host→`lib/wms/internal`, NOT host Prisma access to WMS tables. `npm run lint` stays green (Task 1 DoD).

**Definition of Done:**
- [ ] Feed shows recent movements across all parts: date, part, reason, on-hand delta, reserved delta, source, actor
- [ ] After an inline adjust + refresh, the new ADJUSTMENT appears at the top
- [ ] Verify: browser confirms render + update (TS-002 step 4)

### Task 6: Barcode/GTIN assignment on part edit

**Objective:** Let an admin set/clear a part's `StockItem.barcode`/`gtin` from the part edit form, rejecting a code already held by another item (app-level uniqueness on the non-unique index), so scanning newly assigned codes resolves the part. Verified by TS-004.

**Files:**
- Modify: `components/admin/PartEditForm.tsx` — add `barcode` + `gtin` inputs (+ fields on `PartData`).
- Modify: `app/actions/parts.ts` — in `updatePart`, read `barcode`/`gtin` (empty → `null`); inside the existing transaction, before writing, reject if another `stockItem` in `TENANT_KEY` has the same non-null `barcode` (and same for `gtin`) → `{ error: "Этот штрихкод уже назначен другой позиции" }`; else `tx.stockItem.update({ where:{partId}, data:{ barcode, gtin } })`.
- Modify: `app/(admin)/admin/parts/[id]/page.tsx` — extend `stockItem` select with `barcode`, `gtin`; pass into serialized `part`.

**Key Decisions / Notes:**
- Per-field uniqueness (barcode≠other barcode, gtin≠other gtin) — matches `findViewByCode`'s `OR:[{barcode},{gtin}]` and the non-unique `StockItem_barcode_idx`. Cross-field collision out of scope.
- Keep inside `updatePart`'s `$transaction` (atomic with quantity/part edits). Empty string clears to `null`.
- Extend `scripts/verify-warehouse.ts` with a uniqueness case (assign to A, attempt same on B → expect error).

**Definition of Done:**
- [ ] Edit form shows Barcode + GTIN prefilled from `StockItem`
- [ ] Saving a unique code persists it; reopening shows it
- [ ] Saving a code already used by another item is rejected, not persisted
- [ ] After assigning, `GET /api/stock/lookup?code=<barcode>` resolves the part (TS-004)
- [ ] Verify: `npm run verify-warehouse` (uniqueness case) prints PASS

### Task 7: `StockBin` + `StockBinMovement` schema & migration

**Objective:** Add the WMS-owned multi-bin tables — `StockBin` (per-location on-hand breakdown) and `StockBinMovement` (placement audit) — additively, without altering `StockItem`/`StockMovement`. Verified by migration apply + `prisma validate`.

**Files:**
- Modify: `prisma/schema.prisma` — add `enum StockBinMovementReason { PLACE TRANSFER REMOVE }`; `model StockBin { id @id @default(cuid()); itemId; location; quantity Int @default(0); tenantKey @default("geleoteka"); createdAt; updatedAt; item StockItem @relation(fields:[itemId], references:[id], onDelete: Cascade); @@unique([tenantKey, itemId, location]); @@index([tenantKey, location]) }`; `model StockBinMovement { id; itemId; reason StockBinMovementReason; fromLocation String?; toLocation String?; quantity Int; actorUserId String?; note String?; tenantKey @default("geleoteka"); createdAt @default(now()); item StockItem @relation(...); @@index([tenantKey, itemId, createdAt]) }`; add `bins StockBin[]` and `binMovements StockBinMovement[]` relations to `model StockItem`.
- Create: `prisma/migrations/<ts>_stockbin_placement_layer/migration.sql` (via the migrate command).

**Key Decisions / Notes:**
- Additive only — no change to `StockItem`/`StockMovement` columns (existing consumers untouched). FKs only to `StockItem` (extractable, per seam §3).
- Run `npx prisma migrate dev --name stockbin_placement_layer` then `npx prisma generate`. `Trivial:` no — new tables, but no application logic in this task (logic is Task 8).
- `location` stored normalized (uppercase, trimmed) — normalization happens in the Task 8 ops; the column is a plain string.

**Definition of Done:**
- [ ] `npx prisma validate` passes; migration applies cleanly on the dev DB
- [ ] `npx prisma generate` succeeds; `StockBin`/`StockBinMovement` delegates exist on the client
- [ ] Verify: `npx prisma migrate dev --name stockbin_placement_layer` then `npx prisma validate` exit 0

### Task 8: WMS-core bin placement layer (place/transfer/remove + reads + invariants)

**Objective:** Add the core bin operations to `@/lib/wms/public` — `placeStock`, `transferStock`, `removeFromBin` enforcing `Σbins ≤ quantity` and per-bin sufficiency, plus reads `binsForItem` / `itemsInLocation`, all funnelled through `repository.ts` and audited via `StockBinMovement`. Verified by extended `scripts/verify-warehouse.ts`.

**Files:**
- Modify: `lib/wms/internal/repository.ts` — add `findBin(client, itemId, location, tenantKey)`, `sumBins(client, itemId, tenantKey)`, `upsertBinDelta(client, itemId, location, delta, tenantKey)` (create-or-increment — **raw signed increment, NO silent clamp**; the caller validates sufficiency first, see below), `findBinsForItem(client, itemId, tenantKey)`, `findItemsInLocation(client, location, tenantKey)`, `insertBinMovement(client, row)`. Resolve `itemId`(partId)→`StockItem.id` via `ensureStockItem`.
- Create: `lib/wms/public/placement.ts` — `placeStock` (qty>0, qty ≤ unplaced=`quantity − sumBins`), `transferStock` (from≠to, qty ≤ bin[from]), `removeFromBin` (qty ≤ bin[location]); each writes a `StockBinMovement` and runs in the injected client; normalizes location (uppercase/trim).
- Modify: `lib/wms/public/types.ts` — add `BinPlacement { location: string; quantity: number }`, `ItemPlacement { itemId; quantity; placed; unplaced; reconcileNeeded; bins: BinPlacement[] }`, and the placement input types.
- Modify: `lib/wms/public/errors.ts` — add codes `INSUFFICIENT_UNPLACED`, `INSUFFICIENT_BIN`, `SAME_LOCATION`, `INVALID_QTY` (reuse) with static ctors.
- Modify: `lib/wms/public/index.ts` — export the new ops, reads, and types.
- Modify: `scripts/verify-warehouse.ts` — add cases: place ≤ unplaced ok (bin row + StockBinMovement PLACE); place > unplaced rejected (`INSUFFICIENT_UNPLACED`); transfer moves qty + TRANSFER audit; transfer from==to rejected; `unplaced = max(0, quantity − Σbins)` and `reconcileNeeded` true when `Σbins > quantity` (force via place then aggregate adjust down).

**Key Decisions / Notes:**
- `unplaced = quantity − Σbins`; surface `reconcileNeeded = Σbins > quantity` (Phase-1 drift, see Assumptions). Reads compute these; ops validate against `unplaced` clamped at ≥ 0.
- Placement ops NEVER call `recordMovement` and NEVER change `StockItem.quantity`/`reserved` — they only move stock between `unplaced`↔bin↔bin.
- **No silent clamp — consistent audit (should_fix):** `upsertBinDelta` does a raw signed increment; the sufficiency check (`qty ≤ unplaced` for place, `qty ≤ bin[location]` for remove/transfer-source) and the increment MUST be atomic so the `StockBinMovement` audit can never record a delta that wasn't applied. Use a **conditional update that only decrements when the row still holds enough** (`updateMany({ where: { …, quantity: { gte: qty } }, data: { quantity: { decrement: qty } } })` and check `count === 1`) — if `count === 0`, throw `WmsError.insufficientBin()`/`insufficientUnplaced()` to roll back. This closes the TOCTOU where two concurrent removes both pass a pre-read check and the audit then lies. For `placeStock` the `qty ≤ unplaced` guard is re-derived and checked **inside the tx** before the increment, but it is NOT a single conditional UPDATE — the `Σbins ≤ quantity` invariant spans multiple rows, so full cross-row atomicity (two concurrent putaways) is deferred to the documented low-concurrency assumption (see `## Assumptions`), not enforced by a row lock here.
- All within the injected `client`/tx (atomic). ESLint boundary stays green (no host imports).
- ≤2 test surfaces: extend the single `verify-warehouse.ts` (no new file). `Why >0 new behaviour, 1 script:` all bin behaviour is integration-verified through one script, matching the project's `verify-*` convention.

**Definition of Done:**
- [ ] `placeStock` rejects `qty > unplaced` (`INSUFFICIENT_UNPLACED`) and otherwise creates/increments the bin + a PLACE audit row
- [ ] `transferStock` rejects from==to and `qty > bin[from]`; otherwise moves qty and writes a TRANSFER audit row; `StockItem.quantity` unchanged
- [ ] `removeFromBin` rejects `qty > bin[location]`; otherwise decrements the bin (→ unplaced) + REMOVE audit
- [ ] `binsForItem` returns bins + `placed`/`unplaced`/`reconcileNeeded`; `itemsInLocation` lists items in a location
- [ ] Every applied bin op writes a `StockBinMovement` whose `quantity` equals the delta actually applied (no audit/state divergence) — the conditional-update guard makes a rejected op write nothing
- [ ] Verify: `npm run verify-warehouse` prints PASS (all bin cases); `npm run lint` green

### Task 9: Host bin actions + putaway/transfer UI in the scan view

**Objective:** Expose the core bin ops as role-gated host server actions and wire putaway + bin-to-bin transfer into the scan result, showing the scanned item's bins + `unplaced`. Verified by TS-005.

**Files:**
- Modify: `app/actions/warehouse.ts` — add `placeIntoBin(partId, location, qty)`, `transferBetweenBins(partId, from, to, qty)`, `removeFromBin(partId, location, qty)`; each `const session = await requireRole([...])`, `db.$transaction` → core op with `tenantKey: TENANT_KEY`, `actorId: actorId(session)`; map `WmsError` codes to Russian messages; return `{ error, placement? }` (placement from `binsForItem`).
- Modify: `components/admin/WarehouseScanBox.tsx` — after lookup, fetch + show the item's bins + `unplaced` (via a small read — extend `/api/stock/lookup` response OR a new `binsForItem`-backed fetch); render putaway (location + qty) and transfer (from/to + qty) controls calling the new actions; `router.refresh()` on success.

**Key Decisions / Notes:**
- Surface bins in the scan card. Simplest data path: add `bins`/`unplaced` to the `adjustStock`/lookup result, OR a dedicated `getPlacement(partId)` server action wrapping `binsForItem`. Choose the server-action path to avoid changing the public lookup API contract.
- Reuse the location input as a scan target (operator can scan a printed location label → it types the code).
- Map `INSUFFICIENT_UNPLACED`→«Недостаточно нераспределённого остатка», `INSUFFICIENT_BIN`→«В ячейке недостаточно», `SAME_LOCATION`→«Ячейки совпадают».

**Definition of Done:**
- [ ] Scan card shows the item's bins and `unplaced`
- [ ] Putaway places `unplaced` into a location; over-`unplaced` is rejected with a clear message
- [ ] Transfer moves qty between two locations; from==to rejected; on-hand unchanged
- [ ] Verify: browser E2E TS-005 passes

### Task 10: Location search + location-centric lookup + placement column + reconcile flag

**Objective:** Add a placement summary (placed/unplaced) + "needs reconcile" flag to the overview, a `?loc=` filter, and a location-centric lookup ("what's stored in A-1-1?"). Verified by TS-006.

**Files:**
- Modify: `components/admin/WarehouseOverview.tsx` — add a placement column per row (placed total / unplaced) + reconcile flag. **Batch the bin totals in ONE query (no per-row call):** after the parts query, collect the visible page's StockItem ids and run a single `db.stockBin.groupBy({ by: ["itemId"], where: { itemId: { in: stockItemIds }, tenantKey: TENANT_KEY }, _sum: { quantity: true } })`; build a `Map<itemId, placedSum>` for O(1) per-row lookup; `unplaced = quantity − placedSum`, `reconcileNeeded = placedSum > quantity`. Support `?loc=` by filtering parts to those whose StockItem has a `StockBin` in the normalized location (`some` filter or an id pre-query over `StockBin.location`).
- Create: `components/admin/WarehouseLocationLookup.tsx` — a location input (typed/scanned) → server action wrapping `itemsInLocation` → list of items + quantities stored there.
- Modify: `app/(admin)/admin/warehouse/page.tsx` — render `<WarehouseLocationLookup />`; pass `loc` to overview.

**Key Decisions / Notes:**
- **Single batch query for placement (must_fix):** exactly one `stockBin.groupBy` per page render for placed totals — NOT `binsForItem` per row (that would be 25 queries for a 25-row page on a hot SSR path). The `_sum.quantity` map is joined to the already-fetched part rows in memory.
- Reconcile flag styling via CSS variable (warning), no hardcoded hex.
- `?loc=` matches normalized location (uppercase/trim) to align with Task 8 normalization.

**Definition of Done:**
- [ ] Overview shows placed/unplaced per part and a reconcile flag when `Σbins > quantity`
- [ ] Placement totals come from a SINGLE `stockBin.groupBy` per page (no per-row bin query) — confirm StockBin queries = 1 for a 25-row page (query log)
- [ ] `?loc=<code>` narrows the overview to parts stored in that location
- [ ] Location lookup lists items + quantities stored in a scanned/typed location
- [ ] Verify: browser E2E TS-006 passes
