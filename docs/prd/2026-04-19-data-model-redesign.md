# Geleoteka Data Model Redesign

Created: 2026-04-19
Author: aleksandr's.spiskov@gmail.com
Category: Infrastructure
Status: Final
Research: Deep (4 parallel research agents — ERPNext/Odoo, Salesforce/Dynamics, DDD bounded contexts, automotive workshop vertical; findings at `docs/research/2026-04-16-research-*.md`)

## Problem Statement

Geleoteka's schema grew organically across 4 development sessions without an explicit data-modeling principle. Three structural problems exist:

1. **Four parallel "person" tables** (User, Founder, Master, Supplier) model the same real-world concept — a person or entity the business transacts with. Founders who buy parts, masters who are also customers, and suppliers who bring their cars for service create duplicate records. The tables have no cross-referencing mechanism. Each new "kind of person" requires a new table, new server actions, new admin pages.

2. **Two parallel "vehicle" tables** (Car for customer vehicles, RentalCar for the fleet). Both track VIN, mileage, color, year, model — but with different column names and no shared code. When a rental car needs servicing (oil change between rentals), it can't be referenced by the service module because `Appointment.carId` points at `Car`, not `RentalCar`. Industry norm (validated by all dealer-loaner-fleet vendors surveyed) is one Vehicle table.

3. **Appointment + Estimate as separate models** disconnects the core service workflow. A customer gets an estimate, then books an appointment — but in the schema, `Estimate` and `Appointment` are 1:1 linked by a FK with no shared lifecycle. The industry standard (Tekmetric, Shop-Ware, Shopmonkey, Mitchell1) is a unified RepairOrder with JobLine children, where each JobLine carries its own approval status and the estimate is just the first state of the RO.

**Why now:** the schema has 27 models, ~50 real users, 4 founders, 1 supplier, 3 rental cars, and ~10 test appointments. All existing data is test/mock and can be dropped. Fixing the data model now — before real customers accumulate — is 100x cheaper than retrofitting later. The competitive analysis (`docs/research/2026-04-13-rental-competitive-analysis.md`) and module-boundaries design work identified these issues as prerequisites for professional-grade modules.

## Core User Flows

### Flow 1: Admin creates a supplier (unified User)

1. Admin navigates to `/admin/suppliers/new`
2. Fills name, email, phone, contact person, country, notes
3. System creates a User row with `permissionRole = NONE`, `isSupplier = true`, plus a SupplierProfile row
4. The same person later brings their G-Class for service — admin searches by name/phone, finds the existing User, checks `isCustomer = true`
5. Now one User row appears in both the Suppliers list and the Customers list — no duplicate record

### Flow 2: Admin creates a repair order (RepairOrder + JobLine)

1. Customer books online or admin creates manually → a RepairOrder is created (status = ESTIMATE)
2. Admin adds JobLines: "Brake pad replacement" (labor + parts), "Oil change" (labor + parts), "Windshield chip" (sublet)
3. Each JobLine has status = PROPOSED
4. Customer reviews (via portal or SMS link), approves brake pads and oil change, declines windshield
5. Approved JobLines → status = APPROVED; declined → DECLINED (preserved for history)
6. Master works on the approved jobs → status = IN_PROGRESS → DONE
7. Admin invoices → RepairOrder.status = INVOICED → immutable Invoice snapshot created
8. On the next visit, the customer sees "Recommended: windshield chip repair (deferred from last visit)"

### Flow 3: Rental car gets serviced (unified Vehicle)

1. G-Class G 500 exists as a Vehicle with `ownershipType = RENTAL`
2. Between rentals, the shop does an oil change — admin creates a RepairOrder for this Vehicle
3. Same RepairOrder flow as customer vehicles — same JobLine pattern, same parts tracking
4. The Vehicle's service history shows both: rental-booking gaps AND maintenance ROs
5. No code duplication between "customer car service" and "fleet car service"

### Flow 4: Founder who is also a customer

1. Founder "Учредитель 1" exists as User with `isFounder = true, permissionRole = ADMIN`
2. He buys brake pads from the parts shop → same User row appears on the PartOrder
3. He brings his personal G-Class for service → same User row on the RepairOrder
4. Admin views his profile → sees: Founder (25% equity, contribution history), Customer (order history, service history), Admin (full panel access). One person, one record.

## Scope

### In Scope

**Migration 1 — User unification:**
- New `UserPermissionRole` enum: NONE, CLIENT, MANAGER, ADMIN
- 4 identity boolean flags on User: isCustomer, isMaster, isFounder, isSupplier
- 4 new 1:1 profile tables: CustomerProfile, MasterProfile, FounderProfile, SupplierProfile
- Drop tables: Founder, Master, MasterProfile (old), Supplier
- Rename FounderContribution → Contribution (FK: founderId → userId)
- Rewire SupplierOrder.supplierId → SupplierOrder.supplierId (renamed to userId)
- Rewire all Appointment.masterId references → RepairOrder.masterUserId (covered by Migration 3)
- User.email and User.phone stay required — non-login entities use placeholder values
- User.passwordHash becomes optional (nullable) — NONE-permissionRole users have no password
- Re-seed: 4 founders as Users with FounderProfile, masters as Users with MasterProfile, supplier as User with SupplierProfile
- Update all admin pages: `/admin/founders/*`, `/admin/suppliers/*`, `/admin/team/*`
- Update all server actions: `founders.ts`, `suppliers.ts`, `supplier-orders.ts`, `admin.ts`
- Update auth code: login rejects `permissionRole = NONE`, registration defaults to `permissionRole = CLIENT, isCustomer = true`

**Migration 2 — Vehicle merge:**
- New Vehicle table absorbing fields from both Car and RentalCar
- `ownershipType` enum: CUSTOMER, RENTAL, LOANER
- Nullable `ownerUserId` (required when ownershipType = CUSTOMER, null for fleet)
- Fleet-specific fields: `dailyRate`, `isAvailable`, `fleet_status` — nullable, only populated for RENTAL/LOANER
- Customer-specific fields: `plate`, `vin` — shared across both types
- Spec fields from RentalCar: `engine`, `horsepower`, `transmission`, `features[]`, `seats` — useful for customer cars too (show on service history)
- Drop tables: Car, RentalCar
- Rewire: RentalBooking.carId → RentalBooking.vehicleId
- Rewire: all code referencing `db.car.*` → `db.vehicle.*` and `db.rentalCar.*` → `db.vehicle.*`
- Re-seed: rental fleet as Vehicle rows with ownershipType = RENTAL
- Update pages: `/rentals/*`, `/admin/rentals/*`, `/cabinet/cars/*`, booking wizard VehicleInput

**Migration 3 — RepairOrder + JobLine:**
- New RepairOrder model replacing Appointment, with full status lifecycle:
  `ESTIMATE → APPROVED → IN_PROGRESS → AWAITING_PARTS → QC → READY → INVOICED → PAID → CLOSED → CANCELLED`
- New JobLine model (child of RepairOrder) with per-job status:
  `PROPOSED → APPROVED → DECLINED → DEFERRED → IN_PROGRESS → DONE`
- New LaborLine model (child of JobLine): description, bookHours, actualHours, rate, technicianUserId, total
- New PartLine model (child of JobLine): partId (optional — allows free-text parts), description, qty, unitCost, unitPrice, supplierId (optional), status (NEEDED/ORDERED/RECEIVED/INSTALLED)
- RepairOrder references: userId (customer), vehicleId, masterUserId (assigned technician), mileageIn, mileageOut
- Drop tables: Appointment, AppointmentService, Estimate, EstimateItem
- Rewire: LoyaltyTransaction.appointmentId → LoyaltyTransaction.repairOrderId
- Rewire: Notification metadata references
- Re-seed: sample RepairOrders with JobLines
- Update all admin pages: `/admin/appointments/*` → `/admin/repair-orders/*`, `/admin/calendar/*`, `/admin/estimates/*` (merged into RO flow)
- Update booking wizard: creates a RepairOrder (status = ESTIMATE) instead of an Appointment
- Update portal: `/cabinet/history/*`, `/cabinet/tracking/*`, `/cabinet/estimates/*` — all point at RepairOrder now
- Update server actions: `booking.ts`, `admin.ts`, `estimates.ts` → unified `repair-orders.ts`
- Update API routes: `/api/slots/*`, `/api/appointments/*` → reference new model

**Cross-cutting:**
- Full re-seed of `prisma/seed.ts` for the new schema
- Update `lib/utils.ts` status labels (AppointmentStatus → RepairOrderStatus, etc.)
- All existing test/mock data is dropped (user confirmed: "Drop old data — it's mock")
- Single Prisma migration that drops old tables + creates new ones
- Production deploy via Railway `preDeployCommand`

### Explicitly Out of Scope

- **Module boundaries / folder refactor** — depends on this schema being stable first. Separate effort.
- **Sidebar restructure** — depends on module boundaries. Separate effort.
- **Module enable/disable toggles** — separate PRD.
- **Parts inventory model** (InventoryItem, InventoryTransaction) — separate PRD when parts module grows.
- **Online payments / deposit holds** — separate rental-feature PRD.
- **Digital contracts / e-signature** — separate rental-feature PRD.
- **Damage management / check-in-out photos** — separate rental-feature PRD.
- **Invoice model** — the PRD establishes RepairOrder.status = INVOICED as the lifecycle step, but a full `Invoice` table (with immutable snapshot, payment tracking, tax calculation) is a separate PRD. For now, invoicing is a status change, not a data entity.
- **Multi-tenant / SaaS infrastructure** — future consideration, not this PRD.
- **Vehicle ownership history table** — industry recommends this for tracking previous owners, but it's not needed until Geleoteka has enough volume that cars change hands. Separate PRD.
- **PurchaseOrder model** (industry-standard name for what's currently SupplierOrder) — renaming is optional and low-priority; SupplierOrder is clear enough. Not in scope.

## Technical Context

- **Framework:** Next.js 16 App Router, React 19, TypeScript strict
- **Database:** PostgreSQL (local: `alex@localhost:5432/geleoteka`, prod: Railway Postgres via `metro.proxy.rlwy.net:55662`)
- **ORM:** Prisma 6 with custom output (`app/generated/prisma/client`)
- **Auth:** JWT in httpOnly cookies (`lib/auth.ts`). `getSession()` returns `{ id, email, phone, name, role }`. The `role` field currently returns UserRole enum — will need to return `permissionRole` after migration.
- **Server Actions:** all mutations via `"use server"` files in `app/actions/`
- **Deploy:** Railway auto-deploy from GitHub main. `preDeployCommand = ["npx prisma migrate deploy"]` in `railway.toml` — migrations run before traffic switches.
- **Current data is mock/test** — user confirmed all existing appointments, estimates, customers, cars are test data that can be dropped. Production DB has 4 real founders, 1 real supplier, 3 real rental cars, and ~10 test appointments.

### Files affected (high-level — /spec will do the exhaustive inventory)

**Schema:** `prisma/schema.prisma` — 13 models affected (drop 9, create 8, modify 4)
**Seed:** `prisma/seed.ts` — complete rewrite for new schema
**Auth:** `lib/auth.ts` — update `getSession()` return shape, login guard for NONE users
**Actions:** `app/actions/{admin,booking,cars,estimates,founders,rentals,supplier-orders,suppliers}.ts` — most will be rewritten or renamed
**Admin pages:** `app/(admin)/admin/{appointments,calendar,customers,estimates,founders,parts,rentals,suppliers,team}/*` — import path updates, model reference updates
**Public pages:** `app/(public)/{booking,rentals,services}/*` — model reference updates
**Portal pages:** `app/(portal)/cabinet/{cars,estimates,history,tracking,rentals}/*` — model reference updates
**Components:** `components/admin/*`, `components/booking/*`, `components/portal/*`, `components/rentals/*` — model reference updates
**API routes:** `app/api/{appointments,slots}/*` — model reference updates

## Key Decisions

| Decision | Choice | Why |
|---|---|---|
| Person model | One User table with boolean identity flags + 1:1 profile tables | User-chosen. Avoids 4 parallel person tables. Research showed ERPNext uses separate tables (defensible) and Odoo uses central table (kitchen-sink risk); we mitigate the kitchen-sink risk by putting all role-specific data in profile tables, not on User itself. |
| Permission vs identity | Two separate axes: `permissionRole` enum (auth) + `is*` booleans (identity) | A founder (identity) might be an admin (permission) or might not (silent partner). The two concepts are orthogonal. |
| Migration strategy for existing data | Drop all mock data, fresh seed | User confirmed existing data is mock/test. Eliminates migration complexity entirely — just drop old tables + create new ones. |
| Migration ID strategy | Fresh IDs + FK rewire | User chose this over reuse-IDs. New CUIDs for migrated entities; all FK references updated in migration SQL. |
| Email/phone nullable | Keep required, use placeholders for non-login entities | User chose this. Avoids schema-level nullable complexity. Placeholder values (e.g. `supplier-hans@placeholder.local`) clearly marked as non-real. |
| No-login users | Explicit `permissionRole = NONE` | User chose this. Clearer than implicit passwordHash=NULL. Login code rejects NONE before password check. |
| Vehicle merge | One Vehicle table with ownershipType enum | Industry standard per dealer-loaner-fleet vendors. All 5 surveyed systems use one vehicle table. |
| RepairOrder lifecycle | Estimate is a state, not a separate model | Industry standard per Tekmetric/Shop-Ware/Shopmonkey/Mitchell1. JobLine children carry per-job approval status. |
| Existing data treatment | Drop — it's mock | User confirmed. No preservation needed. Clean migration. |
| Invoice model | Deferred — status change only for now | Full Invoice table (immutable snapshot, payment tracking) is a follow-up PRD. RepairOrder.status = INVOICED is sufficient for v1. |
| Vehicle specs fields (engine, HP, etc.) | Shared across all vehicle types | Currently only on RentalCar. Useful for customer cars too (shop techs want to see engine spec on the work order). |
| Loyalty system | Keep LoyaltyAccount/LoyaltyTransaction, rewire appointmentId → repairOrderId | Loyalty module is functional and cross-cutting. Minimal change. |

## Research Findings

Deep research completed 2026-04-16 via 4 parallel agents. Full findings at:

- `docs/research/2026-04-16-research-erpnext-odoo.md` — ERPNext's "separate masters + Party facade in GL only" vs Odoo's "res.partner kitchen sink"
- `docs/research/2026-04-16-research-salesforce-dynamics.md` — Dynamics F&O Party + Roles model; Salesforce Account/Contact/Person Account evolution
- `docs/research/2026-04-16-research-ddd-bounded-contexts.md` — single-team monolith: stay simple, User is the only shared kernel needed, avoid event bus
- `docs/research/2026-04-16-research-automotive-vertical.md` — workshop SaaS convergence on RepairOrder + JobLine, one Vehicle table, Catalog + Inventory + free-text-on-RO for parts

**Key synthesis:** research streams disagreed on Person model (ERPNext/DDD: separate tables; Salesforce/Dynamics: Party table). User broke the tie: "Founder/Master/Supplier are just UI labels — proper user schema." The unified-User design with profile tables was the synthesis: avoids kitchen-sink (profile tables isolate role-specific data) while eliminating parallel tables (one record per real person).

## Target Schema (high-level — /spec will finalize exact Prisma definitions)

```
User
  ├── id, email, phone, name, passwordHash?
  ├── permissionRole: NONE | CLIENT | MANAGER | ADMIN
  ├── isCustomer, isMaster, isFounder, isSupplier (booleans)
  ├── CustomerProfile? → preferredMasterUserId, blacklisted, notes
  ├── MasterProfile?   → specialty, yearsExperience, bio, photoUrl, isActive, sortOrder
  ├── FounderProfile?  → sharePercent, isActive, sortOrder
  ├── SupplierProfile? → contactName, country, notes, isActive
  ├── vehicles[]       (ownership — customer cars)
  ├── repairOrders[]   (as customer)
  ├── assignedOrders[] (as master/technician)
  ├── contributions[]  (as founder)
  ├── supplierOrders[] (as supplier)
  ├── partOrders[], rentalBookings[], loyaltyAccount, notifications, ...
  └── createdAt, updatedAt

Vehicle
  ├── id, vin?, plate?, make, model, year, color?, mileage
  ├── ownershipType: CUSTOMER | RENTAL | LOANER
  ├── ownerUserId? (required for CUSTOMER, null for fleet)
  ├── engine?, horsepower?, transmission?, features[], seats
  ├── dailyRate?, isAvailable?, description?, photos[] (fleet-specific)
  ├── repairOrders[], rentalBookings[]
  └── createdAt, updatedAt

RepairOrder
  ├── id, roNumber (human-friendly sequential)
  ├── userId (customer), vehicleId, masterUserId? (assigned tech)
  ├── status: ESTIMATE | APPROVED | IN_PROGRESS | AWAITING_PARTS | QC | READY | INVOICED | PAID | CLOSED | CANCELLED
  ├── mileageIn?, mileageOut?
  ├── concern (customer's words), notes
  ├── subtotalLabor, subtotalParts, tax, discount, total
  ├── promisedAt?, completedAt?
  ├── jobLines[] → JobLine
  ├── loyaltyTransactions[]
  └── createdAt, updatedAt

JobLine
  ├── id, repairOrderId, sortOrder
  ├── description (the "job" name: "Brake pad replacement")
  ├── status: PROPOSED | APPROVED | DECLINED | DEFERRED | IN_PROGRESS | DONE
  ├── laborLines[] → LaborLine
  ├── partLines[]  → PartLine
  ├── laborTotal, partsTotal, total
  └── createdAt

LaborLine
  ├── id, jobLineId
  ├── description, bookHours, actualHours?, rate, total
  ├── technicianUserId?
  └── createdAt

PartLine
  ├── id, jobLineId
  ├── partId? (nullable — free-text for special-order/non-catalog parts)
  ├── description, qty, unitCost, unitPrice
  ├── supplierUserId? (who we're ordering from)
  ├── status: NEEDED | ORDERED | RECEIVED | INSTALLED
  └── createdAt

Contribution (renamed from FounderContribution)
  ├── id, orderId (SupplierOrder), userId (founder)
  ├── amount, sharePercent, isPaid, paidAt?, notes?
  └── createdAt

SupplierOrder (unchanged shape, supplierId → userId)
  ├── supplierId renamed to userId
  └── (all other fields unchanged)
```

**Models that stay unchanged:** Service, PartCategory, Part, PartOrder, PartOrderItem, LoyaltyAccount, LoyaltyTransaction (rewired FK), Notification (rewired metadata), CMSBlock, BlogPost, Vacancy, PasswordReset, RentalBooking (rewired FK).
