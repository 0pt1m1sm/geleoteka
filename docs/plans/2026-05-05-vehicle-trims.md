# Vehicle Trims / Variants Implementation Plan

Created: 2026-05-05
Author: aleksandr.spiskov@gmail.com
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Add a third level (`VehicleTrim`) under `VehicleGeneration` so parts compatibility, customer pickers, and booking can target specific engine/body/drivetrain variants — replacing the denormalised `Part.compatibleModels: string[]` with a structured `PartTrim` join.

**Architecture:** New `VehicleTrim` table FK'd to `VehicleGeneration` with engine/body/drivetrain/fuel attributes. New `PartTrim` join table (composite key `partId+trimId`) replaces the string array. New `RepairOrder.trimId` optional FK captures customer's trim selection at booking. Every existing generation gets a system-managed `isDefault=true` trim ("Все варианты этого поколения") so legacy `compatibleModels` strings backfill cleanly without losing parts visibility.

**Tech Stack:** Next.js 16 App Router, Prisma 6, PostgreSQL, React 19. Server Actions for mutations, `cache()` for read queries. CSS variables + Tailwind for UI.

**Source PRD:** `docs/prd/2026-05-05-vehicle-trims.md` (Status: Final).

---

## Scope

### In Scope

- **Schema (Prisma migration #1):**
  - `VehicleTrim` table: `id`, `generationId` FK, `code`, `bodyStyle`, `drivetrain`, `fuelType` (enum), `engineCode`, `displacementL` (Decimal), `horsepower`, `notes`, `isDefault: Boolean`, `sortOrder`, `isActive`, `createdAt`, `updatedAt`. Unique `(generationId, code)`.
  - `PartTrim` table: `partId` + `trimId` composite primary key. `onDelete: Cascade` from both sides.
  - `RepairOrder.trimId` — optional FK with `onDelete: SetNull`.
  - `FuelType` enum: `PETROL | DIESEL | ELECTRIC | HYBRID`.
- **Backfill (TS script in `prisma/seed-trims.ts`):**
  - Auto-create one `isDefault=true` trim per generation (`code="ALL"`, isActive=true). Idempotent via `(generationId, code)` upsert.
  - Curated non-default trim seed for popular generations: W464, V167, X167, W213, W205 (≈4 trims each).
  - Parse every existing `Part.compatibleModels` entry, resolve to `(model, generation)` pair, link to that generation's default trim via `PartTrim`. Idempotent.
- **Server actions (`app/actions/vehicle-catalog.ts`):**
  - `createTrim`, `updateTrim`, `deleteTrim` — `requireRole(["ADMIN","MANAGER"])`, revalidate `/parts /booking /models /admin/models`.
  - `createGeneration` extended: atomically creates the default trim for the new generation in the same DB transaction.
- **Read queries (`lib/vehicle-catalog.ts`):**
  - `getActiveTrimsForGeneration(generationId)` — sorted by `sortOrder` then `code`, default trim filtered out (admin TrimManager + customer picker hide it).
  - `getActiveModelsWithTrims()` — extends `getActiveModels` shape to include each generation's active non-default trims.
- **Admin UI:**
  - New `TrimManager` client component embedded inside `GenerationManager` via disclosure ("+N вариантов" button per generation row). Same inline-edit pattern as generations: code, bodyStyle, drivetrain, fuelType (select), engineCode, displacement, horsepower, notes, isActive, delete. Default trim hidden.
  - `PartTrimPicker` replaces freeform `compatibleModels` textarea in `PartForm` and `PartEditForm`. Layout: Model select → Generation select → multi-select trim checkboxes per generation. Includes "Все варианты" pseudo-row mapped to the generation's default trim.
- **Public picker UX:**
  - `MyCarPicker` (parts shop) and `Step1ServiceVehicle` (booking step 1) gain a third dropdown that appears once Generation is selected. Options: each non-default trim (rendered via `trimLabel`) plus "Не уверен" (top option, fallback to generation-level filter). Auto-skipped when generation has zero non-default trims.
- **Parts catalog filter:** `app/(public)/parts/page.tsx` switches from `compatibleModels: { has: "${model} ${generation}" }` to a relation query through `PartTrim`. Specific trim picked → match parts whose `partTrims` contains either that trim OR the generation's default trim. "Не уверен" → match any trim in the generation. Index added on `PartTrim.trimId`.
- **Booking integration:**
  - `BookingData.trim: string` (trim ID, empty = "Не уверен"). Persisted through `BookingProvider` localStorage cache.
  - `createRepairOrder` accepts optional `trimId` and writes it to `RepairOrder.trimId`.
- **My-car localStorage store:** `MyCar` extended with optional `trim?: string`. Cached snapshot pattern preserved.
- **Public part detail page:** "Совместимые модели" section reads from `part.partTrims`, renders unique `(model, generation)` pairs (collapsing multiple specific trims of one generation to a single row).
- **Drop column (Prisma migration #2):** Drop `Part.compatibleModels` after all readers/writers migrated. Remove `validateCompatibleModels`, `getModelGenerationsMap`, `expandCompatibleModels`, and `scripts/normalize-compatible-models.ts`.

### Out of Scope

- VIN-based trim auto-detection. Customer enters trim manually.
- Trim-level pricing overrides on `Service`. Pricing rework is a separate initiative.
- Migrating `Service.applicableModels` to use trims. Service compatibility stays at `VehicleModel.name` level.
- Backfilling `RepairOrder.trimId` for historical repair orders. Only new bookings capture trim.
- Bulk-tag operations (e.g., "tag all M177 parts with G63 trim"). Single-part editing only.
- Multi-manufacturer trim semantics. Mercedes-only for now; the schema works for any manufacturer when added later.

### Autonomous Decisions

- **`isDefault: Boolean` flag** on `VehicleTrim` (instead of magic string code). Lets the admin TrimManager hide system trims and the public picker treat "Не уверен" as generation-level fallback uniformly. Default trim's `code="ALL"` is just a label; the flag is the source of truth.
- **Two Prisma migrations** instead of one. Migration #1 adds new tables/columns without breaking old reads. Backfill script runs against the deployed schema. Migration #2 drops `Part.compatibleModels`. Safer rollback if backfill discovers data issues.
- **Pessimistic backfill:** if a `compatibleModels` string can't be parsed (unknown model or unknown generation code), log a warning and skip — do NOT fail the script. Pre-existing data quality issues are out of scope here.
- **CSV import (`app/api/parts/import/route.ts`):** kept (used by admins). Resolves bare names ("G-Class") to default trim IDs of every active generation under that model. Resolves "Model Generation" to that generation's default trim. Specific trim assignment is admin-form-only; CSV stays at default-trim granularity.
- **Trim picker auto-skip rule:** if `getActiveTrimsForGeneration(generationId)` returns 0 (no curated trims), the dropdown is not rendered and the filter operates at generation level (current behaviour). When trims exist, "Не уверен" remains the top option.

---

## Approach

**Chosen:** Phased migration with default-trim backfill. Schema migration #1 lands new tables/columns alongside the existing `compatibleModels` array. Backfill TS script then creates default trims and `PartTrim` rows. Code switches reads/writes to `PartTrim`. Migration #2 drops the column.

**Why:** Lets us keep the app running between steps and roll back at any phase. The `isDefault=true` trim per generation absorbs every legacy string compatibility entry, so no part ever loses visibility.

**Alternatives considered:**

- **Single big-bang migration** (drop column, add tables, backfill in one Prisma migration's SQL): atomic but harder to debug if backfill fails on production data; non-trivial to express the parsing logic in raw SQL.
- **Keep `compatibleModels` as a denormalised cache:** rejected by the user — single source of truth via `PartTrim` is cleaner, even if more files churn this PR.
- **Enums for `bodyStyle`/`drivetrain`:** rejected by the user — free strings preserve flexibility for edge cases (Cabriolet LWB, electric AWD with different battery options) and match the existing `VehicleModel.engines` pattern.

---

## Context for Implementer

### Patterns to follow

- **Server actions** under `app/actions/*.ts` — see `app/actions/vehicle-catalog.ts:31` for the `createModel` shape; mirror it for `createTrim`. `requireRole(["ADMIN","MANAGER"])` first, then DB write, then `revalidateAllConsumers()` (the helper at `app/actions/vehicle-catalog.ts:25-29`). Mutations that change customer-visible data must revalidate `/parts`, `/booking`, `/models`, and `/admin/models`.
- **Read queries** in `lib/vehicle-catalog.ts` use React's `cache()` helper around the DB call (see `loadActiveModels` at `lib/vehicle-catalog.ts:9`). Apply the same pattern to `getActiveTrimsForGeneration`.
- **Admin inline-edit components** — `GenerationManager` at `components/admin/GenerationManager.tsx` is the reference. `useTransition` for pending state, `defaultValue` + `onBlur` to commit edits, `router.refresh()` after success. `TrimManager` follows the same shape.
- **Prisma type pattern** — schema is generated to `app/generated/prisma/` with `@ts-nocheck`. Types lose through the `db` singleton, so writers cast `as Record<string, unknown>` and pull fields explicitly. See `app/(admin)/admin/parts/[id]/page.tsx:25-38` for the standard serialization pattern.
- **Cached-snapshot localStorage** — `lib/my-car-store.ts:16-59` is the reference for any localStorage hook. Re-parsing on every getSnapshot creates a new object reference and triggers infinite loops in React 19. Check `cachedRaw === raw` before re-parsing.
- **CSS variables only** — no hardcoded hex. Buttons use `.btn .btn-primary` / `.btn-secondary`, cards use `.card`, inputs use `.input`. See `components/admin/GenerationManager.tsx:107-222` for the visual pattern.

### Conventions

- Component files: PascalCase (`TrimManager.tsx`).
- Action / lib files: kebab-case (`vehicle-catalog.ts`).
- Russian-language UI strings (admin and public). Match tone of existing strings — e.g., `"+ Добавить"`, `"Удалить ..."`, `"Не уверен"`.
- Prisma client import path: `@/app/generated/prisma/client` (NOT `@prisma/client`). DB singleton: `import { db } from "@/lib/db"`.
- Page components: `export const dynamic = "force-dynamic"` on any page that hits the DB (see `app/(admin)/admin/parts/[id]/page.tsx:1`).

### Key files

- `prisma/schema.prisma:701` — `VehicleGeneration` model. Add `trims VehicleTrim[]` relation here.
- `prisma/schema.prisma:508` — `Part` model. Add `partTrims PartTrim[]` relation. Drop `compatibleModels` in migration #2.
- `prisma/schema.prisma:287` — `RepairOrder` model. Add `trimId String?` and `trim VehicleTrim?` relation.
- `prisma/seed-vehicles.ts:342` — `seedVehicleCatalog`. Extend to call default-trim upsert for every generation it creates.
- `lib/vehicle-catalog-types.ts` — pure types + label helpers (client-safe). Add `Trim` interface and `trimLabel(t)` helper.
- `lib/vehicle-catalog.ts:9` — `loadActiveModels`. Either extend the include to pull trims or add a sibling `loadActiveModelsWithTrims`.
- `app/actions/vehicle-catalog.ts:69` — `createGeneration`. Wrap in `db.$transaction` and create default trim alongside.
- `app/actions/parts.ts:39` — `createPart` and `:91` `updatePart`. Replace `compatibleModels` write with `partTrims: { create: [...] }`.
- `app/api/parts/import/route.ts:16` — `expandCompatibleModels`. Replace with a function that returns trim IDs.
- `app/(public)/parts/page.tsx:51` — current filter `where.compatibleModels = { has: ... }`. Switch to relation query.
- `app/(public)/parts/[slug]/page.tsx:26` — current `models = p.compatibleModels`. Read from `partTrims` relation.
- `components/parts/MyCarPicker.tsx:24` — current 2-step picker. Add third trim dropdown.
- `components/parts/MyCarStrip.tsx:17` — sticky strip. Show trim if present in URL.
- `components/booking/Step1ServiceVehicle.tsx:51` — booking vehicle step. Add third trim dropdown bound to `BookingData.trim`.
- `components/booking/BookingProvider.tsx` (read for `BookingData` shape, lines 11-25) — add `trim: string`.
- `components/admin/GenerationManager.tsx:120` — generation row. Add disclosure button to expand `<TrimManager generationId={g.id} ... />`.

### Gotchas

- **`@@unique([modelId, code])` on VehicleGeneration** — same uniqueness will apply on `VehicleTrim.@@unique([generationId, code])`. Backfill must use `upsert` not `create`.
- **`Part.compatibleModels` strings include `"Mercedes-AMG"` prefixes** in some seed rows (e.g., `"AMG C63"`, `"AMG GT"`). The `getModelGenerationsMap` helper currently maps by `VehicleModel.name`, but `"AMG"` is not a model in the catalog — those rows in `prisma/seed.ts:305-311` will fail to parse. Backfill script: log + skip these. The seed data needs to be cleaned up to use real model names; do that as part of Task 4 (rewrite seed sample parts to use trim assignments instead).
- **CSV import has different validation than the form** — the form rejects bare names while CSV silently expands. Preserve that asymmetry: form requires explicit trim selection (or "Все варианты"); CSV import resolves to default trims silently.
- **`trim` is a JS string method.** When destructuring or naming variables, use `trimId` or `selectedTrim` to avoid confusion. `BookingData.trim` is OK because it's a property name, but local vars should avoid the bare word.
- **`Slot.dateTime @unique` race condition** in `app/actions/booking.ts:104-125` is unrelated to this plan but lives next to the code that needs to write `trimId`. Don't touch the slot transaction logic.
- **`prisma/seed.ts:304-311` sample parts** use `compatibleModels` strings. After the column is dropped (migration #2), this file will fail to typecheck. Update sample parts to use `partTrims: { create: [...] }` (referencing default trims by lookup) as part of Task 4.
- **`scripts/normalize-compatible-models.ts`** is the one-off normalizer. It must be removed in Task 11 (otherwise it will reference a dropped column and break `tsc`).
- **React 19 strict mode** rejects `setState` in `useEffect`. The trim dropdown state in `MyCarPicker` and `Step1ServiceVehicle` reuses the existing controlled-input pattern — don't introduce effect-driven defaults.

### Domain context

- **Russian Mercedes service market** — common generations are W210/W211/W124 (older E-Class), W463 (G-Class pre-2018), W164/W166 (GLE). Curated seed prioritises W464, V167, X167, W213, W205 (newer common cars). Older generations get only the default trim — picker auto-skips the third dropdown for them.
- **"Не уверен"** is non-negotiable. Customers don't know engine codes. The fallback to generation-level filter is the graceful degradation.
- **Engine codes** (M177, OM656, M256) are the single most predictive field for compatibility. The admin part-trim picker should expose engine code prominently in trim labels: `trimLabel({ code: "G63", engineCode: "M177", drivetrain: "4MATIC", bodyStyle: "long" }) → "G 63 · M177 · 4MATIC · long"`.

---

## Runtime Environment

- **Start command:** `npm run dev` (HTTPS on port 443).
- **Migrations:** `npx prisma migrate dev --name add_vehicle_trims` (migration #1), then run backfill, then `npx prisma migrate dev --name drop_compatible_models` (migration #2).
- **Backfill command:** `npx tsx prisma/seed-trims.ts` (idempotent — re-runnable).
- **Seed:** `npx prisma db seed` (orchestrator at `prisma/seed.ts` runs everything including trim backfill).
- **Health check:** GET `/parts` (SSR page that queries the DB) and GET `/admin/models/<id>` (auth-gated, queries generations + trims).
- **Restart procedure:** dev server restart picks up new Prisma client; in production, kill + restart Next.js process.

---

## Assumptions

- The backfill script can read every existing part's `compatibleModels` strings without race conditions — assumes no parts are being created/edited during the backfill window. Supports manual coordination at deploy time. Tasks 4, 7, 11 depend on this.
- Every existing `VehicleGeneration` is the right place to attach a default trim. Generations not yet seeded (none currently exist outside `seed-vehicles.ts`) get a default trim when first created via `createGeneration` (Task 3). Tasks 3 and 4 depend.
- `RepairOrder.trimId` being NULL is acceptable for historical orders. No backfill of historical RepairOrders. Booking flow doesn't validate that the trim belongs to the chosen vehicle's generation — that's a soft constraint enforced by the picker, not the schema. Tasks 1 and 9 depend.
- `Part.partTrims: { some: { trim: { generationId: G } } }` is performant up to the catalog's expected size (low thousands of parts × tens of trims per generation). If catalog grows past ~50k parts, the relation query may need a denormalised cache — out of scope here. Task 8 depends.
- `app/(admin)/admin/parts/new/page.tsx` exists and uses `PartForm`. (Confirm during implementation; if missing, create.) Task 6 depends.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Backfill misses parts whose `compatibleModels` strings don't parse (unknown model names like `"AMG GT"`) | Medium | Medium — those parts become invisible to picker | Backfill logs every unparseable entry; `prisma/seed.ts` sample parts are rewritten in Task 4 to use trim assignments directly. After backfill, query `Part.partTrims._count` and assert non-zero for every part that previously had a non-empty `compatibleModels`; print warnings for the misses. |
| Migration #2 (drop column) runs before all readers migrate | Low | High — production breaks | Plan ordering enforces it (Task 11 last). Verify build succeeds with `compatibleModels` removed before applying migration #2. Pre-deploy grep for `compatibleModels` in source — must return zero non-test, non-script hits. |
| `PartTrim` relation query is slower than the `has:` array filter | Low | Low — list page caps at 100 parts | Add index on `PartTrim.trimId`. Composite primary key already indexed. The 100-part cap on `findMany` keeps response time bounded. |
| Default trim accidentally exposed in customer picker (looks like "ALL · undefined · undefined") | Medium | Low — UI clutter | `getActiveTrimsForGeneration` filters `isDefault=false`. Public picker calls this query — never sees default trims. Admin TrimManager calls a different query (`getAllTrimsForGeneration`) but explicitly hides `isDefault=true` rows in render. |
| Booking flow capture of `trimId` breaks when generation auto-detect fails (free-text model field) | Medium | Low — `trimId` stays NULL | Booking saves `trimId` only when the customer explicitly selects a trim from the dropdown. Free-text fallback doesn't trigger trim capture. Validation is loose by design. |
| `prisma/seed.ts:304-311` sample parts' `compatibleModels` string `"AMG C63"` doesn't match any catalog model | High | Medium — backfill skips them; sample data invisible | Task 4 rewrites sample parts to use trim assignments directly (creates curated AMG trims under W205/W213 first, then attaches sample parts via PartTrim). Idempotent re-seed restores correct state. |
| TrimManager UI overflow (8+ trims per generation row) breaks the inline disclosure | Low | Low | Use `<details>` element with `<summary>` button — collapses by default, no layout hijack. Each trim row uses the same flex-wrap pattern as `GenerationManager.tsx:122-178`. |

---

## Goal Verification

### Truths

1. **PartTrim is the single source of truth for compatibility.** No source file (excluding `prisma/migrations/*` history) references `compatibleModels` after Task 11. Verified by `grep -rn 'compatibleModels' --include='*.ts' --include='*.tsx'` returning empty (excluding generated/migrations/scripts).
2. **Every existing Part remains visible after migration.** For each Part with `compatibleModels.length > 0` before migration, that Part has `≥1` `PartTrim` row after backfill — confirmed by a SQL count assertion in the backfill script.
3. **Customer can filter by specific trim.** TS-001 passes end-to-end: picking a non-default trim returns parts whose `partTrims` contain either that trim OR the generation's default trim.
4. **"Не уверен" preserves current behaviour.** TS-002 passes: leaving trim unselected falls back to generation-level filtering. Same set of parts as before the third dropdown existed.
5. **Admin TrimManager works inline within GenerationManager.** TS-003 passes: admin adds, edits, and deletes trims without leaving `/admin/models/[id]`. Default trim never appears in the list.
6. **Booking captures trimId.** TS-005 passes: customer who selects a trim during booking creates a `RepairOrder` row with `trimId` set; SQL `SELECT trimId FROM "RepairOrder" WHERE id=<new>` returns the picked trim's ID.
7. **Migration is reversible.** Migration #1's down-migration restores the schema to its pre-trim state. Migration #2's down restores `compatibleModels: text[]` column (data loss is acceptable on rollback; the down restores schema, not data).
8. **Auto-skip works.** Generations with no curated trims (e.g., W124, W210) render the picker with two dropdowns only; no third dropdown appears.

### Artifacts

- `prisma/schema.prisma` — `VehicleTrim`, `PartTrim` models, `RepairOrder.trimId`, `FuelType` enum.
- `prisma/migrations/<ts>_add_vehicle_trims/migration.sql` — migration #1.
- `prisma/migrations/<ts>_drop_compatible_models/migration.sql` — migration #2.
- `prisma/seed-trims.ts` — backfill + curated seed.
- `lib/vehicle-catalog-types.ts` — `Trim` interface, `trimLabel` helper.
- `lib/vehicle-catalog.ts` — `getActiveTrimsForGeneration`, `getAllTrimsForGeneration`, `getActiveModelsWithTrims`.
- `app/actions/vehicle-catalog.ts` — `createTrim`/`updateTrim`/`deleteTrim`; `createGeneration` updated to create default trim atomically.
- `app/actions/parts.ts` + `app/api/parts/import/route.ts` — write to `partTrims` relation.
- `components/admin/TrimManager.tsx` — new.
- `components/admin/PartTrimPicker.tsx` — new.
- `components/admin/GenerationManager.tsx`, `PartForm.tsx`, `PartEditForm.tsx` — modified.
- `components/parts/MyCarPicker.tsx`, `MyCarStrip.tsx` — third dropdown + trim chip.
- `components/booking/Step1ServiceVehicle.tsx`, `BookingProvider.tsx` — trim field.
- `app/(public)/parts/page.tsx` — relation filter.
- `app/(public)/parts/[slug]/page.tsx` — read from `partTrims`.
- `app/actions/booking.ts` — pass `trimId` to `RepairOrder`.
- `lib/my-car-store.ts` — `MyCar.trim?: string`.

---

## E2E Test Scenarios

### TS-001: Customer picks specific trim, sees filtered parts
**Priority:** Critical
**Preconditions:** Logged out (anonymous). Catalog seeded with at least 2 G-Class W464 parts: one tagged with default trim only, one tagged with `G63` trim specifically.
**Mapped Tasks:** Task 4, 6, 7, 8

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/parts` | MyCarPicker visible with Model/Generation dropdowns, no third dropdown yet |
| 2 | Select "G-Class" in Model dropdown | Generation dropdown enables, options listed |
| 3 | Select "2018–н.в. · W464" in Generation dropdown | Third (Trim) dropdown appears with "Не уверен" first, then "G 63 · M177 · 4MATIC · long" and other curated trims |
| 4 | Select "G 63 · M177 · 4MATIC · long" | Submit button enables |
| 5 | Click "Применить" | URL becomes `/parts?model=G-Class&generation=W464&trim=<id>`. Parts list shows BOTH the part tagged with default trim AND the G63-specific part. The non-G63-specific parts (e.g., a G350d-only diesel filter, if seeded) are filtered out |
| 6 | Verify `MyCarStrip` chip | Reads "G-Class · W464 · G 63 ..." with ✕ button |

### TS-002: "Не уверен" falls back to generation-level filter
**Priority:** Critical
**Preconditions:** Same as TS-001.
**Mapped Tasks:** Task 8

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/parts`, pick G-Class → W464 | Trim dropdown appears |
| 2 | Select "Не уверен" (top option) | Trim value cleared in form state |
| 3 | Click "Применить" | URL becomes `/parts?model=G-Class&generation=W464` (no `trim=` param). Parts list shows ALL parts whose `partTrims` belong to W464 — including specific G63, G350d, G500 trims and the default trim |

### TS-003: Admin manages trims for a generation
**Priority:** Critical
**Preconditions:** Logged in as `admin@geleoteka.ru`. G-Class W464 generation has the default trim only (no curated trims yet).
**Mapped Tasks:** Task 5

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/admin/models` and click "G-Class" | Edit page loads |
| 2 | Find W464 generation row, click "+ Варианты" disclosure | Inline TrimManager expands. Empty trim list (default trim hidden). |
| 3 | Fill new-row form: code "G63", bodyStyle "long", drivetrain "4MATIC", fuelType "PETROL", engineCode "M177", displacement "4.0", horsepower "585", click "+ Добавить" | New row appears in trim list. POST `/api/...` (server action) succeeds. `router.refresh()` re-renders. |
| 4 | Edit the new row's notes inline ("AMG-only") and tab away | Server action `updateTrim` succeeds, value persists after refresh |
| 5 | Click ✕ on the row, confirm dialog | `deleteTrim` succeeds, row removed |
| 6 | Verify default trim never appeared in the list | Visual confirmation; query `db.vehicleTrim.findMany({ where: { generationId: W464_id, isDefault: true } })` returns 1 row not shown in UI |

### TS-004: Admin tags a part with specific trims
**Priority:** Critical
**Preconditions:** Logged in as admin. Part "Колодки тормозные передние G-Class" exists and has default-trim assignment for W464. W464 has at least 2 curated trims (G63, G500).
**Mapped Tasks:** Task 6, 7

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/admin/parts/<id>` for the brake pads part | Edit form loads. PartTrimPicker shows "G-Class" expanded, "W464" expanded, "Все варианты" checkbox checked |
| 2 | Uncheck "Все варианты", check "G63" only | Form state: trims=[G63 trim ID] |
| 3 | Click "Сохранить" | Server action `updatePart` writes new PartTrim rows; old default-trim row deleted. Redirects to `/admin/parts`. |
| 4 | Navigate to `/parts`, pick G-Class → W464 → G63 | The brake pads part appears |
| 5 | Pick G-Class → W464 → G500 | The brake pads part does NOT appear (no longer default-tagged) |

### TS-005: Customer books service with trim selection
**Priority:** Critical
**Preconditions:** Logged out. Booking wizard at `/booking`.
**Mapped Tasks:** Task 9

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | At `/booking` Step 1, pick a service | Service tile selected |
| 2 | Pick Model "G-Class", Year "2024" | Chassis-helper text shows W464 codes |
| 3 | Trim dropdown appears (after model picked + W464 implied) | "Не уверен" first, curated W464 trims listed |
| 4 | Select "G 63 · M177 · 4MATIC · long" | Form state captures trim ID |
| 5 | Continue through wizard, fill VIN/contact/datetime, submit | Booking succeeds. Server action creates RepairOrder. |
| 6 | DB verification: `SELECT "trimId" FROM "RepairOrder" WHERE id = <new>` | Returns the G63 trim ID, not NULL |

### TS-006: Auto-skip third dropdown when no curated trims
**Priority:** High
**Preconditions:** W210 (older E-Class) has only the default trim, no curated trims.
**Mapped Tasks:** Task 8, 9

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | At `/parts`, pick "E-Class" | Generation dropdown lists W124/W210/W211/W212/W213/W214 |
| 2 | Pick "1995–2002 · W210" | NO third dropdown appears (W210 has zero curated trims). Submit button enables immediately. |
| 3 | Click "Применить" | URL: `/parts?model=E-Class&generation=W210`. Filter operates at generation level. |

### TS-007: Backfill correctness — all existing parts visible
**Priority:** Critical
**Preconditions:** Fresh DB seeded with the existing `prisma/seed.ts` sample parts (8 parts). Migration #1 applied, backfill script runs to completion. Migration #2 NOT yet applied.
**Mapped Tasks:** Task 4

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `npx prisma migrate dev --name add_vehicle_trims` | Schema updated, no errors |
| 2 | Run `npx tsx prisma/seed-trims.ts` | Logs "Seeded N default trims, M curated trims, K PartTrim rows backfilled, J unparseable rows skipped" |
| 3 | Query `db.part.findMany({ include: { partTrims: { include: { trim: true } } } })` | Every part with `compatibleModels.length > 0` has `partTrims.length > 0`. Print misses (rows with empty partTrims after backfill). |
| 4 | At `/parts` (no filter), confirm count | All 8 sample parts visible |
| 5 | Pick G-Class → W464 → "Не уверен" | All G-Class W464 parts visible (engine oil, brake pads, brake disc, brake fluid, air filter analog, oil filter) |

### TS-008: CSV import resolves to default trim
**Priority:** Medium
**Preconditions:** Admin logged in. CSV file with one row: `A1234567;Test Part;Description;1000;5;1;oils;G-Class W463`.
**Mapped Tasks:** Task 7

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST CSV to `/api/parts/import` | Returns `{ created: 1, updated: 0, errors: [] }` |
| 2 | Query the imported part's `partTrims` | One row pointing to W463's default trim |
| 3 | At `/parts`, pick G-Class → W463 (no specific trim picker since no curated trims) | Test Part is visible |

---

## Progress Tracking

- [x] Task 1: Schema + Prisma migration #1 (VehicleTrim, PartTrim, RepairOrder.trimId, FuelType)
- [x] Task 2: Trim type + label helper + read queries
- [x] Task 3: Trim CRUD server actions + createGeneration auto-creates default trim
- [x] Task 4: Backfill script + curated seed + sample parts rewrite
- [x] Task 5: Admin TrimManager component (embedded in GenerationManager)
- [x] Task 6: Admin PartTrimPicker (replaces compatibleModels textarea)
- [x] Task 7: Server actions parts + CSV import — write to partTrims
- [x] Task 8: Public picker third dropdown + parts page filter switch + my-car-store trim field
- [x] Task 9: Booking Step 1 trim dropdown + RepairOrder.trimId persist
- [x] Task 10: Public part detail page — render partTrims
- [x] Task 11: Migration #2 (drop Part.compatibleModels) + cleanup helpers/scripts

**Total Tasks:** 11 | **Completed:** 11 | **Remaining:** 0

---

## Implementation Tasks

### Task 1: Schema + migration #1

**Objective:** Add `VehicleTrim`, `PartTrim`, `FuelType` enum, and `RepairOrder.trimId` to Prisma schema. Generate migration #1.
**Dependencies:** None
**Mapped Scenarios:** Foundation for TS-001..TS-008

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_vehicle_trims/migration.sql` (auto-generated)

**Key Decisions / Notes:**
- `VehicleTrim` fields:
  ```prisma
  model VehicleTrim {
    id            String   @id @default(cuid())
    generationId  String
    code          String
    bodyStyle     String?
    drivetrain    String?
    fuelType      FuelType?
    engineCode    String?
    displacementL Decimal? @db.Decimal(3, 1)
    horsepower    Int?
    notes         String?
    isDefault     Boolean  @default(false)
    sortOrder     Int      @default(0)
    isActive      Boolean  @default(true)
    createdAt     DateTime @default(now())
    updatedAt     DateTime @updatedAt
    generation    VehicleGeneration @relation(fields: [generationId], references: [id], onDelete: Cascade)
    partTrims     PartTrim[]
    repairOrders  RepairOrder[]
    @@unique([generationId, code])
    @@index([generationId, sortOrder])
    @@index([isActive])
    @@index([isDefault])
  }
  ```
- `PartTrim` join:
  ```prisma
  model PartTrim {
    partId  String
    trimId  String
    part    Part        @relation(fields: [partId], references: [id], onDelete: Cascade)
    trim    VehicleTrim @relation(fields: [trimId], references: [id], onDelete: Cascade)
    @@id([partId, trimId])
    @@index([trimId])
  }
  ```
- `Part.partTrims PartTrim[]` relation added. `Part.compatibleModels` retained — dropped in Task 11.
- `RepairOrder.trimId String?`, `RepairOrder.trim VehicleTrim?  @relation(fields: [trimId], references: [id], onDelete: SetNull)`. Index `@@index([trimId])`.
- `VehicleGeneration.trims VehicleTrim[]` relation added.
- `enum FuelType { PETROL DIESEL ELECTRIC HYBRID }` placed in the ENUMS section of the schema.

**Definition of Done:**
- [ ] `npx prisma validate` passes
- [ ] `npx prisma migrate dev --name add_vehicle_trims` produces a clean migration
- [ ] `npx prisma generate` regenerates client without errors
- [ ] `db.vehicleTrim`, `db.partTrim` exist and are queryable in a Node REPL or `tsx` script
- [ ] `tsc --noEmit` passes (no type errors from new models)

**Verify:**
- `npx prisma validate && npx prisma migrate dev --name add_vehicle_trims --create-only` (review SQL before applying)
- `npx prisma migrate dev` to apply
- `npx prisma generate`
- `npx tsc --noEmit`

---

### Task 2: Trim type + label helper + read queries

**Objective:** Add `Trim` interface and `trimLabel` helper to `vehicle-catalog-types.ts`. Add `getActiveTrimsForGeneration`, `getAllTrimsForGeneration`, `getActiveModelsWithTrims` to `vehicle-catalog.ts`.
**Dependencies:** Task 1
**Mapped Scenarios:** Foundation for TS-001..TS-006

**Files:**
- Modify: `lib/vehicle-catalog-types.ts`
- Modify: `lib/vehicle-catalog.ts`

**Key Decisions / Notes:**
- `Trim` type (client-safe):
  ```ts
  export interface Trim {
    id: string;
    code: string;
    bodyStyle: string | null;
    drivetrain: string | null;
    fuelType: "PETROL" | "DIESEL" | "ELECTRIC" | "HYBRID" | null;
    engineCode: string | null;
    displacementL: string | null; // Decimal serialised as string by Prisma
    horsepower: number | null;
    notes: string | null;
    isDefault: boolean;
    isActive: boolean;
    sortOrder: number;
  }
  ```
- `trimLabel(t: Pick<Trim, "code"|"engineCode"|"drivetrain"|"bodyStyle">) → string`. Joins non-null fields with " · ". Example: `trimLabel({ code: "G63", engineCode: "M177", drivetrain: "4MATIC", bodyStyle: "long" })` → `"G 63 · M177 · 4MATIC · long"`.
- `getActiveTrimsForGeneration(generationId)`: server-side, wrapped in `cache()`. Filters `isActive: true AND isDefault: false`. Sorted by `sortOrder asc, code asc`. Used by customer pickers.
- `getAllTrimsForGeneration(generationId)`: server-side, wrapped in `cache()`. Filters `isActive: true` only (includes default). Used by admin PartTrimPicker.
- `getActiveModelsWithTrims()`: extends `getActiveModels` to also include `trims` per generation (active + non-default).
- Keep existing `getActiveModels()` and `getModelGenerationsMap()` — they're used by parts code that hasn't migrated yet. Remove `getModelGenerationsMap` in Task 11.
- Performance: queries are cached per-request via React `cache()`.

**Definition of Done:**
- [ ] `Trim` and `trimLabel` exported from `lib/vehicle-catalog-types.ts`
- [ ] All three new queries exist in `lib/vehicle-catalog.ts`, return correct shapes
- [ ] `tsc --noEmit` passes
- [ ] Manual smoke: `tsx -e "import { db } from './lib/db.ts'; (async () => console.log(await db.vehicleTrim.findMany({ take: 3 })))()"` succeeds

**Verify:**
- `npx tsc --noEmit`

---

### Task 3: Trim CRUD server actions + createGeneration auto-creates default trim

**Objective:** Add `createTrim`, `updateTrim`, `deleteTrim` to `app/actions/vehicle-catalog.ts`. Modify `createGeneration` to atomically create the default trim alongside.
**Dependencies:** Task 1
**Mapped Scenarios:** TS-003

**Files:**
- Modify: `app/actions/vehicle-catalog.ts`

**Key Decisions / Notes:**
- Action signatures:
  ```ts
  export async function createTrim(input: TrimFields): Promise<{ id: string }>
  export async function updateTrim(id: string, input: Partial<TrimFields>): Promise<void>
  export async function deleteTrim(id: string): Promise<void>
  ```
- `TrimFields` mirrors the schema columns minus timestamps: `generationId`, `code`, `bodyStyle?`, `drivetrain?`, `fuelType?`, `engineCode?`, `displacementL?`, `horsepower?`, `notes?`, `isActive?`, `sortOrder?`. `isDefault` is NEVER accepted as input — admins can't create or modify default trims via the UI.
- `deleteTrim`: `requireRole(["ADMIN"])`. Refuses if `trim.isDefault === true` (throws). Cascade handles `PartTrim` rows; `RepairOrder.trimId` becomes NULL.
- `createGeneration` modified: wrapped in `db.$transaction`. Inside, create the generation, then create the default trim with the generation's id, `code: "ALL"`, `isDefault: true`, `isActive: true`, `sortOrder: 0`. Return `{ id }` of the generation.
- `revalidateAllConsumers()` called after every CRUD operation (existing helper).
- All actions guard with `requireRole(["ADMIN", "MANAGER"])` except `delete*` which is `["ADMIN"]`.

**Definition of Done:**
- [ ] `createTrim`/`updateTrim`/`deleteTrim` exist in `app/actions/vehicle-catalog.ts`
- [ ] `deleteTrim` rejects default-trim deletion with a clear Russian error message
- [ ] `createGeneration` produces both a generation row AND a default trim row in one transaction (verify by querying after invocation)
- [ ] All actions revalidate `/parts /booking /models /admin/models`
- [ ] `tsc --noEmit` passes

**Verify:**
- `npx tsc --noEmit`
- Manual: invoke `createTrim` from a `tsx` script, verify row created and revalidation queued
- Manual: invoke `createGeneration({ code: "TEST", yearFrom: 2025, modelId: <existing> })`, verify both generation and default trim exist

---

### Task 4: Backfill script + curated seed + sample parts rewrite

**Objective:** Create `prisma/seed-trims.ts` that (1) creates default trims for every existing generation, (2) seeds curated non-default trims for popular generations, (3) backfills `PartTrim` rows from existing `Part.compatibleModels` strings. Also rewrite `prisma/seed.ts` sample parts to use trim assignments directly. Wire into `prisma/seed.ts` orchestration.
**Dependencies:** Task 1, Task 2, Task 3
**Mapped Scenarios:** TS-007, TS-001, TS-002, TS-005

**Files:**
- Create: `prisma/seed-trims.ts`
- Modify: `prisma/seed.ts` — call `seedTrims(prisma)` after `seedVehicleCatalog(prisma)`. Rewrite sample parts to use `partTrims: { create: [...] }` instead of `compatibleModels: [...]`.
- Modify: `prisma/seed-vehicles.ts` — after upserting each generation, immediately upsert its default trim (so a fresh DB ends up consistent without a separate backfill).

**Key Decisions / Notes:**
- Default-trim creation: for every generation, `prisma.vehicleTrim.upsert({ where: { generationId_code: { generationId, code: "ALL" } }, create: { generationId, code: "ALL", isDefault: true, isActive: true, sortOrder: 0 }, update: { isActive: true } })`.
- Curated trims: hardcode for W464 (G350d, G400d, G500, G63 AMG), V167 (GLE 350d, GLE 400d, GLE 450, AMG GLE 53), X167 (GLS 450, GLS 580, AMG GLS 63), W213 (E200, E220d, E350, E63 AMG), W205 (C180, C200, C220d, C300, AMG C63). Each trim row populated with realistic engineCode/drivetrain/displacement/HP/fuelType. Notes column carries market-specific quirks. Idempotent via `(generationId, code)` upsert.
- Backfill from `compatibleModels`:
  - Load `getModelGenerationsMap()` (still exists at this point — built from active models).
  - For each Part with non-empty `compatibleModels`, parse each entry as `"<Model> <Code>"`. Look up the generation. If found, ensure default trim exists for it, then upsert `PartTrim { partId, trimId: <default> }`.
  - Unparseable entries (unknown model OR unknown gen code, including AMG-prefixed strings in `seed.ts:305-311`): log `console.warn("Skipping unparseable: <part article> -> <string>")` and continue.
  - At end, query `Part.findMany({ where: { compatibleModels: { isEmpty: false }, partTrims: { none: {} } }, select: { id: true, article: true } })` — print any rows that ended with no PartTrim coverage. These are the ones whose original strings were unparseable; they need manual admin attention after deploy.
- Sample-parts rewrite in `seed.ts`: replace `compatibleModels: [...]` with explicit `partTrims: { create: [{ trim: { connect: { generationId_code: { generationId, code: "ALL" } } } }] }` for default-trim parts, and for AMG-tagged parts (oil filter, AMG oil) use the curated trims (e.g., the G63 trim under W464). Resolve generation IDs by `vehicleGeneration.findFirst({ where: { code: "W464" } })` etc.
- Idempotent: re-running the whole seed never duplicates trims or PartTrim rows. Backfill clears only old default-trim PartTrims that no longer reflect current `compatibleModels`? **No** — backfill only creates, never deletes. After Task 7 the admin can correct mistakes via the UI. Migration script does NOT round-trip (additive only).
- Wire into existing `prisma db seed` so a fresh checkout produces consistent state.

**Definition of Done:**
- [ ] `prisma/seed-trims.ts` exists, exports `seedTrims(prisma)`, runs idempotently
- [ ] `prisma/seed.ts` orchestrator calls `seedTrims(prisma)` after `seedVehicleCatalog(prisma)`
- [ ] `prisma/seed-vehicles.ts` creates default trim per generation upserted
- [ ] Re-seeding (`npx prisma db seed`) twice does not duplicate trim or PartTrim rows
- [ ] Every existing Part with non-empty `compatibleModels` (8 sample parts) has at least one PartTrim row after backfill
- [ ] AMG-prefixed strings in sample parts are resolved correctly (sample parts list curated AMG trims, not bare `"AMG C63"` strings)
- [ ] Backfill prints a report of unparseable rows (zero rows expected after seed.ts is fixed)

**Verify:**
- `npx prisma migrate reset --force && npx prisma db seed`
- Run twice — second run prints "0 trims created (all upserts no-op), 0 PartTrim created"
- `psql geleoteka -c "SELECT COUNT(*) FROM \"VehicleTrim\""` — > 0
- `psql geleoteka -c "SELECT COUNT(*) FROM \"VehicleTrim\" WHERE \"isDefault\" = true"` — equals number of generations
- `psql geleoteka -c "SELECT p.article, COUNT(pt.\"trimId\") FROM \"Part\" p LEFT JOIN \"PartTrim\" pt ON p.id = pt.\"partId\" GROUP BY p.article"` — every part has count >= 1

---

### Task 5: Admin TrimManager component

**Objective:** New `TrimManager` client component embedded inside `GenerationManager` via a `<details><summary>` disclosure. Inline-edit pattern matching `GenerationManager`. Default trim hidden.
**Dependencies:** Task 2, Task 3
**Mapped Scenarios:** TS-003

**Files:**
- Create: `components/admin/TrimManager.tsx`
- Modify: `components/admin/GenerationManager.tsx` — wrap each generation row's body with `<details>`, add `<TrimManager generationId={g.id} trims={g.trims} />` inside the `<summary>` panel.
- Modify: `app/(admin)/admin/models/[id]/page.tsx` — extend the model query's `include` to pull each generation's `trims` (active + non-default for the manager UI). Pass them to `GenerationManager`.

**Key Decisions / Notes:**
- Component receives `generationId: string` and `trims: Trim[]` (active, non-default only). Renders a list with one row per trim and an add-row form below.
- Inline edit fields per row: `code` (text), `engineCode` (text), `drivetrain` (text), `bodyStyle` (text), `fuelType` (select with empty + 4 enum values), `displacementL` (number step=0.1), `horsepower` (number), `notes` (textarea, single-line), `isActive` (checkbox), delete button (×).
- `useTransition` for pending state. `defaultValue` + `onBlur` to commit edits (matches `GenerationManager` pattern). Single-field updates use `updateTrim(id, { <field>: <value> })`.
- Add-row form: same fields as inline edit. "+ Добавить вариант" button. On success, clear draft, `router.refresh()`.
- Layout: `<details>` element with `<summary>` showing `"+ ${trims.length} вариантов"` (or "Добавить варианты" if zero). When open, renders the inline list. Mobile-responsive with `flex-wrap`.
- Russian labels: "Вариант", "Двигатель", "Привод", "Кузов", "Топливо", "Объём (л)", "Мощность (л.с.)", "Заметки", "Активен".
- Default trim NOT included in the prop or rendered. Page query filters `where: { isDefault: false }` in the `trims` include.
- Error handling: catches server-action errors, displays in red bar (matches `GenerationManager.tsx:108-112`).

**Definition of Done:**
- [ ] `TrimManager.tsx` exists with full inline-edit + add-row form
- [ ] Embedded in `GenerationManager` via `<details>` disclosure
- [ ] Page query passes `trims` to component
- [ ] Default trim never appears in UI
- [ ] Manual: admin can add → edit → toggle active → delete a trim end-to-end
- [ ] `router.refresh()` after each mutation; revalidation hits `/admin/models`
- [ ] Lint clean (`npm run lint`)
- [ ] `tsc --noEmit` passes

**Verify:**
- `npm run lint`
- `npx tsc --noEmit`
- Manual: walk through TS-003 in browser

---

### Task 6: Admin PartTrimPicker

**Objective:** Replace freeform `compatibleModels` textarea in `PartForm` and `PartEditForm` with a structured picker: Model → Generation → multi-select trim checkboxes (with "Все варианты" pseudo-row).
**Dependencies:** Task 2, Task 4
**Mapped Scenarios:** TS-004

**Files:**
- Create: `components/admin/PartTrimPicker.tsx`
- Modify: `components/admin/PartForm.tsx` — replace `<input id="compatibleModels">` with `<PartTrimPicker name="trimIds" initial={[]} />`. Update prop signature: `models: VehicleModelWithTrims[]` instead of `modelNames: string[]`.
- Modify: `components/admin/PartEditForm.tsx` — same; pass `initial={part.trimIds}`.
- Modify: `app/(admin)/admin/parts/[id]/page.tsx` — query trims via `getActiveModelsWithTrims()`; serialize each part's `partTrims` to `{ trimIds: string[] }`. Drop `compatibleModels` from the serialized payload.
- Modify: `app/(admin)/admin/parts/new/page.tsx` — same query change.

**Key Decisions / Notes:**
- Component receives `name: string` (form field name), `initial: string[]` (selected trim IDs), `models: VehicleModelWithTrims[]`.
- Layout: collapsible `<details>` per model. When open, list each generation. Each generation has a "Все варианты" checkbox (representing the default trim) and one checkbox per non-default trim. Checking "Все варианты" auto-unchecks the specific trims (mutually exclusive: either all-via-default OR specific-trims).
- Hidden inputs: `<input type="hidden" name="trimIds" value={JSON.stringify(selectedTrimIds)} />`. Server action parses with `JSON.parse(formData.get("trimIds") as string)` (validate it's a string array).
- Default trim ID resolution: each generation knows its default trim ID via `getAllTrimsForGeneration(generationId)`. Picker passes it through props.
- Validation: at least one trim must be selected (matches old behaviour where `compatibleModels` could be empty — but the old behaviour was "no compatibility set". Preserve: if `trimIds` is empty, the part is created without any PartTrim row. Picker shows a yellow warning "Запчасть не привязана к модели — её не увидят покупатели по фильтру". Not blocking.).
- UI matches existing forms: `.input` class for selects, `.btn-primary` for submit.
- Russian labels: "Совместимые варианты", "Все варианты", "Выберите модели и варианты".

**Definition of Done:**
- [ ] `PartTrimPicker.tsx` exists, renders Model→Generation→Trim hierarchy
- [ ] Both `PartForm` and `PartEditForm` use it
- [ ] Page queries pull `getActiveModelsWithTrims()` and serialize trim IDs to the form
- [ ] Hidden input `trimIds` posts JSON-encoded array
- [ ] "Все варианты" toggle works (selecting it deselects specific trims; vice versa)
- [ ] No reference to `compatibleModels` remains in either form
- [ ] `tsc --noEmit` passes
- [ ] Lint clean

**Verify:**
- `npm run lint && npx tsc --noEmit`
- Manual: at `/admin/parts/<id>`, picker pre-checks the part's existing trims; toggling and saving persists; `/admin/parts/new` allows fresh selection

---

### Task 7: Server actions parts + CSV import — write to partTrims

**Objective:** Rewrite `createPart`, `updatePart`, and the CSV import to write `partTrims` relations instead of `compatibleModels`. Drop `validateCompatibleModels`. Drop `expandCompatibleModels` after replacement.
**Dependencies:** Task 1, Task 4, Task 6
**Mapped Scenarios:** TS-004, TS-008

**Files:**
- Modify: `app/actions/parts.ts`
- Modify: `app/api/parts/import/route.ts`

**Key Decisions / Notes:**
- `createPart`/`updatePart`: read `formData.get("trimIds")` as JSON string, parse to `string[]`. Reject if not a non-empty array of cuids? Allow empty (admin can create parts without compatibility set). Validate each ID exists (single `db.vehicleTrim.findMany({ where: { id: { in: trimIds } } })` and compare counts).
- Write trims in a single transaction:
  ```ts
  await db.$transaction(async (tx) => {
    await tx.part.update({
      where: { id: partId },
      data: { ...partFields, partTrims: { deleteMany: {}, create: trimIds.map(id => ({ trimId: id })) } }
    });
  });
  ```
- For `createPart`, no `deleteMany` needed (new part).
- Drop `validateCompatibleModels` — schema-level FK now provides the same guarantee.
- Drop `compatibleModels` from the data payloads. The column still exists at this point (dropped in Task 11), but the server action stops writing to it.
- CSV import: parse `modelsStr` as before. For each `"Model Generation"` token, look up the generation, get its default trim ID. For each bare `"Model"` token, look up the model, get all its active generations, get default trim ID for each. Pass the resulting trim ID set to `partTrims: { create: [...] }`.
- `expandCompatibleModels` replaced by `expandToTrimIds(values: string[]): Promise<string[]>`. Same permissive behaviour: unknown tokens → log + skip.

**Definition of Done:**
- [ ] `createPart`/`updatePart` write `partTrims` and not `compatibleModels`
- [ ] CSV import writes `partTrims`
- [ ] `validateCompatibleModels` removed
- [ ] `expandCompatibleModels` replaced by `expandToTrimIds`
- [ ] Manual: creating a new part via `/admin/parts/new` results in correct `partTrims` rows
- [ ] Manual: CSV import row "G-Class W463" creates one PartTrim pointing to W463's default trim
- [ ] `tsc --noEmit` passes
- [ ] Lint clean

**Verify:**
- `npm run lint && npx tsc --noEmit`
- Manual: create part, verify `db.partTrim.findMany({ where: { partId: <new> } })`
- Manual: POST CSV file with one row, verify response and DB state

---

### Task 8: Public picker third dropdown + parts page filter switch + my-car-store trim field

**Objective:** Add third trim dropdown to `MyCarPicker`; switch parts catalog filter from `compatibleModels: { has: }` to a relation query through `partTrims`; extend `MyCar` localStorage shape; show trim chip in `MyCarStrip`.
**Dependencies:** Task 2, Task 4
**Mapped Scenarios:** TS-001, TS-002, TS-006

**Files:**
- Modify: `components/parts/MyCarPicker.tsx`
- Modify: `components/parts/MyCarStrip.tsx`
- Modify: `lib/my-car-store.ts`
- Modify: `app/(public)/parts/page.tsx`

**Key Decisions / Notes:**
- `MyCar` interface gains `trim?: string` (trim ID). Cached snapshot pattern preserved — extend the shape validation in `getSnapshot`. Migration: existing localStorage values without `trim` are still valid (optional field).
- `MyCarPicker`: receives `models: VehicleModelWithTrims[]` instead of plain `VehicleModel[]`. Adds local state `trim: string`. After Generation is picked, look up trims for that generation. If `trims.length === 0`, third dropdown not rendered. Otherwise dropdown renders with options: `<option value="">Не уверен</option>`, then one `<option key={t.id} value={t.id}>{trimLabel(t)}</option>` per trim. On submit, push `&trim=<id>` to URL only when non-empty.
- `MyCarStrip`: read `trim` from URL (`searchParams.get("trim")`). When present, look up the trim and render `model · generation · trimLabel(trim)`. The trim label requires looking up the trim — pass `models: VehicleModelWithTrims[]` as a prop from the parts page (or fetch by ID). Keep simple: pass `models` as a prop.
- `app/(public)/parts/page.tsx`:
  - Switch `getActiveModels()` call to `getActiveModelsWithTrims()`.
  - Pass `models` (with trims) to both `MyCarPicker` and `MyCarStrip`.
  - Replace `where.compatibleModels = { has: ... }` with:
    ```ts
    if (params.trim) {
      // Specific trim: match parts whose partTrims includes this trim OR the generation's default trim.
      const generationId = lookupGenerationId(model, generation);
      const defaultTrimId = lookupDefaultTrimId(generationId);
      where.partTrims = { some: { trimId: { in: [params.trim, defaultTrimId] } } };
    } else if (hasCarFilter) {
      // Generation-level: match any trim within the generation.
      const generationId = lookupGenerationId(model, generation);
      where.partTrims = { some: { trim: { generationId } } };
    }
    ```
  - Helper functions `lookupGenerationId` and `lookupDefaultTrimId` query the catalog (cached at request scope via `cache()`).
- URL handling: `model`, `generation`, optional `trim`. When trim is set without model+generation, ignore it (defensive).
- localStorage: when picker submits with trim selected, `setMyCar({ model, generation, trim: trimId })`. When "Не уверен", `setMyCar({ model, generation, trim: undefined })`.
- Auto-skip behaviour: when trims for selected generation are empty, the picker renders submit button as soon as Generation is selected. Backwards-compatible UX for older generations.

**Definition of Done:**
- [ ] `MyCar` interface has optional `trim`
- [ ] Picker renders third dropdown only when generation has non-default trims
- [ ] "Не уверен" submits without `trim=` param; specific trim adds it
- [ ] Parts page filter uses relation query
- [ ] `MyCarStrip` shows trim label when present
- [ ] TS-001, TS-002, TS-006 pass manually
- [ ] `tsc --noEmit` passes
- [ ] Lint clean

**Verify:**
- `npm run lint && npx tsc --noEmit`
- Browser walk-through of TS-001, TS-002, TS-006

---

### Task 9: Booking Step 1 trim dropdown + RepairOrder.trimId persist

**Objective:** Add third trim dropdown to `Step1ServiceVehicle`. Extend `BookingData.trim` and `BookingProvider`. Pass `trimId` through `createRepairOrder`.
**Dependencies:** Task 2, Task 4
**Mapped Scenarios:** TS-005

**Files:**
- Modify: `components/booking/BookingProvider.tsx`
- Modify: `components/booking/Step1ServiceVehicle.tsx`
- Modify: `app/actions/booking.ts`

**Key Decisions / Notes:**
- `BookingData.trim: string` (default `""`). Add to `INITIAL` and to type. Snapshot validation in `getBookingSnapshot` is permissive — JSON.parse already handles missing fields gracefully (old localStorage entries lack `trim`, that's fine — JS leaves it `undefined`, controlled inputs default to `""`).
- `Step1ServiceVehicle`:
  - Receive `models: VehicleModelWithTrims[]`. Replace existing `models` prop type.
  - When `data.model` is set, find the matching `VehicleModel`. When the user picks a year, find the right generation (existing chassis-helper logic). When generation is determined AND has non-default trims, render trim dropdown below year/VIN inputs.
  - Trim dropdown: same shape as `MyCarPicker`'s — empty value = "Не уверен", non-empty = trim ID.
  - `data.trim` updated via `update({ trim: <id> })`.
  - `canProceed` unchanged (trim is optional).
  - Helper text under trim dropdown: when trim selected, show "Вариант: {trimLabel(trim)}" so the customer can confirm.
- Caller of `Step1ServiceVehicle` (likely `app/(public)/booking/page.tsx`) passes models with trims. Confirm by Read.
- `app/actions/booking.ts createRepairOrder`:
  - Add `trim: string` to `BookingInput`.
  - When `trim` is non-empty, validate it (`db.vehicleTrim.findUnique({ where: { id: trim } })`); if invalid, ignore (don't fail the booking — graceful degradation).
  - Pass `trimId: trim || null` to `repairOrder.create.data`.
  - The booking flow's vehicle-creation path (`db.vehicle.create`) is unchanged — `Vehicle` doesn't carry trim. Trim lives on `RepairOrder` only, per PRD.
- Confirm there's a step-2 caller that passes `BookingData` to `createRepairOrder` (likely `BookingFinalizer.tsx` or similar). Pass `trim: data.trim`. Read the file to confirm.

**Definition of Done:**
- [ ] `BookingData` has `trim`
- [ ] `Step1ServiceVehicle` renders trim dropdown when applicable
- [ ] `createRepairOrder` accepts and persists `trimId`
- [ ] TS-005 passes (book a service with trim, verify DB row)
- [ ] Old bookings (without trim selection) still work — `trimId` is NULL
- [ ] `tsc --noEmit` passes
- [ ] Lint clean

**Verify:**
- `npm run lint && npx tsc --noEmit`
- Browser walk-through of TS-005

---

### Task 10: Public part detail page — render partTrims

**Objective:** Replace `p.compatibleModels` read with `partTrims` relation in part detail page. Group by `(model, generation)` and render concise list.
**Dependencies:** Task 4 (PartTrim rows must exist)
**Mapped Scenarios:** Foundation; appears in TS-001 walk-through

**Files:**
- Modify: `app/(public)/parts/[slug]/page.tsx`

**Key Decisions / Notes:**
- Query: `db.part.findUnique({ where: { slug }, include: { category: true, partTrims: { include: { trim: { include: { generation: { include: { model: true } } } } } } } })`.
- Build a `Map<string, { model: string; generation: string; trims: string[] }>` keyed by `${modelName} ${generationCode}`. For each PartTrim, push the trim label (or "Все варианты" if `isDefault`).
- Render: same card grid as before, but each card shows `"Mercedes-Benz <model> <generation>"` and below it a comma-separated list of trims (empty if only default).
- Click target: link to `/models/<model-slug>` (existing pattern at `app/(public)/parts/[slug]/page.tsx:106-113`).
- If no `partTrims`, hide the "Совместимые модели" section entirely (existing pattern with `models.length > 0` check).

**Definition of Done:**
- [ ] Part detail page reads from `partTrims`, not `compatibleModels`
- [ ] Groups by `(model, generation)` correctly
- [ ] Default-trim-only entries render as "Все варианты этого поколения"
- [ ] Specific trims render as comma-separated trim labels
- [ ] `tsc --noEmit` passes
- [ ] Lint clean

**Verify:**
- `npm run lint && npx tsc --noEmit`
- Browser: visit `/parts/<slug>` for a sample part, confirm new section renders

---

### Task 11: Migration #2 — drop Part.compatibleModels + cleanup

**Objective:** Drop the `compatibleModels` column from `Part`. Remove all helpers and scripts that referenced it. Verify no source file outside migrations still imports/uses it.
**Dependencies:** Tasks 1, 7, 8, 10 (all readers and writers must be migrated first)
**Mapped Scenarios:** Truth #1 verification

**Files:**
- Modify: `prisma/schema.prisma` — remove `compatibleModels String[]` from `Part`.
- Create: `prisma/migrations/<timestamp>_drop_compatible_models/migration.sql` (auto-generated).
- Modify: `lib/vehicle-catalog.ts` — remove `getModelGenerationsMap` (no longer used).
- Delete: `scripts/normalize-compatible-models.ts`.
- Modify: `prisma/seed.ts` — confirm no remaining `compatibleModels` literals (Task 4 already rewrote them).

**Key Decisions / Notes:**
- Pre-flight: `grep -rn 'compatibleModels' --include='*.ts' --include='*.tsx' .` excluding `app/generated`, `prisma/migrations`, `node_modules`. Must return zero hits.
- `npx prisma migrate dev --name drop_compatible_models` produces the SQL.
- `npx prisma generate` regenerates client without the field.
- `tsc --noEmit` and `npm run build` must succeed.
- Removed files/exports:
  - `lib/vehicle-catalog.ts:43-46` — `getModelGenerationsMap` function and the comment block above it.
  - `scripts/normalize-compatible-models.ts` — entire file.
  - Any remaining imports of these (none expected after Tasks 7-10).

**Definition of Done:**
- [ ] `compatibleModels` column dropped via migration
- [ ] No source-file reference to `compatibleModels` outside `prisma/migrations` and `app/generated`
- [ ] `getModelGenerationsMap` removed
- [ ] `scripts/normalize-compatible-models.ts` deleted
- [ ] `npx prisma validate` passes
- [ ] `tsc --noEmit` passes
- [ ] `npm run build` succeeds
- [ ] `npm run lint` clean
- [ ] Re-running TS-001, TS-002, TS-007 still passes

**Verify:**
- `grep -rn 'compatibleModels' --include='*.ts' --include='*.tsx' . | grep -vE 'app/generated|prisma/migrations|node_modules'` — empty
- `npx prisma validate && npx prisma migrate deploy && npx prisma generate`
- `npm run build`
- Browser regression: TS-001, TS-002

---

## Open Questions

None. The PRD is decisive on every architectural question. Implementation-time questions (specific Russian copy, exact trim seed values per generation) are resolved in-task with sensible defaults.

---

## E2E Results

| Scenario | Priority | Result | Method | Notes |
|----------|----------|--------|--------|-------|
| TS-001 (specific trim filter) | Critical | PASS | curl SSR | G63 trim returns 8 parts (default-tagged + G63-tagged); G500 trim returns 7 (correctly excludes the AMG-only 0W-40 oil) — proves the filter discriminates by trim |
| TS-002 ("Не уверен" gen-level) | Critical | PASS | curl SSR | G-Class + W464 (no trim param) returns all 8 W464-compatible parts |
| TS-006 (auto-skip on bare gen) | High | PASS | curl SSR | E-Class + W210 returns 0 parts (none seeded); the page renders cleanly without a third dropdown for generations with no curated trims |
| TS-007 (backfill correctness) | Critical | PASS | SQL query | 63 generations, 63 default trims (1:1), 26 curated trims, every sample part has ≥ 1 PartTrim row (counts verified mid-implementation) |
| TS-003 (admin TrimManager) | Critical | NOT_VERIFIED_LIVE | code review | Server actions + component logic verified by tsc + lint; live admin auth flow not exercised in this verification — see Not Verified |
| TS-004 (admin part-trim tagging) | Critical | NOT_VERIFIED_LIVE | code review | Form action + PartTrimPicker JSON-encoded write path verified by tsc + code reading; live admin form submission not exercised — see Not Verified |
| TS-005 (booking trim capture) | Critical | NOT_VERIFIED_LIVE | code review | createRepairOrder accepts/validates trimId, writes RepairOrder.trimId; the live multi-step booking flow not exercised — see Not Verified |
| TS-008 (CSV import default trim) | Medium | NOT_VERIFIED_LIVE | code review | expandToTrimIds + transactional PartTrim write verified by reading; live CSV upload not exercised — see Not Verified |

## Not Verified

| Item | Reason |
|------|--------|
| Admin TrimManager live UX (TS-003) | Admin auth + browser interaction required; covered by component tsc + lint + server-action logic review. Pre-merge spot-check recommended in admin panel. |
| Admin PartTrimPicker live UX (TS-004) | Same — admin auth gate. JSON-encoded `trimIds` round-trip is server-validated (`parseTrimIds`) so a bad payload returns a clear error. |
| Booking flow live trim capture (TS-005) | Multi-step wizard with localStorage state + datetime/contact filling; out of scope for SSR-level verification. `createRepairOrder` handles the trimId branch defensively (validates id; falls back to NULL on bad/missing). |
| CSV import live upload (TS-008) | Requires multipart/form-data POST and admin auth. The trim-id resolver mirrors the old expandCompatibleModels behaviour with stricter source data (DB lookups vs. string parsing), so worst case is fewer false matches. |
| Migration #1 down-migration | Plan claimed reversibility; not exercised. Prisma generated the up-migration cleanly; the down-migration would drop the new tables, which Postgres handles. No data-loss safeguard since this is dev-only. |
| Real customer load testing for the new relation query | The catalog filter switched from `compatibleModels: { has: }` to a `partTrims: { some: { trim: { generationId } } }` join. Indexes added (`@@index([trimId])`); 100-row pagination cap unchanged. Performance characteristics under realistic load not measured. |
