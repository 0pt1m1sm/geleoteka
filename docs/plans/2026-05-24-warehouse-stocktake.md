# Warehouse Phase 3 — Stocktake / инвентаризация Implementation Plan

Created: 2026-05-24
Author: aleksandr.spiskov@gmail.com
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** A warehouse worker generates a count session (by zone / location(s) / full warehouse / part), scans each cell and its items with the system quantity visible, and a manager reviews the found/missing/unexpected/unknown variances and posts them — each posted variance writes a bulk per-part ADJUSTMENT and reconciles the counted bins, with nothing written until the manager approves.

## Out of Scope

- **Auto write-off** — variances are NEVER posted automatically; an ADMIN/MANAGER review+post is mandatory.
- **Blind counting** — v1 is informed (system qty shown during count); a reveal-toggle is deferred.
- **Closing the unplaced↔bin drift from outbound consumption** — that is Phase 4 (bin-aware picking). Stocktake observes the drift but does not fix its source.
- **Count-sheet PDF / printable worksheets** — counting is screen-driven; label printing already exists for cells/items.
- **Per-physical-unit serialization** — model stays quantity-aggregate (Part + StockBin), per the roadmap's 2026-05-23 decision.

## Approach

**Chosen:** New WMS-owned `StockCountSession` + `StockCountLine` tables and a `lib/wms/public/stocktake.ts` core, posted through the existing `recordMovement` (ADJUSTMENT) + `placeStock`/`removeFromBin` chokepoints; scan resolution reuses `parseScanCode` + `/api/warehouse/scan`; UI lives at a new `/admin/warehouse/stocktake` sub-route.
**Why:** Reusing the audited movement + placement primitives means posting introduces zero new aggregate-mutation logic (only orchestration), keeping the `lib/wms` host-agnostic seam intact; a sub-route (not the single warehouse page) fits the stateful multi-step count→review→post lifecycle. Cost: a new migration and two new tables, justified because sessions must persist across time and support review.

## Context for Implementer

**`postCountSession` is the transaction boundary AND the idempotency guard.** The action layer calls it with the base `db`; the function opens exactly ONE `db.$transaction` and does everything inside it. The FIRST statement inside re-reads the session row: if already `POSTED` → return success (no-op, retry-safe); if not `REVIEW` → error. This status flip (`REVIEW`→`POSTED`, set last) is the sole idempotency mechanism — do NOT rely on per-operation idempotency keys for retry safety (see next note). A post that throws rolls back the status flip with everything else, so a retry re-enters cleanly.

**Why placement ops inside the post carry NO idempotency key.** `placeStock`/`removeFromBin` self-wrap in their own `$transaction` only when handed a base client (`txCapable(client)` true) AND a key; inside the outer transaction the client is a Prisma tx-client (no `$transaction`), so the self-wrap is skipped and they compose with the outer tx — good. But a *keyed* bin op routes through `auditBinMovement`, which **throws `DUPLICATE_OPERATION` on a same-key replay** (unlike `recordMovement`, which no-ops). So keyed bin ops would make a retry throw, not no-op. Resolution: call `placeStock`/`removeFromBin` with the tx-client and **no key** (atomicity comes from the outer tx; retry safety comes from the session status guard above). The per-part ADJUSTMENT still carries `source {type:"StockCount", id:"<sessionId>:<partId>"}` — the `@@unique([tenantKey, sourceType, sourceId, reason])` (no itemId, so the partId suffix is mandatory to avoid cross-part collision) is the uniqueness backstop; no `idempotencyKey` needed since the status guard already prevents replay.

**Posting order (keeps `Σbins ≤ quantity` at every step).** Per part, after the guards below: **(1) bin DECREASES** (`removeFromBin`: shortages + MISSING, bin→unplaced) → **(2) net ADJUSTMENT** (`recordMovement` `ADJUSTMENT`, signed Σ; skip if 0) → **(3) bin INCREASES** (`placeStock`: surpluses + UNEXPECTED, unplaced→bin).

**Two pre-write guards that make the invariant actually hold.** The ordering above is only safe when the part STARTS consistent. Existing code permits drift (`binsForItem` sets `reconcileNeeded` when placed > on-hand; `recordMovement` has no negative/reserved floor on ADJUSTMENT). So before any write, per touched part, read LIVE `quantity`, `reserved`, `Σbins` and block (dedicated error, surfaced in review, session stays REVIEW) when: (a) live `Σbins > quantity` (pre-existing reconcile drift — stocktake refuses to post on top of it), or (b) the planned net ADJUSTMENT would drive `quantity` below `reserved` or below 0. Also pre-check that every PLACE-target location (UNEXPECTED + surplus cells) is usable BEFORE writing — a blocked/inactive cell makes `placeStock` throw `LOCATION_BLOCKED` mid-transaction and roll back the whole post; fail fast with a clear message naming the cell instead.

**Drift detection must compare the FULL live scope, not just snapshot lines.** Re-reading each existing line's bin qty misses a NEW bin created in an in-scope location/part after the sheet was generated (no line exists to compare). Persist the resolved scope on the session (`scopeLocations String[]`, `scopePartIds String[]`; FULL = both empty + the FULL marker) and at post enumerate the LIVE `StockBin` rows matching the scope predicate, building a `(location,itemId)→qty` map. Any cell where live ≠ snapshot — changed, removed, OR newly present — is `COUNT_DRIFT`. Collect all, throw before any write.

**The unplaced consequence (why review is mandatory).** Bins-are-truth treats each counted cell's variance as an on-hand change, so counting stock into a cell the system had at 0 (UNEXPECTED) raises on-hand even if that stock already existed as *unplaced*. The review screen MUST show, per part, `on-hand X→Y` and `unplaced U→U'` computed from the **LIVE** `StockItem.quantity`/`Σbins` at render time (the page is `force-dynamic`, so this is free) — never a snapshot, or a concurrent out-of-scope receive makes the projection lie. No auto write-off; review is the safety net.

## Assumptions

- The set of a part's StockBins is small (single-to-low-double digits), so materializing count lines from a `StockBin` snapshot and re-reading them at post is cheap — Tasks 2, 4, 5 depend on this (no pagination of count lines in v1).
- `parseScanCode` + the article resolver already resolve every label a counter will scan (`WMS:LOC:` cells, `WMS:PART:`/barcode/article items) — Task 3/5 reuse it rather than adding new scan parsing.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Spurious on-hand increase when counting already-unplaced stock into a cell (bins-are-truth) | Medium | Medium | Review shows per-part `on-hand X→Y` + `unplaced U→U'` from LIVE state; mandatory ADMIN/MANAGER post gate; verify scenario asserts the surfaced delta matches Σ(counted−system). |
| Concurrent op clobbered by a stale count — incl. a NEW bin in an in-scope cell with no count line | Medium | High | Post enumerates the full LIVE scoped `(location,itemId)→qty` map and compares to the snapshot; any changed/removed/new cell → `COUNT_DRIFT`, blocks the post, routes to re-count. Verify scenarios cover both a changed existing line AND a newly-created in-scope bin. |
| Posting on top of pre-existing reconcile drift (`Σbins > quantity`) leaves the invariant violated | Medium | High | Per-part pre-write guard blocks the post (dedicated `RECONCILE_BLOCKED` error, surfaced in review) when live `Σbins > quantity` or the ADJUSTMENT would push `quantity` below reserved/0. Verify scenario seeds drift and asserts the post is refused with no writes. |
| `placeStock` throws `LOCATION_BLOCKED` mid-post for an UNEXPECTED item in a blocked cell, rolling back everything and stranding the session in REVIEW | Low | Medium | Pre-check all PLACE-target locations usable before any write; fail fast with a message naming the blocked cell; session stays REVIEW with an actionable error. Verify scenario blocks a cell between count and post. |
| Post retry double-applies bin mutations | Medium | High | `postCountSession` re-reads session status inside the tx and returns a no-op for an already-`POSTED` session before any write; bin ops carry no idempotency key (which would throw `DUPLICATE_OPERATION` on replay). Verify scenario asserts a second post is a clean no-op. |

## Goal Verification

### Truths

1. When a session over parts that start consistent (`Σbins ≤ quantity`) is posted, every counted cell's `StockBin` equals the counted qty and each touched part's on-hand has changed by exactly Σ(counted − systemQty) over that session's cells, with `Σbins ≤ quantity` preserved; a part that starts inconsistent, or whose variance would push on-hand below reserved/0, blocks the post instead (nothing written).
2. A session cannot be posted if ANY in-scope cell's live stock differs from the snapshot — changed, removed, or newly created with no count line — the post is blocked, the drifted cells are surfaced, and no stock is written until they are re-counted.
3. Every posted variance appears in the movements feed as an ADJUSTMENT sourced to the count session; unknown scans are saved as flagged lines that post nothing; a second post of an already-posted session is a no-op.

## E2E Test Scenarios

### TS-001: Create a count session by location
**Priority:** Critical
**Preconditions:** Logged in as admin; cell A-1-1 holds ≥1 placed part.
**Mapped Tasks:** Task 1, Task 3, Task 4

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/admin/warehouse/stocktake` | Sessions list + "Новый пересчёт" form visible |
| 2 | Choose scope "По ячейке", enter `A-1-1`, submit | Redirects to `/admin/warehouse/stocktake/<id>`; session OPEN; a count line for each part currently in A-1-1 with its system qty shown |

### TS-002: Count a cell — match, variance, unexpected
**Priority:** Critical
**Preconditions:** Open session scoped to A-1-1 (TS-001).
**Mapped Tasks:** Task 3, Task 5

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Scan/enter the cell `WMS:LOC:A-1-1` | Cell context set; expected items listed with system qty (informed) |
| 2 | Enter counted = system for one item | Line marked FOUND, variance 0 |
| 3 | Enter counted ≠ system for another item | Line FOUND with signed variance shown |
| 4 | Scan an item not expected in A-1-1, enter qty | New UNEXPECTED line (system 0, counted M) |
| 5 | Click "Завершить пересчёт" | Session → REVIEW; any unscanned expected line shown as MISSING |

### TS-003: Review and post — variance hits the ledger
**Priority:** Critical
**Preconditions:** Session in REVIEW with ≥1 non-zero variance (TS-002).
**Mapped Tasks:** Task 2, Task 3, Task 5

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | On the REVIEW screen, inspect a varianced part | Shows `on-hand X→Y` and `unplaced U→U'` |
| 2 | Click "Провести" (as admin) | Session → POSTED; counted bins now equal counted qty |
| 3 | Open the warehouse movements feed | An ADJUSTMENT row per varianced part, sourced to the count session |

### TS-004: Drift blocks the post (changed line AND new uncounted bin)
**Priority:** High
**Preconditions:** Session in REVIEW. Variant A: an existing counted line's bin qty is changed after generation. Variant B: a NEW bin (different part, had no count line) is created in an in-scope cell after generation.
**Mapped Tasks:** Task 2, Task 3, Task 5

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | (A) Change a counted cell's stock, then click "Провести" | Post rejected; the drifted cell flagged with a re-count prompt; no movements written |
| 2 | (B) Receive a different part into an in-scope cell (creating a new bin with no line), then click "Провести" | Post rejected; the new cell surfaced as drift; no movements written |

### TS-005: Unknown scan is flagged, not posted
**Priority:** Medium
**Preconditions:** Open session.
**Mapped Tasks:** Task 3, Task 5

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Scan a code that resolves to no part | An UNKNOWN line is saved showing the raw code |
| 2 | Finalize and post | The UNKNOWN line posts nothing; it remains visible for catalog follow-up |

## E2E Results

| Scenario | Priority | Result | Notes |
|----------|----------|--------|-------|
| TS-001 (create LOCATION session) | Critical | PASS | Live on dev server — redirect to session, OPEN, line materialized |
| TS-002 (count cell, informed, finalize) | Critical | PASS | Live — system qty shown, variance recorded, REVIEW with projection |
| TS-003 (review + post → ledger) | Critical | PASS | Live — POSTED, on-hand 10→12, bin reconciled, ADJUSTMENT sourced to session |
| TS-004 (drift block) | High | PASS (unit) | verify-stocktake (d) covers changed + new-bin drift; reconcile-block variant confirmed live |
| TS-005 (unknown scan) | Medium | PASS (unit) | verify-stocktake (e); UI "Добавить позицию" wired to recordCountAction unknown path |

Post-review hardening verified live: corrected unplaced projection renders `без места 6→6` (invariant under bins-are-truth), confirming the Codex HIGH-2 fix end-to-end.

## Not Verified

| Not Verified | Reason |
|--------------|--------|
| WAREHOUSE_WORKER blocked from posting (post gate) | Enforced by `requireRole(["ADMIN","MANAGER"])` at the action layer — the standard auth pattern used across the app; not unit-testable in the tsx verify scripts without a session-mocking harness the project doesn't have. |
| TS-004/TS-005 via browser | Core logic exhaustively covered by verify-stocktake (d)+(e); UI structured-error path confirmed live via the reconcile-block variant. Full browser drift/unknown deferred as redundant given unit coverage + shared wiring. |

## Progress Tracking

- [x] Task 1: Schema + migration for count sessions/lines
- [x] Task 2: Stocktake core module + verify script
- [x] Task 3: Server actions (count = worker, post = admin/manager)
- [x] Task 4: Stocktake list + new-session UI + warehouse entry link
- [x] Task 5: Session counting + review/post UI + roadmap doc update

## Implementation Tasks

### Task 1: Count-session schema + migration

**Objective:** Add the persistence for stocktake: a `StockCountSession` (lifecycle + scope descriptor + audit) and per-(part, location) `StockCountLine` (system snapshot, counted, classification, posted delta), both tenant-scoped and WMS-owned. Materializes everything the count→review→post flow needs.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<generated>/migration.sql` (via `prisma migrate dev`)

**Key Decisions / Notes:**
- New enums: `StockCountStatus { OPEN REVIEW POSTED CANCELLED }`, `StockCountScope { ZONE LOCATION FULL PART }`, `StockCountClassification { FOUND MISSING UNEXPECTED UNKNOWN }`.
- `StockCountSession`: `id, status, scope, scopeValue String?` (zone name / comma codes / category-or-part ref — display label), `scopeLocations String[]`, `scopePartIds String[]` (the RESOLVED scope, persisted so the post-time drift query can enumerate the full live scoped bin map; FULL scope = both empty + `scope=FULL` marker meaning "all tenant bins"), `note String?`, `createdByUserId String?`, `createdAt`, `postedByUserId String?`, `postedAt DateTime?`, `tenantKey String @default("geleoteka")`. Index `@@index([tenantKey, status, createdAt])`.
- `StockCountLine`: `id, sessionId, itemId String?` (nullable for UNKNOWN), `rawCode String?` (UNKNOWN scan payload), `location String`, `systemQty Int` (snapshot at generation), `countedQty Int?` (null until counted), `classification StockCountClassification?`, `postedDelta Int?`, `createdAt, updatedAt, tenantKey`. FK `session StockCountSession @relation(... onDelete: Cascade)`. `@@index([tenantKey, sessionId])`. No itemId FK to Part (mirror `StockMovement.actorUserId` opacity? — itemId IS a partId here; follow `StockBin.itemId` which has no FK either at the bin layer — keep it a plain String for the host seam).
- Follow existing model conventions (lines 924–1062): `tenantKey` default, cuid ids, created/updated timestamps.
- `Trivial:` NOT trivial (new tables) — no test file; schema is exercised by Task 2's verify script.

**Definition of Done:**
- [ ] `npx prisma validate` passes; `npx prisma migrate dev --name warehouse_stocktake` applies cleanly; `npx prisma generate` regenerates the client.
- [ ] The three enums and two models exist with tenant-scoped indexes.

### Task 2: Stocktake core module + verify script

**Objective:** Implement the host-agnostic stocktake engine in `lib/wms/public/stocktake.ts`: create a session (materialize lines from a `StockBin` snapshot per scope), record counts/unknowns, finalize (classify MISSING), and post (drift-check, then bins-are-truth reconcile via the removes→adjust→places ordering) — all reusing `recordMovement`/`placeStock`/`removeFromBin`. A `verify-stocktake.ts` tsx script proves the invariants. Verified by TS-003/TS-004/TS-005.

**Files:**
- Create: `lib/wms/public/stocktake.ts`
- Modify: `lib/wms/public/index.ts` (export the public surface)
- Modify: `lib/wms/public/errors.ts` (add `WmsError.countDrift()` → code `COUNT_DRIFT`)
- Create: `scripts/verify-stocktake.ts`
- Modify: `package.json` (add `"verify-stocktake": "tsx scripts/verify-stocktake.ts"`)

**Key Decisions / Notes:**
- Functions (all take `DbClientPort` + `tenantKey`, mirror `scan-receive.ts` signatures): `createCountSession(client, {scope, scopeValue, locations?, partIds?, actorId})` resolves + persists the scope (`scopeLocations`/`scopePartIds`) and materializes one line per in-scope `StockBin` with `systemQty = bin.quantity`, `classification=null`; `recordCount(client, {sessionId, itemId, location, countedQty})` upserts a line (FOUND if a snapshot line exists, UNEXPECTED if none) — last write wins; `recordUnknownScan(client, {sessionId, location, rawCode})`; `finalizeSession(client, sessionId)` OPEN→REVIEW, sets uncounted snapshot lines to MISSING (countedQty 0); `postCountSession(client, {sessionId, actorId})` REVIEW→POSTED; `cancelSession`; reads `getCountSession`, `listCountSessions`, `sessionVariance(sessionId)` — per-part `on-hand X→Y` + `unplaced U→U'` projection computed from **LIVE** `StockItem.quantity`/`Σbins` (NOT the snapshot — a concurrent out-of-scope receive must be reflected).
- **Posting (the crux — read Context for Implementer in full).** `postCountSession` opens ONE `db.$transaction` and does all of the following inside it, in order:
  1. **Status guard / idempotency:** re-read the session; if `POSTED` → return success no-op; if not `REVIEW` → error. (This is the ONLY retry guard — bin ops below carry NO idempotency key, because a keyed replay throws `DUPLICATE_OPERATION` via `auditBinMovement` rather than no-opping.)
  2. **Full-scope drift check:** enumerate LIVE `StockBin` rows matching the persisted scope (`scopeLocations`/`scopePartIds`; FULL = all tenant bins) into a `(location,itemId)→qty` map; compare to the snapshot lines. Any changed / removed / newly-present cell → collect; if any → `throw WmsError.countDrift()` with the drifted `(location,itemId)` list. No writes.
  3. **Per-part pre-write guards:** for each touched part read LIVE `quantity`, `reserved`, `Σbins`; block (`throw WmsError.reconcileBlocked()`, naming the part) if `Σbins > quantity` OR the planned net ADJUSTMENT would push `quantity` below `reserved` or below 0.
  4. **Blocked-location pre-check:** for every PLACE-target cell (UNEXPECTED + surplus lines) call `assertLocationUsable`; if it throws `LOCATION_BLOCKED`, surface it naming the cell (fail fast — do NOT discover this mid-write).
  5. **Apply per part:** REMOVE decreases (`removeFromBin`, tx-client, **no key**) → net `recordMovement` ADJUSTMENT (signed Σ, `source {type:"StockCount", id:"<sessionId>:<partId>"}`, no `idempotencyKey`; skip if 0) → PLACE increases (`placeStock`, tx-client, **no key**). Record `postedDelta` per line. UNKNOWN lines (itemId null) post nothing.
  6. Set status `POSTED`, `postedAt`, `postedByUserId` (last, so a throw rolls it back).
- Scope materialization (creation): ZONE → `StockLocation` codes with that zone → their bins, persist codes in `scopeLocations`; LOCATION → given codes' bins, persist codes; FULL → all tenant `StockBin`, leave scope arrays empty + `scope=FULL`; PART → given partIds' bins, persist `scopePartIds` (category→partIds expansion happens in the action layer).
- `errors.ts`: add `WmsError.countDrift()` (`COUNT_DRIFT`) and `WmsError.reconcileBlocked()` (`RECONCILE_BLOCKED`) to the `WmsErrorCode` union + factories, matching the existing pattern.
- Verify scenarios (one tsx script, fixtures prefixed `VERIFY-ST-`, cleanup cascade): (a) create-by-location persists scope + snapshots lines; (b) FOUND-match / FOUND-variance / UNEXPECTED / MISSING classification; (c) post on a consistent part applies Σ(counted−system) ADJUSTMENT per part, sets each counted bin to counted, asserts `Σbins ≤ quantity` after; (d) drift — both a CHANGED existing line's bin AND a NEW in-scope bin with no line → `postCountSession` throws `COUNT_DRIFT`, asserts zero movement/bin writes; (e) unknown scan → flagged line, posts nothing; (f) retry — second `postCountSession` on a POSTED session is a clean no-op (no double bin/movement write); (g) pre-existing drift — seed `Σbins > quantity`, assert post throws `RECONCILE_BLOCKED`, no writes; (h) blocked PLACE-target cell → post fails fast naming the cell, session stays REVIEW, no writes.
- `Why >2 test classes:` N/A — single tsx verify script (project has no jest/vitest; pattern = `verify-scan-receiving.ts`).
- Reuse `assertPositive`/`normalizeLocation`/`binsForItem` from placement.ts; do NOT re-implement bin math.

**Definition of Done:**
- [ ] `npm run verify-stocktake` exits 0 with all scenarios (a)–(h) passing.
- [ ] Posting a consistent session with mixed FOUND-variance + MISSING + UNEXPECTED leaves each counted bin = counted and on-hand changed by exactly Σ(counted−system), `Σbins ≤ quantity`.
- [ ] Drift (a changed line OR a new in-scope bin), pre-existing `Σbins > quantity`, and a blocked PLACE-target each make the post throw the right error and write nothing; a repeat post of a POSTED session is a no-op.

### Task 3: Stocktake server actions

**Objective:** Thin `"use server"` wrappers over the Task 2 core with role gates — create/count/finalize/cancel callable by ADMIN/MANAGER/WAREHOUSE_WORKER; post callable by ADMIN/MANAGER only (the review gate). Item-code resolution reuses the existing scan resolver. Verified by TS-001..TS-005.

**Files:**
- Create: `app/actions/stocktake.ts`

**Key Decisions / Notes:**
- Mirror `app/actions/warehouse.ts` structure: `requireRole`, `actorId(session)`, `TENANT_KEY`, `db.$transaction` for writes, Prisma `@ts-nocheck` casts as needed. Extend `wmsErrorMessage` (lib/warehouse/wms-error-message.ts) to map the new `COUNT_DRIFT` and `RECONCILE_BLOCKED` codes (and confirm `LOCATION_BLOCKED` already maps) to Russian messages.
- Actions: `createCountSessionAction(scope, scopeValue)`, `recordCountAction(sessionId, rawItemCode, location, countedQty)` (resolve `rawItemCode`→partId via `parseScanCode` + article fallback exactly like `scan/route.ts:45`; unresolved → `recordUnknownScan`), `finalizeSessionAction(sessionId)`, `postCountSessionAction(sessionId)` — `requireRole(["ADMIN","MANAGER"])`, returns `{ error, drift?: Array<{location,itemId}>, blockedLocation?: string, reconcilePartId?: string }` so the UI can surface WHICH guard fired, `cancelSessionAction(sessionId)`, `getCountSessionAction`, `listCountSessionsAction`.
- The post throws come back as caught `WmsError`s: map `COUNT_DRIFT`→`{drift}`, `RECONCILE_BLOCKED`→`{reconcilePartId}`, `LOCATION_BLOCKED`→`{blockedLocation}`; the session stays REVIEW in every blocked case (the throw rolled back the status flip).
- PART scope with a category value: expand category→partIds here (host catalog concern), then call core with partIds.
- `Trivial:` not trivial (role gates + structured error returns are behavioral) — covered by Task 2's core verify + TS scenarios; no separate unit test class (actions are thin pass-throughs).

**Definition of Done:**
- [ ] `postCountSessionAction` returns a structured block (`drift` / `reconcilePartId` / `blockedLocation`) on each guard and writes nothing; succeeds for ADMIN/MANAGER only (WAREHOUSE_WORKER blocked from posting).
- [ ] `recordCountAction` with an unresolvable code creates an UNKNOWN line rather than erroring.

### Task 4: Stocktake list + new-session UI + warehouse entry

**Objective:** A `/admin/warehouse/stocktake` page listing sessions (status, scope, variance summary, dates) with a "Новый пересчёт" form (scope picker: zone / location(s) / full / part-or-category), plus an "Инвентаризация" entry link from the main warehouse page. Verified by TS-001.

**Files:**
- Create: `app/(admin)/admin/warehouse/stocktake/page.tsx`
- Create: `components/admin/StocktakeSessionList.tsx`
- Create: `components/admin/StocktakeNewSession.tsx`
- Modify: `app/(admin)/admin/warehouse/page.tsx` (add entry link/section to `/admin/warehouse/stocktake`)

**Key Decisions / Notes:**
- `page.tsx`: `export const dynamic = "force-dynamic"`, `requireRole(["ADMIN","MANAGER","WAREHOUSE_WORKER"])` — follow the existing warehouse page (uses `requireRole`, not the conventions-doc `getSession` note; match the established local pattern).
- New-session form is a client component calling `createCountSessionAction`; on success `router.push` to `/admin/warehouse/stocktake/<id>`. Scope picker maps to the `StockCountScope` enum + a value input shown conditionally (zone name / cell codes / part-or-category).
- Use existing design-system classes (`.card`, `.btn`, `.badge`, `.input`) and `PageHeader`; CSS variables only (no hardcoded hex), per `geleoteka-conventions.md`.
- `Trivial:` not trivial (new route + forms) — verified by browser E2E TS-001; no unit test (UI wiring).

**Definition of Done:**
- [ ] `/admin/warehouse/stocktake` lists sessions and creates a new one that redirects to its detail page with lines materialized (TS-001).
- [ ] The main warehouse page links to the stocktake section.

### Task 5: Session counting + review/post UI + roadmap doc update

**Objective:** The session detail page driving the full lifecycle: OPEN scan-driven counting (scan cell → informed item lines + counted entry; unexpected/unknown handling; finalize), REVIEW variance table with per-part on-hand/unplaced projection + drift flags + Post(admin/manager)/Cancel, and POSTED/CANCELLED read-only summary. Marks roadmap Phase 3 shipped. Verified by TS-002..TS-005.

**Files:**
- Create: `app/(admin)/admin/warehouse/stocktake/[id]/page.tsx`
- Create: `components/admin/StocktakeCountBox.tsx`
- Create: `components/admin/StocktakeReview.tsx`
- Modify: `docs/prd/2026-05-22-warehouse-wms-roadmap.md` (mark Phase 3 shipped, reference this plan)

**Key Decisions / Notes:**
- Counting reuses scan resolution: scan `WMS:LOC:` cell (via the same `/api/warehouse/scan` POST, which returns a location card listing expected items) to set the active cell; scan an item → `recordCountAction(sessionId, rawCode, location, countedQty)`. Informed: render each line's `systemQty` next to the counted input. Reuse the `QrScanner` component + the typed-LOC insight from `WarehouseScanBox` (scanner resolves locations only via `WMS:LOC:` — build payloads with `formatScanCode("LOC", code)`).
- REVIEW (`StocktakeReview`): variance table grouped by classification (FOUND/MISSING/UNEXPECTED/UNKNOWN) with system vs counted vs delta; per-part `on-hand X→Y` + `unplaced U→U'` from `sessionVariance` (which reads LIVE StockItem state — see Task 2); "Провести" calls `postCountSessionAction` and handles each structured block: `{drift}` → highlight those cells + prompt re-count (route back to counting), `{reconcilePartId}` → show the pre-existing-drift message for that part, `{blockedLocation}` → show "cell blocked" naming it; in every blocked case the session is still REVIEW (no writes). Post button hidden for WAREHOUSE_WORKER.
- localStorage (if any client persistence) uses `useSyncExternalStore` with cached snapshots per `geleoteka-conventions.md`; do NOT use `useState`+`useEffect` for it. Performance: the count-line list re-renders on each scan — key list rows and avoid recomputing the variance projection when inputs are unchanged.
- Doc sync: update the roadmap Phase 3 entry to "Shipped" with the plan path (per documentation-sync rule).
- `Trivial:` not trivial — verified by browser E2E TS-002..TS-005.

**Definition of Done:**
- [ ] Counting a cell records FOUND/variance/UNEXPECTED lines and finalize moves uncounted lines to MISSING (TS-002).
- [ ] Review shows per-part on-hand/unplaced projection; posting (as admin) writes ADJUSTMENTs visible in the movements feed (TS-003); drift blocks the post and flags cells (TS-004); UNKNOWN posts nothing (TS-005).
- [ ] Roadmap doc marks Phase 3 shipped.
