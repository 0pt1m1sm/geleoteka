# Master Backlog — compiled 2026-05-21

Cross-referenced against `prisma/schema.prisma`, `app/`, `lib/`, and `app/actions/`
on 2026-05-21. Every "outstanding" item cites what was checked (model/route/field
absent). Plans marked `Status: VERIFIED` shipped despite stale unchecked checkboxes.

## Genuinely outstanding work (grouped by module/theme)

### Warehouse Management System  [PRD: docs/prd/2026-05-10-warehouse-management.md, Status: Draft]

Almost entirely UNBUILT. The PRD's foundation (Deal+Fulfillment) is built, but no
warehouse-specific schema, actions, or routes exist.

- Depends on: deal-fulfillment-architecture PRD — **built** (Deal/Estimate exist).
- What's missing (verified against code):
  - [ ] `StockMovement` model — NOT in schema (grep count 0 in schema.prisma)
  - [ ] `StockMovementReason` enum — NOT in schema
  - [ ] `SplusSyncRun` model — NOT in schema (grep count 0)
  - [ ] `Part.barcode` field — NOT in schema (Part model lines 863–890: no barcode)
  - [ ] `Part.gtin` field — NOT in schema
  - [ ] `Part.lastSplusSyncAt` / `Part.splusExternalId` — NOT in schema
  - [ ] `applyStockMovement` server action — does not exist
  - [ ] SupplierOrder RECEIVED → stock write — NOT done. `app/actions/supplier-orders.ts`
        RECEIVED handler only sets `receivedAt`; no quantity increment, no movement.
  - [ ] RepairOrder close → CONSUMPTION movement — no such action exists
  - [ ] PartShipment delivery → SALE movement — no such action (also no PartShipment model)
  - [ ] `GET /api/stock/lookup?code=` route — NOT present (no `app/api/stock/` dir)
  - [ ] `lookupPartForDealLine` picker contract — does not exist
  - [ ] `/admin/parts/[id]` "История движений" tab — n/a (no movement model)
  - [ ] Splus reconciliation — `lib/splus.ts` is a 51-line stub only; no `runSplusSync`
  - [ ] `/admin/warehouse/scan` scanner UI — no warehouse routes at all
  - Note: DealLine part-picker (PRD §"Deal Flow Integration") is moot — the `DealLine`
    model was deliberately removed (schema comment "refactor 2026-05-18"); EstimateLine
    is now the line source of truth. Picker would target EstimateLine if revived.

### CRM Expansion — Pipeline / Customer 360 / metrics  [PRD: docs/prd/2026-05-10-crm-expansion.md, Status: Draft]

Largely BUILT under `/admin/crm/*` (not the PRD's planned `(crm)` route group).
Deal/Estimate/CommunicationLog/CrmTask/InboxMessage models all shipped. Outstanding:

- [ ] **Pipeline kanban** (`/crm/pipeline`) — NO pipeline/kanban page exists. Grep for
      "pipeline"/"kanban" in `app`/`components` hits only inbox.ts + PDF route (unrelated).
- [ ] **CustomerProfile CRM extension** — model (schema lines 381–387) has only
      userId/preferredMasterUserId/blacklisted/notes. Missing PRD fields: `source`,
      `referrerUserId`, `firstSeenAt`, `lastTouchAt`, `lifetimeValue`. So denormalized
      LTV / last-touch tracking is NOT implemented at the data layer.
  - [ ] `bumpLastTouch` exists (`lib/crm/public/bump-last-touch.ts`) but cannot persist
        `lastTouchAt`/`lifetimeValue` (fields absent) — verify what it actually writes.
  - [ ] `recompute-ltv` action — no LTV field to compute into.
- [ ] **Customer 360 full 7-tab page** — `/admin/customers/[id]` has Автомобили + Сделки
      sections only. Missing: Метрики tab (LTV/avg ticket/days-in-stage), and the
      communications/tasks/tags as the PRD's tabbed 360 layout.
- [ ] **CRM metrics layer** — no `lib/crm/queries/metrics.ts` (LTV, win-rate, avg ticket,
      days-in-stage). CRM dashboard exists (`/admin/crm/page.tsx`) — verify which KPI
      tiles actually compute vs. placeholder.
- [ ] **`(crm)` route group / dedicated shell + cross-shell switcher** — NOT built; CRM
      lives under the `(admin)` shell at `/admin/crm/*`. This is an architectural
      deviation from both this PRD and the Deal+Fulfillment PRD §"URL/shell architecture".
      May be an accepted decision — see Uncertain section.
- Built and confirmed: Communications log (CommunicationLog + inbox triage UI),
  CrmTask CRUD + `/admin/crm/tasks`, Estimate list/detail/editor, inbound/outbound
  email (Resend) via `lib/email/*`, unread-reply badge (2026-05-19 plans, VERIFIED).

### Deal + Fulfillment Architecture  [PRD: docs/prd/2026-05-10-deal-fulfillment-architecture.md, Status: Draft]

Foundation BUILT (Deal, Estimate, EstimateLine, fulfillment dealId links, createDeal
wired into booking/rentals/part-orders). Remaining gaps:

- [ ] **Migration Step 2 incomplete** — `PartOrder.dealId` and `RentalBooking.dealId`
      are still NULLABLE (schema lines 915, 971); only `RepairOrder.dealId` is NOT NULL
      (line 610). PRD requires NOT NULL on all three fulfillments.
- [ ] **Money not fully moved off fulfillments** — `RentalBooking.totalCost` still
      present; `PartOrder.total` still present. PRD Step 2 calls for dropping these.
- [ ] **PartOrder → PartShipment rename** — NOT done. Models are still `PartOrder` /
      `PartOrderItem` (grep "PartShipment" = 1 hit, only a stray reference). PRD Step 3.
- [ ] **`approveEstimate` does not dispatch fulfillment creation** — `app/actions/crm/
      estimates.ts:232` only advances stages; comment says dispatch is "a separate step",
      relying on booking-time creation. PRD acceptance: "approve creates the right
      fulfillment(s) via module public APIs" — not satisfied for the estimate path.
- [ ] **ESLint module-boundary enforcement** — no boundary rule found in
      `eslint.config.mjs` (no `no-restricted-imports`/boundaries entries). PRDs across
      all three repeatedly require this; `lib/crm/public` vs `internal` split exists by
      convention but is not machine-enforced. (Cross-ref 2026-04-13 module-boundaries PRD.)
- Note: DealStage enum uses `NEW`/`IN_PROGRESS` (schema), not the PRD's
  `DRAFT/QUOTED/APPROVED/IN_FULFILLMENT/DELIVERED/WON/LOST`. Likely an intentional
  simplification — flagged in Uncertain.

### Splus integration (cross-cutting, blocks Warehouse goal #4)

- [ ] `lib/splus.ts` is a 51-line stub. Real Splus pull/reconciliation, `SplusSyncRun`
      logging, and cron schedule all unbuilt. PRD explicitly defers real credentials but
      expects the contract-shaped stub + sync run model — model is absent.

## Done-but-unchecked (plans whose work shipped; checkboxes stale)

All below are `Status: VERIFIED`; unchecked `[ ]` are sub-task lists inside completed work.

- 2026-05-11-estimate-and-yookassa-followups.md — Estimate editor + revision UX shipped;
  YooKassa payment scaffolding deliberately REMOVED (no payment gateway planned).
- 2026-05-11-estimate-pdf-two-page-layout.md — Two-page estimate PDF shipped.
- 2026-05-12-inbound-email-integration.md — Inbound email (Resend) shipped; `lib/email/inbound.ts`.
- 2026-05-12-smtp-email-integration.md — Outbound email/SMTP shipped; `lib/email/send.ts`.
- 2026-05-19-inbound-reply-task-and-badge.md — Reply task + unread badge shipped.
- 2026-05-19-resend-inbound-outbound-broken.md — Email bug fixes shipped (0 unchecked).
- 2026-05-07-crm-customers-expansion.md — Customer list/detail + filters + notes/tags shipped.
- 2026-05-07-code-quality-audit-fixes.md — Dead-code/dup fixes shipped; rest explicitly Out of Scope.
- 2026-05-07-remaining-findings.md — Audit follow-ups shipped; remainder explicit Deferred Ideas.
- Foundational (spot-checked, all VERIFIED): 2026-05-05-vehicle-trims,
  2026-05-06-vehicle-catalog-trims-all-models, 2026-05-07-design-system-overhaul,
  2026-05-08-light-theme-typography-overhaul, 2026-05-04-public-site-refresh,
  2026-05-07-cms-expansion, 2026-05-07-post-checkout-account-claim,
  2026-04-11-mercedes-service-platform, 2026-04-11-geleoteka-phase2.

### Explicitly deferred minor ideas (from VERIFIED plans — not a backlog, logged for record)
- `<ModelSelect/>` / `<SuccessCard/>` primitive extraction (incompatible APIs) — code-quality plans.
- Rentals page self-similar block refactor + `app/actions/rentals.ts` self-dup — future rentals spec.
- Denormalized `User.lastVisitAt` for SQL sort — crm-customers-expansion Out of Scope.
- `DIESEL_HYBRID` enum, Russian-market trim cross-check — remaining-findings, no UX driver.

## Uncertain / needs user decision

- **CRM shell location:** PRDs spec a dedicated `(crm)` route group + cross-shell
  switcher; the team shipped CRM under `/admin/crm/*` in the existing admin shell. Is the
  `(crm)` split still wanted, or is `/admin/crm/*` the accepted final design?
- **DealStage enum simplification:** schema uses `NEW`/`IN_PROGRESS`; PRDs spec a richer
  7-value pipeline. If pipeline kanban is built, columns must map to actual enum values —
  confirm whether to expand the enum or keep the simplified set.
- **CRM dashboard KPI fidelity:** `/admin/crm/page.tsx` exists; not verified which tiles
  compute real metrics vs. placeholders (no `metrics.ts` query module found).
- **Migration Step 2 nullable dealId / leftover money fields:** intentional (legacy-row
  tolerance) or genuinely unfinished? Needs a backfill-status check on production data.
