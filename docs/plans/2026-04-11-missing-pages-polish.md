# Missing Pages & Polish — Implementation Plan

Created: 2026-04-11
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Expand rental detail page to match product detail quality (specs, gallery, features, trust signals), add missing admin part orders page, and polish remaining pages.

**Architecture:** Extends existing patterns — Prisma model updates, Server Actions, SSR pages. No new dependencies.

## Scope

### In Scope
1. **Rental detail page redesign** — breadcrumb, specs table, features list, trust signals
2. **Rental car schema expansion** — engine, horsepower, transmission, features[], seats
3. **Admin part orders page** — view/manage customer parts orders with status updates
4. **Seed data update** — realistic G-Class specs
5. **Rental catalog cards** — add specs preview

### Out of Scope
- Blog pages (skipped per user request)
- Online payment
- New page types not in navigation

## Approach

**Chosen:** Incremental enhancement — add DB fields via migration, update seed, rewrite rental detail following parts detail as template, add admin orders page following existing admin patterns.

## Context for Implementer

### Parts Detail (Template)
`app/(public)/parts/[slug]/page.tsx` — the quality benchmark:
- Breadcrumb, ImageGallery with thumbnails, specs table, compatible models grid
- Sticky buy card with trust signals
- Layout: `grid-cols-1 lg:grid-cols-[1fr_380px]`

### Current Rental Detail (Sparse)
`app/(public)/rentals/[id]/page.tsx` — only shows image, title, year/color/mileage, description, price, booking form

### Patterns
- Dynamic pages: `export const dynamic = "force-dynamic"`
- Auth in admin: `getSession()` + `redirect()`
- Prisma: cast as `Record<string, unknown>` with inline assertions
- ImageGallery: `<ImageGallery images={photos} alt={name} aspectRatio="16/9" />`

## Runtime Environment
- **Dev:** `npm run dev` (port 443, HTTPS)
- **DB:** PostgreSQL `geleoteka` on localhost:5432
- **Deploy:** Railway auto-deploy from `main`

## Assumptions
- PostgreSQL running with existing schema — Task 1 depends on this
- New fields are optional with defaults — no migration breakage
- Admin orders follows admin estimates page pattern

## Goal Verification

### Truths
1. Rental detail shows breadcrumb, specs table, features, trust signals — same quality as parts detail
2. Rental catalog cards show engine/power preview
3. Admin can view all part orders and change status
4. Seed data has realistic G-Class specs

### Artifacts
- `prisma/migrations/XXXXXX_add_rental_specs/migration.sql`
- `app/(public)/rentals/[id]/page.tsx` — redesigned
- `app/(admin)/admin/orders/page.tsx` — new

## Progress Tracking

- [x] Task 1: Expand RentalCar schema + migration + seed
- [x] Task 2: Redesign rental detail page
- [x] Task 3: Update rental catalog cards with specs
- [x] Task 4: Admin part orders management page

**Total Tasks:** 4 | **Completed:** 4 | **Remaining:** 0

## Implementation Tasks

---

### Task 1: Expand RentalCar Schema

**Objective:** Add spec fields to RentalCar model, migrate, update seed with realistic G-Class data.

**Dependencies:** None

**Files:**
- Modify: `prisma/schema.prisma` — add engine, horsepower, transmission, features[], seats
- Modify: `prisma/seed.ts` — populate new fields

**Key Decisions:**
- Fields: `engine String?`, `horsepower Int?`, `transmission String?`, `features String[]`, `seats Int @default(5)`
- All optional/defaulted — no breaking change
- Seed: G 500 (4.0 V8 biturbo, 422 HP, 9G-TRONIC), G 63 AMG (4.0 V8 biturbo, 585 HP), G 400d (3.0 diesel, 330 HP)

**Definition of Done:**
- [ ] Migration succeeds
- [ ] Seed populates new fields
- [ ] Build passes

---

### Task 2: Redesign Rental Detail Page

**Objective:** Expand rental detail to match parts detail quality.

**Dependencies:** Task 1

**Files:**
- Modify: `app/(public)/rentals/[id]/page.tsx` — full redesign

**Key Decisions:**
- Layout: `grid-cols-1 lg:grid-cols-[1fr_380px]` (like parts)
- Left: ImageGallery → title → specs table → features → description
- Right: sticky card with price + booking form + trust signals
- Specs table: engine, HP, transmission, year, color, mileage, seats
- Trust signals: страховка, поддержка 24/7, доставка
- Breadcrumb: Главная / Аренда / [model]

**Definition of Done:**
- [ ] Breadcrumb, specs table, features, trust signals present
- [ ] Layout matches parts detail (2-column, sticky card)
- [ ] Build passes

---

### Task 3: Update Rental Catalog Cards

**Objective:** Show engine/power on catalog cards.

**Dependencies:** Task 1

**Files:**
- Modify: `app/(public)/rentals/page.tsx` — add specs to card

**Definition of Done:**
- [ ] Cards show engine and horsepower
- [ ] Build passes

---

### Task 4: Admin Part Orders Page

**Objective:** Admin page to view/manage customer part orders.

**Dependencies:** None

**Files:**
- Create: `app/(admin)/admin/orders/page.tsx`
- Create: `components/admin/OrderStatusChanger.tsx`
- Create: `app/actions/part-order-admin.ts`
- Modify: `app/(admin)/layout.tsx` — add "Заказы" to nav

**Key Decisions:**
- Pattern: same as admin appointments with StatusChanger
- Shows: date, customer, items, total, status dropdown
- Statuses: PENDING → CONFIRMED → SHIPPED → COMPLETED / CANCELLED

**Definition of Done:**
- [ ] /admin/orders shows all part orders
- [ ] Admin can change status inline
- [ ] Build passes

---

## Open Questions

None.
