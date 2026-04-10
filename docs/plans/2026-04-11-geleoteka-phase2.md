# Geleoteka Phase 2 — Parts Shop, Rental Cars, Fixes & Polish

Created: 2026-04-11
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Fix broken booking display, add parts shop with inventory management, add rental cars module, polish public site with missing UX elements, and prepare SPlus integration for service requests.

**Architecture:** Extends existing Next.js 16 + PostgreSQL + Prisma stack. Three new modules: parts catalog (public shop + admin inventory), rental cars (public catalog + booking + admin), SPlus integration (service request handoff). Reuses existing auth, layout, and component patterns.

**Tech Stack:** Same as Phase 1 — Next.js 16, PostgreSQL, Prisma, Tailwind CSS, React Query. No new major dependencies.

## Scope

### In Scope

**Bug Fix:**
- Booking creates guest user instead of linking to session → appointments invisible in portal/admin

**Parts Shop (Module 4):**
- Parts catalog with search by model/article/name
- OEM / aftermarket filter, availability indicator
- Product detail page with photos and compatibility
- Cart + checkout (invoice-based, no online payment yet)
- Order history in client portal
- Admin: parts CRUD, inventory management, CSV bulk import
- Admin: order management (view, update status, fulfill)

**Rental Cars (New Module):**
- Public catalog of available rental cars
- Rental booking form (dates, car selection)
- Admin: car fleet CRUD (model, photos, daily rate, availability)
- Admin: rental management (bookings, returns)
- Client portal: my rentals

**Public Site Polish:**
- WhatsApp + Telegram floating buttons
- Mobile hamburger menu with full navigation
- 152-ФЗ cookie/privacy consent banner
- Vacancies page with job listings
- Yandex Map on contacts page (placeholder → real embed when API key available)

**Admin Enhancements:**
- All appointments list with status management (change status inline)
- Upcoming appointments view on dashboard (not just today)

### Explicitly Out of Scope
- Marketplace publishing (Avito, Drom, Zzap, Юла) — Phase 3
- Online payment (ЮKassa) — invoice + offline only
- Full SPlus API integration (bidirectional sync) — Phase 3
- Digital Vehicle Inspection (DVI) — handled by SPlus
- Full CRM with tags/LTV/segments — SPlus
- Analytics/reporting dashboards — SPlus
- Blog — skipped per user request
- i18n (EN language) — post-launch
- Google/VK OAuth — deferred
- 2FA — deferred

## Approach

**Chosen:** Lean modular approach — each new module (parts, rental) follows the same pattern as existing modules: Prisma model → Server Actions → SSR pages + client components. Reuse existing layout shells, auth middleware, card/badge styles, and action patterns.

**Why:** Minimizes new patterns and keeps the codebase easy to maintain. One developer can understand and extend any module by looking at any other module.

**Alternatives considered:**
- Separate microservice for parts shop — rejected: adds deployment complexity, the data volume doesn't justify it
- External e-commerce engine (Medusa, Saleor) — rejected: overkill for a single-store parts catalog, adds learning curve

## Context for Implementer

### Booking Bug Root Cause

The `createAppointment` action in `app/actions/booking.ts` looks up users by email/phone and creates a guest user if not found. When a logged-in user books with their email, it correctly finds them. BUT: the action doesn't use the session at all — it always does email lookup. If the logged-in user types a slightly different email, a new guest user is created and the appointment is invisible in their portal.

**Fix:** Check session first. If user is logged in, use their userId directly. Only create guest users for unauthenticated bookings.

Additionally, the admin dashboard only shows today's count — upcoming appointments are invisible. Fix: show upcoming (next 7 days) on admin dashboard.

### Patterns to Follow

- **Server Actions:** `app/actions/*.ts` — all mutations via `"use server"` actions
- **DB queries in page components:** Dynamic pages use `export const dynamic = "force-dynamic"` + direct Prisma queries
- **Layouts:** Each route group has its own layout with sidebar nav
- **Auth:** `getSession()` for optional auth, `requireAuth()` for mandatory, `requireRole(["ADMIN", "MANAGER"])` for admin
- **Styling:** CSS variables in `globals.css`, `.card`, `.btn`, `.input`, `.badge` utility classes
- **Type assertions:** Prisma results typed as `Record<string, unknown>` with inline casts (consequence of custom Prisma output path)

### Key Files

- `prisma/schema.prisma` — add Part, PartOrder, RentalCar, RentalBooking models
- `lib/auth.ts` — session helpers (getSession, requireAuth, requireRole)
- `lib/utils.ts` — formatPrice, formatDate, etc.
- `app/(public)/layout.tsx` — public header/footer (add mobile menu, floats here)
- `app/(portal)/layout.tsx` — portal sidebar (add parts orders, rentals links)
- `app/(admin)/layout.tsx` — admin sidebar (add parts, rentals, vacancies links)

## Runtime Environment

- **Start:** `npm run dev` (port 443, HTTPS)
- **DB:** PostgreSQL `geleoteka` on localhost:5432
- **Seed:** `npx prisma db seed`
- **Env:** `.env` — DATABASE_URL, JWT_SECRET

## Assumptions

- PostgreSQL is running and `geleoteka` database exists with Phase 1 schema — all tasks depend on this
- No online payment needed — parts orders and rentals are invoice-based (pay at pickup / bank transfer)
- SPlus integration is a one-way push (our booking → SPlus) — no bidirectional sync yet
- Rental cars are managed entirely in our system (not SPlus)
- Parts CSV import follows a simple format: article, name, price, quantity, OEM flag, compatible models

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Parts catalog grows large (10K+ items) | Medium | Medium | Add pagination, search index. Start with basic Prisma text search, move to Meilisearch if slow |
| SPlus API unavailable or undocumented | High | Low | Build a stub client that logs requests. Real integration deferred |
| CSV import with bad data | Medium | Medium | Validate each row, skip invalid, report errors in summary |

## Goal Verification

### Truths

1. Logged-in user books a service → appointment visible in their portal dashboard within page reload
2. Admin sees all upcoming appointments (not just today) on dashboard
3. User can browse parts catalog, filter by OEM/aftermarket, search by name/article
4. User can add parts to cart and complete checkout (receives order confirmation)
5. Admin can add/edit/delete parts, manage inventory, import from CSV
6. User can browse rental cars and submit a rental booking
7. Admin can manage rental fleet and rental bookings
8. WhatsApp and Telegram floating buttons visible on all public pages
9. Mobile hamburger menu opens with full navigation
10. Privacy consent banner shown on first visit

### Artifacts

- `prisma/schema.prisma` — Part, PartCategory, PartOrder, PartOrderItem, RentalCar, RentalBooking, Vacancy models
- `app/(public)/parts/page.tsx` — parts catalog
- `app/(public)/parts/[slug]/page.tsx` — part detail
- `app/(public)/rentals/page.tsx` — rental catalog
- `app/(public)/vacancies/page.tsx` — job listings
- `app/(admin)/admin/parts/page.tsx` — parts management
- `app/(admin)/admin/rentals/page.tsx` — rental management
- `components/shared/FloatingButtons.tsx` — WhatsApp + Telegram
- `components/shared/MobileMenu.tsx` — hamburger menu
- `components/shared/CookieConsent.tsx` — 152-ФЗ banner

## E2E Test Scenarios

### TS-001: Booking Displays in Portal
**Priority:** Critical
**Preconditions:** Logged in as client@test.ru
**Mapped Tasks:** Task 1

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to /booking | Booking wizard step 1 loads |
| 2 | Select a service, fill vehicle, pick date/time, fill contacts with client@test.ru | All steps complete |
| 3 | Click "Записаться" | Success confirmation shown |
| 4 | Navigate to /cabinet | Dashboard shows the new appointment |

### TS-002: Parts Shop Purchase Flow
**Priority:** Critical
**Preconditions:** Parts catalog has items
**Mapped Tasks:** Task 4, Task 5

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to /parts | Catalog loads with parts grid |
| 2 | Search for a part by name | Filtered results shown |
| 3 | Click a part → detail page | Part detail with price, photos, compatibility |
| 4 | Click "В корзину" | Cart counter updates |
| 5 | Navigate to /parts/cart | Cart shows the part with total |
| 6 | Fill contacts, click "Оформить" | Order confirmation shown |

### TS-003: Rental Car Booking
**Priority:** High
**Preconditions:** Rental cars exist in catalog
**Mapped Tasks:** Task 7, Task 8

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to /rentals | Rental car catalog loads |
| 2 | Click a car | Detail view with daily rate |
| 3 | Fill dates and contacts, submit | Booking confirmation shown |

## Progress Tracking

- [x] Task 1: Fix booking display bug + admin upcoming appointments
- [x] Task 2: Public site polish (mobile menu, floats, consent, vacancies)
- [x] Task 3: Parts shop schema + admin catalog CRUD
- [x] Task 4: Parts shop public pages (catalog, search, detail)
- [x] Task 5: Parts shop cart + checkout + orders
- [x] Task 6: Parts CSV import in admin
- [x] Task 7: Rental cars schema + admin + public catalog
- [x] Task 8: Rental car booking + portal integration
- [x] Task 9: Admin enhancements (appointments management)
- [x] Task 10: SPlus integration stub

**Total Tasks:** 10 | **Completed:** 10 | **Remaining:** 0

## Implementation Tasks

---

### Task 1: Fix Booking Display Bug + Admin Upcoming

**Objective:** Fix booking action to use session user when authenticated. Add upcoming appointments to admin dashboard.

**Dependencies:** None
**Mapped Scenarios:** TS-001

**Files:**

- Modify: `app/actions/booking.ts` — check session, use logged-in userId
- Modify: `app/(admin)/admin/page.tsx` — add upcoming appointments list (next 7 days)
- Modify: `app/(admin)/admin/calendar/page.tsx` — ensure new bookings are visible

**Key Decisions:**

- `getSession()` at top of `createAppointment` — if session exists, use session.id as userId, skip email/phone lookup
- If not logged in (public booking), keep current guest-user-creation logic
- Admin dashboard: add "Upcoming" section showing next 7 days of appointments with client name, car, services

**Definition of Done:**

- [ ] Logged-in user books → appointment appears in /cabinet
- [ ] Anonymous user books → guest user created, appointment visible in admin
- [ ] Admin dashboard shows upcoming 7 days of appointments
- [ ] Build passes

**Verify:**

- Log in as client@test.ru → book → /cabinet shows the appointment

---

### Task 2: Public Site Polish

**Objective:** Add missing UX elements: mobile hamburger menu, WhatsApp/Telegram floats, 152-ФЗ consent, vacancies page.

**Dependencies:** None
**Mapped Scenarios:** None

**Files:**

- Create: `components/shared/FloatingButtons.tsx` — WhatsApp + Telegram fixed buttons (bottom-right)
- Create: `components/shared/MobileMenu.tsx` — hamburger menu with full nav links
- Create: `components/shared/CookieConsent.tsx` — cookie/privacy consent banner
- Modify: `app/(public)/layout.tsx` — integrate floats, mobile menu, consent
- Create: `app/(public)/vacancies/page.tsx` — static vacancies listing

**Key Decisions:**

- Mobile menu: slide-in panel from right, covers full height, lists all nav items + login/cabinet
- Floats: WhatsApp (green circle) + Telegram (blue circle), stacked bottom-right, z-50
- Cookie consent: bottom banner with "Принять" button, stores acceptance in localStorage
- Vacancies: static page with hardcoded listings (can be CMS-driven later)

**Definition of Done:**

- [ ] WhatsApp and Telegram buttons visible on all public pages
- [ ] Mobile hamburger opens full navigation panel
- [ ] Cookie consent banner shown on first visit, hidden after acceptance
- [ ] /vacancies page renders job listings
- [ ] Build passes

**Verify:**

- Resize browser to mobile → hamburger visible → tap → full menu opens

---

### Task 3: Parts Shop — Schema + Admin CRUD

**Objective:** Create database models for parts and admin interface for managing catalog.

**Dependencies:** None
**Mapped Scenarios:** TS-002

**Files:**

- Modify: `prisma/schema.prisma` — add Part, PartCategory, PartOrder, PartOrderItem models
- Create: `app/(admin)/admin/parts/page.tsx` — parts list with search, filters
- Create: `app/(admin)/admin/parts/new/page.tsx` — add part form
- Create: `app/(admin)/admin/parts/[id]/page.tsx` — edit part
- Create: `app/actions/parts.ts` — CRUD actions for parts
- Modify: `app/(admin)/layout.tsx` — add "Запчасти" to admin nav
- Modify: `prisma/seed.ts` — seed sample parts data

**Key Decisions:**

- Part model: id, slug, article (артикул), name, description, price, compareAtPrice (для скидок), quantity (stock), isOEM (boolean), photos (String[]), compatibleModels (String[]), categoryId, isActive
- PartCategory: id, name, slug (e.g., "Масла и жидкости", "Фильтры", "Тормоза")
- PartOrder: id, userId, status (PENDING/CONFIRMED/SHIPPED/COMPLETED/CANCELLED), total, items[], contactName, contactPhone, contactEmail, notes
- Admin parts page: table view with search bar, OEM/aftermarket toggle, stock filters

**Definition of Done:**

- [ ] Migration creates Part, PartCategory, PartOrder, PartOrderItem tables
- [ ] Admin can add a new part with all fields
- [ ] Admin can edit and delete parts
- [ ] Parts list shows search + filters
- [ ] Seed creates sample categories and parts
- [ ] Build passes

**Verify:**

- `npx prisma migrate dev` succeeds
- Admin /admin/parts shows seeded parts

---

### Task 4: Parts Shop — Public Catalog

**Objective:** Build public-facing parts catalog with search, filtering, and detail pages.

**Dependencies:** Task 3
**Mapped Scenarios:** TS-002

**Files:**

- Create: `app/(public)/parts/page.tsx` — catalog grid with search, category filter, OEM toggle
- Create: `app/(public)/parts/[slug]/page.tsx` — part detail page
- Modify: `app/(public)/layout.tsx` — add "Запчасти" to public nav
- Modify: `app/middleware.ts` — add /parts to public paths

**Key Decisions:**

- Search by name, article number, compatible model
- Filters: category dropdown, OEM/aftermarket toggle, "В наличии" checkbox
- URL-based filters for shareability (`/parts?q=масло&category=oils&oem=true`)
- SSR for SEO — catalog pages are force-dynamic
- Part detail: photos, price, availability, compatible models list, "В корзину" button

**Definition of Done:**

- [ ] /parts shows catalog grid with search input
- [ ] Filtering by category, OEM, availability works
- [ ] /parts/[slug] renders full part detail
- [ ] Applicable models link to /models/[slug]
- [ ] Build passes

**Verify:**

- Navigate to /parts, search for a seeded part → result appears

---

### Task 5: Parts Shop — Cart + Checkout

**Objective:** Shopping cart with checkout flow for parts ordering.

**Dependencies:** Task 4
**Mapped Scenarios:** TS-002

**Files:**

- Create: `components/parts/CartProvider.tsx` — cart context with localStorage
- Create: `app/(public)/parts/cart/page.tsx` — cart page with items, totals, checkout form
- Create: `app/actions/part-orders.ts` — createPartOrder action
- Create: `app/(portal)/cabinet/orders/page.tsx` — order history in portal
- Modify: `app/(portal)/layout.tsx` — add "Заказы запчастей" to portal nav
- Modify: `app/(public)/parts/layout.tsx` — wrap with CartProvider

**Key Decisions:**

- Cart stored in localStorage (same pattern as booking data)
- Cart provider: addItem, removeItem, updateQuantity, clear, items[], total
- Checkout: contact form (name, phone, email, notes) + submit
- Order creates a PartOrder with PartOrderItems, decrements stock
- No online payment — order status starts as PENDING (pay at pickup or bank transfer)
- Notification sent to admin on new order

**Definition of Done:**

- [ ] "В корзину" on part detail adds to cart
- [ ] Cart page shows items with quantities and total
- [ ] Checkout creates order in DB
- [ ] Order appears in client portal /cabinet/orders
- [ ] Stock decremented on order
- [ ] Build passes

**Verify:**

- Add part → cart → checkout → order visible in portal

---

### Task 6: Parts CSV Import

**Objective:** Bulk import parts from CSV file in admin panel.

**Dependencies:** Task 3
**Mapped Scenarios:** None

**Files:**

- Create: `app/(admin)/admin/parts/import/page.tsx` — CSV import UI
- Create: `app/actions/parts-import.ts` — parse CSV, validate, upsert parts
- Create: `app/api/parts/import/route.ts` — file upload endpoint

**Key Decisions:**

- CSV format: article, name, description, price, quantity, isOEM (0/1), category, compatibleModels (comma-separated)
- Upload via form, parse server-side with built-in CSV parsing (no external lib)
- Upsert by article number — existing parts updated, new ones created
- Summary report: N created, N updated, N errors (with row numbers)

**Definition of Done:**

- [ ] Admin can upload CSV file
- [ ] Parts created/updated from CSV data
- [ ] Error report shows invalid rows
- [ ] Build passes

**Verify:**

- Upload sample CSV → parts appear in admin catalog

---

### Task 7: Rental Cars — Schema + Admin + Public Catalog

**Objective:** Create rental car module: DB models, admin fleet management, public catalog.

**Dependencies:** None
**Mapped Scenarios:** TS-003

**Files:**

- Modify: `prisma/schema.prisma` — add RentalCar, RentalBooking models
- Create: `app/(admin)/admin/rentals/page.tsx` — fleet management
- Create: `app/(admin)/admin/rentals/new/page.tsx` — add rental car
- Create: `app/actions/rentals.ts` — rental CRUD + booking management
- Create: `app/(public)/rentals/page.tsx` — public rental catalog
- Create: `app/(public)/rentals/[id]/page.tsx` — car detail + booking form
- Modify: `app/(admin)/layout.tsx` — add "Аренда" to admin nav
- Modify: `app/(public)/layout.tsx` — add "Аренда" to public nav
- Modify: `app/middleware.ts` — add /rentals to public paths
- Modify: `prisma/seed.ts` — seed sample rental cars

**Key Decisions:**

- RentalCar: id, model, year, dailyRate, photos (String[]), description, isAvailable, plate, color, mileage
- RentalBooking: id, carId, userId (optional), status (PENDING/CONFIRMED/ACTIVE/RETURNED/CANCELLED), startDate, endDate, totalCost, contactName, contactPhone, contactEmail, notes
- Public catalog shows available cars with daily rate
- Booking form: date range picker, contact info
- Admin: table of cars, table of bookings with status management

**Definition of Done:**

- [ ] Migration creates RentalCar, RentalBooking tables
- [ ] Admin can add/edit/delete rental cars
- [ ] /rentals shows available cars with prices
- [ ] /rentals/[id] shows car detail
- [ ] Seed creates sample rental cars
- [ ] Build passes

**Verify:**

- Admin adds car → visible on /rentals

---

### Task 8: Rental Car Booking + Portal

**Objective:** Complete rental booking flow and integrate with client portal.

**Dependencies:** Task 7
**Mapped Scenarios:** TS-003

**Files:**

- Modify: `app/(public)/rentals/[id]/page.tsx` — add booking form with date range
- Create: `app/(portal)/cabinet/rentals/page.tsx` — my rentals in portal
- Modify: `app/(portal)/layout.tsx` — add "Аренда" to portal nav
- Modify: `app/actions/rentals.ts` — createRentalBooking action
- Create: `app/(admin)/admin/rentals/bookings/page.tsx` — admin booking management

**Key Decisions:**

- Booking checks date availability (no overlap with existing bookings for same car)
- Uses same session-aware pattern as fixed booking action (Task 1)
- Total cost = daily rate × number of days
- Admin can change booking status (PENDING → CONFIRMED → ACTIVE → RETURNED)

**Definition of Done:**

- [ ] User can book a rental car with date range
- [ ] Booking checks availability (no double-booking)
- [ ] Booking visible in /cabinet/rentals
- [ ] Admin can manage rental bookings
- [ ] Build passes

**Verify:**

- Book car → visible in portal → admin sees booking

---

### Task 9: Admin Enhancements

**Objective:** Improve admin appointment management with inline status changes and full appointment list.

**Dependencies:** Task 1
**Mapped Scenarios:** None

**Files:**

- Modify: `app/(admin)/admin/page.tsx` — add upcoming appointments list with inline status buttons
- Create: `app/(admin)/admin/appointments/page.tsx` — full appointments list with filters
- Create: `components/admin/StatusChanger.tsx` — inline status change dropdown/buttons
- Modify: `app/(admin)/layout.tsx` — add "Записи" to admin nav

**Key Decisions:**

- Status changer: dropdown with all valid transitions, server action call on change
- Full appointments page: filterable by status, date range, client
- Dashboard shows upcoming 7 days (from Task 1) + quick status change buttons
- Reuse `APPOINTMENT_STATUS_LABELS` from utils

**Definition of Done:**

- [ ] Admin can change appointment status directly from dashboard and appointments list
- [ ] /admin/appointments shows all appointments with filters
- [ ] Status change triggers notification to client
- [ ] Build passes

**Verify:**

- Admin changes status → client sees update in portal tracking

---

### Task 10: SPlus Integration Stub

**Objective:** Create SPlus API client stub that logs booking handoffs. Actual API integration deferred.

**Dependencies:** Task 1
**Mapped Scenarios:** None

**Files:**

- Create: `lib/splus.ts` — SPlus client stub with typed interface
- Modify: `app/actions/booking.ts` — call SPlus stub after booking creation

**Key Decisions:**

- SPlus client: `pushAppointment(appointment)` — logs to console, returns success
- Interface matches expected SPlus API shape (appointment data, client data, vehicle data)
- When SPlus credentials are configured (env vars), makes real HTTP call
- Without credentials, mock mode (console log)

**Definition of Done:**

- [ ] SPlus client exported from lib/splus.ts
- [ ] Booking action calls splus.pushAppointment() after creation
- [ ] Console shows "[SPLUS] Push appointment: ..." in dev
- [ ] Build passes

**Verify:**

- Create booking → console shows SPlus push log

---

## Open Questions

None — all key decisions resolved.

## Deferred Ideas

- Marketplace XML feeds (Avito, Drom, Zzap, Юла) — Phase 3
- Online payment (ЮKassa) for parts and rentals
- Full SPlus bidirectional sync
- Google/VK OAuth
- 2FA
- Blog module
- Meilisearch for parts catalog (if basic search becomes slow)
