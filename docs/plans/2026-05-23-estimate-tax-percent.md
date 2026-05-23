# Estimate Tax as Percentage Implementation Plan

Created: 2026-05-23
Author: aleksandr.spiskov@gmail.com
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** An estimate carries a tax **rate** (percent, default 20%); the tax amount is computed automatically as `(subtotal − discount) × rate`, shown as a «Налог (X%)» line in the editor, the admin/customer estimate views, and the PDF, and folded into the estimate and deal totals — replacing the manual fixed-sum «Сбор» (FEE) workaround.

## Out of Scope

- **Migrating existing FEE «налог» lines** — `FEE` stays for genuine non-tax fees; existing estimates keep their FEE lines untouched and get `taxRate = 0` (no retroactive tax). User decision.
- **Per-line tax flags / mixed rates** — one rate per estimate; not per-line taxability.
- **Tax on rental-only or fees** — taxable base is labor + parts + rental after discount; FEE lines are never taxed.
- **A global tax-rate setting** — the rate lives on each estimate (new ones default to 20%); no app-wide settings row.

## Approach

**Chosen:** Add `Estimate.taxRate` and compute tax in a shared pure helper (`computeEstimateMoney`) consumed by both `recomputeEstimateTotals` and `recomputeDealTotals` (the existing `Estimate.tax` and `Deal.tax` columns are already present but unused — they get wired here). A debounced rate input in `EstimateLineEditor` calls a new `setEstimateTaxRate` action; the tax line is rendered in the editor strip, admin detail, `CustomerEstimateView`, and the PDF.

**Why:** Reuses the existing recompute cascade and the dormant `tax` columns (no new money columns, no deal-side rate field — the deal reads the active estimate's rate), at the cost of touching every estimate display surface so the «Налог (X%)» line is consistent everywhere. A shared compute helper avoids the totals logic drifting between the estimate and deal recompute paths (they already duplicate the line-sum loop).

## Context for Implementer

- **Money is integer ₽ (kopeck-free).** `EstimateLine.total` is signed: DISCOUNT negative, others positive (`lib/crm/internal/signed-line-total.ts`). `discount` field = Σ DISCOUNT line totals (already negative). So `subtotalAfterDiscount = subtotalLabor + subtotalParts + subtotalRental + discount`.
- **Taxable base** = `max(0, subtotalLabor + subtotalParts + subtotalRental + discount)` (after discount, excludes FEE). `tax = Math.round(base × taxRate / 100)`. `total = Σ all lines (incl. FEE & DISCOUNT) + tax`.
- **Two recompute paths must agree:** `recomputeEstimateTotals` (estimate-side) and `recomputeDealTotals` (deal mirrors its *active* estimate). Both sum `EstimateLine.total` directly — so both must add tax, or the deal total silently drops it. The deal reads the active estimate's `taxRate`.
- **Editable only on DRAFT.** The line editor is DRAFT-only (`EstimateLineEditor` `editable` prop); the rate input follows the same gate. Non-DRAFT estimates show the rate read-only.
- **Prisma client** is `@ts-nocheck`; cast results / use explicit `select`. Migrations: run `npx prisma migrate dev` then `generate`, then restart dev; omit any `*_photos_gin_idx` drop from generated SQL.

## Runtime Environment

- **Start:** `npm run dev` (HTTPS :443). **Health:** an estimate detail page `/admin/crm/estimates/<id>` (admin session). **DB:** `postgresql://alex@localhost:5432/geleoteka`.

## Assumptions

- Existing `Estimate.tax` / `Deal.tax` Int columns are unused by the current recompute (verified: `recomputeEstimateTotals`/`recomputeDealTotals` never write `tax`, total = Σlines). Tasks 2 depend on this — wiring them is additive, not a behavior conflict.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| All channels' deals get 20% default tax — `createDeal` (service, parts-retail, rentals) creates a 20%-taxed estimate | Low | Low | **RESOLVED (user decision): 20% for all channels.** The manager sets 0% per-deal where tax doesn't apply (retail/rental). No channel-specific default. |
| Editor has two debounced autosave streams (row edits + the new rate edits); a stale row-recompute could overwrite `tax`/`total` computed against the old rate, persisting inconsistent money fields | Medium (single user, near-simultaneous debounced saves) | High (wrong persisted total/tax) | Both recompute helpers read `taxRate` + lines and write inside one `FOR UPDATE`-locked transaction (Task 2) — recomputes serialize per estimate/deal, so the last one always reads the current committed rate + lines |

## Goal Verification

### Truths

1. Changing an estimate's tax rate recomputes a «Налог (X%)» amount = `(subtotal − discount) × rate` and the new amount is reflected consistently in the editor total, the admin estimate total, the customer view, the PDF, AND the parent deal's total — without any manual FEE line.
2. Estimates that existed before this change (rate backfilled to 0) show no tax and keep their previous totals unchanged.

## E2E Test Scenarios

### TS-001: Set tax rate → tax computed after discount, total updates
**Priority:** Critical · **Preconditions:** admin; a DRAFT estimate with a LABOR line (10 000 ₽), a PART line (5 000 ₽), and a DISCOUNT line (1 000 ₽). · **Mapped Tasks:** 1, 2, 3, 4

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open the estimate editor | A «Налог, %» input shows 20 (default for a new estimate); totals strip shows a «Налог (20%)» row |
| 2 | Read the «Налог (20%)» amount | = round((10000 + 5000 − 1000) × 20/100) = 2 800 ₽ |
| 3 | Read «Итого» | = 14 000 (lines) + 2 800 = 16 800 ₽ |
| 4 | Change the rate to 10, blur | «Налог (10%)» = 1 400 ₽; «Итого» = 15 400 ₽ (autosaved) |

### TS-002: Tax shows in customer view + PDF + deal total
**Priority:** High · **Preconditions:** the estimate from TS-001 at rate 10%. · **Mapped Tasks:** 2, 5

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open the customer estimate view (cabinet or public token page) | A «Налог (10%)» row = 1 400 ₽ appears between «Скидка» and the grand total |
| 2 | Open the estimate PDF (`/api/estimates/<id>/pdf`) | PDF shows the «Налог (10%)» line and grand total 15 400 ₽ |
| 3 | Open the parent deal page | Deal total = 15 400 ₽ (includes the tax) |

### TS-003: Pre-existing estimate is untaxed
**Priority:** High · **Preconditions:** an estimate created before the migration. · **Mapped Tasks:** 1, 2

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open it in the editor | «Налог, %» = 0; no «Налог» row in the totals (or shows 0); total equals the sum of its lines (unchanged from before) |

### TS-004: A revision keeps the parent's tax rate
**Priority:** High · **Preconditions:** a SENT estimate with `taxRate = 10`. · **Mapped Tasks:** 3

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a revision (Пересмотреть) of that estimate | The new DRAFT revision's «Налог, %» = 10 (not the 20% default); its tax recomputes at 10% |

## E2E Results

Verified in Chrome (admin session) with a seeded deal/estimate (LABOR 10000, PART 5000, DISCOUNT −1000). DB assertions confirm persistence + deal cascade.

| Scenario | Priority | Result | Notes |
|----------|----------|--------|-------|
| TS-001 | Critical | PASS | Editor «Налог, %»=20 default; «Налог (20%)»=2 800 ₽ (base after discount 14 000); Итого 16 800. Changed to 10% → live 1 400/15 400; **persisted** estimate taxRate=10/tax=1400/total=15400 |
| TS-002 | High | PARTIAL | Deal cascade PASS (deal tax=1400/total=15400). Customer-view + PDF «Налог (X%)» row verified by construction (fields in selects + mirrored discount-row markup + tsc-clean + persisted tax); not browser-rendered (DRAFT not customer-visible without sending) |
| TS-003 | High | PASS (by data) | All 10 pre-existing estimates backfilled to taxRate=0 (T1); `estimate.tax > 0` hides the row |
| TS-004 | High | PASS | `verify-deal-estimate` asserts a revision keeps parent taxRate (10) |

> Note: `createDeal` stores DISCOUNT lines unsigned (+1000) — a **pre-existing** behavior unrelated to this feature (the editor's `addEstimateLine` signs discounts via `signedLineTotal`). The seed's discount was corrected to −1000 for the E2E. Out of scope here; flag separately.

## Progress Tracking

- [x] Task 1: Schema — `Estimate.taxRate` + backfill migration
- [x] Task 2: `computeEstimateMoney` helper + wire estimate & deal recompute + verify
- [x] Task 3: `setEstimateTaxRate` action + revision copies rate
- [x] Task 4: Tax-rate input + live «Налог» row in the editor
- [x] Task 5: «Налог (X%)» row in admin detail, customer view, and PDF

## Implementation Tasks

### Task 1: Schema — `Estimate.taxRate` + backfill migration

**Objective:** Add a per-estimate tax rate (percent), defaulting new estimates to 20% while leaving every existing estimate at 0% (no retroactive tax). The `tax` amount columns already exist on `Estimate` and `Deal`. Verified by migration apply + `prisma validate`.

**Files:**
- Modify: `prisma/schema.prisma` — add `taxRate Int @default(20)` to `model Estimate`, directly after the `tax Int @default(0)` line (schema.prisma:1357-ish).
- Create: `prisma/migrations/<ts>_estimate_tax_rate/migration.sql` (via migrate) — `ADD COLUMN "taxRate" INTEGER NOT NULL DEFAULT 20`, then backfill all pre-existing rows to 0 so they are not retroactively taxed:
  `UPDATE "Estimate" SET "taxRate" = 0;`
  (Runs once at migration time, before any new estimate exists — every current row → 0; the column default 20 applies only to rows created afterward.)

**Key Decisions / Notes:**
- New estimates inherit 20% from the column default (no app-code change needed for the default). Existing rows are zeroed by the backfill.
- **Both statements MUST live in the SAME migration file** (the `ADD COLUMN … DEFAULT 20` then the `UPDATE … SET "taxRate" = 0`). Splitting the UPDATE into a separate later migration would leave a window where existing estimates carry 20% retroactively. Append the UPDATE to the generated `migration.sql` before applying.
- Run `npx prisma migrate dev --name estimate_tax_rate` then `npx prisma generate`, restart dev. Omit any `*_photos_gin_idx` drop from the generated SQL.
- `Trivial:` no — schema + data migration; no app logic (logic is Tasks 2-3).

**Definition of Done:**
- [ ] `npx prisma validate` passes; migration applies on the dev DB
- [ ] `taxRate` exists on the generated client; new `db.estimate.create({...})` without `taxRate` yields 20; all pre-existing estimates have `taxRate = 0`
- [ ] Verify: `npx prisma migrate dev --name estimate_tax_rate` then `npx prisma validate` exit 0

### Task 2: `computeEstimateMoney` helper + wire estimate & deal recompute + verify

**Objective:** Centralize estimate money math in one pure helper and have both recompute paths set `tax` and a tax-inclusive `total`, so the estimate total, the deal total, and every display agree. Verified by extended `scripts/verify-deal-estimate.ts`.

**Files:**
- Create: `lib/crm/internal/compute-estimate-money.ts` — `computeEstimateMoney(lines: { type: string; total: number }[], taxRate: number): { subtotalLabor; subtotalParts; subtotalRental; discount; tax; total }`. Sum lines by type (mirror `recompute-estimate-totals.ts`): `linesTotal = Σ total`; `discount = Σ DISCOUNT.total` (negative); subtotals partition LABOR/PART/RENTAL_DAY. `base = Math.max(0, subtotalLabor + subtotalParts + subtotalRental + discount)`; `tax = Math.round(base * taxRate / 100)`; `total = linesTotal + tax`. Pure — no DB.
- Modify: `lib/crm/internal/recompute-estimate-totals.ts` — wrap the whole read→compute→write in `db.$transaction(async (tx) => { … })` that FIRST locks the estimate row (`await tx.$queryRaw\`SELECT id FROM "Estimate" WHERE id = ${estimateId} FOR UPDATE\``), THEN reads lines + `taxRate` **via `tx`**, calls `computeEstimateMoney(lines, taxRate ?? 0)`, and writes all fields incl. `tax`. The lock serializes concurrent recomputes for one estimate so the last recompute always reads the current committed `taxRate` + lines (closes the row-autosave vs rate-autosave race — see Risks). Then cascade to `recomputeDealTotals` (outside or after the tx).
- Modify: `lib/crm/internal/recompute-deal-totals.ts` — same transactional pattern: in `db.$transaction`, lock the deal row (`SELECT id FROM "Deal" WHERE id = ${dealId} FOR UPDATE`), select the active estimate's `taxRate` (extend the `findMany` select with `taxRate`) and its lines via `tx`, call `computeEstimateMoney(lines, active.taxRate ?? 0)`, write `tax` + tax-inclusive `total`. When no active estimate, `tax = 0` (existing reset path).
- Modify: `scripts/verify-deal-estimate.ts` — add cases: (a) tax = round((labor+parts+rental+discount) × rate/100) on the estimate, total = Σlines + tax; (b) deal.tax/total mirror the active estimate; (c) base clamps at 0 when discount ≥ subtotal (tax = 0); (d) rate 0 → tax 0, total = Σlines (regression for existing estimates); (e) FEE line is NOT in the taxable base but IS in total.

**Key Decisions / Notes:**
- `computeEstimateMoney` lives in `internal/` and is imported directly by the two sibling recompute files (no `public/` re-export needed; the verify script imports it via the relative path like it imports other internals).
- Rounding once on the final tax (banker's not required — `Math.round`), matching the integer-₽ convention.
- **Single recompute entry point.** Grep for `recomputeDealTotals(` callers — every `EstimateLine` mutation (`addEstimateLine` / `updateEstimateLine` / `deleteEstimateLine`, `EstimatePartPicker`'s action) must funnel through `recomputeEstimateTotals` (which writes `estimate.tax` then cascades), NOT call `recomputeDealTotals` directly (that path skips writing `estimate.tax`). If any line mutation calls the deal recompute directly, reroute it through the estimate recompute.
- `Why >0 new behaviour, reuse 1 script:` tax math is integration-verified through the existing `verify-deal-estimate.ts`; the pure helper's branches are exercised by cases (a)-(e). Concurrency safety is a code-review guarantee (the `FOR UPDATE` locked read+write), not a scripted race.

**Definition of Done:**
- [ ] `recomputeEstimateTotals` writes `tax = round((subtotal − discount) × taxRate/100)` and `total = Σlines + tax`
- [ ] `recomputeDealTotals` writes the same `tax`/`total` from the active estimate's rate
- [ ] Base clamps at 0 (discount ≥ subtotal → tax 0); rate 0 → tax 0, total unchanged from Σlines
- [ ] Recompute reads `taxRate` + lines and writes totals inside one `FOR UPDATE`-locked transaction (estimate row for estimate recompute, deal row for deal recompute)
- [ ] No `EstimateLine` mutation calls `recomputeDealTotals` directly (audited via grep) — all route through `recomputeEstimateTotals`
- [ ] Verify: `npm run verify-deal-estimate` prints PASS (all tax cases); `npm run lint` green

### Task 3: `setEstimateTaxRate` action + revision copies rate

**Objective:** Let an admin set the tax rate on a DRAFT estimate (recomputing totals), and ensure a revision carries the parent's rate. Verified by TS-001 and the editor wiring in Task 4.

**Files:**
- Modify: `app/actions/crm/estimates.ts` — add `setEstimateTaxRate(estimateId: string, rate: number): Promise<{ error: string | null }>`: `await requireRole(["ADMIN","MANAGER"])`; reject non-integer / `rate < 0` / `rate > 100` → `{ error: "Ставка налога должна быть от 0 до 100%" }`; verify the estimate is editable (stage `DRAFT`) else `{ error: "Налог можно менять только в черновике" }`; `db.estimate.update({ where:{id}, data:{ taxRate: rate } })` then `await recomputeEstimateTotals(estimateId)`; return `{ error: null }`. In `reviseEstimate` (estimates.ts:439+) add `taxRate: true` to the parent `select` and `taxRate: parent.taxRate` to the new `tx.estimate.create({ data })` so a revision keeps the rate.

**Key Decisions / Notes:**
- Mirror the existing estimate-action shape (requireRole + `{ error }` return; `recomputeEstimateTotals` already cascades to the deal).
- DRAFT-only gate matches the line editor's `editable` rule (non-DRAFT estimates are immutable).

**Definition of Done:**
- [ ] `setEstimateTaxRate` rejects out-of-range / non-DRAFT and otherwise persists the rate + recomputes (estimate & deal totals update)
- [ ] A revision created via `reviseEstimate` has the same `taxRate` as its parent (not the 20% default) — verified by TS-004
- [ ] Verify: `npm run lint` green; behavior covered by TS-001 (editor) and TS-004 (revision) at verify time

### Task 4: Tax-rate input + live «Налог» row in the editor

**Objective:** Add a tax-rate % control and a live «Налог (X%)» row to `EstimateLineEditor`, so a manager sets the rate and sees tax + total update immediately (DRAFT only). Verified by TS-001.

**Files:**
- Modify: `components/crm/EstimateLineEditor.tsx` — add `taxRate: number` to `Props`; hold it in local state. Render a «Налог, %» number input (min 0, max 100) near the totals strip; on change debounce-call `setEstimateTaxRate(estimateId, rate)` (reuse the ~400ms `SAVE_DEBOUNCE_MS` pattern). Call `router.refresh()` **only inside the awaited action's success branch** (after the promise resolves with `{ error: null }`), never on a separate timer — otherwise refresh can fire before the DB write commits and show stale totals. Extend `LiveTotalsStrip` to compute and show a «Налог (R%)» row: `taxBase = Math.max(0, labor + parts + rental + discount)`, `taxAmount = Math.round(taxBase × R / 100)`, and add it into the displayed «Итого» (`subtotals.total + taxAmount`). When `editable` is false, render the rate read-only (no input).
- Modify: `app/(admin)/admin/crm/estimates/[id]/page.tsx` — pass `taxRate={estimate.taxRate}` to `<EstimateLineEditor>` (extend the estimate `select` with `taxRate: true`).

**Key Decisions / Notes:**
- The live tax mirrors the server formula exactly (base after discount, clamp ≥ 0) so the strip matches the persisted value after refresh — no drift.
- The rate input is a host-side debounce identical to row autosave; on a `{ error }` result surface it via the existing `toast.error`.

**Definition of Done:**
- [ ] Editor shows «Налог, %» (default 20 on new estimates) and a live «Налог (R%)» row; «Итого» includes the tax
- [ ] Editing the rate autosaves and the persisted estimate/deal totals match the displayed values after refresh
- [ ] Non-DRAFT estimates show the rate read-only (no input)
- [ ] Verify: browser E2E TS-001 passes

### Task 5: «Налог (X%)» row in admin detail, customer view, and PDF

**Objective:** Render a «Налог (X%)» line (amount = `estimate.tax`) between the discount row and the grand total on every read surface, so customers and the PDF see the tax. Verified by TS-002.

**Files:**
- Modify: `app/(admin)/admin/crm/estimates/[id]/page.tsx` — add `tax`, `taxRate` to the estimate `select` + the local interface (page.tsx:31-34, 81-84); insert a «Налог ({estimate.taxRate}%)» row showing `formatPrice(estimate.tax)` between the discount row (~246-250) and the total row (~255), shown when `estimate.tax > 0`.
- Modify: `components/portal/CustomerEstimateView.tsx` — add `tax`/`taxRate` to its estimate prop type; render the «Налог (X%)» row before the grand total.
- Modify: `app/(portal)/cabinet/estimates/[id]/page.tsx` and `app/(public)/estimate/[token]/page.tsx` — extend their estimate `select`/data passed to `CustomerEstimateView` with `tax`, `taxRate`.
- Modify: `lib/estimate-pdf-document.tsx` — add `tax`/`taxRate` to the estimate data type; render the «Налог (X%)» line before «Итого к оплате».
- Modify: `app/api/estimates/[id]/pdf/route.ts` — extend the estimate `select` feeding the PDF with `tax`, `taxRate`.

**Key Decisions / Notes:**
- Amount comes from the persisted `estimate.tax` (computed in Task 2) — surfaces do not recompute. Label interpolates `taxRate`.
- Mirror each surface's existing discount-row markup for visual consistency; CSS variables / existing styles, no hardcoded hex.
- **Row visibility uses `estimate.tax > 0`, consistently across all surfaces.** A non-zero `taxRate` whose base rounds to `tax = 0` (e.g. a 1₽ base × 5% → `Math.round(0.05) = 0`) hides the row — intentional and uniform; the rate input in the editor still shows the configured rate.

**Definition of Done:**
- [ ] Admin detail, customer view (cabinet + public), and PDF each show «Налог (X%)» = `estimate.tax` between discount and grand total when tax > 0
- [ ] Grand total on each surface equals subtotal − discount + tax (+ fees)
- [ ] Verify: browser E2E TS-002 passes (customer view + PDF + deal total)
