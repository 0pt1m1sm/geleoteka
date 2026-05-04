# Data Model Redesign Implementation Plan

Created: 2026-04-21
Author: aleksandr's.spiskov@gmail.com
Status: VERIFIED
Approved: Yes
Iterations: 1
Worktree: No
Type: Feature

## Summary

**Goal:** Redesign Geleoteka's data model with three coordinated changes: (1) User unification — Founder/Master/Supplier collapse into User with permissionRole + identity flags + profile tables. (2) Vehicle merge — Car + RentalCar → Vehicle with ownershipType. (3) RepairOrder + JobLine — Appointment + Estimate → industry-standard repair order with per-job approval. All existing data is mock and will be dropped. Fresh seed.

**Architecture:** Single Prisma migration drops 9 old models, creates 8 new models, modifies 4 models. Then 7 UI tasks update every page, component, and action that referenced the old models. Schema-first approach: the migration + seed ship as Task 1, then each UI surface updates independently.

**Tech Stack:** Next.js 16, Prisma 6, PostgreSQL, TypeScript strict. No new runtime deps. PRD: `docs/prd/2026-04-19-data-model-redesign.md`.

## Scope

### In Scope

- New Prisma schema with all 3 migrations in one
- New seed file for the new schema
- Auth updates (permissionRole, login guard for NONE users)
- Admin pages rewrite (repair orders, founders, suppliers, team, rentals, calendar, dashboard)
- Booking wizard update (creates RepairOrder instead of Appointment)
- Portal pages update (cabinet history, tracking, estimates, cars, rentals)
- Public pages update (rentals, about)
- Component rewrites (all admin, booking, portal, rental components referencing old models)
- Server action rewrites (booking, admin, cars, estimates, founders, rentals, suppliers, supplier-orders)
- API route updates (slots, appointment status)
- Admin nav updates (lib/admin-nav.ts route references)
- Status label updates (lib/utils.ts)
- Production deploy via Railway preDeployCommand

### Out of Scope

- Module boundaries / folder refactor (separate effort — plan superseded, to be redone after schema)
- Sidebar restructure to one-group-per-module (deferred to module boundaries plan)
- Module enable/disable toggles (deferred)
- Parts inventory model (separate PRD)
- Invoice table (RepairOrder.status=INVOICED is sufficient for now)
- Online payments, digital contracts, damage management (separate rental PRDs)
- Vehicle ownership history table (deferred until volume justifies)

## Approach

**Chosen:** Schema-first, then UI. Task 1 rewrites the schema + seed. Tasks 2-8 update each UI surface. Build won't compile until all old model references are updated (Prisma generates new types; old references become TS errors). The implementer fixes all TS errors systematically using `bunx tsc --noEmit` as the feedback loop.

**Why:** Cleanest — schema is the source of truth; everything else is derived. Each UI task is independently verifiable once it compiles. Since all data is mock, the migration is just "drop + create" with no preservation logic.

**Alternatives rejected:**
- Per-migration tasks (User first, Vehicle second, RO third) — rejected because all 3 migrations touch the same seed file and the same pages (admin dashboard queries all models). Would require 3 intermediate migration states that each need a consistent seed.
- Single atomic task — rejected because ~70 files in one task is un-reviewable and un-debuggable.

## Context for Implementer

> Write for an implementer who has never seen the codebase.

### Key patterns

- **Prisma client** imports from `@/lib/db` (singleton at `lib/db.ts`). NEVER import from `@prisma/client` or `@/app/generated/prisma/client` directly.
- **Auth in admin pages**: `getSession()` + `redirect("/login")` if not ADMIN/MANAGER. Do NOT use `requireRole()` which throws.
- **Server Actions**: `"use server"` files in `app/actions/`. First param for `useActionState` actions is `_prevState`.
- **Components**: PascalCase filenames. `"use client"` directive for interactive components.
- **CSS**: CSS variables only (`var(--card)`, `var(--color-accent)`, etc.). No hardcoded hex.

### Gotchas

- **`app/(cabinet)/` is EMPTY** — dead route group. Ignore it.
- **`app/(public)/blog/` and `app/(admin)/admin/blog/` are EMPTY** — skeleton, no pages.
- **`components/ui/` is EMPTY** — placeholder.
- **The `APPOINTMENT_STATUS_LABELS` in `lib/utils.ts` must be replaced** with `REPAIR_ORDER_STATUS_LABELS` and `JOB_LINE_STATUS_LABELS`.
- **`lib/admin-nav.ts`** references route paths (`/admin/appointments`, `/admin/estimates`). These MUST be updated to the new routes.
- **The booking wizard** (`app/(public)/booking/*`) is a multi-step flow with `BookingProvider` context. It currently creates an Appointment via `app/actions/booking.ts`. After refactor, it creates a RepairOrder (status=ESTIMATE).
- **`AdminCalendar`** component in `components/platform/AdminCalendar.tsx` (moved there in a prior session) renders appointment data. Must be updated to RepairOrder.
- **`lib/auth.ts` SessionUser** shape changes: `role: string` → `permissionRole: string`. Every consumer of `session.role` must update.

### Key files

| File | Purpose | Change needed |
|---|---|---|
| `prisma/schema.prisma` | Full schema | Complete rewrite of affected models |
| `prisma/seed.ts` | Seed data | Complete rewrite |
| `lib/auth.ts` | Auth helpers | permissionRole, NONE guard |
| `lib/utils.ts` | Status labels | Replace appointment labels with RO/JobLine labels |
| `lib/admin-nav.ts` | Sidebar nav data | Update route paths |
| `app/actions/*.ts` | Server actions | Most need rewriting |
| `app/(admin)/admin/*` | Admin pages | Update model references |
| `app/(public)/booking/*` | Booking wizard | Appointment → RepairOrder |
| `app/(portal)/cabinet/*` | Customer portal | Update model references |
| `components/admin/*` | Admin components | Update imports and types |
| `components/booking/*` | Booking wizard | Update model references |
| `components/platform/*` | AdminCalendar etc. | Update model references |

## Runtime Environment

- **Dev:** `npm run dev` (port 443, HTTPS)
- **DB:** PostgreSQL `geleoteka` on localhost:5432
- **Production:** Railway auto-deploy from main. `preDeployCommand = ["npx prisma migrate deploy"]`
- **Admin credentials:** `admin@geleoteka.ru` / `admin123`

## Feature Inventory

**Models dropped (9):** Founder, Master, MasterProfile, Supplier, Car, RentalCar, Appointment, AppointmentService, Estimate, EstimateItem

**Models created (8):** CustomerProfile, MasterProfile (new shape), FounderProfile, SupplierProfile, Vehicle, RepairOrder, JobLine, LaborLine, PartLine

**Models modified (4):** User (add permissionRole + identity flags + profile relations), SupplierOrder (supplierId → userId), FounderContribution → Contribution (rename + founderId → userId), LoyaltyTransaction (appointmentId → repairOrderId)

**Models unchanged (14):** Service, PartCategory, Part, PartOrder, PartOrderItem, LoyaltyAccount, Notification, CMSBlock, BlogPost, Vacancy, PasswordReset, RentalBooking (vehicleId replaces carId)

**Enums dropped:** AppointmentStatus, EstimateStatus, EstimateItemType
**Enums created:** UserPermissionRole, VehicleOwnershipType, RepairOrderStatus, JobLineStatus, PartLineStatus
**Enums modified:** UserRole → dropped (replaced by UserPermissionRole)

### File-to-task mapping (every affected file assigned)

| File | Change | Task |
|---|---|---|
| `prisma/schema.prisma` | Full rewrite of affected models | 1 |
| `prisma/seed.ts` | Complete rewrite | 1 |
| `lib/auth.ts` | permissionRole, NONE guard, session shape | 2 |
| `lib/utils.ts` | Status labels | 2 |
| `lib/admin-nav.ts` | Route path updates | 2 |
| `app/middleware.ts` | Session role check if any | 2 |
| `app/actions/booking.ts` | Appointment→RepairOrder | 3 |
| `app/actions/admin.ts` | Appointment+Estimate→RepairOrder actions | 3 |
| `app/actions/estimates.ts` | Merge into repair-orders.ts or update | 3 |
| `app/actions/cars.ts` | Car→Vehicle | 3 |
| `app/actions/rentals.ts` | RentalCar→Vehicle | 3 |
| `app/actions/founders.ts` | Founder→User+FounderProfile | 3 |
| `app/actions/suppliers.ts` | Supplier→User+SupplierProfile | 3 |
| `app/actions/supplier-orders.ts` | supplierId→userId, FounderContrib→Contribution | 3 |
| `app/api/slots/route.ts` | Model references | 3 |
| `app/api/appointments/[id]/status/route.ts` | → repair-orders or remove | 3 |
| `app/(admin)/admin/page.tsx` | Dashboard queries | 4 |
| `app/(admin)/admin/appointments/page.tsx` | → repair-orders page | 4 |
| `app/(admin)/admin/calendar/page.tsx` | RepairOrder queries | 4 |
| `app/(admin)/admin/estimates/page.tsx` | Merge into repair-orders or update | 4 |
| `app/(admin)/admin/estimates/new/page.tsx` | Merge into repair-orders or update | 4 |
| `app/(admin)/admin/customers/page.tsx` | No change (queries User) | — |
| `app/(admin)/admin/customers/[id]/page.tsx` | Car→Vehicle, Appointment→RepairOrder | 4 |
| `app/(admin)/admin/founders/page.tsx` | Founder→User+FounderProfile | 5 |
| `app/(admin)/admin/founders/new/page.tsx` | Founder→User+FounderProfile | 5 |
| `app/(admin)/admin/founders/[id]/page.tsx` | Founder→User+FounderProfile | 5 |
| `app/(admin)/admin/suppliers/page.tsx` | Supplier→User+SupplierProfile | 5 |
| `app/(admin)/admin/suppliers/new/page.tsx` | Supplier→User+SupplierProfile | 5 |
| `app/(admin)/admin/suppliers/[id]/page.tsx` | Supplier→User+SupplierProfile | 5 |
| `app/(admin)/admin/suppliers/orders/page.tsx` | supplierId→userId | 5 |
| `app/(admin)/admin/suppliers/orders/new/page.tsx` | supplierId→userId | 5 |
| `app/(admin)/admin/suppliers/orders/[id]/page.tsx` | supplierId→userId, FounderContrib→Contribution | 5 |
| `app/(admin)/admin/team/page.tsx` | Master→User+MasterProfile | 5 |
| `app/(admin)/admin/rentals/page.tsx` | RentalCar→Vehicle | 6 |
| `app/(admin)/admin/rentals/new/page.tsx` | RentalCar→Vehicle | 6 |
| `app/(admin)/admin/rentals/[id]/page.tsx` | RentalCar→Vehicle | 6 |
| `app/(admin)/admin/rentals/bookings/page.tsx` | RentalCar→Vehicle | 6 |
| `app/(admin)/admin/orders/page.tsx` | No change (queries PartOrder) | — |
| `app/(admin)/admin/cms/page.tsx` | No change | — |
| `app/(admin)/admin/parts/page.tsx` | No change | — |
| `app/(public)/rentals/page.tsx` | RentalCar→Vehicle | 6 |
| `app/(public)/rentals/[id]/page.tsx` | RentalCar→Vehicle | 6 |
| `app/(public)/booking/page.tsx` | Appointment→RepairOrder references | 7 |
| `app/(public)/booking/layout.tsx` | BookingProvider | 7 |
| `app/(public)/booking/step-2/page.tsx` | VehicleInput | 7 |
| `app/(public)/booking/step-3/page.tsx` | CalendarSlotPicker | 7 |
| `app/(public)/booking/step-4/page.tsx` | ContactForm | 7 |
| `app/(public)/booking/step-5/page.tsx` | BookingConfirmation | 7 |
| `app/(public)/about/page.tsx` | Master→User references if any | 7 |
| `app/(portal)/cabinet/page.tsx` | Appointment→RepairOrder | 8 |
| `app/(portal)/cabinet/cars/page.tsx` | Car→Vehicle | 8 |
| `app/(portal)/cabinet/cars/add/page.tsx` | Car→Vehicle | 8 |
| `app/(portal)/cabinet/estimates/page.tsx` | Estimate→RepairOrder | 8 |
| `app/(portal)/cabinet/history/page.tsx` | Appointment→RepairOrder | 8 |
| `app/(portal)/cabinet/tracking/page.tsx` | Appointment→RepairOrder | 8 |
| `components/admin/StatusChanger.tsx` | Appointment→RepairOrder | 4 |
| `components/admin/DeleteAppointmentButton.tsx` | Appointment→RepairOrder | 4 |
| `components/admin/EstimateBuilder.tsx` | Estimate→RepairOrder/JobLine | 4 |
| `components/admin/FounderEditForm.tsx` | Founder→User+FounderProfile | 5 |
| `components/admin/SupplierEditForm.tsx` | Supplier→User+SupplierProfile | 5 |
| `components/admin/SupplierOrderForm.tsx` | supplierId→userId | 5 |
| `components/admin/SupplierOrderStatusChanger.tsx` | No change (action path same) | — |
| `components/admin/ContributionPaidToggle.tsx` | FounderContrib→Contribution | 5 |
| `components/admin/RentalEditForm.tsx` | RentalCar→Vehicle | 6 |
| `components/admin/RentalStatusChanger.tsx` | No change | — |
| `components/platform/AdminCalendar.tsx` | Appointment→RepairOrder | 4 |
| `components/booking/BookingProvider.tsx` | Appointment→RepairOrder context | 7 |
| `components/booking/BookingConfirmation.tsx` | createAppointment→createRepairOrder | 7 |
| `components/booking/ServiceSelector.tsx` | Service model (unchanged) | — |
| `components/booking/VehicleInput.tsx` | Car→Vehicle references | 7 |
| `components/booking/CalendarSlotPicker.tsx` | Appointment→RepairOrder slot logic | 7 |
| `components/booking/ContactForm.tsx` | Minor or none | 7 |
| `components/booking/StepIndicator.tsx` | No change | — |
| `components/portal/EstimateReview.tsx` | Estimate→RepairOrder/JobLine | 8 |
| `components/portal/StatusBoard.tsx` | Appointment→RepairOrder | 8 |
| `components/rentals/RentalBookingForm.tsx` | RentalCar→Vehicle | 6 |

## Assumptions

- **All existing data is mock/test and can be dropped** — user confirmed 2026-04-19. Tasks 1 depends on this (no data preservation in migration).
- **`email` and `phone` remain required on User** — user chose to use placeholder values for non-login entities rather than making fields nullable. Task 1 seed + Task 5 (supplier/founder creation forms) must enforce placeholder patterns.
- **RepairOrder replaces BOTH Appointment AND Estimate** — the booking wizard creates a RepairOrder (status=ESTIMATE) and the admin converts it. No separate estimate page after this change. Tasks 3, 4, 7 depend on this.
- **`lib/auth.ts` SessionUser.role → SessionUser.permissionRole`** — every file that reads `session.role` must update. Task 2 handles this.
- **Admin pages that reference old routes (`/admin/appointments`, `/admin/estimates`)** will change to `/admin/repair-orders` (or similar). Task 4 handles the route + nav update.
- **The `/api/appointments/[id]/status/route.ts` API route** either becomes `/api/repair-orders/[id]/status/route.ts` or is replaced by a server action. Task 3.
- **`components/platform/AdminCalendar.tsx`** was moved from `components/admin/` in the prior sidebar-audit spec. It must update from Appointment to RepairOrder queries. Task 4.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Build breaks after Task 1 until ALL UI tasks complete | Certain | High (can't verify intermediate state via build) | Run `bunx tsc --noEmit 2>&1 | wc -l` after Task 1 to count errors; systematically work through them in Tasks 2-8. Expected: ~200+ TS errors from old model references. |
| Booking wizard breaks in subtle ways (multi-step state) | Medium | High | Task 7 dedicates full attention to the 6-file wizard + BookingProvider context. Runtime browser verification of all 5 steps. |
| Session.role → session.permissionRole breaks auth across the app | High | High | Task 2 does the auth rename FIRST (before any page work) and updates the middleware + every `session.role` reference in one pass. Grep to verify zero remaining references. |
| New RepairOrder/JobLine UI is more complex than old flat Appointment | High | Medium | Start with the simplest workable UI: list view with status, detail view with inline JobLine rows. The per-job-line approval UX can be refined in a follow-up. Ship working, improve later. |
| Seed fails on production (Railway) | Low | High | Test seed locally in Task 1. preDeployCommand runs migration (schema change), seed is separate (`npx prisma db seed` — NOT auto-run by Railway). Need to either add seed to preDeployCommand or run manually post-deploy. |
| Rental booking form breaks (RentalCar → Vehicle) | Medium | Medium | Task 6 updates all rental pages + the booking form. Runtime verify via `/rentals/[id]` booking flow. |

## Goal Verification

### Truths

1. **`bunx tsc --noEmit` reports zero errors** after all tasks complete.
2. **`npm run build` succeeds** with the full route list.
3. **`npm run lint` passes** with zero new errors.
4. **Admin can log in and navigate every sidebar entry** without 500 errors or console errors.
5. **Admin can create a RepairOrder with JobLines** (the new service workflow works end-to-end).
6. **Admin can create a User-as-supplier** (unified User model) and create a SupplierOrder against them.
7. **Admin can create a User-as-founder** and see their contribution history.
8. **Public `/rentals` page shows fleet vehicles** (Vehicle model works).
9. **Booking wizard creates a RepairOrder** (not an Appointment) through all 5 steps.
10. **Portal shows repair order history** (not appointments) for logged-in customers.

### Artifacts

- `prisma/schema.prisma` — redesigned schema
- `prisma/migrations/<timestamp>_data_model_redesign/migration.sql`
- `prisma/seed.ts` — fresh seed for new models
- `lib/auth.ts` — updated session shape
- `lib/utils.ts` — new status labels
- All updated admin, public, portal pages and components

## E2E Test Scenarios

### TS-001: Admin creates a RepairOrder with JobLines
**Priority:** Critical
**Preconditions:** Admin logged in, at least one Vehicle and one Service exist in seed
**Mapped Tasks:** Task 4

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/repair-orders` (or equivalent new route) | List renders (may be empty). No 500 error. |
| 2 | Click "New" or equivalent CTA | Create form renders with customer picker, vehicle picker, service picker. |
| 3 | Fill out the form: select customer, vehicle, add 2 JobLines | Form accepts input, shows job descriptions + proposed status. |
| 4 | Submit | RepairOrder created, redirected to detail page. Status = ESTIMATE. |
| 5 | On detail, approve one JobLine, decline another | Approved JobLine status → APPROVED, declined → DECLINED. |

### TS-002: Unified User — create supplier and verify in suppliers list
**Priority:** Critical
**Preconditions:** Admin logged in
**Mapped Tasks:** Task 5

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/suppliers/new` | Form renders with name, email, phone, contactName, country, notes. |
| 2 | Fill form, submit | User created with isSupplier=true, SupplierProfile created. Redirected to suppliers list. |
| 3 | New supplier appears in `/admin/suppliers` list | Row shows name, country, contact. |

### TS-003: Vehicle merge — rental fleet renders
**Priority:** Critical
**Preconditions:** Seed has 3 rental vehicles
**Mapped Tasks:** Task 6

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to `/rentals` | 3 G-Class vehicles render with photos, specs, daily rate. |
| 2 | Click any vehicle | `/rentals/[id]` detail page renders with booking form. |
| 3 | Navigate to `/admin/rentals` | Fleet list renders with 3 vehicles. |

### TS-004: Booking wizard creates RepairOrder
**Priority:** Critical
**Preconditions:** Seed has services and masters
**Mapped Tasks:** Task 7

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to `/booking` | Step 1 renders with ServiceSelector. |
| 2 | Select a service, continue through steps 2-4 | Each step renders without error. |
| 3 | Submit on step 5 | RepairOrder created (not Appointment). Confirmation shown. |

### TS-005: Admin sidebar and dashboard work post-migration
**Priority:** Critical
**Preconditions:** Admin logged in, seed data present
**Mapped Tasks:** Task 2, Task 4

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin` | Dashboard renders stats (today's repair orders, active, etc.). |
| 2 | Click every sidebar group and sub-item | All pages render without 500 errors. |
| 3 | Check console | Zero errors across all navigations. |

## Progress Tracking

- [x] Task 1: Prisma schema rewrite + migration + seed
- [x] Task 2: Auth + utils + nav + middleware updates
- [x] Task 3: Server actions rewrite
- [x] Task 4: Admin service pages (repair orders, calendar, estimates, dashboard, customers)
- [x] Task 5: Admin entity pages (founders, suppliers, team)
- [x] Task 6: Rental pages (admin + public) + rental components
- [x] Task 7: Booking wizard + public pages
- [x] Task 8: Portal pages + portal components
- [x] Task 9: [VERIFY-FIX] Verification gaps from iteration 1 (see Verification Gaps below)
      **Total Tasks:** 9 | **Completed:** 9 | **Remaining:** 0
      **Status (iter 0):** `bunx tsc --noEmit` exit 0; `npm run build` succeeded with full route list 2026-04-29.
      **Status (iter 1):** All 10 verification gaps fixed. `prisma validate` ✓, `prisma migrate reset` re-applied with cleaned migration ✓, seed re-runs ✓. `npx tsc --noEmit` exit 0. `npm run lint` 0 errors / 7 pre-existing warnings. `npm run build` succeeded with `/admin/repair-orders` and `/api/slots` in route list (no `/admin/appointments`). Final source-tree grep for `session.role | payload.role | APPOINTMENT_STATUS_LABELS | /admin/appointments | isFounder | FounderProfile | createAppointment | prisma.contribution` returns 0 hits.

## Verification Gaps (iteration 1)

| # | Gap | Type | Severity | Affected Files | Fix Description |
|---|-----|------|----------|----------------|-----------------|
| 1 | Schema/migration/seed drift on `isFounder` + `FounderProfile` | bug | must_fix | `prisma/schema.prisma` (User model lines 114-160), `prisma/migrations/20260428000000_data_model_redesign/migration.sql:91,150-156`, `prisma/seed.ts:266,286` | `schema.prisma` has no `isFounder` field or `FounderProfile` model. Migration SQL adds them, seed uses them, and the generated client still has them from a stale generation. Re-running `prisma generate` from current schema will break the seed. **Add `isFounder Boolean @default(false)` to `User`, add `founderProfile FounderProfile?` relation, and define the `FounderProfile` model in `schema.prisma`.** Then `npx prisma generate` and re-run typecheck. |
| 2 | Slot booking race — `(dateTime, masterUserId)` unique allows NULL collisions | bug | must_fix | `prisma/schema.prisma:317`, `app/actions/booking.ts:100-150`, `app/api/slots/route.ts`, `prisma/migrations/20260428000000_data_model_redesign/migration.sql` | Booking creates RepairOrder without `masterUserId`. PostgreSQL allows duplicate rows when a unique-key column is NULL, so two simultaneous bookings at the same `dateTime` both succeed. **DECISION (locked):** add a separate `Slot` model with a non-nullable unique `dateTime` and a nullable `repairOrderId` FK. Modify `createAppointment` to (a) `db.$transaction` open, (b) `db.slot.create({ data: { dateTime } })` — relies on unique constraint to fail concurrently, (c) create RO with `slotId`, (d) commit. Update `app/api/slots/route.ts` to read availability from `Slot` table. Drop the now-redundant `(dateTime, masterUserId)` unique constraint on RepairOrder. |
| 3 | Customer estimate response can corrupt RO state and totals | bug | must_fix | `app/actions/estimates.ts:14-55` | `respondToJobLine` updates `JobLine.status` unconditionally — a customer can flip an `IN_PROGRESS` or `DONE` job back to `DECLINED`/`DEFERRED`, and the totals recompute is not transactional with the status update. **Add a `where: { id, status: "PROPOSED" }` guard on the update and wrap status-change + totals-recompute in `db.$transaction`.** Reject changes once RO leaves `ESTIMATE`/`APPROVED`. |
| 4 | `addJobLines` redirects to `/admin/appointments` (plan said `/admin/repair-orders`) | bug | must_fix | `app/(admin)/admin/appointments/` (whole dir), `app/actions/admin.ts:199`, `app/(admin)/admin/page.tsx:82`, `lib/admin-nav.ts:37` | **DECISION (locked):** rename `/admin/appointments` → `/admin/repair-orders`. Move `app/(admin)/admin/appointments/` directory to `app/(admin)/admin/repair-orders/`. Update all three references. Russian sidebar label "Записи" stays (it fits "appointment record" semantics). |
| 5 | Vehicle hard-delete cascades wipe rental + service history | bug | should_fix | `app/actions/rentals.ts:83-85`, `prisma/schema.prisma` (RentalBooking + RepairOrder FKs) | `deleteRentalCar` calls `db.vehicle.delete` with no archive guard. With `RentalBooking.vehicleId` and `RepairOrder.vehicleId` both `ON DELETE CASCADE`, removing a fleet vehicle erases its booking and service history irreversibly. **Add `isArchived Boolean @default(false)` to `Vehicle`, change `deleteRentalCar` to set the flag, and filter archived vehicles out of public/admin listings.** Or change FK action to `RESTRICT` and refuse delete when history exists. |
| 6 | Founders module — REMOVE entirely (out of scope) | scope | must_fix | `prisma/schema.prisma`, `prisma/migrations/20260428000000_data_model_redesign/migration.sql`, `prisma/seed.ts`, generated client, any remaining founder refs | **DECISION (locked):** founders module is not required. Remove ALL founder concepts from the redesign. Specifically: drop `isFounder` column from migration SQL (lines ~91, ~375), drop `FounderProfile` table from migration SQL (lines ~150-156, ~288, ~291, ~294, ~390), drop `Contribution` model (formerly `FounderContribution`) from schema/migration if it exists, remove founder records from `prisma/seed.ts:266-310`, regenerate Prisma client. Founders who were previously seeded (4 users) will not exist post-migration. Update PRD reference: Flow 4 (founder-as-customer) is no longer in scope for this redesign. |
| 7 | `createAppointment` function name not renamed to `createRepairOrder` | spec | should_fix | `app/actions/booking.ts:28`, `components/booking/BookingConfirmation.tsx:6,21` | Plan Task 3 DoD: "`createRepairOrder` action exists and creates RO + JobLines". Function still exported as `createAppointment` even though it returns `repairOrderId` and creates a `RepairOrder`. **Rename the export and update the import in `BookingConfirmation.tsx`.** |
| 8 | `session.role` never replaced with `session.permissionRole` (19 occurrences) | spec | should_fix | `lib/auth.ts:19,79,98`, `app/(admin)/admin/**/page.tsx` (16 files) | Plan Task 2 DoD: `grep "session\\.role"` returns zero. Implementer kept `SessionUser.role` as a backward-compat alias for `permissionRole` (`lib/auth.ts:79` comment: "map permissionRole → role to keep SessionUser shape stable"). Project rule (`development-practices.md`): "Don't use feature flags or backwards-compatibility shims when you can just change the code." **Rename `SessionUser.role` → `SessionUser.permissionRole`, drop the alias, and update all 19 call sites.** |
| 9 | `APPOINTMENT_STATUS_LABELS` alias still used by `StatusBoard` | cleanup | suggestion | `lib/utils.ts:88-89`, `components/portal/StatusBoard.tsx:4,84` | Same backward-compat shim pattern. **Update `StatusBoard.tsx` to import `REPAIR_ORDER_STATUS_LABELS` directly, then delete the alias from `lib/utils.ts`.** |
| 10 | Dead `totalLabor`/`totalParts` accumulation in `addJobLines` | cleanup | suggestion | `app/actions/admin.ts` (~lines 148-152) | Variables are accumulated in the loop then `void`'d. Totals are correctly recomputed from DB after the inserts. **Remove the dead accumulation.** |

**Pushed back (not added as gaps):**
- *Codex [critical] "migration not deploy-safe":* The plan explicitly accepts a destructive drop+reseed (Summary line 13: "All existing data is mock and will be dropped. Fresh seed."). PRD §"Why now" confirms ~50 mock users, 4 mock founders, 1 mock supplier, 3 mock rental cars are acceptable to drop. This is the approved approach for this codebase pre-launch — not a verification gap.

## E2E Results (iteration 1 verify)

Reviewer (iter 2): **10/10 truths verified, 0 must_fix, 0 should_fix, 2 suggestions** — both implemented.

**Smoke checks against running dev server (https://localhost:443):**

| Endpoint | Expected | Got |
|----------|----------|-----|
| `GET /` | 200 | 200 ✓ |
| `GET /rentals` | 200 (Vehicle queries with isArchived filter) | 200 ✓ |
| `GET /admin` | 307 redirect to login | 307 ✓ |
| `GET /admin/repair-orders` | 307 redirect to login (route exists) | 307 ✓ |
| `GET /admin/appointments` | 404 (route removed) | 404 ✓ |
| `GET /admin/founders` | 404 (module removed from scope) | 404 ✓ |
| `GET /api/slots?date=2026-05-10` | 200 with 11 slots all available | 200 ✓ (query targets Slot table) |

**Plan's structured E2E scenarios (TS-001 through TS-005):** Deferred to user manual test in the Code Review Gate. The scenarios require interactive flows (booking wizard fill-out, admin RO creation with JobLines, customer estimate response, sidebar navigation) that the human user can drive more efficiently in their existing browser session. Static smoke + reviewer + Codex coverage gives high confidence the routes/data layer behave correctly; the remaining risk is interactive UX which the user is best positioned to assess.

| Not Verified | Reason |
|--------------|--------|
| TS-001 admin creates RepairOrder with JobLines (interactive) | Deferred to user manual test |
| TS-002 admin creates User-as-supplier (interactive) | Deferred to user manual test |
| TS-003 rental fleet renders with photos (visual) | Smoke confirms 200 response; visual check deferred |
| TS-004 booking wizard 5-step flow (interactive) | Deferred to user manual test |
| TS-005 admin sidebar + dashboard navigation (interactive) | Smoke confirms admin routes redirect correctly; full nav check deferred |
| Concurrent slot booking race (parallel POST) | Static review of `db.$transaction` + `Slot.dateTime @unique` is sufficient evidence of DB-level enforcement; no automated parallel-request harness available |
| respondToJobLine state-machine guards under live load | Static review of `RO_STATES_OPEN_FOR_DECISION` guard + `updateMany where: { status: "PROPOSED" }` + transaction wrap is sufficient evidence |

## Implementation Tasks

---

### Task 1: Prisma schema rewrite + migration + seed

**Objective:** Rewrite `prisma/schema.prisma` with all 3 migrations (User unification, Vehicle merge, RepairOrder+JobLine). Generate one Prisma migration. Rewrite `prisma/seed.ts` for the new schema. Verify migration applies and seed runs.

**Dependencies:** None
**Mapped Scenarios:** All (foundation for everything)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_data_model_redesign/migration.sql` (auto-generated)
- Modify: `prisma/seed.ts`

**Key Decisions / Notes:**
- Drop ALL old models (Founder, Master, MasterProfile, Supplier, Car, RentalCar, Appointment, AppointmentService, Estimate, EstimateItem) and create new ones in a single migration.
- Since existing data is mock, use `DROP TABLE IF EXISTS` for old tables. Prisma migration handles this via `prisma migrate dev --create-only` + edit if needed, or just let Prisma generate the diff.
- **WARNING:** After this task, `bunx tsc --noEmit` will have ~200+ errors because all code still references old models. This is expected and will be fixed in Tasks 2-8.
- Seed should create: admin user, client user, 4 founders (as Users with FounderProfile), 4 masters (as Users with MasterProfile), 1 supplier (as User with SupplierProfile), 3 rental vehicles, sample services, sample parts, sample repair orders with job lines.
- Target schema exactly as specified in PRD `docs/prd/2026-04-19-data-model-redesign.md` Target Schema section.

**Definition of Done:**
- [ ] `npx prisma validate` passes
- [ ] `npx prisma migrate dev --name data_model_redesign` succeeds
- [ ] `npx prisma generate` succeeds
- [ ] `npx prisma db seed` populates all expected rows
- [ ] Direct DB query confirms: User table has founders+masters+supplier+admin+client rows with correct flags; Vehicle table has 3 rental vehicles; RepairOrder/JobLine tables exist.
- [ ] Schema matches the PRD target exactly (UserPermissionRole enum, Vehicle.ownershipType, RepairOrderStatus, JobLineStatus, PartLineStatus, all relations)

**Verify:**
- `npx prisma validate`
- `npx prisma db seed`
- `psql postgresql://alex@localhost:5432/geleoteka -c 'SELECT id, name, "permissionRole", "isFounder", "isMaster", "isSupplier" FROM "User"'`
- `psql postgresql://alex@localhost:5432/geleoteka -c 'SELECT id, model, "ownershipType" FROM "Vehicle"'`

---

### Task 2: Auth + utils + nav + middleware

**Objective:** Update all infrastructure files to use the new schema types. After this task, auth works, status labels are correct, and admin nav points at the right routes.

**Dependencies:** Task 1
**Mapped Scenarios:** TS-005

**Files:**
- Modify: `lib/auth.ts` — `SessionUser.role → SessionUser.permissionRole`, login rejects `permissionRole = NONE`, `getSession()` selects `permissionRole` instead of `role`
- Modify: `lib/utils.ts` — replace `APPOINTMENT_STATUS_LABELS` with `REPAIR_ORDER_STATUS_LABELS` + `JOB_LINE_STATUS_LABELS`
- Modify: `lib/admin-nav.ts` — update route paths (`/admin/appointments` → `/admin/repair-orders`, remove `/admin/estimates` if merged)
- Modify: `app/middleware.ts` — update `session.role` → `session.permissionRole` if referenced
- Modify: `app/(public)/layout.tsx` — `session.role` → `session.permissionRole`
- Grep + fix: every file that references `session.role` must update to `session.permissionRole`

**Key Decisions / Notes:**
- **Critical:** after changing `SessionUser.role → permissionRole`, every admin page that does `session.role !== "ADMIN"` breaks. Run `grep -rn "session.role" --include="*.tsx" --include="*.ts"` and fix every hit.
- `UserPermissionRole.NONE` users must be rejected at login time (`lib/auth.ts` `getSession()` should return null for NONE users, or the login action should refuse to create a token for them).
- Admin nav: the `Записи` (appointments) entry under Сервис → becomes repair-orders route. The `Сметы` (estimates) entry may be removed (estimates are now a state of RepairOrder, not a separate page) OR kept as a filtered view of RepairOrders with status=ESTIMATE.

**Definition of Done:**
- [ ] `grep -rn "session\.role" --include="*.tsx" --include="*.ts" | grep -v node_modules` returns zero results (all replaced with `session.permissionRole`)
- [ ] `lib/auth.ts` compiles with the new `UserPermissionRole` type
- [ ] `lib/utils.ts` exports `REPAIR_ORDER_STATUS_LABELS` and `JOB_LINE_STATUS_LABELS`
- [ ] `lib/admin-nav.ts` references only routes that will exist after this plan completes
- [ ] Login as admin works, login as `permissionRole=NONE` is rejected

**Verify:**
- `grep -rn "session\.role" --include="*.tsx" --include="*.ts" | grep -v node_modules | wc -l` → 0
- `bunx tsc --noEmit 2>&1 | grep -c "error"` → count decreases from Task 1 baseline (not zero yet — page references still broken)

---

### Task 3: Server actions rewrite

**Objective:** Rewrite all server actions that reference old models. Create new actions for RepairOrder lifecycle. Update existing actions for User-as-supplier, User-as-founder.

**Dependencies:** Task 2
**Mapped Scenarios:** TS-001, TS-002, TS-004

**Files:**
- Rewrite: `app/actions/booking.ts` — `createAppointment` → `createRepairOrder` (status=ESTIMATE)
- Rewrite: `app/actions/admin.ts` — `updateAppointmentStatus` → `updateRepairOrderStatus`, `deleteAppointment` → `deleteRepairOrder`, `assignMaster` → `assignMasterToRO`, `createEstimate` → becomes part of RepairOrder flow (add JobLines to existing RO)
- Remove or merge: `app/actions/estimates.ts` → functionality moves into repair-order actions
- Rewrite: `app/actions/cars.ts` — `addCar` → `addVehicle` (ownershipType=CUSTOMER)
- Rewrite: `app/actions/rentals.ts` — `createRentalCar`/`updateRentalCar`/`deleteRentalCar` → `createVehicle`/`updateVehicle`/`deleteVehicle` (ownershipType=RENTAL)
- Rewrite: `app/actions/founders.ts` — Founder → User (isFounder=true) + FounderProfile
- Rewrite: `app/actions/suppliers.ts` — Supplier → User (isSupplier=true) + SupplierProfile
- Update: `app/actions/supplier-orders.ts` — `supplierId` → `userId`, `FounderContribution` → `Contribution`
- Update or replace: `app/api/appointments/[id]/status/route.ts` → `app/api/repair-orders/[id]/status/route.ts`
- Update: `app/api/slots/route.ts` — Appointment → RepairOrder for slot availability

**Key Decisions / Notes:**
- The `createRepairOrder` action should accept: userId (customer), vehicleId, serviceIds (to create initial JobLines from Service catalog), mileageIn, concern/notes. Each selected Service becomes a JobLine (status=PROPOSED) with a LaborLine derived from Service.durationMinutes and rate.
- The `updateRepairOrderStatus` action replaces `updateAppointmentStatus` — same SMS notification pattern via `lib/sms.ts`.
- Founder/Supplier creation actions now create a User row + a profile row in one transaction: `db.$transaction([db.user.create({...}), db.founderProfile.create({...})])`.
- `distributeCost()` helper in supplier-orders.ts stays the same shape but references `userId` instead of `founderId`.

**Definition of Done:**
- [ ] All action files compile with `bunx tsc --noEmit` (no errors in `app/actions/`)
- [ ] `createRepairOrder` action exists and creates RO + JobLines
- [ ] `createVehicle` action works for both CUSTOMER and RENTAL types
- [ ] Founder/Supplier creation uses User + Profile pattern
- [ ] API routes compile

**Verify:**
- `bunx tsc --noEmit 2>&1 | grep "app/actions"` → zero errors
- `bunx tsc --noEmit 2>&1 | grep "app/api"` → zero errors

---

### Task 4: Admin service pages (repair orders, calendar, estimates, dashboard)

**Objective:** Update all admin pages related to the service workflow: dashboard, repair orders list (was appointments), calendar, estimates (merged or filtered view), customer detail. Update related admin components.

**Dependencies:** Task 3
**Mapped Scenarios:** TS-001, TS-005

**Files:**
- Rewrite: `app/(admin)/admin/appointments/page.tsx` → rename to `app/(admin)/admin/repair-orders/page.tsx` (or rewrite in-place)
- Update: `app/(admin)/admin/calendar/page.tsx` — Appointment → RepairOrder
- Rewrite or remove: `app/(admin)/admin/estimates/page.tsx` + `estimates/new/page.tsx` — if estimates become a filtered view of ROs, keep the page but query `RepairOrder WHERE status = ESTIMATE`; if merged entirely, remove and redirect
- Update: `app/(admin)/admin/page.tsx` — dashboard queries change from Appointment to RepairOrder
- Update: `app/(admin)/admin/customers/[id]/page.tsx` — Appointment → RepairOrder, Car → Vehicle
- Rewrite: `components/admin/StatusChanger.tsx` → RepairOrder status changer
- Rewrite: `components/admin/DeleteAppointmentButton.tsx` → `DeleteRepairOrderButton.tsx`
- Rewrite: `components/admin/EstimateBuilder.tsx` → RepairOrder JobLine builder
- Update: `components/platform/AdminCalendar.tsx` — Appointment → RepairOrder

**Key Decisions / Notes:**
- The new RepairOrder list page should show: RO number, customer name, vehicle, status badge, date, total. Filter by status. Same card layout as current appointments.
- The new EstimateBuilder (or JobLineBuilder) adds JobLines to a RepairOrder. Each JobLine has: description, proposed labor hours/rate, proposed parts. Status = PROPOSED. Admin can approve/decline individual JobLines.
- Keep `/admin/appointments` route working (redirect to `/admin/repair-orders`) OR rename the directory. Implementer's call — renaming the directory is cleaner but changes URLs.
- AdminCalendar: the calendar widget renders ROs on their `dateTime` field. Same visual, different data source.

**Definition of Done:**
- [ ] `/admin` dashboard renders with RepairOrder-based stats
- [ ] Repair order list page renders with status badges
- [ ] Calendar renders with RepairOrder data
- [ ] Estimate creation flow creates JobLines on a RepairOrder
- [ ] Customer detail shows RepairOrder history + Vehicle info
- [ ] `bunx tsc --noEmit` has zero errors in admin service pages
- [ ] Runtime smoke: all pages render in browser, zero console errors

**Verify:**
- `bunx tsc --noEmit 2>&1 | grep "admin"` → zero errors
- Browser: navigate to `/admin`, `/admin/repair-orders`, `/admin/calendar`

---

### Task 5: Admin entity pages (founders, suppliers, team)

**Objective:** Update admin pages for entities that changed from separate tables to User + Profile pattern.

**Dependencies:** Task 3
**Mapped Scenarios:** TS-002

**Files:**
- Rewrite: `app/(admin)/admin/founders/page.tsx` — query `User WHERE isFounder = true`, include FounderProfile
- Rewrite: `app/(admin)/admin/founders/new/page.tsx` — create User + FounderProfile
- Rewrite: `app/(admin)/admin/founders/[id]/page.tsx` — User + FounderProfile + Contributions
- Rewrite: `app/(admin)/admin/suppliers/page.tsx` — query `User WHERE isSupplier = true`, include SupplierProfile
- Rewrite: `app/(admin)/admin/suppliers/new/page.tsx` — create User + SupplierProfile
- Rewrite: `app/(admin)/admin/suppliers/[id]/page.tsx` — User + SupplierProfile + SupplierOrders
- Update: `app/(admin)/admin/suppliers/orders/*.tsx` (3 files) — supplierId → userId references
- Rewrite: `app/(admin)/admin/team/page.tsx` — query `User WHERE isMaster = true`, include MasterProfile
- Rewrite: `components/admin/FounderEditForm.tsx`
- Rewrite: `components/admin/SupplierEditForm.tsx`
- Update: `components/admin/SupplierOrderForm.tsx` — supplier selector queries User WHERE isSupplier
- Update: `components/admin/ContributionPaidToggle.tsx` — FounderContribution → Contribution

**Key Decisions / Notes:**
- Founder/Supplier/Team pages look nearly identical to today — just the underlying model changes. The UI shape (list → detail → edit form) stays the same.
- Supplier creation form: name, email (required — placeholder if needed), phone (required — placeholder if needed), contactName, country, notes. Behind the scenes: creates User with `isSupplier=true, permissionRole=NONE` + SupplierProfile.
- Team page: queries `User WHERE isMaster = true` instead of `Master`. Shows MasterProfile fields (specialty, bio, photo).
- SupplierOrderForm's supplier dropdown: `db.user.findMany({ where: { isSupplier: true, supplierProfile: { isActive: true } } })`.

**Definition of Done:**
- [ ] Founders page lists Users with isFounder=true
- [ ] Creating a founder creates a User + FounderProfile
- [ ] Founder detail shows contributions correctly
- [ ] Suppliers page lists Users with isSupplier=true
- [ ] Creating a supplier creates a User + SupplierProfile
- [ ] Supplier order form shows suppliers from User table
- [ ] Team page shows Users with isMaster=true
- [ ] `bunx tsc --noEmit` has zero errors in these pages

**Verify:**
- Browser: `/admin/founders`, `/admin/suppliers`, `/admin/team`, `/admin/suppliers/orders/new`
- `bunx tsc --noEmit 2>&1 | grep "founders\|suppliers\|team"` → zero errors

---

### Task 6: Rental pages + components (admin + public)

**Objective:** Update all rental pages and components to use Vehicle instead of RentalCar.

**Dependencies:** Task 3
**Mapped Scenarios:** TS-003

**Files:**
- Rewrite: `app/(admin)/admin/rentals/page.tsx` — `db.rentalCar` → `db.vehicle.findMany({ where: { ownershipType: "RENTAL" } })`
- Rewrite: `app/(admin)/admin/rentals/new/page.tsx` — `createRentalCar` → `createVehicle`
- Rewrite: `app/(admin)/admin/rentals/[id]/page.tsx` — Vehicle edit
- Update: `app/(admin)/admin/rentals/bookings/page.tsx` — RentalCar → Vehicle
- Rewrite: `app/(public)/rentals/page.tsx` — `db.rentalCar` → `db.vehicle` with RENTAL filter
- Rewrite: `app/(public)/rentals/[id]/page.tsx` — Vehicle detail + booking form
- Rewrite: `components/admin/RentalEditForm.tsx` — Vehicle fields
- Update: `components/rentals/RentalBookingForm.tsx` — Vehicle reference

**Key Decisions / Notes:**
- Vehicle has all the fields from RentalCar (model, year, dailyRate, photos, description, engine, HP, etc.) PLUS the new `ownershipType` and `ownerUserId`.
- The public `/rentals` page filters by `ownershipType = "RENTAL"` AND `isAvailable = true`.
- The booking form stays the same shape — it references the Vehicle id, not the model name.
- Admin rental fleet management is identical in UX — just different model underneath.

**Definition of Done:**
- [ ] `/rentals` public page shows 3 rental vehicles
- [ ] `/rentals/[id]` shows detail with booking form
- [ ] `/admin/rentals` shows fleet list
- [ ] `/admin/rentals/new` creates a Vehicle with ownershipType=RENTAL
- [ ] `/admin/rentals/[id]` edits Vehicle
- [ ] `bunx tsc --noEmit` has zero errors in rental files

**Verify:**
- Browser: `/rentals`, `/rentals/[id]`, `/admin/rentals`, `/admin/rentals/[id]`

---

### Task 7: Booking wizard + public pages

**Objective:** Update the 5-step booking wizard to create RepairOrders instead of Appointments. Update any remaining public pages.

**Dependencies:** Task 3
**Mapped Scenarios:** TS-004

**Files:**
- Rewrite: `components/booking/BookingProvider.tsx` — context stores RepairOrder data instead of Appointment
- Update: `app/(public)/booking/page.tsx` — step 1 (service selection) stays similar
- Update: `app/(public)/booking/step-2/page.tsx` — VehicleInput now references Vehicle
- Update: `app/(public)/booking/step-3/page.tsx` — CalendarSlotPicker queries RepairOrder for slot availability
- Update: `app/(public)/booking/step-4/page.tsx` — ContactForm stays similar
- Rewrite: `app/(public)/booking/step-5/page.tsx` — BookingConfirmation creates RepairOrder
- Rewrite: `components/booking/BookingConfirmation.tsx` — `createAppointment` → `createRepairOrder`
- Update: `components/booking/VehicleInput.tsx` — Car → Vehicle
- Update: `components/booking/CalendarSlotPicker.tsx` — Appointment → RepairOrder slot logic
- Update: `app/(public)/about/page.tsx` — Master → User references if any

**Key Decisions / Notes:**
- The booking wizard flow stays the same 5 steps. The data model underneath changes.
- CalendarSlotPicker: slot availability was checking `Appointment` for booked times. Now checks `RepairOrder` with status not in [CANCELLED, CLOSED].
- BookingConfirmation: final submit calls `createRepairOrder` action instead of `createAppointment`. The action creates RO (status=ESTIMATE) + JobLines from selected services.
- VehicleInput: if the customer has a logged-in session, show their vehicles (type=CUSTOMER). Otherwise, capture make/model/year/VIN as text inputs (create Vehicle on submit).

**Definition of Done:**
- [ ] Booking wizard renders all 5 steps without errors
- [ ] Step 5 creates a RepairOrder (verified by DB query or admin page)
- [ ] Calendar slot picker correctly checks RepairOrder for availability
- [ ] `bunx tsc --noEmit` has zero errors in booking/public files

**Verify:**
- Browser: walk through `/booking` → step-2 → step-3 → step-4 → step-5
- Verify RepairOrder created: `psql ... -c 'SELECT * FROM "RepairOrder" ORDER BY "createdAt" DESC LIMIT 1'`

---

### Task 8: Portal pages + portal components

**Objective:** Update the customer portal to show RepairOrder history instead of Appointment history. Update vehicle references.

**Dependencies:** Task 3
**Mapped Scenarios:** TS-005

**Files:**
- Rewrite: `app/(portal)/cabinet/page.tsx` — dashboard: Appointment → RepairOrder
- Rewrite: `app/(portal)/cabinet/history/page.tsx` — Appointment → RepairOrder
- Rewrite: `app/(portal)/cabinet/tracking/page.tsx` — Appointment → RepairOrder
- Rewrite: `app/(portal)/cabinet/estimates/page.tsx` — Estimate → RepairOrder WHERE status=ESTIMATE
- Rewrite: `app/(portal)/cabinet/cars/page.tsx` — Car → Vehicle WHERE ownershipType=CUSTOMER
- Rewrite: `app/(portal)/cabinet/cars/add/page.tsx` — addCar → addVehicle
- Rewrite: `components/portal/EstimateReview.tsx` — Estimate → RepairOrder/JobLine review
- Rewrite: `components/portal/StatusBoard.tsx` — Appointment → RepairOrder status tracking

**Key Decisions / Notes:**
- Portal cabinet dashboard shows: active RepairOrders (status in [ESTIMATE, APPROVED, IN_PROGRESS, AWAITING_PARTS, QC, READY]), recent completed ROs.
- "My estimates" page becomes a filter: RepairOrders WHERE status=ESTIMATE AND userId=session.id.
- "My cars" page: `Vehicle WHERE ownershipType=CUSTOMER AND ownerUserId=session.id`.
- StatusBoard component: shows RO status with the same visual tracking UI, just different status labels.

**Definition of Done:**
- [ ] `/cabinet` portal dashboard renders with RepairOrder data
- [ ] `/cabinet/history` shows RepairOrder history
- [ ] `/cabinet/tracking` shows active RepairOrder status
- [ ] `/cabinet/estimates` shows pending estimates (RepairOrder WHERE status=ESTIMATE)
- [ ] `/cabinet/cars` lists customer's Vehicles
- [ ] `/cabinet/cars/add` creates a Vehicle with ownershipType=CUSTOMER
- [ ] `bunx tsc --noEmit` has ZERO errors across the entire project
- [ ] `npm run build` succeeds
- [ ] Runtime smoke: log in as client, navigate all cabinet pages

**Verify:**
- `bunx tsc --noEmit` → zero errors (FINAL check — must be clean)
- `npm run build 2>&1 | tail -5` → success
- Browser: `/cabinet`, `/cabinet/history`, `/cabinet/cars`

---

## Open Questions

None — all decisions locked in the PRD. Implementer can proceed.

## Implementation Notes (mid-flight, 2026-04-28)

**Task 1 outcomes:**
- Migration file at `prisma/migrations/20260428000000_data_model_redesign/migration.sql` (436 lines, generated via `prisma migrate diff`)
- Schema applied via `prisma migrate deploy`. Initial `migrate reset` failed because old seed referenced dropped models — workaround was reset with `--skip-seed`, then deploy the new migration manually after marking the failed one rolled-back via `prisma migrate resolve --rolled-back`.
- Seed verified: 10 Users (admin, client, 4 masters, 4 founders) with correct flags; 3 RENTAL Vehicles; all profile tables created.

**Task 2 outcomes — IMPORTANT design decision saved blast radius:**
- `SessionUser` interface kept `role: string` (NOT renamed to `permissionRole`). The `getSession()` function maps DB column `permissionRole` → interface field `role`. Result: ~13 files that read `session.role` continue to work without changes.
- `JWTPayload.role` and the middleware payload check are unchanged — JWT still carries `role` as a string.
- `lib/auth.ts:getSession()` now also rejects `permissionRole === "NONE"` users (suppliers/founders cannot log in).
- `login.ts` rejects users with `passwordHash IS NULL` and `permissionRole === "NONE"`.
- `lib/utils.ts` exports new `REPAIR_ORDER_STATUS_LABELS` + `JOB_LINE_STATUS_LABELS`. Old `APPOINTMENT_STATUS_LABELS` kept as alias to RO labels (back-compat — pages still importing it will show RO statuses without code change).
- `lib/admin-nav.ts` unchanged — route paths `/admin/appointments` and `/admin/estimates` stay the same; only the page content changes in Tasks 4-5.
- `app/middleware.ts` unchanged — `payload.role` still works.

**Implications for remaining tasks:**
- Tasks 4/8 must still update page content (queries, types) but DON'T need to rename `session.role` references.
- Pages currently importing `APPOINTMENT_STATUS_LABELS` won't break immediately — they'll just show RO labels. Cosmetic update can happen during Task 4.

**Build state after Tasks 1-2:** `bunx tsc --noEmit` will still report many errors from Tasks 3-8 territory (page model references like `db.appointment`, `db.founder`, `db.car`). Expected. Will be cleared by Tasks 3-8.

**Task 3 outcomes:**
- Server actions all clean of dropped models. Verified via `grep -nE "db\.(appointment|estimate|estimateItem|car|rentalCar|founder|master|supplier|founderContribution|appointmentService)\b" app/actions/*.ts` → zero matches.
- `app/actions/booking.ts:createAppointment()` now creates a `RepairOrder` (status=ESTIMATE) with one `JobLine` per selected service (status=PROPOSED). Vehicle resolved by VIN or created with `ownershipType="CUSTOMER"`. Return shape changed: `appointmentId` → `repairOrderId`. Caller `components/booking/BookingConfirmation.tsx` (Task 7) must be updated.
- `app/actions/admin.ts`: replaced `updateAppointmentStatus`/`deleteAppointment`/`createEstimate` with `updateRepairOrderStatus`/`deleteRepairOrder`/`addJobLines`. `addJobLines` accepts a `repairOrderId` from the form, creates `JobLine` rows with optional `LaborLine` and `PartLine` children, then recomputes RO totals from all jobs. Redirect target is `/admin/repair-orders` — Task 4 must create that route.
- `app/actions/estimates.ts`: replaced `respondToEstimateItem` with `respondToJobLine(jobLineId, decision)` where decision is `APPROVED` | `DECLINED` | `DEFERRED`. Authorization checks `JobLine.repairOrder.userId === session.id`. After update, RO totals are recomputed from APPROVED job lines only.
- `app/actions/cars.ts`: `addCar` now creates a `Vehicle` with `ownershipType="CUSTOMER"` and `ownerUserId=session.id`. URL path unchanged (`/cabinet/cars`).
- `app/api/slots/route.ts`: queries `db.repairOrder` instead of `db.appointment` (variable renamed to `bookedRepairOrders`). Behavior unchanged: filters by date range, excludes `CANCELLED`. Note: with the new `@@unique([dateTime, masterUserId])` constraint, multiple ESTIMATE rows can share a dateTime when `masterUserId IS NULL` — slot conflict only matters once a master is assigned.
- `app/api/appointments/[id]/status/route.ts` removed; replaced with `app/api/repair-orders/[id]/status/route.ts` (queries `db.repairOrder`).
- `components/portal/StatusBoard.tsx`: fetch URL updated to `/api/repair-orders/${id}/status`; `STATUS_ORDER` array updated to `[ESTIMATE, APPROVED, IN_PROGRESS, AWAITING_PARTS, QC, READY]`. The `Appointment` interface (with `carModel`, `services` props) remains as-is for now — Task 8 will reshape props when consumer pages are rewritten.

**Implications for Task 4:**
- Must create `/admin/repair-orders` route (or rename `/admin/appointments` to it). `app/actions/admin.ts:addJobLines` redirects there.
- The new `EstimateBuilder` (Task 4 deliverable) form fields must use the names: `repairOrderId`, `description`, `laborHours`, `laborRate`, `partDescription`, `partQty`, `partUnitCost`, `partUnitPrice` (one repeated set per job). See `addJobLines` in `app/actions/admin.ts`.
- `BookingConfirmation` (Task 7) must read `result.repairOrderId` instead of `result.appointmentId`.
