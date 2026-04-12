# Admin Capabilities & Suppliers Module — Implementation Plan

Created: 2026-04-12
Status: COMPLETE
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Add rental car editing, introduce Suppliers/Deliveries module with 4-way founder **cost-sharing** (each founder owes 25% of every supplier order), configurable founders table, enhance appointments admin view.

**Architecture:** Extends existing admin patterns. New Prisma models for Founder, Supplier, SupplierOrder, SupplierOrderItem, FounderContribution (tracks each founder's share per order + paid status). New admin routes under `/admin/suppliers` and `/admin/founders`. Rental edit page follows the parts edit pattern.

**Tech Stack:** Same as existing — Next.js 16, PostgreSQL, Prisma 6, Tailwind, Server Actions.

## Scope

### In Scope

1. **Rental car editing** — `/admin/rentals/[id]` edit page with full form (model, specs, features, photos, price, availability)
2. **Founders management** — CRUD for Founder records (name, share %, contact). Default 4 founders at 25% each
3. **Suppliers management** — CRUD for Supplier records (name, contact, country, notes)
4. **Supplier orders module** — full tracking:
   - Supplier, order date, items (linked to Part or free-text), quantities, unit cost
   - Shipping cost, tracking number, ETA, received date
   - Status: DRAFT → ORDERED → IN_TRANSIT → CUSTOMS → RECEIVED → COMPLETED / CANCELLED
   - Total cost = items cost + shipping
5. **Founder cost sharing** — auto-generate on order creation:
   - Each order creates N FounderContribution records (one per active founder)
   - Each founder's share = founder.sharePercent × totalCost (what they OWE)
   - "Paid" flag with paid date — marks when founder has paid their share
6. **Profit tracking** — track sellingPrice and estimated profit per order for margin visibility (separate from cost split)
7. **Founder dashboard** — `/admin/founders/[id]` shows total contributions owed, paid, outstanding balance
7. **Appointments admin improvements** — add customer phone, car VIN, services list to list view
8. **Stub appointments cleanup** — add admin action to delete test/stub appointments

### Out of Scope
- Multi-currency (RUB only)
- Supplier-facing portal (suppliers don't log in)
- Payment integration for commission payouts
- PDF invoices for supplier orders
- Appointment edit from admin (status change already works)

## Approach

**Chosen:** Extend existing admin patterns with new Prisma models and admin pages. Each founder gets auto-generated commission rows on supplier order creation.

**Why:** Follows proven patterns (parts CRUD, admin pages). Commission split is deterministic and easy to audit.

**Alternatives considered:**
- Single "finances" table with JSON column — rejected: harder to query, no per-founder views
- Commission calculated on-the-fly from order.total — rejected: can't track paid status per founder

## Context for Implementer

### Patterns to Follow

- **Prisma models** in `prisma/schema.prisma` — new enums + models at end of file
- **Server Actions** in `app/actions/*.ts` — kebab-case filenames, `"use server"` directive
- **Admin pages** under `app/(admin)/admin/` — dynamic, `getSession()` + redirect auth
- **Part edit page** (`app/(admin)/admin/parts/[id]/page.tsx`) — pattern for rental edit
- **Part form** (`components/admin/PartForm.tsx`, `PartEditForm.tsx`) — client component with `useActionState`
- **Admin nav** (`app/(admin)/layout.tsx`) — add "Поставки" and "Учредители" links
- **Prisma client** import: `@/app/generated/prisma/client` (custom output path)

### New Models Schema

```prisma
enum SupplierOrderStatus {
  DRAFT
  ORDERED
  IN_TRANSIT
  CUSTOMS
  RECEIVED
  COMPLETED
  CANCELLED
}

model Founder {
  id              String   @id @default(cuid())
  name            String
  email           String?
  phone           String?
  sharePercent    Int      @default(25) // 25 = 25%
  isActive        Boolean  @default(true)
  sortOrder       Int      @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  contributions   FounderContribution[]
}

model Supplier {
  id          String   @id @default(cuid())
  name        String
  contactName String?
  email       String?
  phone       String?
  country     String?  // e.g. "Германия"
  notes       String?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  orders      SupplierOrder[]
}

model SupplierOrder {
  id               String              @id @default(cuid())
  supplierId       String
  orderNumber      String?             // external invoice # from supplier
  orderDate        DateTime
  status           SupplierOrderStatus @default(DRAFT)
  itemsCost        Int                 @default(0) // sum of all item unitCost × qty
  shippingCost     Int                 @default(0)
  customsCost      Int                 @default(0)
  totalCost        Int                 @default(0) // itemsCost + shipping + customs (what founders split)
  sellingPrice     Int                 @default(0) // expected total revenue from selling these parts
  estimatedProfit  Int                 @default(0) // sellingPrice - totalCost (for margin visibility)
  trackingNumber   String?
  estimatedArrival DateTime?
  receivedAt       DateTime?
  notes            String?
  createdAt        DateTime            @default(now())
  updatedAt        DateTime            @updatedAt

  supplier         Supplier              @relation(fields: [supplierId], references: [id])
  items            SupplierOrderItem[]
  contributions    FounderContribution[]

  @@index([supplierId])
  @@index([status])
}

enum SupplierOrderItemType {
  PART       // tracked inventory item (linked to Part)
  CUSTOM     // custom parts or equipment (not in catalog)
  FEE        // bank commission, crypto network fee, currency conversion, etc.
  SERVICE    // one-off service cost (e.g., courier)
}

model SupplierOrderItem {
  id          String                @id @default(cuid())
  orderId     String
  type        SupplierOrderItemType @default(PART)
  partId      String?               // set only when type = PART
  description String                // free text even if partId set, for clarity
  quantity    Int                   @default(1)
  unitCost    Int                   // in rubles
  totalCost   Int                   // unitCost × quantity

  order       SupplierOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  part        Part?         @relation(fields: [partId], references: [id], onDelete: SetNull)

  @@index([orderId])
  @@index([partId])
}

model FounderContribution {
  id           String    @id @default(cuid())
  orderId      String
  founderId    String
  amount       Int       // what this founder OWES for this order
  sharePercent Int       // snapshot of founder % at time of contribution
  isPaid       Boolean   @default(false)
  paidAt       DateTime?
  notes        String?
  createdAt    DateTime  @default(now())

  order        SupplierOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  founder      Founder       @relation(fields: [founderId], references: [id], onDelete: Cascade)

  @@index([orderId])
  @@index([founderId])
  @@index([isPaid])
}
```

### Cost Split Calculation

On supplier order save:
1. Compute `itemsCost = Σ(item.unitCost × item.quantity)`
2. Compute `totalCost = itemsCost + shippingCost + customsCost` (what founders split)
3. Compute `estimatedProfit = sellingPrice - totalCost` (margin visibility, not distributed)
4. For each active Founder, create `FounderContribution`:
   - `amount = Math.floor(totalCost × founder.sharePercent / 100)` for N-1 founders
   - Last founder gets: `totalCost - Σ(others)` — ensures exact sum
   - `sharePercent = founder.sharePercent` (snapshot)
5. If totalCost changes on edit → delete existing contributions (only unpaid ones preserved), recreate for unpaid

### Part Edit Reference

See `app/(admin)/admin/parts/[id]/page.tsx` + `components/admin/PartEditForm.tsx` for the pattern: fetch record, serialize for client, pass to form. Form uses `useActionState` with a bound action.

## Runtime Environment
- **Dev:** `npm run dev` (port 443, HTTPS)
- **DB:** PostgreSQL `geleoteka` on localhost:5432
- **Deploy:** Railway auto-deploy from `main`

## Assumptions
- 4 founders, default 25% each — configurable via `/admin/founders`
- Founders split TOTAL COST (what the business spends), not profit
- `sellingPrice` is tracked for margin visibility only — not distributed to founders
- Items have 4 types: PART (catalog link), CUSTOM (free-text), FEE (bank/crypto/SWIFT fees), SERVICE (courier etc.)
- All item types contribute to totalCost split among founders
- Currency is RUB only
- Appointments "stub" appearance is visual repetition (same customer name in seed/test data), not a real bug — improving the list view will make them more distinguishable

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Cost split rounding errors (sum ≠ totalCost) | Medium | Low | Last founder gets remainder after flooring others |
| Founder % total ≠ 100% | Medium | Medium | Validate on save: warn if active founders don't sum to 100 |
| Editing supplier order re-distributes unpaid contributions | Medium | Medium | Preserve paid contributions; recalculate unpaid ones only |
| Supplier order delete orphans contributions | Low | Low | Cascade delete via Prisma onDelete |

## Goal Verification

### Truths

1. Admin can edit existing rental car via `/admin/rentals/[id]`
2. Admin can CRUD founders at `/admin/founders`
3. Admin can CRUD suppliers at `/admin/suppliers`
4. Admin can create supplier order with PART/CUSTOM/FEE/SERVICE items and see auto-generated founder contributions summing to totalCost
5. Founder dashboard shows total owed, paid, outstanding balance
6. Admin appointments list shows customer phone, car, services inline
7. Active founder percentages summing to 100% is validated

### Artifacts

- `prisma/migrations/YYYYMMDD_add_suppliers_founders/migration.sql`
- `app/(admin)/admin/rentals/[id]/page.tsx` — rental edit
- `app/(admin)/admin/founders/page.tsx` + `[id]`, `new`
- `app/(admin)/admin/suppliers/page.tsx` + `[id]`, `new`
- `app/(admin)/admin/suppliers/orders/page.tsx` + `[id]`, `new`
- `app/actions/rentals.ts` — add `updateRentalCar`
- `app/actions/founders.ts` — CRUD
- `app/actions/suppliers.ts` — CRUD
- `app/actions/supplier-orders.ts` — CRUD + commission generation

## Progress Tracking

- [x] Task 1: Prisma schema — Founder, Supplier, SupplierOrder, SupplierOrderItem, FounderContribution
- [x] Task 2: Rental car edit page + updateRentalCar action
- [x] Task 3: Founders CRUD pages + action
- [x] Task 4: Suppliers CRUD pages + action
- [x] Task 5: Supplier orders CRUD + commission auto-generation
- [x] Task 6: Founder dashboard (earnings, paid/unpaid)
- [x] Task 7: Admin appointments list enhancements (phone, VIN, services inline)
- [x] Task 8: Seed data for 4 founders
- [x] Task 9: Admin nav update + navigation wiring

**Total Tasks:** 9 | **Completed:** 9 | **Remaining:** 0

## Implementation Tasks

---

### Task 1: Prisma Schema — Suppliers & Founders Models

**Objective:** Add Founder, Supplier, SupplierOrder, SupplierOrderItem, FounderContribution models. Migrate.

**Dependencies:** None

**Files:**
- Modify: `prisma/schema.prisma` — add new enum + 5 models
- Modify: `prisma/schema.prisma` — add `supplierOrderItems` relation to Part model

**Key Decisions:**
- All amounts in rubles (Int)
- Status enum: DRAFT, ORDERED, IN_TRANSIT, CUSTOMS, RECEIVED, COMPLETED, CANCELLED
- Cascade delete: SupplierOrderItem, FounderContribution from SupplierOrder
- SetNull on Part delete to preserve order history

**Definition of Done:**
- [ ] `npx prisma migrate dev --name add_suppliers_founders` succeeds
- [ ] Prisma client regenerates with new models
- [ ] Build passes

**Verify:**
- `npx prisma validate`

---

### Task 2: Rental Car Edit Page

**Objective:** Allow admin to edit rental car after creation — all fields (model, specs, features, price, availability).

**Dependencies:** None

**Files:**
- Create: `app/(admin)/admin/rentals/[id]/page.tsx` — edit page shell
- Create: `components/admin/RentalEditForm.tsx` — client form
- Modify: `app/actions/rentals.ts` — add `updateRentalCar` action
- Modify: `app/(admin)/admin/rentals/page.tsx` — make cards clickable to edit

**Key Decisions:**
- Form fields: model, year, dailyRate, engine, horsepower, transmission, features (textarea, one per line), seats, color, mileage, plate, description, isAvailable
- Features textarea converted to `String[]` on save
- Follow `RentalBookingForm.tsx` + `PartEditForm.tsx` pattern
- Cards wrapped in `<Link>` to `/admin/rentals/[id]`

**Definition of Done:**
- [ ] Admin sees edit form at `/admin/rentals/[id]`
- [ ] Changes save correctly
- [ ] Cards on `/admin/rentals` link to edit page
- [ ] Build passes

---

### Task 3: Founders CRUD

**Objective:** Admin pages for managing founders — list, create, edit.

**Dependencies:** Task 1

**Files:**
- Create: `app/(admin)/admin/founders/page.tsx` — list + share % summary
- Create: `app/(admin)/admin/founders/new/page.tsx`
- Create: `app/(admin)/admin/founders/[id]/page.tsx` — edit + dashboard
- Create: `components/admin/FounderForm.tsx`
- Create: `components/admin/FounderEditForm.tsx`
- Create: `app/actions/founders.ts` — createFounder, updateFounder, deleteFounder

**Key Decisions:**
- Fields: name, email (optional), phone (optional), sharePercent (Int 0-100), isActive, sortOrder
- List shows: name, share %, total earned (sum of all FounderContribution.amount), is active
- Top of list: sum of active founder % — warning if ≠ 100
- Soft delete via `isActive = false` (preserve commission history)

**Definition of Done:**
- [ ] CRUD works end-to-end
- [ ] Percentage sum validation shown
- [ ] Build passes

---

### Task 4: Suppliers CRUD

**Objective:** Admin pages for managing suppliers.

**Dependencies:** Task 1

**Files:**
- Create: `app/(admin)/admin/suppliers/page.tsx` — list
- Create: `app/(admin)/admin/suppliers/new/page.tsx`
- Create: `app/(admin)/admin/suppliers/[id]/page.tsx` — edit + order history
- Create: `components/admin/SupplierForm.tsx`
- Create: `components/admin/SupplierEditForm.tsx`
- Create: `app/actions/suppliers.ts`

**Key Decisions:**
- Fields: name, contactName, email, phone, country, notes, isActive
- List shows: name, country, total orders count, total amount
- Supplier detail shows recent orders (link to `/admin/suppliers/orders/[id]`)

**Definition of Done:**
- [ ] CRUD works end-to-end
- [ ] Supplier detail shows order history
- [ ] Build passes

---

### Task 5: Supplier Orders + Commission Auto-Generation

**Objective:** Track supplier orders with items, costs, shipping, and auto-generate commission distributions.

**Dependencies:** Tasks 3, 4

**Files:**
- Create: `app/(admin)/admin/suppliers/orders/page.tsx` — all orders list
- Create: `app/(admin)/admin/suppliers/orders/new/page.tsx` — create form
- Create: `app/(admin)/admin/suppliers/orders/[id]/page.tsx` — detail + commission view
- Create: `components/admin/SupplierOrderForm.tsx` — dynamic item rows
- Create: `app/actions/supplier-orders.ts` — createSupplierOrder, updateSupplierOrder, updateOrderStatus, markCommissionPaid

**Key Decisions:**
- Order form: supplier selector, order date, dynamic item rows, shipping cost, customs cost, selling price, tracking number, ETA, notes
- **Item types** (dropdown per row):
  - `PART` — select from existing Part catalog (autofills description)
  - `CUSTOM` — free-text description (off-catalog parts, tools, equipment)
  - `FEE` — bank commission, crypto network fee, SWIFT fee, currency conversion
  - `SERVICE` — courier, one-off service
- On save: compute itemsCost = Σ(items), totalCost = itemsCost + shipping + customs, estimatedProfit = sellingPrice - totalCost
- All item types count toward totalCost (fees are part of what founders split)
- Generate FounderContribution rows for ALL active founders
- Rounding: floor all except last founder (gets remainder so sum matches exactly)
- Status dropdown on detail page (reuse StatusChanger pattern)
- Mark founder contribution paid: single button per founder row on order detail
- Delete order cascades to items + contributions

**Definition of Done:**
- [ ] Admin creates supplier order → commission rows auto-generated
- [ ] Sum of commissions = profit (exact, rounding-safe)
- [ ] Status changes persist
- [ ] Commission paid flag toggles
- [ ] Build passes

---

### Task 6: Founder Dashboard

**Objective:** Show per-founder contributions — total owed, paid, outstanding balance, transaction history.

**Dependencies:** Task 3, Task 5

**Files:**
- Modify: `app/(admin)/admin/founders/[id]/page.tsx` — add dashboard below edit form

**Key Decisions:**
- Stats: total contributions owed (all time), paid, outstanding
- Table: order date, supplier, order total, my share, order status, paid?
- Link each row to `/admin/suppliers/orders/[orderId]`

**Definition of Done:**
- [ ] Dashboard shows numbers correctly
- [ ] Rows link to order details
- [ ] Build passes

---

### Task 7: Admin Appointments Enhancements

**Objective:** Show more detail per appointment in admin list view (phone, VIN, services, notes) + add delete action.

**Dependencies:** None

**Files:**
- Modify: `app/(admin)/admin/appointments/page.tsx` — expand card with more fields, add delete button
- Create: `components/admin/DeleteAppointmentButton.tsx` — confirmation + action
- Modify: `app/actions/admin.ts` — add `deleteAppointment` action

**Key Decisions:**
- Show: customer name + phone, car model + VIN (if present), all services with names, date/time, master, notes, status
- Delete button with JS confirm dialog
- Admin-only (MANAGER cannot delete — preserve audit trail)

**Definition of Done:**
- [ ] Appointments show all fields inline
- [ ] Admin (not manager) can delete appointment
- [ ] Build passes

---

### Task 8: Seed Default Founders

**Objective:** Seed 4 founders at 25% each.

**Dependencies:** Task 1

**Files:**
- Modify: `prisma/seed.ts` — add founder block

**Key Decisions:**
- Names: "Учредитель 1", "Учредитель 2", "Учредитель 3", "Учредитель 4"
- All 25%, all active, sortOrder 1-4
- Upsert by name to stay idempotent

**Definition of Done:**
- [ ] `npx prisma db seed` populates 4 founders
- [ ] Total share = 100%

---

### Task 9: Admin Nav + Wiring

**Objective:** Add "Поставки", "Учредители" to admin nav. Wire supplier orders to suppliers section.

**Dependencies:** All prior tasks

**Files:**
- Modify: `app/(admin)/layout.tsx` — add nav items

**Key Decisions:**
- Order: ... Сметы, Запчасти, **Поставки**, Заказы, Аренда, **Учредители**, Контент, Команда
- "Поставки" links to `/admin/suppliers` (list page)

**Definition of Done:**
- [ ] Both links appear in sidebar
- [ ] Clicks navigate correctly
- [ ] Build passes

---

## E2E Test Scenarios

### TS-001: Edit Rental Car
**Priority:** Critical
**Preconditions:** Logged in as admin, rental car exists
**Mapped Tasks:** Task 2

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to /admin/rentals | Fleet list shows cars |
| 2 | Click a car card | Edit page opens with pre-filled form |
| 3 | Change daily rate and features | Fields accept input |
| 4 | Click Save | Redirected to /admin/rentals, changes persist |

### TS-002: Create Supplier Order with Founder Cost Split
**Priority:** Critical
**Preconditions:** 4 active founders @ 25%, 1+ supplier exists
**Mapped Tasks:** Task 5

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to /admin/suppliers/orders/new | Form shown |
| 2 | Select supplier, add 2 PART items (total 80000), 1 FEE item "SWIFT" (5000), set shipping 10000, customs 5000 | Totals calc: itemsCost 85000, totalCost 100000 |
| 3 | Click Save | Order detail opens |
| 4 | View contributions | 4 founder rows, each = 25000₽ owed, sum = 100000 |
| 5 | Click "Mark paid" on founder 1 | Row shows paid status, total paid = 25000 |

### TS-003: Founder Dashboard
**Priority:** High
**Preconditions:** Founder has 2+ contributions from orders
**Mapped Tasks:** Task 6

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to /admin/founders | Founders list with total owed and outstanding |
| 2 | Click a founder | Dashboard shows total contributed, paid, outstanding balance |
| 3 | Click a contribution row | Navigates to source supplier order |

## Open Questions

None — all key decisions resolved in Q&A.
