# Deal + Fulfillment Architecture

Created: 2026-05-10
Author: aleksandr.spiskov@gmail.com
Category: Architecture / Product
Status: Draft
Research: Standard

Supersedes: prior `service-vs-deal-ia-split` draft (the IA-split idea
was a UI band-aid; the real architectural fix is a unified commercial
model that this PRD specifies).

## Problem Statement

Geleoteka has three commercial flows that conceptually represent the
same thing — a customer commits to spend money with the workshop —
but the data model treats them as three unrelated aggregates:

| Flow | Today's root | Issues |
|---|---|---|
| Workshop service | `RepairOrder` | `status` enum mixes deal stages (ESTIMATE, APPROVED) with operations stages (IN_PROGRESS, READY, CLOSED). Money fields (subtotalLabor/Parts/total) live on the operations row. |
| Parts e-commerce | `PartOrder` | Independent commercial flow; no shared concept of "deal", "stage", or "owner". Cannot represent a parts purchase that's part of a service visit. |
| Rentals | `RentalBooking` | Same problem; `totalCost` lives on the booking row; no commercial pipeline view. |

Three downstream consequences:

1. **CRM is structurally weak.** Lifetime value across streams requires `UNION` over three tables. Pipeline kanban over open deals requires three parallel data sources. Communications and tasks have nowhere to attach a deal-level reference; they can only point at a customer or one specific operations row.
2. **Cross-stream commerce is inexpressible.** A customer doing a service visit who also takes a part home (oil + filter) is two database rows the system cannot bundle, discount, or invoice as one transaction. Bundles, package deals, "free part with service" promotions — all hard.
3. **Module boundaries are violated.** Two roles (sales manager and ops manager) edit the same row through different surfaces, racing on `RepairOrder.subtotal*`, `RepairOrder.status`, etc. The IA-split idea (separate UIs over one table) papers over this; it does not solve it.

The professional pattern (Salesforce Opportunity, Mitchell RO, Tekmetric, CDK Drive) splits into two layers: a **commercial aggregate** owned by CRM, and **operational fulfillments** owned by the modules that execute the work. This PRD adopts that pattern for Geleoteka.

## Goals

1. Introduce a single commercial aggregate `Deal` owned by the CRM module. Stage, total, owner, lines, customer, source, channel.
2. Demote `RepairOrder`, `PartOrder` (renamed `PartShipment`), and `RentalBooking` to **fulfillments** — operational execution entities owned by the Service / Parts / Rentals modules respectively. They link back to a Deal.
3. Allow one Deal to have multiple fulfillments of different kinds (e.g. service + parts in one transaction).
4. Move money to the Deal. Deal lines are the source of truth for what was sold; fulfillments denormalize total for quick display.
5. Move "estimate" to a first-class CRM model `Estimate` with its own stage (DRAFT/SENT/APPROVED/DECLINED/EXPIRED/SUPERSEDED). Estimate is conditional — pure-retail parts checkout doesn't need one.
6. Route group `/crm/*` becomes the home of CRM (own shell, own sidebar) per the modularity discussion. Operations stays under `/admin/*`.
7. ESLint module boundaries: CRM owns `Deal`, `DealLine`, `Estimate`, `EstimateLine`. Service owns `RepairOrder`, `JobLine`, `LaborLine`, `PartLine`. Parts owns `PartShipment`. Rentals owns `RentalBooking`. Cross-module reads only through `lib/<module>/public.ts`.

## Non-Goals

- Multi-currency. Single RUB pricing.
- Tax / VAT engine. `tax` field on Deal is a free Int for now.
- Per-line approval inbox for clients (deferred — Estimate-level approval suffices in v1).
- A built-in payment processor. `paymentStatus` is manually advanced.
- Full ERP-style document chain (purchase order → invoice → receipt → ledger). We ship Deal + Estimate now; `Invoice` and `Payment` are deferred.

## Data Model

### New: `Deal` (CRM aggregate root)

```prisma
enum DealStage {
  DRAFT             // being assembled by sales (no estimate sent)
  QUOTED            // estimate sent, awaiting customer
  APPROVED          // customer accepted; fulfillment can start
  IN_FULFILLMENT    // any fulfillment is active
  DELIVERED         // all fulfillments completed; awaiting payment/closure
  WON               // closed-paid
  LOST              // declined / cancelled
}

enum DealChannel {
  SERVICE           // workshop service is the primary intent
  PARTS_RETAIL      // e-commerce parts purchase
  PARTS_WHOLESALE   // B2B parts (future)
  RENTAL            // rental booking
  WALK_IN           // mixed in-person
}

enum DealPaymentStatus {
  UNPAID
  PARTIAL
  PAID
  REFUNDED
}

model Deal {
  id              String              @id @default(cuid())
  number          String?             @unique     // human "D-XXXXX"
  customerUserId  String
  vehicleId       String?                          // optional — parts-only deal may not have one
  ownerUserId     String?                          // sales rep / deal owner
  stage           DealStage           @default(DRAFT)
  channel         DealChannel
  source          String?                          // "booking-form" | "parts-cart" | "rentals-form" | "walk-in" | "phone"
  paymentStatus   DealPaymentStatus   @default(UNPAID)

  // Money — denormalized from DealLine[] on every mutation
  subtotalLabor   Int @default(0)
  subtotalParts   Int @default(0)
  subtotalRental  Int @default(0)
  discount        Int @default(0)
  tax             Int @default(0)
  total           Int @default(0)

  // Workflow timestamps
  quotedAt        DateTime?
  approvedAt      DateTime?
  closedAt        DateTime?
  lostReason      String?

  // Guest-checkout claim — moves here from PartOrder/RentalBooking/RepairOrder
  claimToken      String?

  notes           String?
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  customer        User                @relation("DealCustomer", fields: [customerUserId], references: [id], onDelete: Cascade)
  vehicle         Vehicle?            @relation(fields: [vehicleId], references: [id], onDelete: SetNull)
  owner           User?               @relation("DealOwner", fields: [ownerUserId], references: [id], onDelete: SetNull)

  dealLines       DealLine[]
  estimates       Estimate[]
  repairOrders    RepairOrder[]       // fulfillment
  partShipments   PartShipment[]      // fulfillment
  rentalBookings  RentalBooking[]     // fulfillment

  @@index([customerUserId])
  @@index([vehicleId])
  @@index([ownerUserId])
  @@index([stage])
  @@index([channel])
  @@index([claimToken])
  @@index([createdAt])
}
```

### New: `DealLine` (polymorphic line items)

```prisma
enum DealLineType {
  LABOR        // service labor
  PART         // catalog part or non-catalog part
  RENTAL_DAY   // one rental day at a daily rate
  DISCOUNT     // negative-amount line
  FEE          // delivery, surcharge, etc.
}

model DealLine {
  id          String       @id @default(cuid())
  dealId      String
  sortOrder   Int          @default(0)
  type        DealLineType

  description String
  qty         Float        @default(1)         // hours for LABOR, units for PART, days for RENTAL_DAY
  unitPrice   Int          @default(0)         // ₽ per unit
  total       Int          @default(0)         // computed: qty * unitPrice (signed; DISCOUNT is negative)

  // Optional structured references — populated when applicable.
  partId             String?      // catalog Part if PART line is catalog
  vehicleId          String?      // for RENTAL_DAY
  laborLineId        String?      // back-link to LaborLine on the linked RO if applicable

  deal       Deal       @relation(fields: [dealId], references: [id], onDelete: Cascade)
  part       Part?      @relation(fields: [partId], references: [id], onDelete: SetNull)
  vehicle    Vehicle?   @relation(fields: [vehicleId], references: [id], onDelete: SetNull)

  @@index([dealId])
  @@index([type])
  @@index([partId])
}
```

### New: `Estimate` + `EstimateLine`

```prisma
enum EstimateStage {
  DRAFT       // sales is composing
  SENT        // sent to customer, awaiting decision
  APPROVED    // customer approved → triggers Deal → APPROVED + fulfillments
  DECLINED
  EXPIRED
  SUPERSEDED  // replaced by a revised estimate
}

model Estimate {
  id                  String          @id @default(cuid())
  number              String?         @unique     // "E-XXXXX"
  dealId              String
  stage               EstimateStage   @default(DRAFT)
  preparedByUserId    String?
  validUntil          DateTime?
  parentEstimateId    String?                     // revision chain
  notes               String?
  sentAt              DateTime?
  approvedAt          DateTime?
  declinedAt          DateTime?
  declineReason       String?

  // Money frozen at the moment of SENT — historical contract
  subtotalLabor       Int @default(0)
  subtotalParts       Int @default(0)
  subtotalRental      Int @default(0)
  discount            Int @default(0)
  tax                 Int @default(0)
  total               Int @default(0)

  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt

  deal              Deal       @relation(fields: [dealId], references: [id], onDelete: Cascade)
  preparedBy        User?      @relation("EstimatePreparedBy", fields: [preparedByUserId], references: [id], onDelete: SetNull)
  parent            Estimate?  @relation("EstimateRevision", fields: [parentEstimateId], references: [id], onDelete: SetNull)
  revisions         Estimate[] @relation("EstimateRevision")
  estimateLines     EstimateLine[]

  @@index([dealId])
  @@index([stage])
  @@index([number])
}

model EstimateLine {
  id          String       @id @default(cuid())
  estimateId  String
  sortOrder   Int          @default(0)
  type        DealLineType
  description String
  qty         Float        @default(1)
  unitPrice   Int          @default(0)
  total       Int          @default(0)
  partId      String?

  estimate Estimate @relation(fields: [estimateId], references: [id], onDelete: Cascade)
  part     Part?    @relation(fields: [partId], references: [id], onDelete: SetNull)

  @@index([estimateId])
  @@index([partId])
}
```

### Mutations to existing models

```prisma
model RepairOrder {
  // EXISTING ops fields stay (status, dateTime, mileageIn/Out, concern,
  // promisedAt, masterUserId, jobLines, workPhotos, ...).

  // NEW
  dealId    String
  deal      Deal   @relation(fields: [dealId], references: [id], onDelete: Cascade)

  // REMOVED in this iteration:
  //   subtotalLabor, subtotalParts, total — money lives on Deal
  //   tax, discount — same
  //   claimToken — moved to Deal
  //   status enum value `ESTIMATE` — the deal stage handles that

  @@index([dealId])
}

// Renamed: PartOrder → PartShipment
model PartShipment {
  // EXISTING fields kept: id, status (-→ shipment status), contactName/phone/email,
  // notes, items (PartOrderItem renamed PartShipmentItem and now redundant since
  // DealLine carries the same info — keep for fulfillment-side picking sheet only).

  // NEW
  dealId  String
  deal    Deal   @relation(fields: [dealId], references: [id], onDelete: Cascade)

  // REMOVED:
  //   total — denormalized from Deal
  //   claimToken — moved to Deal
}

model RentalBooking {
  // EXISTING ops fields kept: vehicleId, startDate, endDate, status,
  // contactName/phone/email, notes.

  // NEW
  dealId  String
  deal    Deal   @relation(fields: [dealId], references: [id], onDelete: Cascade)

  // REMOVED:
  //   totalCost — denormalized from Deal (subtotalRental)
  //   claimToken — moved to Deal
}
```

`RepairOrderStatus` enum loses `ESTIMATE`. Default status for a freshly-created RO becomes `SCHEDULED` (added if missing) — RO only exists once the deal is APPROVED.

## Server actions / API surface

```
crm/actions/
  create-deal.ts             createDeal(input)
  update-deal-line.ts        addDealLine, updateDealLine, removeDealLine, reorderDealLines
                             // recomputes Deal totals + denormalizes to fulfillments
  send-estimate.ts           sendEstimate(estimateId) — Deal QUOTED, Estimate SENT
  approve-estimate.ts        approveEstimate(estimateId)
                             // Deal → APPROVED, Estimate → APPROVED, snapshot lines → fulfillment(s)
  decline-estimate.ts        declineEstimate(estimateId, reason)
  revise-estimate.ts         reviseEstimate(estimateId) — clones to DRAFT child, parent → SUPERSEDED
  set-deal-stage.ts          manual stage transitions (ADMIN only for backwards moves)
  set-payment-status.ts
  close-deal.ts              closeDeal(dealId, "WON" | "LOST", reason?)

crm/queries/
  deal-summary.ts
  pipeline.ts                kanban data over open deals
  customer-360.ts            assembles Deal[] + comms + tasks for one customer
  metrics.ts                 LTV, win-rate, avg ticket, days-in-stage
```

Service / Parts / Rentals modules each export a thin **fulfillment write API** to CRM:

```
service/public/fulfillment.ts   createRepairOrderForDeal(dealId, ...)
parts/public/fulfillment.ts     createPartShipmentForDeal(dealId, ...)
rentals/public/fulfillment.ts   createRentalBookingForDeal(dealId, ...)
```

`approveEstimate` in CRM calls the appropriate `create*ForDeal` based on the line types present. CRM does not import service internals, only `service/public/fulfillment`.

## Flow examples

### Workshop service with a part the customer takes home

1. Customer books via the booking form (Service module).
2. `service/actions/booking.ts` calls `crm/public.createDeal({customerUserId, vehicleId, channel: SERVICE, source: "booking-form"})` → `Deal{stage: DRAFT}`.
3. Manager opens the deal in `/crm/deals/[id]`, adds DealLines: 1 LABOR (oil change) + 1 PART (5W-40 oil) + 1 PART (oil filter).
4. Manager clicks "Создать смету" → `Estimate{stage: DRAFT}` cloned from current dealLines.
5. Manager clicks "Отправить клиенту" → `Estimate{stage: SENT}`, `Deal{stage: QUOTED}`. Customer receives SMS/email.
6. Customer clicks accept link → `Deal{stage: APPROVED}`, `Estimate{stage: APPROVED}`. CRM dispatches:
   - `service/public.createRepairOrderForDeal(dealId)` → `RepairOrder{status: SCHEDULED}` with JobLines copied from labor lines + on-demand-installed part lines.
   - PARTS lines that are "take-home" (a future flag) would also create `PartShipment`. v1: every PART line attached to a service deal is for installation, no shipment.
7. Master executes work, updates RO operations status. Money never moves; Deal totals stay frozen.
8. Manager sets `Deal.paymentStatus = PAID` and `Deal{stage: WON}` on payment.

### E-commerce parts checkout (no service)

1. Customer fills cart, hits checkout.
2. `parts/actions/place-order.ts` calls `crm/public.createDeal({channel: PARTS_RETAIL, source: "parts-cart"})` and immediately adds DealLines + sets `stage: APPROVED` (retail is auto-approved).
3. CRM calls `parts/public.createPartShipmentForDeal(dealId)` → `PartShipment{status: PENDING}`.
4. Operations fulfills shipment as today.
5. CRM auto-advances `Deal{stage: WON}` when `PartShipment.status = DELIVERED` and `paymentStatus = PAID`.

### Rental

Mirrors parts: rental form → `Deal{channel: RENTAL, stage: APPROVED}` + `RentalBooking`. No estimate. Rental rate × days = DealLines of type `RENTAL_DAY`.

## URL / shell architecture

Two route groups, two shells, single auth.

```
app/(admin)/admin/...    — Operations shell (Service/Parts/Rentals operations)
app/(crm)/crm/...        — CRM shell (Deals, Customers, Communications, Tasks, Pipeline, Estimates)
```

Shared:
- Auth middleware
- User role check (ADMIN, MANAGER allowed in both; future SALES allowed only in `/crm/*`)
- Header link to switch shells

Sidebar:

```
/admin (Operations)
  Дашборд
  Сервис
    Записи            /admin/repair-orders
    Календарь         /admin/calendar
    Команда           /admin/team
  Запчасти
    Каталог           /admin/parts
    Отгрузки клиентам /admin/parts/shipments
    Поставщики        /admin/suppliers
    Заказы поставщикам /admin/suppliers/orders
  Аренда
    Автопарк          /admin/rentals
    Бронирования      /admin/rentals/bookings
  Сайт
    Контент / Услуги / Вакансии / Модели
  Доступы
    Пользователи

/crm (CRM)
  Дашборд              /crm
  Сделки               /crm/deals
  Pipeline             /crm/pipeline
  Сметы                /crm/estimates
  Клиенты              /crm/customers
  История общения      /crm/communications
  Задачи               /crm/tasks
```

## Module boundaries (ESLint enforced)

```
lib/crm/             owns Deal, DealLine, Estimate, EstimateLine
lib/service/         owns RepairOrder, JobLine, LaborLine, PartLine
lib/parts/           owns Part, PartCategory, PartShipment, PartShipmentItem
lib/rentals/         owns RentalBooking
lib/<module>/public/ thin types + write-API for cross-module use
```

`lib/crm/**` may import `lib/<other>/public/**`; never `lib/<other>/internal/**`.

## Migration

Single coordinated change set. Migrations split into reversible steps to satisfy zero-downtime constraints (Geleoteka deploys to Railway with migrations on container start).

### Step 1 — additive
1. Create `Deal`, `DealLine`, `Estimate`, `EstimateLine` tables.
2. Add `dealId` column to `RepairOrder`, `PartOrder`, `RentalBooking` as nullable.
3. Backfill: for every existing `RepairOrder` create a `Deal` with channel SERVICE, stage derived from RO status (`ESTIMATE` → QUOTED, anything else → APPROVED or later mapped per status), totals copied, `dealLines` synthesized from `JobLine` rows. Same for `PartOrder` (channel PARTS_RETAIL) and `RentalBooking` (channel RENTAL). Set `dealId` on each fulfillment row.
4. Verify backfill: every fulfillment row has a `dealId`; every `Deal.total` matches the sum of its sources.

### Step 2 — schema lock
5. `dealId` becomes NOT NULL on all three fulfillment tables.
6. Drop `RepairOrder.subtotalLabor/subtotalParts/total/tax/discount/claimToken`.
7. Drop `PartOrder.total/claimToken`.
8. Drop `RentalBooking.totalCost/claimToken`.
9. Remove `ESTIMATE` from `RepairOrderStatus`. Existing rows with that value were converted in step 3; we run a one-shot SQL `UPDATE RepairOrder SET status='SCHEDULED' WHERE status='ESTIMATE'` defensively before the enum DDL (Postgres requires this — see `geleoteka-project.md` already documents the ALTER TYPE constraint).

### Step 3 — rename
10. Rename `PartOrder` → `PartShipment`, `PartOrderItem` → `PartShipmentItem`. Three commits: introduce `@@map`, switch code, drop the alias.

### Step 4 — UI cutover
11. Build `/crm/*` route group.
12. Strip pricing controls from `/admin/repair-orders/[id]` (cross-link only).
13. `/admin/parts/shipments` becomes the list of fulfillments (read-only commerce data, write-only ops fields like delivery status).

### Step 5 — flow refactor
14. `app/actions/booking.ts`, `app/actions/parts/checkout.ts`, `app/actions/rentals/book.ts` call `crm.createDeal(...)` and the matching `crm.createEstimate` if applicable.
15. Remove dead code paths.

## Acceptance criteria

- [ ] All four schema migrations applied; backfill verified (deal totals match historical sums).
- [ ] No code path mutates money fields on a fulfillment row directly.
- [ ] `/crm/deals/[id]` is the only place that edits DealLines.
- [ ] `/admin/repair-orders/[id]` shows zero pricing controls; only cross-link to deal.
- [ ] Parts cart checkout creates Deal+PartShipment in one transaction.
- [ ] Rentals booking creates Deal+RentalBooking in one transaction.
- [ ] Service booking creates Deal+RepairOrder in one transaction; estimates are optional in this flow.
- [ ] Pipeline kanban renders ≥10 sample deals across all three channels.
- [ ] Customer 360 shows Deals[], not RO+Parts+Rentals separately.
- [ ] `npm run lint` clean; module-boundary rules pass.
- [ ] Browser-verified: end-to-end deal creation, estimate send/approve, RO/shipment creation, payment status update.

## Open questions

- Should retail parts checkout always create an Estimate (SENT+APPROVED in one go for paper trail) or skip estimate entirely? Recommendation: skip — retail e-com is fundamentally point-of-sale, not negotiated.
- Per-line discount vs. deal-level discount? Recommendation: both. DealLine`{type: DISCOUNT}` for line-tied discounts (e.g. "free oil filter"), and `Deal.discount` field for blanket discounts.
- Multi-deal customer LTV — count WON only, or all closed deals net of refunds? Recommendation: WON net of refunds.
- Service flow without an estimate (drop-in, "just change the oil while I wait")? Recommendation: support — booking creates Deal in `APPROVED` directly, no Estimate row needed.

## Related PRDs

- `2026-05-10-crm-expansion.md` — communications, tasks, pipeline UI, all built on this Deal aggregate.
- `2026-05-10-warehouse-management.md` — `StockMovement.dealId` and `StockMovement.fulfillmentId` (instead of `repairOrderId`/`partOrderId`).
- `2026-04-13-module-boundaries-refactor.md` — defines the ESLint boundary mechanism this PRD relies on.
