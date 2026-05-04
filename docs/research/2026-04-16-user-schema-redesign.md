# User Schema Redesign — Unified Person Model

Created: 2026-04-16
Author: aleksandr's.spiskov@gmail.com
Status: Design discussion (not yet a PRD)

## Summary

Geleoteka currently has four parallel "person/entity" tables — `User`, `Founder`, `Master`, `Supplier` — each modeling a different kind of person the business deals with. User input on 2026-04-16: this is over-engineering. None of these roles need their own login/permissions story; they're categorical labels on people. The cleaner design is **one `User` table for every person/entity**, with an auth-permission axis separate from an identity-kind axis.

This document proposes that redesign. It is a design proposal, not yet a /prd or /spec — the goal is to get the data model right before committing to migration tasks.

## Source research

This design is informed by four parallel research streams completed 2026-04-16:

- `/tmp/data-model-research-erpnext-odoo.md` — ERPNext keeps separate tables (Customer/Supplier/Employee/Shareholder); Odoo unifies under `res.partner` and pays a documented "kitchen-sink" cost.
- `/tmp/data-model-research-salesforce-dynamics.md` — Dynamics F&O Party + Roles model is the cleanest version of unification; recommended for B2B with frequent role overlap.
- `/tmp/data-model-research-ddd-bounded-contexts.md` — User-as-shared-kernel is the right scope for a single-team monolith; CRM-as-spine is an anti-pattern.
- `/tmp/data-model-research-automotive-vertical.md` — Workshop SaaS doesn't unify Customer + Supplier (no business reason in this vertical); none unifies Customer + Employee either.

The research disagreed on whether to unify. After discussion with the user, the unifying direction was chosen because:
1. The four current "person" tables are genuinely categorical labels (no role-specific login behavior expected).
2. Real-world overlap exists at Geleoteka's scale (founder buying parts, master being a customer, etc.).
3. Future module additions shouldn't require deciding "is this a new Person table or a new role?"

## The two axes

The current schema collapses two unrelated concerns into one `UserRole` enum (`CLIENT | MANAGER | ADMIN`). They should be separate:

**Auth permission axis** — what can this person do in the system?
- `NONE` — never logs in (suppliers, some founders, some masters who don't use the app)
- `CLIENT` — logs into the customer portal (`/cabinet/*`)
- `MANAGER` — admin panel access, can manage day-to-day operations
- `ADMIN` — full admin panel access including settings, founders, suppliers

**Identity kind axis** — what role(s) does this person play in the business?
- `CUSTOMER` — buys services, parts, rentals
- `MASTER` — works as a technician/mechanic
- `FOUNDER` — equity owner (cost-split participant)
- `SUPPLIER` — sells parts/services to the business

These are **multi-select**. A founder who also works as a master and buys parts for personal use is a single User with `isCustomer = true, isMaster = true, isFounder = true`.

Default values: `permissionRole = CLIENT, isCustomer = true` for self-registration through the public site. Admin creates a Master/Founder/Supplier by checking the appropriate flag.

## Proposed schema

```prisma
model User {
  id           String       @id @default(cuid())
  email        String?      @unique             // optional — a supplier with no contact email is fine
  phone        String?      @unique             // same
  name         String
  passwordHash String?                          // NULL for entities that never log in
  
  // Auth axis (single role — what UI the person sees if they log in)
  permissionRole UserPermissionRole @default(CLIENT)
  
  // Identity axis (multi-select — what business roles the person plays)
  isCustomer Boolean @default(true)
  isMaster   Boolean @default(false)
  isFounder  Boolean @default(false)
  isSupplier Boolean @default(false)
  
  // Optional 1:1 profile extensions (only present when relevant role flag is true)
  customerProfile CustomerProfile?
  masterProfile   MasterProfile?
  founderProfile  FounderProfile?
  supplierProfile SupplierProfile?
  
  // Existing relations (mostly unchanged)
  cars              Car[]
  appointments      Appointment[]
  loyaltyAccount    LoyaltyAccount?
  notifications     Notification[]
  passwordResets    PasswordReset[]
  partOrders        PartOrder[]
  rentalBookings    RentalBooking[]
  
  // New relations (work assignments for masters, contributions for founders, etc.)
  assignedAppointments Appointment[]   @relation("AssignedMaster")
  contributions        Contribution[]
  supplierOrders       SupplierOrder[]  // orders placed against this supplier
  
  // Self-referential — referrals (existing)
  referredBy   User?  @relation("Referral", fields: [referredById], references: [id])
  referredUsers User[] @relation("Referral")
  referredById String?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([email])
  @@index([phone])
  @@index([isCustomer])
  @@index([isMaster])
  @@index([isFounder])
  @@index([isSupplier])
}

enum UserPermissionRole {
  NONE      // never logs in
  CLIENT    // customer portal only
  MANAGER   // admin panel, no settings
  ADMIN     // full admin
}

// Profile extensions — only created when the corresponding flag is true.
// Keeps the User table clean of role-specific bloat.

model CustomerProfile {
  user        User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId      String  @id @unique
  
  // Customer-specific fields (currently sprawled across User + Cars + LoyaltyAccount)
  preferredMasterId String?
  blacklisted       Boolean @default(false)
  notes             String?
  // ...future customer attributes
}

model MasterProfile {
  user        User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId      String  @id @unique
  
  specialty       String?      // "G-Class engines", "AMG", etc.
  yearsExperience Int?
  bio             String?
  photoUrl        String?
  isActive        Boolean @default(true)
  sortOrder       Int     @default(0)
  // moved from existing Master + MasterProfile tables
}

model FounderProfile {
  user        User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId      String  @id @unique
  
  sharePercent Int     @default(25)
  isActive     Boolean @default(true)
  sortOrder    Int     @default(0)
  // moved from existing Founder table
}

model SupplierProfile {
  user        User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId      String  @id @unique
  
  contactName String?
  country     String?
  notes       String?
  isActive    Boolean @default(true)
  // moved from existing Supplier table
}
```

### What this collapses

| Current model | Becomes | Notes |
|---|---|---|
| `User` (auth + customer) | `User` + `CustomerProfile` | Role split: auth fields stay on User; customer-specific stuff moves to CustomerProfile |
| `Founder` | `User` (with `isFounder=true`) + `FounderProfile` | Existing 4 founder rows become 4 Users with FounderProfiles. Optional User.email/passwordHash. |
| `FounderContribution` | `Contribution` (renamed for generality) | FK to User instead of Founder. Same shape. |
| `Master` | `User` (with `isMaster=true`) + `MasterProfile` | Existing master rows become Users. Existing `MasterProfile` 1:1 collapses into the new `MasterProfile`. |
| `MasterProfile` | merged into the new `MasterProfile` | Same purpose, now keyed by userId not masterId. |
| `Supplier` | `User` (with `isSupplier=true`) + `SupplierProfile` | Suppliers become Users. They never log in (`permissionRole=NONE`, no passwordHash). |
| `SupplierOrder.supplierId` | `SupplierOrder.userId` | FK target changes. Same row count, same data. |

### What stays unchanged

- `Car` (customer's cars), `RentalCar` (fleet) — orthogonal to user redesign
- `Appointment`, `AppointmentService`, `Estimate`, `EstimateItem` — link to userId, no change
- `LoyaltyAccount`, `LoyaltyTransaction` — link to userId, no change
- `Notification` — link to userId, no change
- `Part`, `PartCategory`, `PartOrder`, `PartOrderItem` — no person changes
- `RentalBooking` — links to userId, no change
- `CMSBlock`, `BlogPost`, `Vacancy`, `PasswordReset` — no person changes

## Implications and risks

### Wins

1. **Single source of truth for "people in the system."** A founder buying parts is one User row, not a duplicated User + Founder pair.
2. **Future role additions are flag additions, not new tables.** If you want a "Partner" role (independent referral agent who gets a kickback), add `isPartner` + optional `PartnerProfile`. No schema upheaval.
3. **Cross-role reporting becomes natural.** "Show me everyone who's both a customer and a master" is `WHERE isCustomer = true AND isMaster = true`.
4. **Permissions decouple from identity.** A founder who's NOT an admin (e.g. silent partner) gets `isFounder=true, permissionRole=NONE` — currently impossible.
5. **The User table stays small.** Auth fields + the 4 boolean flags + name. All role-specific data lives in profiles.

### Costs

1. **Migration is real work.** ~5 tables collapsing into User + 4 profile tables. Foreign keys across the schema rewire (Founder.id → User.id, Master.id → User.id, Supplier.id → User.id, FounderContribution.founderId → Contribution.userId, SupplierOrder.supplierId → SupplierOrder.userId, etc.). Data preservation is mandatory (existing seeded founders, suppliers, master).
2. **`User.email` becomes nullable** because suppliers might not have one. Existing `@unique` constraint with NULL is fine in Postgres (multiple NULLs allowed) but every code path that assumes email is required becomes wrong (registration, login, password reset). Most won't run for `permissionRole=NONE` users so it's manageable but needs auditing.
3. **`User.passwordHash` becomes nullable.** Login code paths must reject login attempts for users with NULL passwordHash. Currently `passwordHash` is unconditionally compared — needs a guard.
4. **Querying "all founders" changes.** Today: `db.founder.findMany()`. Tomorrow: `db.user.findMany({ where: { isFounder: true }, include: { founderProfile: true } })`. More verbose. Mitigated by writing a small helper: `getFounders()`.
5. **Risk of role explosion.** If someone adds `isPartner`, `isVendor`, `isContractor`, `isAffiliate` over time, the boolean flags multiply. Recommend: cap at 5-6 identity kinds; if you need more, switch to a `userKinds: Set<UserIdentityKind>` join table at that point.

### Risks specifically called out by research

- **Odoo's res.partner kitchen-sink** — if we let `User` grow to 80+ fields by adding role-specific stuff directly to it, we'll repeat that failure. Mitigation: ALL role-specific data goes in profile tables, never on User itself. The User table should never grow past ~10 columns.
- **"User is auth, not a person"** — the research warned against this conflation. We're explicitly accepting the conflation because the operational benefit (no parallel person tables) outweighs the theoretical purity (auth-vs-CRM separation). Document this trade-off so future maintainers understand the design choice.
- **"Triple-identity problem"** (Odoo) — when a User row is auto-created by registration vs admin-created for a non-logging-in person, the two flows must converge to the same shape. Avoid creating "ghost" User rows that desync.

## Open questions

These need answers before this becomes a PRD:

### Q1: What happens to existing data during migration?

The 4 existing Founder rows, 1 Supplier row, and N existing Master rows (need to count) must migrate to User rows. Plan options:

- **(a) Migrate in place** — write a Prisma migration that creates User rows for each existing Founder/Master/Supplier, populates the new profile tables, rewires foreign keys. Existing IDs change (Founder.id was a CUID; the new User.id is a different CUID). External references (if any) break.
- **(b) Reuse IDs** — set `User.id = Founder.id` so existing references keep working without rewiring. Cleaner migration, but only works if no User row currently exists with that ID (collision check needed).
- **(c) Phased** — add the new tables alongside the old, dual-write for a period, eventually drop the old tables. Safest for production data but more complex.

### Q2: How do we handle `User.email` and `User.phone` being nullable?

Today both are `@unique` and required. Suppliers might have email but no phone, or vice versa. Founders are real people who DO have email. Masters typically have both. The right rule:

- email/phone optional at schema level
- BUT enforce "at least one contact method" as application-level invariant for any User the business interacts with (i.e. not just login users)
- Login code paths must reject NULL email/passwordHash explicitly

### Q3: Do we add `permissionRole = NONE` or model it as `passwordHash = NULL`?

Two ways to express "this user can't log in":
- (a) `permissionRole = NONE` enum value
- (b) `passwordHash IS NULL`

Option (a) is more explicit and lets you have "could log in but isn't allowed" (e.g. deactivated employee with passwordHash still set). Option (b) is more compact. Recommendation: (a) — explicit beats implicit, and `passwordHash IS NULL` is an implementation detail of "no auth credentials yet."

### Q4: Should we extend the redesign to also fix Vehicle (merge Car + RentalCar)?

Industry research strongly recommended ONE Vehicle table with `ownershipType` enum. This is orthogonal to the User redesign — they could be one PRD or two. Recommendation: separate PRDs. Doing both at once balloons risk.

### Q5: What about the Appointment + Estimate → RepairOrder + JobLine pattern?

Same answer: orthogonal, separate PRD if you want it. The User redesign can ship without it.

## Proposed sequencing

If you accept this design:

1. **Now: confirm the design** (this doc) and answer Q1-Q3.
2. **Then: write a User-redesign PRD** that captures the migration plan (data preservation, FK rewiring, code path updates).
3. **Then: /spec the PRD** to produce a step-by-step implementation plan.
4. **Then: implement** in a single coordinated migration (this is one of those changes that's hard to do incrementally — schema changes need to ship together).
5. **Defer**: Vehicle merge (separate PRD), RepairOrder/JobLine (separate PRD), the original module-boundaries refactor (now grounded in the new schema).

## Sources

- `/tmp/data-model-research-erpnext-odoo.md`
- `/tmp/data-model-research-salesforce-dynamics.md`
- `/tmp/data-model-research-ddd-bounded-contexts.md`
- `/tmp/data-model-research-automotive-vertical.md`
