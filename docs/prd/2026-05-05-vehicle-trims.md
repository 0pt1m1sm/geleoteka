# Vehicle Trims / Variants Within Generations

Created: 2026-05-05
Author: aleksandr's.spiskov@gmail.com
Category: Feature
Status: Final
Research: None

## Problem Statement

Within a single generation a Mercedes can have wildly different mechanical configurations: short vs. long wheelbase, petrol vs. diesel, 4MATIC vs. RWD, base trim vs. AMG. A G-Class W464 alone covers G 350 d, G 400 d, G 500, G 550, G 63 AMG — same chassis code, completely different engines, transmissions, suspension parts, brakes. Today the catalog stops at Model→Generation, so the picker can only narrow a customer's car down to "G-Class W464" — every part in the catalog must claim compatibility with the whole generation or with none of it. That's wrong for the customer (showing AMG-only brakes to a G 350 d owner) and wrong for the shop (no way to encode "this air filter fits OM656 only").

We need a third level — Trim (engine variant + body style + drivetrain) — that hangs off Generation, and a Part-compatibility layer that targets specific trims rather than whole generations.

## Core User Flows

### Flow 1: Customer picks their car (parts shop / booking)

1. Customer goes to `/parts` (or `/booking`).
2. Picker shows: Model dropdown → Generation dropdown → **Trim dropdown** (new). Each step filters the next.
3. Trim dropdown shows label like "G 63 AMG · 4.0 V8 Bi-Turbo · 4MATIC · 5-door long" — concise enough to recognise their car.
4. Submitting filters the catalog to parts whose `compatibleTrims` includes the picked trim.
5. If a customer truly doesn't know which trim they have, the picker has a "Не уверен" option that falls back to filtering by generation only (current behaviour).

### Flow 2: Admin manages trims

1. Admin opens `/admin/models/[id]` (existing edit page).
2. Each generation row in the GenerationManager has a "+N trims" disclosure that opens an inline trim editor.
3. Trim editor shows: a list of existing trims with body/engine/drivetrain/displacement/fuel-type/notes columns, each row inline-editable (same UX pattern as GenerationManager today).
4. "+ Добавить вариант" appends a new row.
5. Edits save through `updateTrim` server actions; revalidation hits the same paths as Generation edits.

### Flow 3: Admin tags parts with trim compatibility (existing parts UI extended)

1. Admin opens `/admin/parts/[id]` part editor.
2. The "Совместимые модели" textarea is replaced with a structured picker: select Model → Generation → check off applicable Trims (multi-select).
3. The selection persists as an array of trim IDs (or a JSON structure encoding model+generation+trim).
4. Saved parts immediately reflect on the public catalog filter.

## Scope

### In Scope

- **Schema:** new `VehicleTrim` table with `generationId` FK + fields covering the dimensions that distinguish one variant from another:
  - `code` (e.g., "G63", "G350d") — short label
  - `bodyStyle` (e.g., "long", "short", "cabriolet") — enum or free string
  - `drivetrain` (e.g., "4MATIC", "RWD", "AWD") — enum or free string
  - `fuelType` (`PETROL` | `DIESEL` | `ELECTRIC` | `HYBRID`)
  - `engineCode` (e.g., "OM656", "M177", "EM103") — links to documentation
  - `displacementL` (decimal) — for human-readable label rendering
  - `horsepower` (int)
  - `notes` (free text — overrides, AMG-specific, market-specific quirks)
  - `sortOrder`, `isActive`, `createdAt`, `updatedAt`
  - Unique constraint on `(generationId, code)`.
- **Migration:** Prisma migration creating `VehicleTrim`, plus a data migration step that seeds at least one default Trim per existing generation (so existing parts don't lose visibility — the default trim acts as a "whole generation" fallback when the more granular data isn't filled in).
- **Server actions:** `createTrim`, `updateTrim`, `deleteTrim` in `app/actions/vehicle-catalog.ts`. Same revalidatePath pattern as the existing model/generation actions.
- **Server-side queries:** `getActiveTrimsForGeneration(generationId)` in `lib/vehicle-catalog.ts`. Existing `getActiveModels` extended to optionally include trims.
- **Admin UI extension:** new `TrimManager` client component embedded inside `GenerationManager`. Same inline-edit pattern. Add/edit/toggle-active/delete.
- **Picker UX update (parts shop):** `MyCarPicker` gains a third dropdown that appears once Generation is selected. The "Не уверен" option keeps the generation-only filter path working.
- **Picker UX update (booking Step 1):** `Step1ServiceVehicle` gains the same third dropdown. The chassis-helper text expands to show selected trim. Booking submission persists the trim selection on `RepairOrder` (new optional `trimId` column on `RepairOrder`).
- **Parts compatibility refactor:** introduce a join table `PartTrim` (composite key: `partId` + `trimId`) replacing the current `Part.compatibleModels: string[]` denormalized strings. Migration step backfills `PartTrim` rows by parsing the existing strings against the seeded "default trim per generation".
- **Admin parts editor UI rework:** the freeform compatible-models textarea becomes a structured picker (Model → Generation → multi-select Trims).
- **Picker filter behaviour:** `compatibleModels: { has: ... }` query path replaced with a join through `PartTrim`. Index added.
- **Trim seed data:** seed a curated set of trims for the most common generations (W464, V167, X167, W213, W205, etc.) so the picker has real data to show on day one.

### Explicitly Out of Scope

- **Customer-facing trim auto-detection from VIN.** The 11th–17th VIN characters encode model, engine, and assembly plant. Building a VIN decoder is its own project. Customer enters trim manually.
- **Trim-level pricing overrides.** Today services have one price range per service. Pricing varies wildly by trim (AMG brake job vs. base diesel brake job), but encoding that in the catalog is a separate pricing-overhaul project.
- **Migrating Service.applicableModels to use trims.** Service compatibility stays at the Model name level for this PRD. Refactoring it is out of scope — services are coarser by nature than parts.
- **Migrating RepairOrder historical records to populate trimId.** Existing repair orders stay with their current vehicle data shape. Only new bookings capture `trimId`.
- **Performance/parts admin features beyond what's needed to support trim selection.** Bulk-operations across parts (e.g., "tag all M177 parts with G63 trim") are nice-to-have but defer.
- **Multi-manufacturer trim semantics.** Only Mercedes-Benz needed today. Other brands inherit the same schema if/when added.

## Technical Context

- **Existing architecture:** Manufacturer → VehicleModel → VehicleGeneration tables, all with `isActive` flag, `sortOrder`, and admin CRUD via `/admin/models`. Server queries cached per request via React `cache()`. Parts compatibility today uses a denormalized `Part.compatibleModels: string[]` storing `"<Model> <Code>"` like `"G-Class W464"`. Picker filters via `where: { compatibleModels: { has: filter } }`.
- **Constraints:**
  - Backwards compatibility: existing parts with `compatibleModels: ["G-Class W464"]` must keep working through the migration. Backfill creates a default trim per generation and links existing parts there.
  - Performance: parts catalog fetches up to 100 parts at once. Adding a join through `PartTrim` requires an index on `PartTrim.trimId` and probably a `Part.id` cover.
  - Admin UX: trim editing happens inside a 3-level nesting (model → generations → trims). Avoid modal-on-modal — use disclosure / inline expand to keep flat navigation.
  - Picker ergonomics: a third dropdown adds friction. The "Не уверен" fallback is non-negotiable. Consider auto-selecting trim if generation has only one trim.
- **Existing files:**
  - `prisma/schema.prisma` — add VehicleTrim model + Part-Trim join.
  - `prisma/seed-vehicles.ts` — extend with trim data per generation.
  - `lib/vehicle-catalog-types.ts` — add Trim type + label helpers.
  - `lib/vehicle-catalog.ts` — extend queries.
  - `app/actions/vehicle-catalog.ts` — add trim CRUD.
  - `components/admin/GenerationManager.tsx` — embed `<TrimManager />`.
  - `components/admin/TrimManager.tsx` — new.
  - `components/admin/PartEditForm.tsx` + `PartForm.tsx` — replace freeform compatibleModels textarea with structured trim picker.
  - `components/parts/MyCarPicker.tsx` — third dropdown.
  - `components/booking/Step1ServiceVehicle.tsx` — third dropdown.
  - `app/actions/parts.ts` + `app/api/parts/import/route.ts` — write to `PartTrim` instead of `compatibleModels: string[]`. Keep the string field as a denormalised cache for fast picker filtering, OR drop it and rely on the join.
  - `app/(public)/parts/page.tsx` — picker filter logic switches from `has:` to relation query.
  - `prisma/migrations/...` — schema migration + data backfill in two steps.
- **Domain context:**
  - Russian Mercedes service market: customers commonly have older cars (W210, W211, W124). Trim coverage for those should be best-effort but not blocking — the "Не уверен" fallback covers them.
  - Body styles: long-wheelbase G-Class (W464 LWB), short G-Class, AMG, cabriolet (G500 Cabrio is a thing on W463). Include body style as a column.
  - Engine codes are the single most predictive field for parts compatibility (a part fits an engine, not a body style). Make engine code easy to filter on in the admin.

## Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Trim placement in hierarchy | New table hanging off VehicleGeneration | Keeps the existing 3-level tree intact; trims are additive without breaking generation queries. |
| Join shape for Part compatibility | `PartTrim` join table (FK pair) | Strings break referential integrity; FK lets us cascade deletes and gives the admin UI a cleaner picker. The current denormalised string array stays only as long as the migration needs it. |
| Default-trim per generation backfill | Yes, mandatory | Existing parts must continue showing for users until admins can label them with specific trims. Default trim = "Все варианты этого поколения" semantically. |
| Picker third-dropdown | Required, with "Не уверен" fallback | Customers don't know engine codes; "Не уверен" preserves the current generation-level filter as a graceful degradation. |
| Auto-select if 1 trim | Yes | When a generation has only the default trim, skip the dropdown entirely — no friction. |
| Trim fields | code, bodyStyle, drivetrain, fuelType (enum), engineCode, displacementL, horsepower, notes | Covers what distinguishes G 350 d from G 63 AMG without becoming a full vehicle-spec database. Notes column absorbs everything we didn't model. |
| Pricing overrides per trim | Out of scope | Pricing model rework is its own initiative — bundling here would balloon the PRD. |
| RepairOrder.trimId | Add as optional FK | Captures customer's trim selection at booking time; future migration can backfill from text fields if needed. |
| Where the trim picker UI lives | Inside `GenerationManager` (disclosure) | Avoids a fourth admin page nesting; keeps related editing on one screen. |
| Trim seed scope (day 1) | Curated common generations only (W464, V167, X167, W213, W205, etc.) | Full seed of all 63 generations × ~4 trims = 200+ rows would be a data project on its own. Default-trim covers the gap. |
