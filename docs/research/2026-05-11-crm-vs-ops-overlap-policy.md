# CRM vs. Operations — Ownership & Overlap Policy

Created: 2026-05-11
Author: aleksandr.spiskov@gmail.com
Status: Adopted (informs Deal+Fulfillment implementation)

## Why this document exists

Phase 0 of the Deal+Fulfillment migration introduces a CRM module that
sits next to Service, Parts, and Rentals. Each business object now has
two valid lenses — commercial (CRM) and operational (the executing
module) — and the same `User` (`MANAGER` role) jumps between both.

This document fixes ownership per field/concept so that:
- Every UI form has one canonical home.
- Cross-module reads go through `lib/<module>/public/**`.
- Future contributors don't have to re-derive who owns what.

It is the **canonical rule set** referenced by the Deal+Fulfillment and
CRM-expansion PRDs.

## Module taxonomy: foundational vs. optional

Modules are **not equal**. Two tiers, with different commercial
treatment in the future SaaS pivot:

### Foundational — always on, part of the base plan
- **CRM** — Deal, DealLine, Estimate, Customer, CommunicationLog, Task.
  Every customer transaction in every vertical creates a Deal. A tenant
  cannot run a real business without a customer ledger and a way to
  track who owes what. Cannot be disabled.
- **Identity / IAM** — User, Role, Auth, Tenant. Platform plumbing.
- **Site / CMS** — public marketing surface (CMS blocks, vacancies).
  Every tenant needs a public face for online ordering.
- **Платформенный дашборд** — KPI overview, top-level navigation.

### Optional — per-tenant licensed verticals
- **Service** — workshop ops. RepairOrder, JobLine, master/team,
  calendar, service catalog (the workshop's offering).
- **Parts** — parts catalog, warehouse, vehicle models/trims (used to
  filter compatible parts), suppliers, supplier procurement, customer
  shipments.
- **Rentals** — fleet vehicles, rental bookings.

Tenant types we anticipate:

| Tenant | Foundational | Service | Parts | Rentals |
|---|---|---|---|---|
| Workshop-only (typical G-Class shop) | ✓ | ✓ | — | — |
| Parts-shop only | ✓ | — | ✓ | — |
| Rental-only | ✓ | — | — | ✓ |
| Full-stack (e.g. Geleoteka itself) | ✓ | ✓ | ✓ | ✓ |

`Tenant.licensedModules: string[]` (future) enumerates only the
**optional** set — `"service" | "parts" | "rentals"`. Foundational
modules are never in that list. Validation: `licensedModules.length ≥
1` (an empty tenant has no business reason to exist).

The Service module conceptually depends on CRM (every RO has a Deal),
but CRM doesn't depend on Service. This is exactly the
foundational/optional pattern: optional layers sit on top of
foundational ones.

## Ownership matrix

| Concept | Owner module | Surface | Cross-link |
|---|---|---|---|
| `Deal` (channel, stage, total, payment, owner, lines) | **CRM** | `/admin/crm/deals/[id]` | RO/PartOrder/RentalBooking detail pages link here |
| `DealLine` (LABOR / PART / RENTAL_DAY / DISCOUNT / FEE) | **CRM** | `/admin/crm/deals/[id]` editor | None — internal to CRM |
| `Estimate` + `EstimateLine` | **CRM** | future `/admin/crm/estimates/[id]` (Phase 2) | Deal detail lists revisions |
| `RepairOrder` (status, dateTime, masterUserId, mileage, concern, notes, workPhotos) | **Service** | `/admin/repair-orders/[id]` | Reciprocal "Открыть сделку" to `/admin/crm/deals/[dealId]` |
| `JobLine` (per-RO work item, status, denorm money) | **Service** | inline on RO detail (read-only for prices once CRM cutover completes) | Source-of-truth is `DealLine`; JobLine is operational expansion |
| `PartOrder` / `PartShipment` (shipment/fulfillment status, items picked) | **Parts** | `/admin/orders/[id]` | "Открыть сделку" to Deal |
| `RentalBooking` (vehicleId, dates, booking status, keys) | **Rentals** | `/admin/rentals/bookings/[id]` | "Открыть сделку" to Deal |
| `Part`, `PartCategory`, `Part.quantity` | **Parts** | `/admin/parts/*` | Read via `lib/parts/public/lookupPartForDealLine` |
| `SupplierOrder` (procurement) | **Parts** | `/admin/suppliers/orders/*` | Not a Deal — inbound only |
| `User` profile, vehicles, tags, notes, loyalty | **CRM** | `/admin/customers/[id]` | Deal detail customer card links here |
| `CommunicationLog`, `CrmTask` (future, Phase 2-3) | **CRM** | `/admin/crm/communications`, `/admin/crm/tasks` | Each row optionally references a Deal |

## Money rules

1. **Deal is the source of truth for revenue.** `Deal.subtotalLabor`,
   `subtotalParts`, `subtotalRental`, `discount`, `tax`, `total` are
   computed from `DealLine[]` and never edited directly.
2. **Fulfillment money fields denormalize, never originate.** During
   Phase 0 we keep `RepairOrder.subtotal*`/`total` and
   `PartOrder.total`/`RentalBooking.totalCost` for backwards
   compatibility; they're dropped once UI cutover finishes (Phase 4 of
   the Deal+Fulfillment PRD).
3. **A single mutation gate.** Adding a line goes through
   `crm/actions/deals.ts → addDealLine`, which recomputes totals.
   Operational code never directly writes a Deal's money field.

## Status rules

1. **`Deal.stage` drives commercial workflow** — DRAFT → QUOTED →
   APPROVED → IN_FULFILLMENT → DELIVERED → WON/LOST. This is what the
   pipeline kanban tracks.
2. **`RepairOrder.status` drives ops workflow** — APPROVED → IN_PROGRESS
   → AWAITING_PARTS → QC → READY → INVOICED → PAID → CLOSED /
   CANCELLED. The `ESTIMATE` legacy value is deprecated; the Deal stage
   handles "is this estimate sent / accepted" instead.
3. **They evolve independently.** Service can mark a RO `IN_PROGRESS`
   without ping-ponging the Deal stage; the Deal stays in
   `IN_FULFILLMENT` for as long as any fulfillment is active. A future
   small auto-rule will advance Deal stage to `DELIVERED` when all
   linked fulfillments are in their terminal "done" state.

## Sidebar policy

Single unified admin shell. CRM is a sidebar group, not a separate
shell. Per-role / per-license hiding of groups is the long-term
mechanism (see Ideas — Role-aware sidebar + per-tenant module
licensing); not in this commit.

Group → tier mapping (must match `lib/admin-nav.ts`):

| Group | Tier | Routes |
|---|---|---|
| Дашборд | foundational | `/admin` |
| Сервис | optional (`service`) | repair-orders, calendar, team, **services catalog** |
| Запчасти | optional (`parts`) | catalog, customer orders, suppliers, supplier orders, **vehicle models/trims** |
| Аренда | optional (`rentals`) | fleet, bookings |
| CRM | foundational | dashboard, deals, estimates filter, customers |
| Доступы | foundational | users |
| Сайт | foundational | CMS, vacancies |

Things relocated from `Сайт` to their owning operational module
during the 2026-05-11 cleanup (so a tenant who disables the module
loses the menu entry cleanly):
- `Услуги` (`/admin/services`) → Сервис (it drives booking; not a
  CMS surface).
- `Модели и поколения` (`/admin/models`) → Запчасти (it's the trim
  catalog used to filter parts; not a CMS surface).

`Сайт` retains only true marketing/public-facing content (CMS
blocks, vacancies).

The CRM group exposes:
- `/admin/crm` — CRM dashboard
- `/admin/crm/deals` — deal list (default filter: open)
- `/admin/crm/deals?stage=open&channel=SERVICE` — Сметы (manager's
  primary commercial workflow)
- `/admin/customers` — customer base (shared with operations)

Deferred surfaces with planned slots:
- `/admin/crm/pipeline` (kanban — Phase 4 of CRM expansion PRD)
- `/admin/crm/communications`, `/admin/crm/tasks` (Phase 2-3)

## Overlap resolution rules

When two surfaces could host the same UI:

| Field/action | Canonical surface |
|---|---|
| Set deal stage / decline / win-mark | CRM (`/admin/crm/deals/[id]`) |
| Set RO status to IN_PROGRESS / READY | Service (`/admin/repair-orders/[id]`) |
| Edit price of a job | CRM (DealLine editor) |
| Assign master to RO | Service |
| Upload work photo | Service |
| Edit customer phone / email | CRM (`/admin/customers/[id]`) |
| Set parts shipment to SHIPPED | Parts (`/admin/orders/[id]`) |
| Mark rental ACTIVE / RETURNED | Rentals (`/admin/rentals/bookings/[id]`) |
| Manual payment status update | CRM (Deal payment) |

If you find yourself debating where a control belongs, the rule is:
"would this control change money, or change physical work?" Money →
CRM. Physical work → operational module.

## Cross-module import rules

```
lib/crm/internal/**       — owned by CRM, callable only within lib/crm/
lib/crm/public/**         — narrow contract: createDeal, addDealLine,
                            setDealStage, bumpLastTouch, types
lib/service/internal/**   — owned by Service
lib/service/public/**     — RepairOrderSummary type, fulfillment write API
lib/parts/internal/**
lib/parts/public/**       — Part read API, lookupPartForDealLine,
                            applyStockMovement
lib/rentals/internal/**
lib/rentals/public/**     — RentalBookingSummary, fulfillment write API
```

ESLint module-boundary rules (`docs/prd/2026-04-13-module-boundaries-refactor.md`)
enforce: a module may import `public/**` of any other module, but never
`internal/**`. The platform shell (admin layout, sidebar) is the only
exception — it touches nav metadata from every module.

## Open items (out of scope for this commit)

- Auto-advance `Deal.stage = DELIVERED` when all fulfillments terminal.
- `Deal.paymentStatus` automation when invoice/payment lands.
- Service module getting its own status-change history (analog of
  `CommunicationLog` for ops state). Today everything's in `Notification`.

See `docs/research/2026-05-11-ideas.md` for SaaS multi-tenancy and
license-gated sidebar groups.
