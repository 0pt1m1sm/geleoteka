# Warehouse Receiving Fixes (Audit 2026-07-11) Implementation Plan

Created: 2026-07-11
Author: aleksandr.spiskov@gmail.com
Agent: Claude Code
Status: VERIFIED
Approved: Yes (ultraralph --auto; critic findings C1/M1/M2/M3/m1/m2 incorporated, verdict upgrade path satisfied)
Completed: 2026-07-11 — all 6 stories VERIFIED in one session; final regression: 86 unit tests, build, verify-warehouse + verify-undo-receive DB gates all green. Changes left UNCOMMITTED (commit is the user's call).
Iterations: 0
Worktree: No
Mode: auto
Type: Feature

## Summary

**Goal:** Close the issues from the 2026-07-11 warehouse audit: a DB-free unit-test layer for the invariant-heavy receiving/WMS logic, a task-first «Приёмка» entry the storekeeper can actually find, unified receiving semantics (staging + status guard), receipt undo (сторно), supplier-order edit/delete lifecycle, and a filterable paginated orders list.

## Out of Scope

- Discrepancy acts / close-line-short workflow (акт расхождения) — follow-up.
- Returns to supplier (RMA / RETURN movement reason) — follow-up.
- Landed-cost allocation into per-unit COGS / valuation — follow-up.
- Document attachments (инвойс/накладная) and printable PO form — follow-up.
- Notifications (arrival, reorder point) — follow-up.
- Migrating existing unplaced stock into bins (stocktake already reconciles it).
- CI pipeline setup — `npm test` must run locally without a DB; wiring it into CI is a follow-up.
- Next.js upgrade — `npm audit` flags middleware/proxy-bypass advisories on next@16.2.3 (pre-existing; security-reviewer S3 + proxy review). Page guards self-gate beyond the proxy, so not blocking; upgrade as a separate task, and never treat the proxy as the sole access control until then.
- API perimeter audit — `/api/*` is outside the proxy matcher (as before); most handlers self-gate, but `app/api/repair-orders/[id]/status/route.ts` GET is an unauthenticated status read by cuid (pre-existing minor info-disclosure). Audit all /api handlers as a follow-up.
- `from` query param on /login is currently unused — if ever wired into post-login redirect, validate as same-origin relative path (open-redirect tripwire; security-proxy review).
- Prisma migration checksum drift — `20260524103113_warehouse_stocktake` was modified after being applied (pre-existing), so `prisma migrate dev` demands a destructive reset and `migrate deploy` may complain on prod. Fix the recorded checksum (update `_prisma_migrations.checksum` to the current file hash) as a separate maintenance task BEFORE the next prod deploy that runs migrations.
- Edit-page part picker (S5 review LOW-2, UX-only): hidden draft parts referenced by existing lines also appear as options when ADDING a new line; exclude inactive parts from the add-new dropdown while keeping them resolvable for existing lines.

## Approach

**Chosen:** Extend the existing seams in place — vitest as a new DB-free unit layer beside the existing `scripts/verify-*.ts` DB-backed convention; host-level semantic unification inside `receiveLine` (`app/actions/supplier-orders.ts`) mirroring `applyScanReceiveOrderLine`; a new `RECEIPT_REVERSAL` movement reason through the same `recordMovement` chokepoint; new receiving-queue pages under the existing `/admin/warehouse` prefix (middleware already scopes WAREHOUSE_WORKER to it).
**Why:** Every change rides an already-proven invariant (CAS token, source-triple idempotency, `Σbins ≤ on-hand`) instead of introducing parallel mechanisms; the WMS core stays extractable (zero host imports). Cost: a new devDependency (vitest) and one Prisma enum migration.

### Autonomous Decisions (ultraralph --auto, no user gates)

1. **vitest over node:test / verify-scripts extension.** The repo note "jest/vitest intentionally not installed" (scripts/verify-cms.ts:5) predates this initiative; the audit explicitly calls for a unit layer. Existing `verify-*` scripts stay untouched as the DB-integration layer.
2. **Order-page receiving gets the same OPEN-status guard as the scanner** (DRAFT no longer receivable from the order page — move it to «Заказ размещён» first). Unifies the canon and makes DRAFT deletion trivially safe.
3. **Full undo returns order status to `ORDERED`** (the true pre-receiving status is unknowable without replaying history); partial undo → `PARTIALLY_RECEIVED`; `receivedAt` cleared when leaving `RECEIVED`.
4. **Сторно uses a new `RECEIPT_REVERSAL` reason** (Prisma enum migration) rather than overloading `ADJUSTMENT` — the ledger stays semantically clean for reports/feed.
5. **DRAFT-only full edit; lines are replaced wholesale in one tx** (delete + recreate). Safe because with decision 2 a DRAFT can never have receipts.
6. **Worker receiving detail shows PART lines only and no money — omitted from the payload, not just the display.** `ReceivingLine.unitCost`/`totalCost` become optional; the worker page never selects or serializes them (RSC payload stays price-free); `showFinancials` only controls admin-side rendering.
7. **Movement source ids for receive/undo become event-unique** (`#${crypto.randomUUID()}` suffix on the informative `${orderId}:${lineId}:${from}->${to}` id), and both `applyReceive` and `applyUndoReceive` assert `recordMovement().applied === true` (throw → tx rollback otherwise). Rationale (critic finding C1): the old cumulative-count source id (`receive.ts:119`) was collision-free only while `receivedQuantity` was monotonic; undo breaks monotonicity, so re-receiving up to a previously-seen count would collide with the source-triple unique index, `recordMovement` would no-op (`applied:false`, result previously discarded), and on-hand would silently desync from `receivedQuantity`. Replay/duplicate protection is NOT weakened: the CAS on `receivedQuantity` runs first in the same tx and remains the sole dedup authority for this path (a replayed submit fails closed before any movement); the randomized suffix only serves the audit ledger, and the `applied` assertion stays as defense-in-depth.
8. **Re-receiving after undo is a supported workflow** (fix a wrong entry, then receive correctly) — full undo returns the order to `ORDERED`, which is receivable again by design.

## Context for Implementer

The generated Prisma client is `@ts-nocheck` and results lose inference through the `db` singleton — every query needs explicit type assertions or loose call-signature casts (see `lib/warehouse/incoming.ts:29` pattern and `.claude/rules/geleoteka-conventions.md`). All receiving mutations must run inside `db.$transaction` and go through `recordMovement` / `placeStock` / `removeFromBin` (`lib/wms/public`) — never touch `StockItem.quantity` or `StockBin` directly. `lib/wms/**` must not import host code (ESLint-enforced); host-side logic lives in `lib/warehouse/*` + `app/actions/*`. UI text is Russian; CSS via variables only (`.btn`, `.card`, `.input`, no hex).

## Runtime Environment

- **Start:** `npm run dev` (port 443, HTTPS, self-signed — browser will warn)
- **URL:** https://localhost:443
- **Logins:** admin `admin@geleoteka.ru` / `admin123`; client `client@test.ru` / `admin123`; DB `postgresql://alex@localhost:5432/geleoteka`
- **Migrations:** `npx prisma migrate dev --name <name>`; regenerate client with `npx prisma generate`
- **Unit tests (after Story 1):** `npm test` (vitest, no DB needed)

## Assumptions

- Node ≥ 20 locally (devDeps target `@types/node@^20`); installed vitest is ^4.x (Node 24 on this machine). — Story 1 depends on this.
- No seeded `WAREHOUSE_WORKER` user exists; Story 3 creates one via seed or the admin users page for verification. — Story 3 E2E depends on this.
- `StockMovementReason` is branched on in FIVE places (critic-verified): `deltasForReason` (exhaustive switch — compile-enforced), `WarehouseMovementsFeed.tsx:6` and `lib/warehouse/movement-csv.ts:15` (label maps), plus two `as const` REASONS allow-lists that the compiler does NOT flag: `app/api/admin/warehouse/movements/export/route.ts:11` and `app/(admin)/admin/warehouse/reports/movements/page.tsx:13`. All five are in Story 4's Files. — Story 4 depends on this.

## Goal Verification

### Truths

1. Под ролью `WAREHOUSE_WORKER` кладовщик проходит приёмку task-first: из «Склад» → «Приёмка» видит очередь ожидаемых поставок, открывает заказ, принимает позиции — не имея доступа к разделу «Поставщики» и не видя ни одной закупочной цены.
2. После любого пути приёмки (страница заказа, сканер, очередь приёмки) принятое количество немедленно числится в конкретной ячейке (по умолчанию ПРИЁМКА) — «незаразмещённой» приёмки больше не существует, и сторно возвращает и остаток, и ячейку, и статус заказа согласованно.

## E2E Test Scenarios

### TS-001: Кладовщик находит и проводит приёмку task-first
**Priority:** Critical
**Preconditions:** Открытый заказ поставщику (ORDERED) с PART-строкой qty=3; пользователь с ролью WAREHOUSE_WORKER
**Mapped Tasks:** Story 3, Story 2

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Войти под WAREHOUSE_WORKER | Редирект на /admin/warehouse, в навигации только «Склад» |
| 2 | На странице склада нажать «Приёмка →» | Открывается /admin/warehouse/receiving со списком открытых заказов: поставщик, №, дата, прогресс «0 из 3»; закупочных цен нет нигде на странице |
| 3 | Открыть заказ из очереди | Панель приёмки: PART-строки без цен; финансового блока нет |
| 4 | Принять 2 шт по строке (ячейка пустая) | «Принято: 2», прогресс 2/3; статус заказа → «Частично получен» |
| 5 | Открыть карточку товара в скан-боксе склада | В ячейке ПРИЁМКА числится +2 (placed, не unplaced) |

### TS-002: Приёмка со страницы заказа стейджится в ПРИЁМКУ; DRAFT закрыт для приёмки
**Priority:** Critical
**Preconditions:** Админ; заказ в статусе ORDERED с PART-строкой; второй заказ в DRAFT
**Mapped Tasks:** Story 2

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | На /admin/suppliers/orders/[id] (ORDERED) принять 1 шт, ячейку не заполнять | Успех; в размещении товара +1 в ПРИЁМКА (не unplaced) |
| 2 | Открыть DRAFT-заказ | Панель приёмки read-only / приём отклоняется с сообщением «Заказ недоступен для приёмки» |

### TS-003: Сторно приёмки
**Priority:** Critical
**Preconditions:** Админ; заказ со строкой qty=3, received=3 (статус «Получен»), товар в ячейке ПРИЁМКА
**Mapped Tasks:** Story 4

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | На странице заказа раскрыть «Сторно» у строки, qty=1, ячейка ПРИЁМКА | Принято становится 2/3; статус → «Частично получен»; on-hand −1; в ПРИЁМКЕ −1 |
| 2 | Сторно оставшихся 2 | Принято 0/3; статус → «Заказ размещён»; receivedAt пуст |
| 3 | Повторить сторно при устаревшей странице (двойной сабмит) | Ошибка «Позиция изменилась — обновите страницу», без повторного списания |
| 4 | Войти под WAREHOUSE_WORKER, открыть тот же заказ в очереди приёмки | Контролов «Сторно» нет |

### TS-004: Редактирование и удаление заказа поставщику
**Priority:** High
**Preconditions:** Админ; заказ в DRAFT с 1 строкой
**Mapped Tasks:** Story 5

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | На странице DRAFT-заказа нажать «Редактировать» | Форма предзаполнена (поставщик, строки, ставки landed cost) |
| 2 | Изменить qty строки и ставку доставки, сохранить | Детали заказа показывают новые итоги (пересчитаны сервером) |
| 3 | Перевести заказ в ORDERED, открыть редактирование | Полного редактирования строк нет; доступна правка трекинга/даты прибытия/заметок |
| 4 | Вернуть тестовый DRAFT и удалить его | Подтверждение → заказ исчез из списка |

### TS-005: Фильтры и пагинация списка заказов
**Priority:** Medium
**Preconditions:** Админ; ≥2 заказов в разных статусах
**Mapped Tasks:** Story 6

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Открыть /admin/suppliers/orders | Фильтр-чипы статусов + фильтр поставщика видны |
| 2 | Выбрать статус «В пути» | Список сузился; URL содержит ?status=IN_TRANSIT; счётчики шапки соответствуют фильтру |
| 3 | Сбросить фильтр, выбрать поставщика | Только его заказы |
| 4 | При >20 заказах перейти на стр. 2 | Пагинация работает, ?page=2 |

### TS-006: Переименование кнопки исходящего потока
**Priority:** Medium
**Preconditions:** Админ
**Mapped Tasks:** Story 3

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Открыть /admin/warehouse | Кнопки «Сканировать заказ» нет; есть «Отбор / Упаковка →» (ведёт на /admin/warehouse/fulfill) и «Приёмка →»; блок-шпаргалка «Как работает склад» раскрывается |

## Progress Tracking

- [x] Story 1: Test infrastructure — vitest + in-memory DbClientPort fake + unit tests for receiving/WMS invariants (Status: VERIFIED — 58 unit tests, lint/tsc/build green, code-reviewer APPROVE, test-engineer should_fix items fixed; Codex review skipped: companion not installed; human gate skipped per Mode: auto)
- [x] Story 2: Unify receiving semantics — blank cell → ПРИЁМКА and OPEN-status guard on the order-page path (Status: VERIFIED — TS-002 browser PASS, 62 unit tests, final regression green, code-reviewer APPROVE 0 blocking)
- [x] Story 3: Task-first «Приёмка» for the storekeeper — receiving queue + worker-safe order view + rename + cheat sheet (Status: VERIFIED — user-gated (approved); TS-001/TS-006 browser PASS; price-free payloads confirmed; verify trio: security-reviewer APPROVE, code-reviewer APPROVE (LOW hardening applied), verifier finding root-caused → dead app/middleware.ts migrated to live root proxy.ts (Next 16 convention) + segment-boundary hardening, re-verified live)
- [x] Story 4: Сторно приёмки — RECEIPT_REVERSAL reason + applyUndoReceive + order-page UI (Status: VERIFIED — user-gated (approved); verify trio: security-reviewer APPROVE (2 LOW hardened: post-image reserved re-check + bin-audit note), code-reviewer APPROVE (5 LOW accepted tradeoffs), verifier gaps closed: fresh post-hardening browser TS-003 re-run (steps 1/2/4, DB-verified) + new real-Postgres gate `npm run verify-undo-receive` PASS (incl. C1 + stale on live PG); 81 unit tests / tsc / eslint / build green)
- [x] Story 5: Supplier order lifecycle — full edit in DRAFT, meta edit later, delete DRAFT (Status: VERIFIED — TS-004 browser PASS incl. server-side recompute + GC safety; code-reviewer APPROVE (refactor equivalence confirmed; LOW-1 meta TOCTOU fixed with atomic guarded updateMany; LOW-2 edit-picker shows hidden drafts — follow-up; LOW-3 informational); 86 unit tests / tsc / eslint / build green)
- [x] Story 6: Orders list — status/supplier filters + pagination (Status: VERIFIED — TS-005 browser PASS incl. filtered counters, negative supplier case, page 2/2 with preserved filters; code-reviewer APPROVE (4 LOW; S6-L1 redundant query and S6-L2 page clamp applied and live-verified); tsc/eslint/build/tests green)

## Implementation Tasks

### Story 1: Test infrastructure + unit tests for receiving/WMS invariants

**Objective:** Add vitest as the DB-free unit layer (`npm test`) and cover the invariant-heavy pure logic and transaction flows with an in-memory `DbClientPort` fake, complementing the existing DB-backed `scripts/verify-*.ts` convention. This is the safety net for Stories 2 and 4, which change the same functions.

**Files:**

- Modify: `package.json` (devDep `vitest`, script `"test": "vitest run"`)
- Create: `vitest.config.ts` (node environment; alias `@` → repo root; include `tests/**/*.test.ts`)
- Create: `tests/helpers/fake-db.ts` (in-memory `DbClientPort` fake: parts, stockItems, stockMovements + source-triple/idempotency unique indexes, stockBins, binMovements, stockLocations, supplierOrders, supplierOrderItems; `$transaction` passthrough)
- Test: `tests/warehouse/receive.test.ts`
- Test: `tests/warehouse/scan-receive.test.ts`
- Test: `tests/wms/record-movement.test.ts`
- Test: `tests/suppliers/landed-cost.test.ts`

**Key Decisions / Notes:**

- The fake must emulate the two Postgres unique indexes recordMovement relies on (`@@unique([tenantKey, sourceType, sourceId, reason, warehouseId])`, `@@unique([tenantKey, idempotencyKey])`) by throwing a P2002-shaped error (`{ code: "P2002" }`) — `isUniqueViolation` (lib/wms/internal/repository.ts) checks `code`.
- The fake must also faithfully model the atomic conditional `updateMany` (`where: { id, receivedQuantity: expectedReceived }` → `count: 0|1`) — the CAS is the invariant under test; a fake that always matches would false-green the whole suite (critic requirement).
- Test targets: `computeReceivingStatus`/`isReceivingStatus` (pure, lib/warehouse/receive.ts:41); `applyReceive` — CAS stale fail-closed, terminal-order guard, over-receive flag, status transition + receivedAt; `applyBlindReceive` — replayed idempotencyKey does NOT re-place (lib/warehouse/scan-receive.ts:92); `applyScanReceiveOrderLine` — non-OPEN order rejected, blank location coerced to ПРИЁМКА; `recordMovement` — qty/source validation throws, source-triple replay no-op, reused key with different payload throws; `deltasForReason` mapping (lib/wms/internal/counters.ts); landed-cost math and bounds (`orderWeightGrams`, `computeShippingRub`, `computeCustomsRub` both modes, `validateOrderLines`, `isWithinLandedCostBounds`, `costResultWithinBounds`).
- `placeStock`'s self-wrap checks `txCapable(client)` — the fake's base client should NOT expose `$transaction` to the WMS ops (pass the "tx view"), matching how production code always calls these inside `db.$transaction`.
- Do not modify any production code in this story. If a behavior looks wrong, note it for the relevant later story.

**Definition of Done:**

- [x] `npm test` runs green with the DB stopped (56 tests / 5 files; vitest injects a dead-end DATABASE_URL, fake DbClientPort only).
- [x] A deliberately broken CAS (e.g. mutating expectedReceived handling) fails at least one test — spot-check by temporary mutation during development, then revert. (Removed receivedQuantity from the CAS where-clause → stale-token test failed; reverted, suite green.)
- [x] `npm run lint` and `npm run build` stay green. (lint: clean; build: exit 0)
- [x] Verify: `npm test`

### Story 2: Unify receiving semantics on the order-page path

**Objective:** Make the order-page receive behave like the scanner: a blank/whitespace cell stages into ПРИЁМКА (never leaves goods unplaced), the target location is validated (blocked/inactive rejected before any stock change), and only OPEN-status orders are receivable (DRAFT is not, matching `applyScanReceiveOrderLine`). Closes the canon violation from the audit (docs/warehouse/storekeeper-workflow.md: "All stock lives in a bin").

**Files:**

- Modify: `app/actions/supplier-orders.ts` (`receiveLine` delegates to `applyScanReceiveOrderLine` inside `db.$transaction` — it already implements trim → `STAGING_LOCATION` default → `assertLocationUsable` → OPEN-status guard → `applyReceive`; `scanReceiveLine` inherits via `receiveLine`)
- Modify: `components/admin/SupplierOrderReceiving.tsx` (DRAFT read-only alongside TERMINAL + hint «Черновик не принимается — переведите заказ в „Заказ размещён"»; placeholders/aria «Ячейка (ПРИЁМКА)»; `FormEvent`→`SubmitEvent` deprecation fix)
- Test: coverage lives in `tests/warehouse/scan-receive.test.ts` (Story 1 file extended: OPEN-status positive `it.each`, blocked-cell blind receive, Cyrillic case-fold, arg-driven `openOrderLinesForPart` stub) — a separate `receive-semantics.test.ts` would duplicate it (parsimony)
- Create: `scripts/seed-receiving-e2e.ts` (E2E fixtures: supplier + part E2E-RCV-001 + ORDERED/DRAFT orders; `--clean` to remove)

**Key Decisions / Notes:**

- Reuse `applyScanReceiveOrderLine` (lib/warehouse/scan-receive.ts:37) as the single receiving semantics for BOTH paths, instead of duplicating coercion/guards in the action — one seam, one test surface.
- `applyReceive`'s own terminal check stays as-is (defense in depth) beneath the OPEN guard.
- ПРИЁМКА location row exists and is kept active by the backfill (lib/wms-host/index.ts:16); LOCATION_BLOCKED surfaces via the existing `wmsErrorMessage` mapping — no new error plumbing.

**Definition of Done:**

- [x] Receiving with an empty cell from the order page places the qty into ПРИЁМКА (verified in browser + DB: StockBin ПРИЁМКА=1 = on-hand=1, status PARTIALLY_RECEIVED, RECEIPT movement recorded).
- [x] Receiving on a DRAFT order returns «Заказ недоступен для приёмки» and writes no movement (unit-tested server-side; UI renders read-only hint — browser-verified).
- [x] Unit tests cover: blank→ПРИЁМКА coercion, explicit cell honored, DRAFT/CANCELLED/COMPLETED/RECEIVED rejected, OPEN statuses positively receivable, blocked location rejected before movement.
- [x] Verify: `npm test` && manual TS-002 flow in the browser (dev server, admin login) — TS-002 PASS, final regression green (tests + build exit 0)

### Story 3: Task-first «Приёмка» entry for the storekeeper

**Objective:** Give the storekeeper a task-first receiving flow: a «Приёмка» button on /admin/warehouse leading to a queue of expected deliveries (open supplier orders with progress), each opening a worker-safe receiving view without purchase prices; rename the misleading primary button «Сканировать заказ» → «Отбор / Упаковка»; embed the canonical workflow cheat sheet in the UI. Resolves the storekeeper complaint verified in the audit (no receiving entry point; queue invisible to WAREHOUSE_WORKER; primary button routes to the outbound flow). Verified by TS-001 and TS-006.

**Files:**

- Create: `app/(admin)/admin/warehouse/receiving/page.tsx` (queue: orders in `OPEN_SUPPLIER_ORDER_STATUSES`, per-order supplier name, orderNumber, orderDate, estimatedArrival, PART-line progress «принято X из Y»; role gate ADMIN/MANAGER/WAREHOUSE_WORKER via `getSession()` + redirect; no cost fields selected at all)
- Create: `app/(admin)/admin/warehouse/receiving/[id]/page.tsx` (worker-safe order receiving: reuse `SupplierOrderReceiving` with `showFinancials=false`, PART lines only; back-link to the queue; no финансы/логистика blocks)
- Modify: `components/admin/SupplierOrderReceiving.tsx` (`ReceivingLine.unitCost`/`totalCost` become OPTIONAL; new prop `showFinancials` default `true` controls admin-side rendering of non-PART rows' prices and cost sublines; «Печать этикеток» stays visible — labels are a worker task; the admin order page keeps passing costs, the worker page never does)
- Modify: `app/actions/supplier-orders.ts` (`receiveLine`, `scanReceiveLine`: `requireRole(["ADMIN","MANAGER","WAREHOUSE_WORKER"])`)
- Modify: `app/(admin)/admin/warehouse/page.tsx` (add primary «Приёмка →» button → /admin/warehouse/receiving; rename «Сканировать заказ →» → «Отбор / Упаковка →»; add collapsed `<details>` block «Как работает склад» summarizing docs/warehouse/storekeeper-workflow.md: приёмка → ПРИЁМКА → putaway → отбор → упаковка → инвентаризация, one line each with links to the respective screens)
- Create: `components/admin/ReceivingQueue.tsx` (client list if interactivity needed; otherwise render server-side in page.tsx — prefer server-side, no client state required)
- Test: `tests/warehouse/receiving-queue.test.ts` (pure helper: queue-row shaping/progress aggregation, if extracted to `lib/warehouse/receiving-queue.ts`)
- Create: `lib/warehouse/receiving-queue.ts` (query + row shaping: orders with PART sums via one `groupBy`/`findMany`, no N+1 — mirror `incomingByPartIds` loose-cast pattern lib/warehouse/incoming.ts:29)

**Key Decisions / Notes:**

- Middleware already allows WAREHOUSE_WORKER under `/admin/warehouse/*` (app/middleware.ts:38) — no middleware change.
- NEITHER receiving page (queue NOR detail) may select `unitCost`/`totalCost`/`itemsCost`/`shippingCost`/`customsCost`/`sellingPrice` — the money must be absent from the serialized RSC payload, not merely hidden by CSS/props (critic finding M2: display-only gating leaks prices via devtools). Truth 1 depends on this.
- Sort the queue: overdue `estimatedArrival` first, then by `orderDate` asc.
- The cheat-sheet block lives on the warehouse page (visible to the worker), not a separate route.
- Keep the existing admin flow intact: /admin/suppliers/orders/[id] unchanged apart from Story 2.
- **Story-3 verify discovery (verifier finding → root cause → fix):** `app/middleware.ts` was NEVER executed — Next.js 16 renamed the `middleware` convention to root-level `proxy.ts`, and the old file was additionally in the wrong directory. The entire /admin + /cabinet route-level auth layer was dead code; only page-level getSession/requireRole guards were live (they held — no content leak observed, unauthenticated RSC responses carried NEXT_REDIRECT). Fixed in this story (it owns the worker authz surface): migrated to root `proxy.ts` per node_modules/next docs (Node runtime → shared verifyToken OK; matcher ["/cabinet/:path*","/admin/:path*"]; publicPaths list dropped — the matcher is the allow-list), deleted `app/middleware.ts`. Verified live: unauthenticated /admin/warehouse and /cabinet → 307 /login?from=…; worker on /admin/suppliers → «/»; worker on /admin/warehouse/receiving → allowed; admin full access; public home 200. NOTE: sessions issued before the migration may bounce once to /login (re-login fixes); page guards remain authoritative.

**Definition of Done:**

- [x] TS-001 passes end-to-end under a WAREHOUSE_WORKER login (steps 1–5: login→/admin/warehouse, nav only «Склад», queue 0/3, receive 2 blank cell → ПРИЁМКА bin=2=on-hand, status «Частично получен»; bonus negative re-verified after the proxy migration: worker hitting /admin/suppliers* is redirected to «/» by the route-level proxy — verifier's evidence-mismatch finding resolved; pre-proxy the /login redirect came from the page-level guard).
- [x] TS-006 passes («Сканировать заказ» removed, «Отбор / Упаковка →» + primary «Приёмка →», cheat sheet «Как работает склад» renders).
- [x] Queue AND detail page payloads contain no cost values (outerHTML incl. RSC payload scans: rub=false, cost=false, profit=false, unitCost/totalCost/itemsCost=false).
- [x] `npm run build` green; `npm test` green (final regression exit 0).
- [x] Verify: `npm test` && browser run of TS-001/TS-006

### Story 4: Сторно приёмки (receipt undo)

**Objective:** Allow ADMIN/MANAGER to reverse an erroneous receipt: decrement the line's `receivedQuantity` under the same CAS discipline, lower on-hand via a new `RECEIPT_REVERSAL` movement (idempotent source triple), optionally pull the qty back out of a bin, and recompute the order status (full undo → ORDERED, `receivedAt` cleared). Verified by TS-003.

**Files:**

- Modify: `prisma/schema.prisma` (enum `StockMovementReason` + `RECEIPT_REVERSAL // undo of an erroneous supplier receipt`)
- Create: `prisma/migrations/*` via `npx prisma migrate dev --name stock-movement-receipt-reversal`
- Modify: `lib/wms/public/types.ts` (`MovementReason` union + `"RECEIPT_REVERSAL"`)
- Modify: `lib/wms/internal/counters.ts` (`RECEIPT_REVERSAL` → `{ quantityDelta: -qty, reservedDelta: 0 }`)
- Modify: `components/admin/WarehouseMovementsFeed.tsx` + `lib/warehouse/movement-csv.ts` (label «Сторно приёмки»)
- Modify: `app/api/admin/warehouse/movements/export/route.ts` + `app/(admin)/admin/warehouse/reports/movements/page.tsx` (add `RECEIPT_REVERSAL` to both `as const` REASONS allow-lists — these are NOT compile-enforced; critic finding M1. If trivial, derive both from one shared exported list in `lib/warehouse/movement-csv.ts`)
- Modify: `lib/warehouse/receive.ts` — TWO changes:
  1. **Re-key the RECEIPT source id in `applyReceive` (critic C1):** replace the cumulative-count id (`${orderId}:${lineId}:${newReceived}`, line 119) with the event-unique `${orderId}:${lineId}:${expectedReceived}->${newReceived}#${crypto.randomUUID()}`, and assert the result: `if (!mv.applied) throw` a WMS-mapped error so the tx (including the already-applied CAS) rolls back. See Autonomous Decision 7 for why this cannot weaken replay safety.
  2. New `applyUndoReceive(client, input)`: load line+order, terminal guard (COMPLETED/CANCELLED closed; RECEIVED allowed — that's the point), `qty ≤ expectedReceived` pre-check, CAS `updateMany({ where: { id, orderId, receivedQuantity: expectedReceived }, data: { receivedQuantity: { decrement: qty } } })` (count 0 → stale, fail closed), guard on-hand: reject when `quantity − qty < 0` or result `< reserved` (mirror lib/warehouse/adjust.ts convention), optional `removeFromBin` first when `location` given, then `recordMovement({ reason: "RECEIPT_REVERSAL", qty, source: { type: "SupplierOrderUndo", id: \`${orderId}:${lineId}:${expectedReceived}->${expectedReceived - qty}#${crypto.randomUUID()}\` } })` with the same `applied` assertion (critic M3 — a silent no-op reversal alongside a committed bin removal/CAS decrement would strand stock; the throw makes the whole undo atomic), then status recompute: all lines zero → `ORDERED`; some received → `PARTIALLY_RECEIVED`; all still full → keep; clear `receivedAt` when leaving `RECEIVED`
- Modify: `app/actions/supplier-orders.ts` (action `undoReceiveLine(orderId, lineId, qty, expectedReceived, location?)`, `requireRole(["ADMIN","MANAGER"])`, `$transaction`, `wmsErrorMessage` mapping — same shape as `receiveLine`)
- Modify: `components/admin/SupplierOrderReceiving.tsx` (per-line collapsed «Сторно» control on lines with `received > 0`: qty input default 1, cell input default ПРИЁМКА, confirm button; rendered only when a new prop `allowUndo` is true; order page passes `allowUndo` for ADMIN/MANAGER, worker receiving view does not)
- Test: `tests/warehouse/undo-receive.test.ts`
- Create: `scripts/verify-undo-receive.ts` + npm script (real-Postgres integration gate for the undo path: receive→undo→C1 re-receive→stale→full undo; added on verifier request)

**Key Decisions / Notes:**

- Bin-first ordering inside the tx: `removeFromBin` (bin→unplaced) BEFORE the negative movement, so `Σbins ≤ quantity` never breaks mid-tx; a bin holding less than qty throws `insufficientBin` → surfaced via `wmsErrorMessage`, whole tx rolls back.
- `location` blank/undefined → skip bin removal (goods were unplaced — legacy receipts); UI defaults the cell to ПРИЁМКА but allows clearing it.
- Undo works while the order is `RECEIVED` (most common case: over-receipt noticed right after), so the terminal guard here differs from `applyReceive`'s — document both in a comment.
- Status downgrade decision (full undo → `ORDERED`) is Autonomous Decision 3.
- `deltasForReason` is an exhaustive switch on `MovementReason` — the compiler enforces the new arm; grep confirmed the only reason-label maps are the two files listed.
- **Migration deviation:** `prisma migrate dev` refused to run — the OLD migration `20260524103113_warehouse_stocktake` has a checksum drift ("modified after it was applied") and the tool demanded a full DB reset (data loss). Instead: authored `prisma/migrations/20260711000001_stock_movement_receipt_reversal/migration.sql` (a single additive `ALTER TYPE … ADD VALUE`), applied it directly via psql, and recorded it with `prisma migrate resolve --applied`. Semantically identical to what migrate dev would have generated; prod deploy applies it via the normal pipeline. The pre-existing drift is registered as a follow-up below.
- Story-1 review carry-forward (code-review L1): `tests/helpers/fake-db.ts` deliberately models the "tx view" (no `$transaction`, no rollback). The "forced `applied:false` rolls back CAS + bin together" consistency test in this story REQUIRES adding transactional snapshot/rollback emulation to the fake (wrap-and-restore state on throw) — do that first.

**Definition of Done:**

- [x] TS-003 passes end-to-end (partial undo → «Частично получен», on-hand/ПРИЁМКА −1, receivedAt cleared; full undo → «Заказ размещён», stock 0; SQL-induced stale submit → «Позиция изменилась — обновите страницу», DB untouched; worker page: zero «Сторно» controls).
- [x] Unit tests: CAS stale rejected; qty > received rejected; on-hand-below-zero and below-reserved rejected (incl. received-then-reserved-by-RO case); bin-insufficient rolls back the whole undo (receivedQuantity unchanged); full-undo status→ORDERED + receivedAt cleared.
- [x] **Regression test for critic C1:** receive 3 → undo 1 → re-receive 1 (back to a previously-seen count) → on-hand, Σbins, and receivedQuantity all consistent; cycle ×2; ledger counts 3 RECEIPT + 2 RECEIPT_REVERSAL.
- [x] Consistency test: a forced `applied:false` from the movement layer (fake-injected P2002) rolls back the CAS decrement and bin removal together — no partial undo survives (fake-db gained $transaction snapshot/rollback per Story-1 carry-forward).
- [x] `npx prisma validate` green; enum applied to dev DB (manual migration + `migrate resolve` — see Migration deviation note; `verify-warehouse` DB script PASS).
- [x] Verify: `npm test` (81) && browser run of TS-003

### Story 5: Supplier order edit/delete lifecycle

**Objective:** Let managers fix mistakes without cancel-and-recreate: full edit (supplier, lines, landed-cost inputs, meta) while `DRAFT`; meta-only edit (orderNumber, trackingNumber, estimatedArrival, notes) in any non-terminal status; delete `DRAFT` orders with confirmation. Verified by TS-004.

**Files:**

- Modify: `app/actions/supplier-orders.ts` (`updateSupplierOrder(orderId, input: CreateOrderInput)`: DRAFT-only guard, wholesale line replace (deleteMany + create) and full server-side landed-cost recompute in one `$transaction` — reuse the exact validation + `resolveLandedCost` + bounds flow of `createSupplierOrder`, extract shared helper if duplication exceeds ~30 lines; `updateSupplierOrderMeta(orderId, meta)`: rejects COMPLETED/CANCELLED; `deleteSupplierOrder(orderId)`: DRAFT-only + `items.every(receivedQuantity === 0)` belt-and-suspenders guard, cascade delete via relation)
- Create: `app/(admin)/admin/suppliers/orders/[id]/edit/page.tsx` (ADMIN/MANAGER; loads order + items into `SupplierOrderForm` initial state; non-DRAFT → redirect back to the order page)
- Modify: `components/admin/SupplierOrderForm.tsx` (props `mode: "create" | "edit"`, `orderId?`, `initialValues?` covering supplier/meta/landedCost/items; submit routes to `createSupplierOrder` or `updateSupplierOrder`; button label «Сохранить» in edit mode)
- Modify: `app/(admin)/admin/suppliers/orders/[id]/page.tsx` (header actions: «Редактировать» link when DRAFT; «Изменить детали» inline meta form (or link) when ORDERED/IN_TRANSIT/CUSTOMS/PARTIALLY_RECEIVED/RECEIVED; «Удалить» button with confirm when DRAFT)
- Create: `components/admin/SupplierOrderMetaForm.tsx` (small client form for meta fields, useTransition + server action)
- Test: `tests/suppliers/order-lifecycle.test.ts` (pure guards if extracted; at minimum status-gate helpers)

**Key Decisions / Notes:**

- NEW_PART lines in edit mode behave exactly as in create (draft Part created on save); existing PART lines keep `partId`.
- Wholesale replace is safe only because DRAFT can't have receipts after Story 2 — the `items.every(receivedQuantity === 0)` guard applies to BOTH `updateSupplierOrder` (wholesale replace) and `deleteSupplierOrder`, inside the tx (critic ambiguity fix: guard, not assumption).
- Orphaned draft Parts (critic m1): when a wholesale replace or delete drops a line whose Part was created by NEW_PART (isActive=false, price=0), garbage-collect that Part iff it has no StockMovements, zero stock, and no other SupplierOrderItem/estimate references; otherwise leave it (accumulation is acceptable, silent stock loss is not). Best-effort within the same tx.
- Delete uses a plain `confirm()`-style client guard + server-side status re-check; SupplierOrderItem cascades via relation (`onDelete: Cascade` on order relation).
- Keep `updateSupplierOrderStatus` untouched (it already refuses receiving-owned statuses).

**Definition of Done:**

- [x] TS-004 passes (edit form fully prefilled; qty 2→4 saved → DB itemsCost 4000/totalCost 5040 — server recompute incl. 26% CIF; ORDERED hides full edit, meta form saves tracking to DB; DRAFT delete via two-step confirm → row gone; GC spared the part still referenced by another order).
- [x] Direct action calls (bypassing UI) against a non-DRAFT order return an error and change nothing (canFullyEditOrder/canDeleteOrder gates unit-tested; enforced inside the tx before any write).
- [x] `npm run build` + `npm test` green (86 tests).
- [x] Verify: `npm test` && browser run of TS-004

### Story 6: Orders list — filters + pagination

**Objective:** Make /admin/suppliers/orders usable at volume: status filter chips, supplier dropdown filter, and server-side pagination (20/page) driven by searchParams; header counters reflect the active filter. Verified by TS-005.

**Files:**

- Modify: `app/(admin)/admin/suppliers/orders/page.tsx` (accept `searchParams: Promise<{ status?, supplier?, page? }>`; `where` built from filters; `db.supplierOrder.count` + `findMany({ skip, take: 20 })`; status chips row (all statuses + «Все»), supplier `<select>` (from users `isSupplier: true`) submitted as GET form; prev/next pagination links preserving filters)
- Test: none (page-level wiring; covered by TS-005 browser run)

**Key Decisions / Notes:**

- Mirror the warehouse page's searchParams handling (app/(admin)/admin/warehouse/page.tsx:22-27). Chips are plain `<Link>`s with merged query params — no client component needed.
- Header счётчики («Всего», «В пути», «Оборот») are computed from the filtered `where` via `count`/`aggregate` queries over the FULL filtered set — never from the fetched page slice (critic m2).
- `Trivial:` candidate — but filters + pagination + counters exceed the trivial bar; standard task, TS-005 is the verification.

**Definition of Done:**

- [x] TS-005 passes (status chip → ?status=ORDERED with counters recomputed over the filter: Всего 1 / оборот 3000₽ vs 5200₽ unfiltered; supplier filter positive + negative (nonexistent id → Всего 0 + empty-state); 22 seeded rows → «Стр. 2 из 2» with 3 rows and filter preserved; seed rows cleaned up).
- [x] URL is the single source of filter state (direct ?supplier=…&page=2 links render correctly).
- [x] `npm run build` green.
- [x] Verify: browser run of TS-005
