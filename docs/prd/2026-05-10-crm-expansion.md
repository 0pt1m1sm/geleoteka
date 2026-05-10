# CRM Expansion — Pipeline, Communications, Tasks, Customer 360

Created: 2026-05-10
Author: aleksandr.spiskov@gmail.com
Category: Product / Module
Status: Draft
Research: Standard

Builds on: `2026-05-10-deal-fulfillment-architecture.md` — Deal is the
commercial aggregate this PRD's surfaces operate on. Without that
foundation in place, the metrics and pipeline views below collapse
into the same union-of-three-tables problem we have today.

## Problem Statement

Current CRM (`/admin/customers/*`) is a contact directory with notes
and tags. After the Deal+Fulfillment refactor lands, CRM gains a real
commercial backbone — but the operator-facing surfaces are still
missing:

- **Pipeline** over open deals across all channels.
- **Communications log** — phone calls, SMS history, future
  WhatsApp/Telegram threads. Inbound and operator-initiated
  communications are invisible today.
- **Tasks & follow-ups** — scheduled reminders with due-date, owner,
  link-back to a deal/customer.
- **Customer 360** — single page aggregating profile, vehicles,
  Deals[], communications, tasks, loyalty, tags, notes, metrics.
- **CRM dashboard** — KPI tiles (open deals, win rate, avg ticket,
  overdue tasks) for the sales lead.

This PRD specifies the full CRM module surface that turns Geleoteka
from "ops tool with a contact list" into "ops tool + sales platform".

## Goals

1. Deliver a CRM shell at `/crm/*` (own route group, own sidebar,
   shared auth) per the modularity discussion. Operations stays under
   `/admin/*`.
2. Pipeline kanban over Deal stages, drag-to-advance.
3. Communications log model + manual logging UI + integration-ready
   schema for inbound webhooks (smsc.ru status, future
   WhatsApp/Telegram).
4. Task model + tasks list + per-deal/per-customer task creation.
5. Customer 360 page that subsumes today's customer detail and adds
   Deals/Communications/Tasks/Metrics tabs.
6. CRM dashboard with operational KPIs.
7. Module boundary clean: CRM imports only `lib/<other>/public/**`
   from operations modules.

## Non-Goals

- Email automation / drip campaigns. Out of scope; revisit after a
  marketing PRD.
- Lead capture beyond what booking/parts/rentals forms already feed
  (those create Deals automatically per the Deal+Fulfillment PRD).
- Custom-field framework. Canonical fields per entity, no per-tenant
  customization.
- Built-in dialer / softphone. Phone calls are logged manually or via
  a future telephony integration; this PRD specifies the schema, not
  the integration.
- Real-time WhatsApp Business / Telegram bot integration in v1 — the
  schema is messenger-agnostic so a future webhook writes into it
  without migration.

## CRM Shell

New route group `app/(crm)/`:

```
app/(crm)/
  layout.tsx              CRM shell — own sidebar, header, theme
  crm/
    page.tsx              Dashboard
    deals/
      page.tsx            List + filters
      [id]/page.tsx       Deal detail (DealLine editor lives here)
    pipeline/page.tsx     Kanban
    estimates/
      page.tsx            List of estimates by stage
      [id]/page.tsx       Estimate detail (lines, send/decline/revise)
    customers/
      page.tsx            List + filters (tag/source/last-touch)
      [id]/page.tsx       Customer 360
    communications/
      page.tsx            Global comm inbox (optional v1)
    tasks/
      page.tsx            My tasks + team tasks
```

CRM-specific sidebar (see Deal+Fulfillment PRD for full layout). Cross-shell switcher in the header lets a manager jump from `/crm` to `/admin` and back; route is preserved when meaningful.

Auth: same `getSession` guard as `/admin`. Roles allowed: `ADMIN`, `MANAGER`. Future `SALES` role would have `/crm` access only.

## Data Model

The Deal+Fulfillment PRD already lands `Deal`, `DealLine`, `Estimate`, `EstimateLine`. This PRD adds the CRM-side workflow tables:

### NEW: `CommunicationLog`

```prisma
enum CommChannel {
  PHONE_INBOUND
  PHONE_OUTBOUND
  SMS_OUTBOUND
  SMS_INBOUND
  WHATSAPP
  TELEGRAM
  EMAIL
  IN_PERSON
  OTHER
}

enum CommOutcome {
  ANSWERED
  VOICEMAIL
  NO_ANSWER
  REPLIED
  DELIVERED
  FAILED
  N_A
}

model CommunicationLog {
  id              String       @id @default(cuid())
  customerUserId  String
  authorUserId    String?      // manager who logged it; null = system / inbound
  dealId          String?      // tie to a specific commercial conversation
  channel         CommChannel
  outcome         CommOutcome  @default(N_A)
  body            String?      // message text or call summary
  durationSec     Int?         // for calls
  externalId      String?      // smsc.ru msg id, future webhook id
  createdAt       DateTime     @default(now())

  customer User  @relation("CommLogCustomer", fields: [customerUserId], references: [id], onDelete: Cascade)
  author   User? @relation("CommLogAuthor", fields: [authorUserId], references: [id], onDelete: SetNull)
  deal     Deal? @relation(fields: [dealId], references: [id], onDelete: SetNull)

  @@index([customerUserId, createdAt])
  @@index([dealId])
  @@index([channel])
}
```

Rationale: communications attach to a Deal (the commercial object) rather than a fulfillment (which may not exist yet at quote time). If a customer calls about a parts shipment, the call still attaches to the Deal that owns that shipment.

### NEW: `CrmTask`

```prisma
enum CrmTaskStatus {
  OPEN
  DONE
  CANCELLED
}

enum CrmTaskKind {
  CALLBACK
  FOLLOW_UP
  PAYMENT_REMINDER
  SCHEDULED_CHECK_IN
  GENERIC
}

model CrmTask {
  id              String         @id @default(cuid())
  title           String
  body            String?
  kind            CrmTaskKind    @default(GENERIC)
  status          CrmTaskStatus  @default(OPEN)
  dueAt           DateTime
  ownerUserId     String         // manager responsible
  customerUserId  String?
  dealId          String?
  completedAt     DateTime?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  owner    User  @relation("CrmTaskOwner", fields: [ownerUserId], references: [id], onDelete: Cascade)
  customer User? @relation("CrmTaskCustomer", fields: [customerUserId], references: [id], onDelete: SetNull)
  deal     Deal? @relation(fields: [dealId], references: [id], onDelete: SetNull)

  @@index([ownerUserId, status, dueAt])
  @@index([customerUserId])
  @@index([dealId])
  @@index([dueAt])
}
```

### Extension to `CustomerProfile`

```prisma
model CustomerProfile {
  // EXISTING
  userId, preferredMasterUserId, blacklisted, notes

  // NEW
  source          String?      // "booking-form" | "parts-cart" | "rentals-form" | "walk-in" | "phone" | "referral"
  referrerUserId  String?      // who brought them (existing customer or staff)
  firstSeenAt     DateTime     @default(now())
  lastTouchAt     DateTime?    // updated on any communication, deal mutation, or fulfillment status change
  lifetimeValue   Int          @default(0) // denormalized SUM of WON deals; recomputed on Deal stage change
}
```

`lastTouchAt` and `lifetimeValue` are denormalized for cheap CRM queries. Single point of update is `crm/actions/customer-touch.ts` — every CRM action that should bump them calls it. Service/Parts/Rentals modules call `crm.public.bumpLastTouch(customerUserId)` after their own mutations.

## Surfaces

### `/crm` — Dashboard

Top tiles (KPIs):
- **Открытые сделки** — count of `Deal` where stage ∈ `{DRAFT, QUOTED, APPROVED, IN_FULFILLMENT}`.
- **Win-rate (30d)** — `WON / (WON + LOST)` for deals closed in last 30 days.
- **Средний чек (30d)** — `AVG(total) WHERE stage=WON AND closedAt > now()-30d`.
- **Просроченные задачи** — count of `CrmTask` where `dueAt < now() AND status=OPEN AND ownerUserId=current`.

Below tiles:
- **Сегодняшние задачи** — list of my tasks due today.
- **Активные сделки** — last 10 deals I own, sorted by `updatedAt DESC`.
- **Лента общения** — last 10 `CommunicationLog` rows across the team.

### `/crm/deals` — Deal list

Filters (chips):
- Stage (Все / Открытые / WON / LOST).
- Channel (Service / Parts retail / Parts wholesale / Rental / Walk-in).
- Owner (My / Team).
- Tag (CRM tags).
- Date range (createdAt).

Each row: client name (link to /crm/customers/[id]), vehicle, owner, stage chip, channel chip, total, days-in-stage, last touch.

### `/crm/deals/[id]` — Deal detail

- Header: customer name (link), vehicle (link), channel chip, stage chip, owner.
- **DealLine editor** — same shape as JobLineEditor lives now, but now operates on `DealLine` rows. Type chip selects LABOR / PART / RENTAL_DAY / DISCOUNT / FEE, fields adapt.
- **Estimates** — list of Estimate rows for this deal with stage chips. Buttons: "Создать смету", "Отправить", "Принять/Отклонить" (manager-side override), "Создать пересмотр".
- **Fulfillments** — read-only summary of linked RepairOrder / PartShipment / RentalBooking with deep links to ops shell (`/admin/...`).
- **История общения** — CommunicationLog rows for this deal; inline "+ Записать звонок/сообщение".
- **Задачи** — CrmTasks for this deal; inline create.
- **Внутренние заметки** — `Deal.notes`.

### `/crm/pipeline` — Kanban

Columns: DRAFT → QUOTED → APPROVED → IN_FULFILLMENT → DELIVERED.
WON / LOST are not kanban columns; they appear on the deal list with their own filter.

Card shows: client + vehicle, total, owner, days in this stage, channel chip, "⚠️" badge if `lastTouchAt < now() - 7d`.

Drag-to-stage triggers `setDealStage`. Backwards moves require ADMIN or specific stage rules (DRAFT→QUOTED→APPROVED is forward; APPROVED→DRAFT requires confirmation modal).

### `/crm/estimates`

Filters: stage (Открытые / Согласованные / Отклонённые / Истёкшие / Все), owner, channel, date range.
Each row: estimate number, deal client, total, validUntil, sentAt, stage chip.

### `/crm/estimates/[id]`

EstimateLine editor (matches DealLine editor shape; lines are typed). Buttons: Save draft / Send to client / Mark approved / Mark declined / Create revision.

### `/crm/customers` — Customer list

Filters: tag, source, days since last touch, blacklist.
Columns: name, phone, vehicles, tags, LTV, last touch, open deals count.

### `/crm/customers/[id]` — Customer 360

Tabs:
1. **Сводка** — profile fields editable, vehicles list, loyalty points, source, firstSeenAt, lastTouchAt, LTV.
2. **Сделки** — `Deal[]` for this customer with stage filter.
3. **История общения** — CommunicationLog timeline; inline create.
4. **Задачи** — CrmTask for this customer.
5. **Заметки** — existing CustomerNote timeline.
6. **Теги** — existing tag manager.
7. **Метрики** — LTV, avg ticket, days since last visit, deal count by stage, NPS placeholder.

### `/crm/communications`

Optional v1. Global inbox of CommunicationLog with filters by channel, outcome, owner, date range. Defer if Customer 360 + Deal detail satisfy operator need.

### `/crm/tasks`

Tabs: "Сегодня" / "Просрочено" / "На неделе" / "Все мои" / "Команда".
Inline complete + reschedule. Click a task row → opens its linked deal/customer in a side panel.

## Server actions / API

```
crm/actions/
  // Deal lifecycle (consumed by both UI and other modules' write APIs)
  create-deal.ts           createDeal(input)
  add-deal-line.ts         addDealLine(dealId, input)
  update-deal-line.ts
  remove-deal-line.ts
  reorder-deal-lines.ts
  set-deal-stage.ts
  set-payment-status.ts
  close-deal.ts            closeDeal(dealId, "WON" | "LOST", reason?)

  // Estimate lifecycle
  create-estimate.ts       createEstimate(dealId, snapshotFromDeal: bool)
  send-estimate.ts
  approve-estimate.ts      // dispatches fulfillment creation via service/parts/rentals public.ts
  decline-estimate.ts
  revise-estimate.ts

  // Communications
  log-communication.ts     logCommunication(input)
  webhook-handle-sms.ts    smsc.ru delivery webhook (writes CommLog SMS_OUTBOUND DELIVERED|FAILED)

  // Tasks
  create-task.ts
  complete-task.ts
  reschedule-task.ts
  cancel-task.ts

  // Customer touch
  bump-last-touch.ts       single point of CustomerProfile.lastTouchAt update
  recompute-ltv.ts         called from set-deal-stage when WON/LOST
```

```
crm/queries/
  deal-summary.ts
  pipeline.ts                  kanban data over open deals
  customer-360.ts              assembles Deal[] + comms + tasks for one customer
  metrics.ts                   LTV, win-rate, avg ticket, days-in-stage, open-deals-count
  dashboard.ts                 KPI tiles
```

```
crm/public/
  index.ts                     // re-exports
  types.ts                     CustomerSummary, DealSummary
  deal-write.ts                createDeal, addDealLine — narrow write API for service/parts/rentals
  bump-last-touch.ts           bumpLastTouch(customerUserId)
```

## Inbound webhook contracts (designed-for, deferred)

Each integration writes to existing tables — no schema change at integration time:
- smsc.ru delivery report → `CommunicationLog{channel: SMS_OUTBOUND, outcome: DELIVERED|FAILED, externalId, customerUserId resolved by phone}`.
- WhatsApp Business webhook → `CommunicationLog{channel: WHATSAPP, ...}`.
- Twilio call webhook → `CommunicationLog{channel: PHONE_INBOUND, durationSec, body: transcript-if-available}`.

A small resolver `lib/crm/resolve-customer-by-phone.ts` maps E.164 phone to `User.id`.

## Permissions

| Surface | ADMIN | MANAGER | (future SALES) |
|---|---|---|---|
| `/crm/*` read | ✓ | ✓ | ✓ |
| Create Deal | ✓ | ✓ | ✓ |
| Edit DealLine | ✓ | ✓ | ✓ |
| Set Deal stage forward | ✓ | ✓ | ✓ |
| Set Deal stage backward | ✓ | with confirm | with confirm |
| Reassign Deal owner | ✓ | own only | own only |
| Delete Deal | ✓ | — | — |
| Decline estimate | ✓ | ✓ | ✓ |
| Recompute LTV | ✓ | — | — |
| `/admin/*` | ✓ | ✓ | — |

## Module boundaries (ESLint)

```
lib/crm/**        ←  may import lib/{service,parts,rentals,shared}/public/**
lib/service/**    ←  may import lib/crm/public/** (for createDeal, bumpLastTouch)
lib/parts/**      ←  may import lib/crm/public/** (same)
lib/rentals/**    ←  may import lib/crm/public/** (same)
lib/{a}/**        ←  must NOT import lib/{b}/internal/** for any a≠b
```

Exception (already defined by `module-boundaries-refactor.md`): the platform shell may import nav metadata from any module.

## Phasing

| Phase | Includes | Depends on |
|---|---|---|
| 0 | Deal+Fulfillment migration (separate PRD) | — |
| 1 | `/crm/*` route group + shell, `/crm/deals/[id]` editor reusing existing JobLine editor shape adapted to DealLine | Phase 0 |
| 2 | `/crm/estimates/*` (list + detail + send/approve/decline/revise) | Phase 1 |
| 3 | `CommunicationLog` migration + Customer 360 communications tab + Deal detail comms section + manual logging UI | Phase 1 |
| 4 | `CrmTask` migration + `/crm/tasks` + per-deal/per-customer task creation | Phase 3 |
| 5 | `/crm/pipeline` kanban | Phase 1 |
| 6 | `/crm` dashboard with KPI tiles | Phases 1, 4, 5 |
| 7 | Inbound webhooks (smsc.ru status, future WhatsApp) | Phase 3 |
| 8 | Customer 360 metrics tab (LTV, avg ticket, days-in-stage) | Phase 5 |

## Acceptance Criteria

- [ ] CRM shell live at `/crm/*` with own sidebar; cross-shell switcher works.
- [ ] `/crm/deals/[id]` is the only place a DealLine is created/edited.
- [ ] Pipeline kanban renders all open deals; drag advances stage; backwards drag prompts confirmation.
- [ ] Estimate flow: create → send → approve creates the right fulfillment(s) via module public APIs.
- [ ] CommunicationLog can be created manually; smsc.ru webhook stub writes into it.
- [ ] CrmTask CRUD works; overdue chip on dashboard; tasks page has Today/Overdue/Week tabs.
- [ ] Customer 360 has all 7 tabs; metrics are correct on the seed data.
- [ ] `lastTouchAt` updates on any communication, deal mutation, or fulfillment status change.
- [ ] Module-boundary ESLint passes; CRM never imports from `lib/<other>/internal/**`.
- [ ] CRM dashboard KPIs match a one-shot SQL audit on the same data.

## Open Questions

- Do we model an "Activity" abstract that unifies CommLog + Task + Deal-stage-change events for a single customer timeline? Recommendation: yes as a derived view, not a new table — `crm/queries/activity-stream.ts` UNIONs the three sources.
- Should completed tasks fall off the dashboard immediately or after 24h? Recommendation: 24h with toggle.
- Pipeline columns by `stage` only or also by `channel` (separate boards)? Recommendation: single board with channel chip on cards; channel filter chip above. Per-channel boards available via filter.
- LTV recompute: on every Deal mutation (expensive) or on stage transition only (cheap)? Recommendation: stage transition only; daily backfill cron catches drift.

## Related PRDs

- `2026-05-10-deal-fulfillment-architecture.md` — required foundation.
- `2026-05-10-warehouse-management.md` — picker integration with DealLine`{type: PART}`.
- `2026-04-13-module-boundaries-refactor.md` — boundary mechanism.
