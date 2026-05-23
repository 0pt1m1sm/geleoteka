# Warehouse Phase 2.5 — Phone QR-Scanning Foundation Implementation Plan

Created: 2026-05-23
Author: aleksandr.spiskov@gmail.com
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** A warehouse operator can scan a typed QR (`WMS:PART:…` / `WMS:LOC:…`) with a phone camera, every scan (including failures) is recorded in a `ScanEvent` audit, a new `warehouse_worker` role can run the warehouse flows, write operations dedupe on a client `idempotency_key`, and locations can be blocked so putaway/transfer into them is rejected with `LOCATION_BLOCKED`.

## Out of Scope

- **Pick / pack / ship** (`WRONG_ITEM`, order-line match) — Phase 4/4b. The scan endpoint recognizes `WMS:ORDER:`/`WMS:BOX:` but returns `WRONG_OBJECT_TYPE` (not yet supported), logging the scan.
- **Stocktake / инвентаризация** (`cycle-count`, found/missing/unexpected) — Phase 3.
- **Per-physical-unit serialized model** — explicitly rejected by the roadmap; we stay quantity-aggregate (`StockItem.quantity` + `StockBin` placement).
- **HMAC / device-binding / signed QR** — PRD §17 "позже"; MVP trusts internal id + backend role checks.
- **No FK from `StockBin.location` → `StockLocation.code`** — the registry is matched by normalized code string; adding a relational FK would force a destructive migration on the live placement layer for no Phase-2.5 benefit.
- **Per-item reorder points / multi-warehouse** — Phase 5/6.

## Approach

**Chosen:** Extend the existing extractable WMS core (`lib/wms/public`) with three host-agnostic primitives — a pure QR parser/formatter (`qr.ts`), a `StockLocation` registry with `LOCATION_BLOCKED` enforcement wired into the existing `placeStock`/`transferStock`, and `ScanEvent` recording + a generalized `idempotency_key` threaded through `recordMovement` and the placement ops. The host adds a thin `POST /api/warehouse/scan` adapter (auth + parse + log + envelope, resolution delegated to a host `scan-router` helper), a `@zxing/browser` camera component wired into the existing `WarehouseScanBox`, `warehouse_worker` role plumbing, and a small location block/unblock admin surface.

**Why:** Keeps the one-way host→core dependency intact (the scanning + location + audit logic extracts with the grocery product; only the route/component/role plumbing is host-side and deletable), and retrofits the camera + typed QR onto the already-shipped lookup/putaway/move flows rather than rebuilding them — at the cost of one new registry table whose block semantics deliberately diverge from the roadmap's literal "StockBin.is_active" wording (a bin is per-item; a location is blocked for all items).

## Context for Implementer

The WMS core (`lib/wms/`) must import **zero** host/CRM/app code — ESLint enforces this (`eslint.config.mjs`, the `lib/wms/**` block). The only allowed bridge is the *generated Prisma types* via the injected `DbClientPort` in `lib/wms/internal/repository.ts`. New core code (`qr.ts`, `locations.ts`, `scan.ts`) follows the existing pattern: the public function receives an injected `client: DbClientPort`, the host passes `wmsDb` + `TENANT_KEY` from `lib/wms-host`. `ScanEvent.userId` and the location/scan APIs treat the user id as an **opaque string** — never import `User`. Locations are normalized **upper/trimmed** everywhere (matches `normalizeLocation` in `lib/wms/public/placement.ts:23`). The project has **no unit-test runner**; the testing convention is a standalone `tsx scripts/verify-*.ts` integration script asserting against the dev DB on throwaway `VERIFY-…` entities (see `scripts/verify-warehouse.ts`) — Phase 2.5 adds `scripts/verify-qr-scanning.ts` and a `verify-qr-scanning` npm script.

## Runtime Environment

- **Start:** `npm run dev` (Next.js 16, port **443**, HTTPS self-signed via `--experimental-https`).
- **App URL:** `https://localhost` (port 443). Browser automation must accept the self-signed cert.
- **DB:** `postgresql://alex@localhost:5432/geleoteka`. Migrations: `npx prisma migrate dev`.
- **Dev creds:** admin `admin@geleoteka.ru` / `admin123`. A `warehouse_worker` test user must be created (seed or manual) to verify role access.

## Assumptions

- Existing `StockBin.location` values are the authoritative seed set for the `StockLocation` registry — Task 1's backfill creates one active, unblocked `StockLocation` per distinct existing location. Tasks 3, 8 depend on this.
- The phone runs iOS Safari or Android Chrome with `getUserMedia` over HTTPS (the dev server is HTTPS; Railway prod is HTTPS). Task 7 depends on this; manual entry is the fallback when camera permission is denied or unavailable.
- `crypto.randomUUID()` is available in the browser (HTTPS secure context) for client-generated idempotency keys. Task 6/7 depend on this.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Adding `idempotencyKey` `@@unique([tenantKey, idempotencyKey])` collides existing rows | Low | High | Column is nullable; Postgres treats NULLs as distinct, so all pre-existing rows (null key) remain unique. New unique only constrains rows that carry a key. Verify migration applies on a populated dev DB. |
| Placement idempotency must not half-apply (bin mutated but op double-counted) | Med | High | When a key is supplied, insert the audit row (carrying the key) **first** inside the caller's `$transaction`; a duplicate key → P2002 → `DUPLICATE_OPERATION` and the transaction rolls back any bin delta. Verified in `verify-qr-scanning.ts`. |
| Camera decode unavailable on iOS Safari without a lib | High | High | `@zxing/browser` `BrowserMultiFormatReader` decodes via canvas (no `BarcodeDetector` dependency); manual text entry is always present as the documented fallback (PRD §11). |

## Goal Verification

### Truths

1. A scan of a typed `WMS:LOC:<code>` whose location is blocked is rejected before any stock moves, and the rejection plus the raw code is queryable in `ScanEvent` (result=rejected, errorCode=LOCATION_BLOCKED) — i.e. the audit captures failures, not just successes.
2. Submitting the same warehouse write twice with one `idempotency_key` changes stock exactly once; the second attempt is a no-op surfaced as a duplicate, with on-hand/bin counters identical to after the first.

## E2E Test Scenarios

### TS-001: Manual-entry scan resolves a part card
**Priority:** Critical
**Preconditions:** Logged in as admin; a part with article `VERIFY-…` and a StockItem exists.
**Mapped Tasks:** Task 2, 5, 7

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `https://localhost/admin/warehouse` | Scan section renders with a camera toggle and a manual-entry input |
| 2 | Type `WMS:PART:<article>` into the manual input and submit | Part card shows name/article/on-hand/available; placement section visible |
| 3 | Type a non-existent `WMS:PART:NOPE` and submit | "Не найдено" shown; no card |

### TS-002: Blocked location is rejected and audited
**Priority:** Critical
**Preconditions:** Admin; a `StockLocation` toggled blocked via the admin surface.
**Mapped Tasks:** Task 3, 5, 8

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | In the locations admin section, block location `B-9-9` | Location row shows blocked state |
| 2 | Resolve a part card, attempt putaway into `B-9-9` | Operation rejected with a "ячейка заблокирована" message; bins unchanged |
| 3 | Scan `WMS:LOC:B-9-9` via manual entry | Location card shows blocked badge |

### TS-003: warehouse_worker can run warehouse ops but not other admin pages
**Priority:** High
**Preconditions:** A user with `permissionRole = WAREHOUSE_WORKER` exists.
**Mapped Tasks:** Task 1, 6

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Log in as the warehouse_worker | Sidebar shows only the warehouse-relevant navigation |
| 2 | Navigate to `/admin/warehouse` and resolve + putaway a part | Operation succeeds |
| 3 | Navigate to `/admin/crm/deals` | Redirected away (no access) |

## E2E Results

| Scenario | Priority | Result | Fix Attempts | Notes |
|----------|----------|--------|--------------|-------|
| TS-001 (manual-entry scan resolves part card) | Critical | PASS | 0 | Live: `WMS:PART:A000989690613` → part card (article fallback). Re-confirmed on production build. |
| TS-002 (blocked location rejected + audited) | Critical | PASS | 0 | Live: blocked C-9 via admin UI → scan shows red "Заблокирована" badge → putaway rejected "Ячейка заблокирована", no bin created. Blocked-LOC scan now audited REJECTED/LOCATION_BLOCKED (review fix). |
| TS-003 (warehouse_worker nav scoping + redirect) | High | VERIFIED_BY_INSPECTION | 0 | Mechanism verified statically: `filterNavForRole` returns warehouse-only nav; leak-audit confirms no non-warehouse admin page admits WAREHOUSE_WORKER; login redirects WW → /admin/warehouse. Live WW-login walk deferred (would log the user out of their active admin session). |

## Progress Tracking

- [x] Task 1: Schema — ScanEvent, StockLocation, idempotencyKey columns, WAREHOUSE_WORKER enum, migration + backfill
- [x] Task 2: Core QR parser/formatter + retrofit labels to typed QR
- [x] Task 3: Core StockLocation registry + LOCATION_BLOCKED enforcement in placement
- [x] Task 4: Core ScanEvent recording + generalized idempotency_key guard
- [x] Task 5: Universal POST /api/warehouse/scan endpoint + scan-router helper
- [x] Task 6: warehouse_worker role plumbing + idempotency_key on write actions
- [x] Task 7: Camera QR scanner component (@zxing/browser) + wire into WarehouseScanBox
- [x] Task 8: StockLocation block/unblock admin surface + warehouse_worker nav scoping

## Implementation Tasks

### Task 1: Schema — ScanEvent, StockLocation, idempotencyKey, WAREHOUSE_WORKER + migration & backfill

**Objective:** Add the data-model foundation for Phase 2.5: the `WAREHOUSE_WORKER` role, the append-only `ScanEvent` audit, the `StockLocation` registry (block/active flags), and a generalized `idempotencyKey` on both movement ledgers. Includes the migration and an idempotent backfill seeding `StockLocation` from existing `StockBin` locations. Verified by TS-002, TS-003.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `scripts/backfill-stock-locations.ts`
- Modify: `package.json` (add `backfill-stock-locations` + `verify-qr-scanning` scripts)
- Modify: `scripts/verify-qr-scanning.ts` (created in Task 2; if Task 1 runs first, create it here)

**Key Decisions / Notes:**
- `enum UserPermissionRole` (schema.prisma:15) += `WAREHOUSE_WORKER` (append after `MANAGER`; do NOT reorder existing values — Postgres `ALTER TYPE ADD VALUE`).
- `enum ScanResult { SUCCESS REJECTED ERROR }`.
- `model ScanEvent { id String @id @default(cuid()); userId String?; deviceId String?; sessionId String?; action String; rawCode String; parsedObjectType String?; parsedObjectId String?; result ScanResult; errorCode String?; tenantKey String @default("geleoteka"); createdAt DateTime @default(now()); @@index([tenantKey, createdAt]); @@index([tenantKey, userId, createdAt]) }` — no relation to `User` (userId is opaque, mirrors `StockMovement.actorUserId`).
- `model StockLocation { id String @id @default(cuid()); code String; zone String?; isActive Boolean @default(true); isBlocked Boolean @default(false); tenantKey String @default("geleoteka"); createdAt DateTime @default(now()); updatedAt DateTime @updatedAt; @@unique([tenantKey, code]); @@index([tenantKey]) }`. `code` is normalized upper/trimmed by callers.
- `StockMovement` (schema.prisma:943) += `idempotencyKey String?` and `@@unique([tenantKey, idempotencyKey])` (NULLs distinct in PG → existing rows unaffected).
- `StockBinMovement` (schema.prisma:992) += `idempotencyKey String?` and `@@unique([tenantKey, idempotencyKey])`.
- Migration: `npx prisma migrate dev --name phase_2_5_qr_foundation` then `npx prisma generate` (custom output `app/generated/prisma`). Reversibility caveat: PG cannot drop an enum value — document in the migration; tables/columns are reversible.
- Backfill (`scripts/backfill-stock-locations.ts`): `SELECT DISTINCT location FROM StockBin WHERE tenantKey` → `stockLocation.upsert` on `tenantKey_code` with `isActive:true, isBlocked:false` (idempotent, create-only — never overwrite an existing block state). Mirror the `dotenv/config` + `db.$disconnect()` shape of `scripts/verify-warehouse.ts`.

**Definition of Done:**
- [ ] `npx prisma validate` passes; `npx prisma migrate dev` applies on the populated dev DB without unique-violation errors.
- [ ] `UserPermissionRole` enum includes `WAREHOUSE_WORKER`; `ScanEvent`, `StockLocation` tables and the two `idempotencyKey` unique indexes exist.
- [ ] `npm run backfill-stock-locations` creates one `StockLocation` per distinct existing `StockBin.location`; a second run adds none and does not reset block/active flags.
- [ ] Verify: `npm run backfill-stock-locations` (run twice; second is a no-op).

### Task 2: Core QR parser/formatter + retrofit labels to typed QR

**Objective:** Add a pure, host-agnostic typed-QR parser and formatter to the WMS core, and switch the existing label generation to emit the typed format. The parser routes `WMS:PART|LOC|ORDER|BOX:<id>`, treats an un-prefixed payload as a legacy raw code (backward-compat for already-printed labels), and flags malformed `WMS:` payloads as unknown. Verified by TS-001.

**Files:**
- Create: `lib/wms/public/qr.ts`
- Modify: `lib/wms/public/index.ts`
- Modify: `app/(admin)/admin/warehouse/labels/page.tsx`
- Create: `scripts/verify-qr-scanning.ts` (if not created in Task 1)

**Key Decisions / Notes:**
- Discriminated union: `type ParsedScanCode = { type: "PART"|"LOC"|"ORDER"|"BOX"; id: string; raw: string } | { type: "RAW"; id: string; raw: string } | { type: "UNKNOWN"; raw: string }`. Export the union + `ScanObjectType`.
- `parseScanCode(raw: string): ParsedScanCode` — trim; if it matches `/^WMS:(PART|LOC|ORDER|BOX):(.+)$/i` → typed (uppercase the type; for `LOC` upper/trim the id to match location normalization); if it starts with `WMS:` but doesn't match → `UNKNOWN`; otherwise `RAW` (legacy plain barcode/article/location).
- `formatScanCode(type: ScanObjectType, id: string): string` → `` `WMS:${type}:${id}` ``.
- Pure module — no DB, no host imports. Export both from `lib/wms/public/index.ts`.
- Labels (`labels/page.tsx:52,58`): part payload becomes `formatScanCode("PART", p.stockItem?.barcode ?? p.article)`; location payload becomes `formatScanCode("LOC", location)`. The `sub` caption stays the human-readable code (not the typed string).
- `verify-qr-scanning.ts` skeleton: copy the `assert` + `main()` + `.finally($disconnect)` shape from `scripts/verify-warehouse.ts`; this task adds the pure parser/formatter assertions (typed round-trip, legacy RAW passthrough, malformed → UNKNOWN, LOC id normalization).

**Definition of Done:**
- [ ] `parseScanCode("WMS:PART:ABC")` → `{type:"PART", id:"ABC"}`; `parseScanCode("WMS:LOC:b-9-9")` → `{type:"LOC", id:"B-9-9"}`; `parseScanCode("PLAINCODE")` → `{type:"RAW", id:"PLAINCODE"}`; `parseScanCode("WMS:WAT:x")` → `{type:"UNKNOWN"}`.
- [ ] `formatScanCode("PART","ABC")` === `"WMS:PART:ABC"`; round-trips through `parseScanCode`.
- [ ] Labels page renders QR payloads in `WMS:PART:`/`WMS:LOC:` form.
- [ ] Verify: `npm run verify-qr-scanning` (parser/formatter section passes); `npm run lint`.

### Task 3: Core StockLocation registry + LOCATION_BLOCKED enforcement

**Objective:** Add WMS-core read/write access to the `StockLocation` registry and enforce it in the placement layer: putaway and bin-to-bin transfer reject a blocked or inactive **destination** with a new `LOCATION_BLOCKED` error, auto-creating an active registry row for a never-seen location. Removing from a bin and transferring *out of* a blocked location stay allowed (so a blocked bin can be evacuated). Verified by TS-002.

**Files:**
- Modify: `lib/wms/internal/repository.ts`
- Create: `lib/wms/public/locations.ts`
- Modify: `lib/wms/public/placement.ts`
- Modify: `lib/wms/public/errors.ts`
- Modify: `lib/wms/public/index.ts`
- Modify: `scripts/verify-qr-scanning.ts`

**Key Decisions / Notes:**
- `errors.ts`: add `LOCATION_BLOCKED` to `WmsErrorCode` + `static locationBlocked(): WmsError`.
- `repository.ts`: `ensureLocation(client, code, tenantKey)` (upsert active/unblocked, return row), `findLocation(client, code, tenantKey)`, `listLocations(client, tenantKey)`, `setLocationFlags(client, code, tenantKey, { isActive?, isBlocked? })`. All normalize `code` to upper/trim.
- `locations.ts` (public): `assertLocationUsable(client, code, tenantKey?)` → resolve via `findLocation`; if absent → `ensureLocation` (auto-create active, returns usable); if `!isActive || isBlocked` → throw `WmsError.locationBlocked()`. Plus `listLocations`, `getLocation`, `setLocationBlocked` passthroughs for the admin surface.
- `placement.ts`: in `placeStock` call `assertLocationUsable(client, location, tenantKey)` **before** the unplaced check; in `transferStock` assert the **`to`** location only (not `from`). `removeFromBin` unchanged. Reuse `normalizeLocation`.
- Export `assertLocationUsable`, `listLocations`, `getLocation`, `setLocationBlocked` + their types from `index.ts`.

**Definition of Done:**
- [ ] `placeStock` into a blocked location throws `WmsError` code `LOCATION_BLOCKED` and writes no bin/audit row.
- [ ] `placeStock`/`transferStock` into a never-seen location auto-creates an active `StockLocation` and succeeds.
- [ ] `transferStock` *out of* a blocked location (blocked `from`, usable `to`) succeeds; into a blocked `to` throws `LOCATION_BLOCKED`.
- [ ] Verify: `npm run verify-qr-scanning` (location section passes).

### Task 4: Core ScanEvent recording + generalized idempotency_key guard

**Objective:** Add core `recordScanEvent` (append-only audit of every scan, success or failure) and thread a client-supplied `idempotencyKey` through `recordMovement` and the placement ops so a repeated write with the same key applies exactly once. Adds `DUPLICATE_OPERATION` to the error taxonomy. Verified by Truth 1, Truth 2.

**Files:**
- Modify: `lib/wms/internal/repository.ts`
- Create: `lib/wms/public/scan.ts`
- Modify: `lib/wms/public/record-movement.ts`
- Modify: `lib/wms/public/placement.ts`
- Modify: `lib/wms/public/types.ts`
- Modify: `lib/wms/public/errors.ts`
- Modify: `lib/wms/public/index.ts`
- Modify: `scripts/verify-qr-scanning.ts`

**Key Decisions / Notes:**
- `errors.ts`: add `DUPLICATE_OPERATION` and `IDEMPOTENCY_KEY_REUSED` to `WmsErrorCode` + `static duplicateOperation()` / `static idempotencyKeyReused()`.
- `repository.ts`: `insertScanEvent(client, row)`; extend `insertMovement` + `insertBinMovement` row shapes with `idempotencyKey: string | null` and **pass it in the Prisma `create` data**; add `findMovementByKey(client, tenantKey, key)` / `findBinMovementByKey(...)` returning the stored row's identity columns for the collision-disambiguation path below.
- `scan.ts` (public): `recordScanEvent(client, { userId?, deviceId?, sessionId?, action, rawCode, parsedObjectType?, parsedObjectId?, result, errorCode?, tenantKey? })` → `insertScanEvent`. Define `ScanEventInput` + `ScanResult = "SUCCESS"|"REJECTED"|"ERROR"`.
- `types.ts`: add optional `idempotencyKey?: string` to `RecordMovementInput` and to the `PlacementMeta` base (so place/transfer/remove inputs inherit it).
- `record-movement.ts`: pass `idempotencyKey: input.idempotencyKey ?? null` into `insertMovement`. **The P2002 catch now covers TWO independent uniques** (the source-triple AND `(tenantKey, idempotencyKey)`), so it must disambiguate rather than blindly return `{applied:false}`: on P2002, if an `idempotencyKey` was supplied, look up the prior row via `findMovementByKey`; if found, compare its identity (`itemId`, `reason`, `quantityDelta`, `reservedDelta`, `sourceType`, `sourceId`) against the current request — **match → idempotent no-op `{applied:false}`** with the item's current counters; **mismatch → throw `WmsError.idempotencyKeyReused()`** (a stale/buggy/malicious client must NOT get a silent success for a different op). If no key was supplied (collision was the source-triple), keep the existing source-triple no-op behavior. Document this dual-unique reasoning in the catch-block comment so it isn't misread as masking a data-integrity error.
- `placement.ts` keyed path mirrors this: on the audit-claim P2002, fetch the prior bin-movement by key; identity match (`itemId`, `reason`, `fromLocation`, `toLocation`, `quantity`) → throw `DUPLICATE_OPERATION` (the op already ran); mismatch → throw `IDEMPOTENCY_KEY_REUSED`.
- `placement.ts`: when `input.idempotencyKey` is set, insert the bin-movement audit row (carrying the key) **first**, then apply the bin delta; wrap the audit insert so a P2002 → `throw WmsError.duplicateOperation()`. When no key is supplied, keep the current mutate-then-audit order (no behavior change).
- **⛔ Atomicity guard — self-wrap, do NOT rely on callers remembering (resolves the "burned key" footgun):** the audit-first claim is only safe inside a transaction. The public API accepts any `DbClientPort` and existing verifiers/callers sometimes pass the base `db` directly (`scripts/verify-warehouse.ts:153,173,207`), so a call-site convention is not enough. Instead, when `input.idempotencyKey` is set, `placeStock`/`transferStock` detect whether they were handed the **base client** (an interactive-tx client does NOT expose `$transaction`; the base `PrismaClient` does — `'$transaction' in client`) and, if so, run the keyed body inside `client.$transaction(tx => …)` themselves; if already given a tx client (no `$transaction`), they run inline and compose with the caller's transaction (no nested tx). This preserves composability with `app/actions/warehouse.ts`'s existing `db.$transaction((tx) => placeStock(tx, …))` wrapping (`:93,115,132`) **and** makes a direct `placeStock(db, {…, idempotencyKey})` self-atomic. Net effect: a rejection after the audit-claim insert always rolls the claim back — the key is never burned without the stock delta.
- `index.ts`: export `recordScanEvent`, `ScanEventInput`, `ScanResult`.

**Definition of Done:**
- [ ] `recordScanEvent` with `result:"REJECTED", errorCode:"LOCATION_BLOCKED"` writes a queryable `ScanEvent` row with the raw code and parsed type/id.
- [ ] `placeStock` (inside a `$transaction`) called twice with the same `idempotencyKey` applies once; the second throws `DUPLICATE_OPERATION` and bins/aggregate are unchanged after the second call.
- [ ] **Rollback proof:** a keyed `placeStock` inside a `$transaction` that throws `LOCATION_BLOCKED` (or insufficient-unplaced) after the audit-claim insert leaves **zero** `StockBinMovement` rows carrying that key — a subsequent retry with the same key succeeds (the claim was rolled back, not orphaned).
- [ ] `recordMovement` called twice with the same `idempotencyKey` **and identical payload** returns `applied:false` on the second; counters unchanged.
- [ ] `recordMovement` called with a **reused `idempotencyKey` but a different payload** (different item/reason/qty) throws `IDEMPOTENCY_KEY_REUSED` and does NOT report a silent success — proving a stale/buggy client cannot mask a different operation as deduped.
- [ ] Verify: `npm run verify-qr-scanning` (ScanEvent + idempotency + rollback + key-reuse-mismatch sections pass).

### Task 5: Universal POST /api/warehouse/scan endpoint + scan-router helper

**Objective:** Add the universal scan front door: a host route that authenticates, parses the raw code, **always** logs a `ScanEvent` (success/rejected/error), and routes by parsed type — resolving PART/RAW to a part card (core barcode/gtin + host article fallback) and LOC to a location card (registry flags + items in location), returning `WRONG_OBJECT_TYPE` for ORDER/BOX and `UNKNOWN_CODE` for malformed codes. Verified by TS-001, TS-002.

**Files:**
- Create: `app/api/warehouse/scan/route.ts`
- Create: `lib/warehouse/scan-router.ts`
- Modify: `lib/warehouse/wms-error-message.ts`
- Modify: `scripts/verify-qr-scanning.ts`

**Key Decisions / Notes:**
- Route: `requireRole(["ADMIN","MANAGER","WAREHOUSE_WORKER"])` in try/catch → 401 on failure (mirror `app/api/stock/lookup/route.ts:18`). Parse JSON body `{ rawCode: string; action?: string; deviceId?; sessionId? }`. No `idempotencyKey` here — this endpoint resolves/reads, it does not mutate stock (writes go through the Task 6 actions).
- **⛔ Single audit writer — `resolveScan` owns ScanEvent logging; the route NEVER logs (resolves the dual-writer contradiction).** The route is auth + body-parse + `parseScanCode` + call `resolveScan` + map the returned outcome to an envelope. `resolveScan(client, parsed, tenantKey, { userId, action, deviceId?, sessionId?, articleResolver })` performs resolution **and** writes exactly one `ScanEvent`, wrapping its own resolution body in try/catch so an unexpected throw is logged as `result:"ERROR"` and returned as an error outcome — there is exactly one `ScanEvent` per scan, owned in one place and directly testable. `articleResolver(code)` reuses the host article fallback from `app/api/stock/lookup/route.ts:33` (extract or inline).
- A malformed/empty `rawCode` (no scannable payload) is a **400 in the route and is NOT a scan** — do not log a ScanEvent for a request that carried no code. Body-parse / auth failures are likewise not scans.
- **Infra-failure scope boundary:** the "every scan incl. failures is logged" guarantee covers *application-level* outcomes (parse-to-UNKNOWN, lookup miss, `LOCATION_BLOCKED`, `WRONG_OBJECT_TYPE`, unexpected resolution exceptions). If the DB itself is unavailable when `resolveScan` tries to write the `ScanEvent`, the event cannot be persisted — this is best-effort on infrastructure failure, by definition. Document this as a one-line code comment in `scan-router.ts` so the PRD §16 audit claim isn't over-read.
- Routing (each returns a typed outcome `{ status, data?, errorCode? }` AND logs one ScanEvent): `PART`/`RAW` → `lookupByCode` then article fallback → part card `{ kind:"part", itemId, name, article, barcode, quantity, available }` (`SUCCESS`) or `UNKNOWN_CODE` (`REJECTED`, 404). `LOC` → `getLocation` + `itemsInLocation` → `{ kind:"location", code, isActive, isBlocked, items }` (`SUCCESS`). `ORDER`/`BOX` → `WRONG_OBJECT_TYPE` (`REJECTED`, 422). `UNKNOWN` → `UNKNOWN_CODE` (`REJECTED`, 400).
- Envelope `{ data }` / `{ error: { code, message } }`; statuses 200/400/401/403/404/422 (backend standards).
- `wms-error-message.ts`: add `LOCATION_BLOCKED`, `DUPLICATE_OPERATION`, `IDEMPOTENCY_KEY_REUSED` Russian messages.
- Verify: `verify-qr-scanning.ts` imports `resolveScan` and asserts each routing branch returns the right outcome **and** writes exactly one `ScanEvent` row with the correct `result`/`errorCode` (route-level auth/HTTP/400-no-code is covered by TS browser scenarios).

**Definition of Done:**
- [ ] `resolveScan` returns a part card for a `PART`/`RAW` code resolving by article or barcode; a location card for `LOC`; a `WRONG_OBJECT_TYPE` outcome for `ORDER`/`BOX`; `UNKNOWN_CODE` for malformed.
- [ ] Every `resolveScan` call writes **exactly one** `ScanEvent` row with the correct `result`/`errorCode` (single writer; the route writes none).
- [ ] A `resolveScan` whose internal resolution throws unexpectedly logs `result:"ERROR"` and returns an error outcome (not an unhandled 500 with no audit).
- [ ] Verify: `npm run verify-qr-scanning` (scan-router section, incl. one-ScanEvent-per-branch, passes); `npm run lint`.

### Task 6: warehouse_worker role plumbing + idempotency_key on write actions

**Objective:** Open the warehouse surface to `WAREHOUSE_WORKER` and make the write server actions accept a client `idempotency_key`. Adds the role to the lookup route, warehouse page, labels page, scan endpoint, and the placement/adjust actions, and threads `idempotencyKey` from the actions into the core. Verified by TS-003, Truth 2.

**Files:**
- Modify: `app/actions/warehouse.ts`
- Modify: `lib/warehouse/adjust.ts`
- Modify: `app/api/stock/lookup/route.ts`
- Modify: `app/(admin)/admin/warehouse/page.tsx`
- Modify: `app/(admin)/admin/warehouse/labels/page.tsx`

**Key Decisions / Notes:**
- Add `"WAREHOUSE_WORKER"` to every `requireRole([...])` warehouse gate: `warehouse.ts` (all five actions), `lookup/route.ts:18`, `warehouse/page.tsx:15`, `labels/page.tsx:32` (the inline `getSession` role check).
- `warehouse.ts`: add optional `idempotencyKey?: string` param to `adjustStock`, `placeIntoBin`, `transferBetweenBins`, `removeFromBinAction`; pass into the core input. Map a thrown `DUPLICATE_OPERATION` via `wmsErrorMessage` to a friendly Russian string in each catch.
- `adjust.ts` `applyAdjustment`: thread `idempotencyKey` into its `recordMovement` call (ADJUSTMENT has a null source, so the key is its only dedupe handle).
- Role nav scoping + non-warehouse redirect lands in Task 8 (UI). This task is gates + idempotency wiring only.

**Definition of Done:**
- [ ] A `WAREHOUSE_WORKER` session is accepted by the lookup route, the scan endpoint, the warehouse page, the labels page, and all five warehouse actions (no redirect/401).
- [ ] `placeIntoBin` called twice with the same `idempotencyKey` reports a duplicate on the second and leaves bins unchanged.
- [ ] Verify: `npm run verify-qr-scanning` still green; `npm run lint`; manual: TS-003 step 2 (worker putaway succeeds).

### Task 7: Camera QR scanner component (@zxing/browser) + wire into WarehouseScanBox

**Objective:** Add a reusable phone-camera QR scanner (native camera via `getUserMedia`, decode via `@zxing/browser`, 1 s duplicate-scan guard, manual-entry fallback) and wire it into the existing `WarehouseScanBox` so a scan hits `POST /api/warehouse/scan` and shows the resolved part/location card. Generates a per-operation `idempotency_key` for the placement/adjust submits. Verified by TS-001, TS-002.

**Files:**
- Create: `components/warehouse/QrScanner.tsx`
- Modify: `components/admin/WarehouseScanBox.tsx`
- Modify: `package.json` (add `@zxing/browser`)

**Key Decisions / Notes:**
- `npm install @zxing/browser` (pulls `@zxing/library`). Detect package manager: `package-lock.json` → **npm**.
- `QrScanner.tsx` (`"use client"`): props `{ onScan: (raw: string) => void }`. A "Сканировать камерой" toggle starts `BrowserMultiFormatReader.decodeFromVideoDevice(undefined, videoEl, cb)`; on decode, dedupe identical `rawText` within 1000 ms (store last code+timestamp), call `onScan`. Always render the existing manual text `<input>` (the current `WarehouseScanBox` input) as the fallback. On unmount or stop: `reader.reset()` and stop all `MediaStream` tracks. Handle `getUserMedia` rejection (permission denied / no camera) by hiding the video and showing a message — manual entry remains usable. Mobile-first: full-width video, ≥44 px touch targets, CSS-variable tokens (no hardcoded hex).
- `WarehouseScanBox.tsx`: replace the raw `<form>` input with `<QrScanner onScan={handleScan} />`; `handleScan(raw)` POSTs `{ rawCode: raw }` to `/api/warehouse/scan`. For `kind:"part"` set the existing item/placement card state (the `data` shape matches today's `ResolvedItem`); for `kind:"location"` show a small location card (code + blocked/active badge + items). Keep the existing adjust/place/transfer handlers; generate `idempotencyKey = crypto.randomUUID()` per submit and pass to the action, reusing the same key if the immediately-prior submit errored (retry-safe).
- The current `/api/stock/lookup` GET stays for any other callers; the scan box now uses `/api/warehouse/scan`.

**Definition of Done:**
- [ ] Manual entry of `WMS:PART:<article>` in the scan box resolves and shows the part card (camera not required).
- [ ] Manual entry of `WMS:LOC:<blocked-code>` shows a location card with a blocked badge.
- [ ] Camera toggle requests permission; on denial the manual input still works; on unmount the camera stream stops (no lingering camera indicator).
- [ ] Verify (browser, `https://localhost/admin/warehouse`): TS-001 and TS-002 steps pass via manual entry; camera start/stop checked manually.

### Task 8: StockLocation block/unblock admin surface + warehouse_worker nav scoping

**Objective:** Give admins a surface to list locations and toggle block/active, and scope the admin navigation so a `warehouse_worker` sees only warehouse entries (and is redirected away from non-warehouse admin pages). Verified by TS-002, TS-003.

**Files:**
- Modify: `app/actions/warehouse.ts` (add `setLocationBlockedAction`, `listLocationsAction`)
- Create: `components/admin/WarehouseLocationsAdmin.tsx`
- Modify: `app/(admin)/admin/warehouse/page.tsx`
- Modify: `app/(admin)/layout.tsx`
- Modify: `lib/admin-nav.ts`

**Key Decisions / Notes:**
- Actions: `listLocationsAction()` → `listLocations(db, TENANT_KEY)`; `setLocationBlockedAction(code, { isActive?, isBlocked? })` → `setLocationBlocked(...)`. Both `requireRole(["ADMIN","MANAGER"])` — per PRD §7 cell configuration is admin/manager, NOT warehouse_worker.
- `WarehouseLocationsAdmin.tsx` (`"use client"`): list locations with block/active toggles (`useTransition`, `router.refresh()`), CSS-variable tokens. Render the section on `warehouse/page.tsx` only for ADMIN/MANAGER (the page already knows the session role — pass a `canManageLocations` prop).
- Nav scoping: `lib/admin-nav.ts` add `filterNavForRole(nav, role)` returning warehouse-only entries when `role === "WAREHOUSE_WORKER"` (the `Запчасти` group reduced to the `Скл"` link, or a dedicated single link). `app/(admin)/layout.tsx` becomes a server component that reads `getSession()` and passes the filtered nav to `Sidebar`/`Header`. Non-warehouse admin pages already redirect non-ADMIN/MANAGER roles (their existing `getSession` guards send `WAREHOUSE_WORKER` to `/` or `/login`) — confirm and, where a page uses `requireRole`, ensure `WAREHOUSE_WORKER` is excluded so it redirects. Warehouse worker landing: ensure `/admin/warehouse` is reachable (Task 6 added the gate).
- Keep the admin location surface minimal — list + toggle only; no create/delete UI in 2.5 (locations auto-create on first putaway; admins block/unblock existing ones).

**Definition of Done:**
- [ ] Admin can block and unblock a location from the warehouse page; the flag persists and TS-002 putaway rejection follows.
- [ ] A `WAREHOUSE_WORKER` sees only warehouse navigation and is redirected from `/admin/crm/deals`.
- [ ] The location admin section is hidden for `WAREHOUSE_WORKER`.
- [ ] **Leak audit:** grep `app/(admin)` for `getSession(` and `requireRole(` — confirm every non-warehouse admin page either calls `requireRole(["ADMIN","MANAGER"])` or has an explicit `session.permissionRole` check that excludes `WAREHOUSE_WORKER`. Any page relying solely on the layout/nav filter (no own gate) is a leak — add a gate or document it as a known gap in the verification report.
- [ ] Verify (browser): TS-002 (block→reject) and TS-003 (nav scoping) pass; `npm run lint`.
