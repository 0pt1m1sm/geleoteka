# Supplier-Order Landed Cost Implementation Plan

Created: 2026-05-23
Author: aleksandr.spiskov@gmail.com
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** On the supplier-order form, derive shipping (weight × $/kg × USD rate) and customs (% of CIF, default 26%, or $/kg cargo) from structured inputs that are stored on the order and shown as a breakdown — instead of manual ₽ lump sums the server blindly trusts.

## Out of Scope

- **Editing landed cost on an existing order.** There is no order-edit flow today (only `updateSupplierOrderStatus` and receiving). The calculator lives on the create form (`SupplierOrderForm`); recompute-on-edit is deferred.
- **CBR (cbr.ru) auto-fetch of the USD rate.** v1 is manual entry, stored per order. CBR daily-XML integration is a deferred fast-follow.
- **Per-line ТН ВЭД duty breakdown.** Customs is a single editable % (default 26%) or a $/kg cargo rate — not separate duty/VAT/fee fields.
- **Insurance term of CIF.** CIF base = `itemsCost + shippingRub`; insurance is folded into the % rate, not a separate input.

## Approach

**Chosen:** Pure calc module `lib/suppliers/landed-cost.ts` + new structured columns on `SupplierOrder` and `Part.weightGrams`; the create form (`SupplierOrderForm` + `OrderTotals`) drives a live preview, and `createSupplierOrder` **recomputes server-side** from the stored inputs.
**Why:** Mirrors the project's "testable pure core in `lib/`, server actions trust nothing from the client" pattern (cf. `lib/crm/internal/compute-estimate-money.ts` recomputed in `createDeal`). Costs storing 7 new nullable columns + a migration, but buys an auditable breakdown and a server-authoritative total.

## Context for Implementer

Money is stored as **whole-ruble `Int`** throughout this codebase (`formatPrice` renders RUB with 0 fraction digits). Fractional inputs introduced here (rate $/kg, USD rate) are stored as **scaled integers ×100** (USD cents / kopecks) to stay in the integer convention and avoid float drift; the customs percentage is stored in **basis points** (2600 = 26%). All ₽ result columns (`shippingCost`, `customsCost`, `totalCost`, `itemsCost`) keep their existing whole-ruble `Int` semantics. Prisma client imports from `@/app/generated/prisma/client` and results need explicit casts (`as { ... }`) — see `.claude/rules/geleoteka-conventions.md`.

## Runtime Environment

- **Start:** `npm run dev` (HTTPS, port 443). After `prisma generate`, restart dev.
- **Health check:** `curl -sk https://localhost/admin/suppliers/orders/new`
- **Login:** `admin@geleoteka.ru` / `admin123`

## Assumptions

- A `Part` with no `weightGrams` contributes 0 to order weight — Task 4 surfaces this via the manual weight override so a manager can correct an under-counted total. Tasks 2, 4 depend on this.
- Cargo ($/kg) and weight-based shipping are **independent** components: in cargo customs mode the shipping $/kg can be set to 0 if cargo is all-in. Task 2, 4 depend on this framing.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Client posts inflated ₽ costs OR a tampered shipping weight | Medium | Money integrity | `createSupplierOrder` ignores client ₽ entirely; auto-weight is derived server-side from DB `Part.weightGrams × qty`; only the explicit, stored `manualWeightOverrideGrams` can change it (Task 5 DoD + tamper verify case). |
| Auto-generated `DROP INDEX *_photos_gin_idx`; split enum-default in migration | High | Broken migration | Strip the gin DROP; ensure `customsMode` ADD COLUMN carries an inline `NOT NULL DEFAULT`; apply via `prisma migrate deploy` after `--create-only` (Task 1). |
| Integer-product overflow / float drift in $/kg × weight × rate | Medium | Wrong totals / `Infinity` | Divide-early formula keeps the product ≈1e13 ≪ `MAX_SAFE_INTEGER`; `isWithinLandedCostBounds` rejects out-of-range inputs before compute; boundary verify case (Task 2, Task 5). |

## Goal Verification

### Truths

1. The `shippingCost`, `customsCost`, and `totalCost` persisted on a newly created order are computed server-side, with the shipping weight **derived from DB `Part.weightGrams × quantity`** (overridable only via the explicit, stored `manualWeightOverrideGrams`) — the client supplies neither the ₽ totals nor the catalog weight, so a tampered payload cannot inflate or deflate them.

## E2E Test Scenarios

### TS-001: Create order with weight-based shipping + % customs
**Priority:** Critical
**Preconditions:** Logged in as admin; at least one catalog part has a weight set (Task 3).
**Mapped Tasks:** Task 3, 4, 5, 6

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/admin/suppliers/orders/new` | Form loads with Финансы (landed-cost) section |
| 2 | Add a PART line (qty 2) for the part with weight | Order weight auto-fills from Σ(weight×qty) |
| 3 | Enter shipping rate $/kg and USD rate | Доставка ₽ updates live |
| 4 | Leave customs mode = «% от CIF», default 26% | Таможня ₽ = round((itemsCost+shipping)×26%) live |
| 5 | Submit, land on order detail | Detail Финансы shows weight, $/kg, USD rate, customs %, and computed Доставка/Таможня/Итого |

### TS-002: Cargo ($/kg) customs mode
**Priority:** High
**Preconditions:** On the create form with a weighted PART line.
**Mapped Tasks:** Task 4, 5

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Switch customs mode to «Карго $/кг» | % field hides, cargo $/kg field shows |
| 2 | Enter a cargo $/kg rate | Таможня ₽ = round(weightKg × cargo$/kg × USD rate), live |
| 3 | Submit and open detail | Detail shows cargo mode + cargo rate, customs ₽ matches |

### TS-003: Manual weight override
**Priority:** Medium
**Preconditions:** On the create form; a line whose part has no weight (e.g. NEW_PART).
**Mapped Tasks:** Task 4

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Observe auto weight (0 for unweighted line) | Доставка ₽ = 0 at this point |
| 2 | Type a manual total weight | Доставка ₽ recomputes from the override |

## Implementation Notes (for verification)

- **TS-001 verified end-to-end** (browser + DB): order created via the form persisted `shippingWeightGrams=5000` (server-derived from DB `Part.weightGrams 2500 × qty 2`, NOT client), `shippingCost=3931`, `customsCost=10642` (26% CIF), `totalCost=51573`; detail page shows the breakdown sub-lines. Goal Truth 1 confirmed.
- **TS-002 (cargo) — resolved in verify via playwright-cli:** the customs-mode toggle works (the earlier Chrome failure was a synthetic-event limitation, not a code bug). Cargo order detail shows «Карго $4/кг», customs 1 850 ₽ (round(5 кг × $4 × 92.5)), total 38 850 ₽.
- **TS-003 (weight override) — verified via playwright-cli:** auto weight 2.5 кг → Доставка 1 966 ₽; override 10 кг → Доставка 7 863 ₽ + customs recomputed via CIF.
- **Test fixtures left in dev DB:** a seeded supplier «TMP Supplier» (`tmp-supplier@geleoteka.ru`), a weight of 2.5 kg on part `Диск тормозной передний G-Class`, and two demo orders (TS-001 %-mode, TS-002 cargo).

## E2E Results

| Scenario | Priority | Result | Fix Attempts | Notes |
|----------|----------|--------|--------------|-------|
| TS-001 (% of CIF) | Critical | PASS | 0 | Chrome: weight auto-derived 5 кг, shipping 3 931 ₽, customs 10 642 ₽ (26% CIF), total 51 573 ₽; DB persisted server-derived weight. |
| TS-002 (cargo $/kg) | High | PASS | 0 | playwright-cli: toggle → cargo field; customs 1 850 ₽, detail «Карго $4/кг», total 38 850 ₽. |
| TS-003 (weight override) | Medium | PASS | 0 | playwright-cli: 2.5 кг → 10 кг override recomputes shipping (1 966 → 7 863 ₽) + customs. |

## Progress Tracking

- [x] Task 1: Schema — `Part.weightGrams` + `SupplierOrder` landed-cost columns + `CustomsMode` enum + migration
- [x] Task 2: Pure calc module `lib/suppliers/landed-cost.ts` + verify script
- [x] Task 3: `Part` weight field in admin part create/edit form + action
- [x] Task 4: Landed-cost calculator UI on the supplier-order form
- [x] Task 5: `createSupplierOrder` derives weight from DB, recomputes server-side, stores breakdown
- [x] Task 6: Order detail page shows the landed-cost breakdown

## Implementation Tasks

### Task 1: Schema — landed-cost columns + CustomsMode enum + migration

**Objective:** Add `Part.weightGrams` and the structured landed-cost inputs to `SupplierOrder`, plus a `CustomsMode` enum. These are the persistence backbone for every later task. All new columns are nullable EXCEPT `customsMode`, which is non-null with a `PERCENT_CIF` default (existing rows backfill to the default).

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_supplier_order_landed_cost/migration.sql`

**Key Decisions / Notes:**
- `Part`: add `weightGrams Int?` (grams; UI enters kg ×1000).
- `enum CustomsMode { PERCENT_CIF CARGO_PER_KG }` — follows the codebase's closed-set-as-enum convention (cf. `SupplierOrderStatus`).
- `SupplierOrder` add (8 columns): `shippingWeightGrams Int?` (effective weight used — server-computed, see Task 5), `manualWeightOverrideGrams Int?` (manager override; null = auto from catalog), `shippingRateUsdCents Int?` ($/kg ×100), `usdRateKopecks Int?` (₽/$ ×100), `customsMode CustomsMode @default(PERCENT_CIF)`, `customsPercentBps Int?` (2600 = 26%), `cargoRateUsdCents Int?` ($/kg ×100). Existing `shippingCost`/`customsCost`/`itemsCost`/`totalCost` Int ₽ are unchanged (computed results).
- ⛔ Migration gotcha (per project memory): generate with `npx prisma migrate dev --create-only --name supplier_order_landed_cost`, then **delete any `DROP INDEX "..._photos_gin_idx";` line** from the generated `migration.sql`, then apply with `npx prisma migrate deploy` and run `npx prisma generate`. Restart dev after generate.
- ⛔ Enum-default safety (reviewer must_fix): confirm the generated `migration.sql` writes the default INLINE — `ADD COLUMN "customsMode" "CustomsMode" NOT NULL DEFAULT 'PERCENT_CIF'` — not a separate `ALTER COLUMN ... SET NOT NULL` step (which would scan/fail against existing NULLs). Fix the SQL in place if Prisma split it.
- `Trivial:` no — schema change with a migration; verified by Task 2's verify script reading/writing the new columns.

**Definition of Done:**
- [ ] `npx prisma validate` passes; `CustomsMode` enum + all 8 new columns exist in the generated client.
- [ ] Migration applied to dev DB via `prisma migrate deploy` with no spurious gin `DROP INDEX`; existing supplier orders read back with `customsMode = PERCENT_CIF` and all other new columns NULL.
- [ ] The `customsMode` ADD COLUMN carries an inline `NOT NULL DEFAULT 'PERCENT_CIF'`.
- [ ] Verify: `npx prisma validate && npx prisma migrate status`

### Task 2: Pure calc module `lib/suppliers/landed-cost.ts` + verify script

**Objective:** Pure, I/O-free functions that compute order weight, shipping ₽, and customs ₽ from the scaled-int inputs. This is the single source of truth reused by the form preview and the server action, so its rounding/CIF semantics are tested independently of the DB.

**Files:**
- Create: `lib/suppliers/landed-cost.ts`
- Create: `scripts/verify-landed-cost.ts`
- Modify: `package.json` (add `verify-landed-cost` script)

**Key Decisions / Notes:**
- `orderWeightGrams(lines: { weightGrams: number | null; quantity: number }[]): number` — Σ(weightGrams×qty), null→0.
- `computeShippingRub({ weightGrams, shippingRateUsdCents, usdRateKopecks }): number` — **divide early to avoid a huge integer product** (reviewer overflow finding): `Math.round((weightGrams / 1000) * (shippingRateUsdCents / 100) * (usdRateKopecks / 100))`. With the bounds below the product stays ≈1e13 ≪ `Number.MAX_SAFE_INTEGER` (9e15). Any null/0 input → 0.
- `computeCustomsRub(input)` — discriminated on `mode`:
  - `PERCENT_CIF`: `Math.round((itemsCostRub + shippingRub) * customsPercentBps / 10_000)`.
  - `CARGO_PER_KG`: same divide-early shape as shipping using `cargoRateUsdCents`.
- Export consts: `DEFAULT_CUSTOMS_PERCENT_BPS = 2600`; input ceilings `MAX_WEIGHT_GRAMS = 50_000_000` (50 t), `MAX_RATE_USD_CENTS = 1_000_000` ($10k/kg), `MAX_USD_RATE_KOPECKS = 1_000_000` (₽10k), `MAX_CUSTOMS_PERCENT_BPS = 100_000` (1000%), `MAX_COST_RUB = 2_000_000_000` (< Postgres Int4 max). Export `isWithinLandedCostBounds(inputs): boolean` (or per-field guards) for Task 5 to enforce before persistence.
- Pattern to follow: `lib/crm/internal/compute-estimate-money.ts` (pure money math, no I/O). Test harness pattern: `scripts/verify-warehouse.ts` (tsx, `assert` helper, exit 1 on fail).
- `Trivial:` no — new pure module with branching math and rounding; the verify script IS its regression guarantee.

**Definition of Done:**
- [ ] `computeShippingRub` rounds correctly (e.g. weight 2500 g, $8.50/kg, ₽92.50 → round(2.5 × 8.50 × 92.50) = round(1965.625) = 1966 ₽).
- [ ] `computeCustomsRub` PERCENT_CIF: itemsCost 100000 + shipping 1966, 26% → round(101966×0.26) = 26511 ₽.
- [ ] `computeCustomsRub` CARGO_PER_KG matches the shipping formula with the cargo rate.
- [ ] `orderWeightGrams` sums weighted lines and treats null weight as 0.
- [ ] Boundary case: max-bound inputs (50 t × $10k/kg × ₽10k) compute without precision loss / `Infinity`, and `isWithinLandedCostBounds` rejects values above the ceilings.
- [ ] Verify: `npm run verify-landed-cost`

### Task 3: `Part` weight field in admin part form + action

**Objective:** Let managers record a part's weight (kg) so order weight can auto-sum. Adds a numeric input to the shared create form and the edit form, parsed to grams in the parts action.

**Files:**
- Modify: `components/admin/PartForm.tsx`
- Modify: `components/admin/PartEditForm.tsx`
- Modify: `app/actions/parts.ts` (`createPart`, `updatePart`)

**Key Decisions / Notes:**
- Add input «Вес (кг)» (`name="weightKg"`, `type="number"`, `step="0.001"`, `min={0}`) into the existing price/compareAtPrice/quantity grid row in `PartForm.tsx` (verify the grid's column count and widen if needed); same in `PartEditForm.tsx` with `defaultValue` from existing grams ÷1000.
- In the action: `const weightKg = parseFloat(formData.get("weightKg") as string); const weightGrams = Number.isFinite(weightKg) && weightKg > 0 ? Math.round(weightKg * 1000) : null;` Follow the existing `parseInt(formData.get(...))` field-parsing pattern already used for `price`/`compareAtPrice` in `createPart`.
- `Trivial:` no — touches two forms + two action paths with a new parsed field and a unit conversion; covered by TS-001 (a weighted part drives shipping) and inspection.

**Definition of Done:**
- [ ] Creating a part with «Вес (кг)» = 2.5 persists `weightGrams = 2500`; blank persists `null`.
- [ ] Editing a part shows the current weight in kg and saves changes.
- [ ] Verify: typecheck + TS-001 (browser) confirms the saved weight feeds the order calc.

### Task 4: Landed-cost calculator UI on the supplier-order form

**Objective:** Replace the two manual ₽ inputs in `OrderTotals` with the structured calculator: auto order-weight (with manual override), shipping $/kg, USD rate, a customs-mode toggle (% of CIF | cargo $/kg), and a live breakdown. State lives in `SupplierOrderForm`; `PartOption` carries weight so the form can auto-sum.

**Files:**
- Modify: `components/admin/supplier-order-form/OrderTotals.tsx`
- Modify: `components/admin/SupplierOrderForm.tsx`
- Modify: `components/admin/supplier-order-form/types.ts`
- Modify: `app/(admin)/admin/suppliers/orders/new/page.tsx` (select `weightGrams` into `parts`)

**Key Decisions / Notes:**
- `PartOption` gains `weightGrams: number | null`; the new-order page's part query selects it.
- New state in `SupplierOrderForm`: `shippingRateUsdCents`, `usdRateKopecks`, `customsMode`, `customsPercentBps` (default 2600), `cargoRateUsdCents`, `manualWeightOverrideGrams: number | null`.
- Auto weight (PREVIEW ONLY) = `orderWeightGrams(items mapped to {weightGrams, quantity})` from `lib/suppliers/landed-cost.ts`; preview effective weight = `manualWeightOverrideGrams ?? autoWeight`. The preview uses the SAME lib functions (`computeShippingRub`, `computeCustomsRub`) so the displayed ₽ match what the server will compute. ⛔ The form submits ONLY `manualWeightOverrideGrams` (+ the rate/mode/% inputs) — NOT the auto weight; the server re-derives auto weight from DB `Part.weightGrams` (Task 5). The client cannot set the catalog-derived weight.
- UI: inputs accept human units (kg, $, %) and convert to scaled ints on change; default customs mode `PERCENT_CIF` shows the % field, `CARGO_PER_KG` shows the cargo $/kg field. Follow `OrderTotals.tsx` Card/Input styling and `lib/utils.ts:formatPrice` for ₽ display.
- Performance: the preview math is trivial and memo-free is fine; do not refetch parts.
- `Trivial:` no — primary UI of the feature; verified by TS-001/002/003.

**Definition of Done:**
- [ ] Adding/removing/qty-editing PART lines updates auto weight; manual override takes precedence (TS-003).
- [ ] Shipping ₽ and customs ₽ update live and equal the `lib/suppliers/landed-cost.ts` outputs.
- [ ] Toggling customs mode swaps the % / cargo $/kg input and recomputes customs (TS-002).
- [ ] Verify: TS-001, TS-002, TS-003 (browser).

### Task 5: `createSupplierOrder` derives weight from DB, recomputes server-side, stores breakdown

**Objective:** Extend the create action's input to the structured fields, **derive the catalog auto-weight server-side from DB `Part.weightGrams` × quantity** (never from the client), apply the manager's explicit override, recompute shipping/customs/total via `lib/suppliers/landed-cost.ts`, validate bounds, and persist the inputs + the computed ₽ results.

**Files:**
- Create: `lib/suppliers/resolve-landed-cost.ts` (DB-aware resolver — testable without `requireRole`)
- Modify: `app/actions/supplier-orders.ts`
- Modify: `components/admin/SupplierOrderForm.tsx` (send structured fields, not ₽, not auto-weight)
- Modify: `scripts/verify-landed-cost.ts` (resolver + tamper + null-input cases)

**Key Decisions / Notes:**
- Replace `shippingCost`/`customsCost` in `CreateOrderInput` with: `manualWeightOverrideGrams`, `shippingRateUsdCents`, `usdRateKopecks`, `customsMode`, `customsPercentBps`, `cargoRateUsdCents` (all optional ints / mode string). The client does NOT send weight totals or ₽.
- ⛔ **Server-authoritative weight** (reviewer high finding): inside the order tx, after resolving each line to a real `partId` (incl. NEW_PART → new draft Part), look up `Part.weightGrams` for the PART lines and compute `autoWeightGrams = Σ(weightGrams × quantity)` from the DB. `effectiveWeightGrams = manualWeightOverrideGrams ?? autoWeightGrams`. A tampered request that changes line composition is reflected truthfully; the only client-settable weight is the explicit, stored `manualWeightOverrideGrams`.
- Put this in `lib/suppliers/resolve-landed-cost.ts`: `resolveLandedCost(client, { partLineWeights, quantities }, inputs) → { shippingWeightGrams, shippingCost, customsCost, totalCost, ...inputsEcho }`. It calls the pure `lib/suppliers/landed-cost.ts` functions. No `requireRole` → the verify script can exercise it against real Parts.
- `customsMode` from the client must be validated against the `CustomsMode` enum values; reject unknown → user error.
- ⛔ Do NOT trust any ₽ value from the client. Validate inputs via `isWithinLandedCostBounds` (Task 2) BEFORE compute; reject negatives and out-of-range with a user-facing error. Keep `sellingPrice`/`estimatedProfit` defaulting to 0 as today.
- `itemsCost` = existing Σ; `totalCost = itemsCost + shippingCost + customsCost`. Store the 8 new columns + the recomputed ₽ results.
- `Trivial:` no — money-authoritative server path; verified by Goal Truth 1 + TS-001 + the tamper verify case.

**Definition of Done:**
- [ ] A created order persists the structured inputs AND `shippingCost`/`customsCost`/`totalCost` equal to `resolveLandedCost` over the DB-derived weight.
- [ ] **Tamper case (verify script):** with two PART lines whose DB `weightGrams` sum to W and NO override, `resolveLandedCost` uses W; passing a bogus client weight has no effect (the resolver ignores it — it isn't a parameter). With an override = W′, the resolver uses W′. Asserted programmatically against real seeded Parts.
- [ ] **All-null inputs:** an order with no landed-cost inputs persists `shippingCost = 0`, `customsCost = 0`, `totalCost = itemsCost`, `customsMode = PERCENT_CIF`.
- [ ] Out-of-range input (e.g. weight override > `MAX_WEIGHT_GRAMS`) is rejected with a user-facing error, no order created.
- [ ] Verify: `npm run verify-landed-cost` (resolver/tamper/null/bounds) + TS-001 (browser).

### Task 6: Order detail page shows the landed-cost breakdown

**Objective:** On the supplier-order detail Финансы section, show how shipping and customs were derived — weight, $/kg, USD rate, customs mode and %/cargo — alongside the existing ₽ rows.

**Files:**
- Modify: `app/(admin)/admin/suppliers/orders/[id]/page.tsx`

**Key Decisions / Notes:**
- Select the new columns; render conditional sub-lines under Доставка (weight kg, $/kg, USD rate) and Таможня (mode label; % or cargo $/kg). Reuse the existing Финансы card markup + `formatPrice`. Display kg = grams÷1000, $ = cents÷100, ₽ rate = kopecks÷100, % = bps÷100.
- Only show a sub-line when its input is non-null (old orders show just the ₽ rows as today).
- `Trivial:` no — read-only display but multi-field conditional formatting; verified by TS-001/002 detail-page steps.

**Definition of Done:**
- [ ] Order created via TS-001 shows weight, $/kg, USD rate, and customs % with values matching what was entered.
- [ ] A cargo-mode order (TS-002) shows the cargo $/kg and «Карго» label.
- [ ] An old order (all new columns null) renders the unchanged ₽-only Финансы card.
- [ ] Verify: TS-001, TS-002 detail steps (browser).
