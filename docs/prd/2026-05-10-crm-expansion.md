# CRM Expansion — Deals, Communications, Pipeline

Created: 2026-05-10
Author: aleksandr.spiskov@gmail.com
Category: Product / Module
Status: Draft
Research: Light

## Problem Statement

Geleoteka's current CRM (`/admin/customers/*`) is a contact directory with timeline notes and tags. It does not capture the artefacts a workshop's commercial team actually works with:

- **Deals** — the financial side of a RepairOrder (estimates, approvals, won/lost outcomes), scattered between Records and Estimates today.
- **Communications log** — phone calls, WhatsApp/Telegram threads, SMS history. Today only system-emitted SMS via smsc.ru is recorded as a `Notification`; inbound and operator-initiated communications are invisible.
- **Tasks & follow-ups** — "позвонить через 3 дня после Замены масла", "напомнить про оплату". Currently exists nowhere.
- **Lifetime view** — total spend, average ticket, days since last visit, NPS. Ad-hoc SQL today.
- **Cross-module commercial overview** — a customer's RentalBookings + PartOrders + RepairOrders are accessed via three separate routes, never on one screen.

The IA-split PRD (`2026-05-10-service-vs-deal-ia-split.md`) cuts the smaller knot (Records vs Deals) but leaves the broader CRM hollow. This PRD scopes the platform-wide CRM extension that turns Geleoteka from "workshop ops" into "ops + commercial" — without abandoning modularity.

## Goals

1. **Deal as a first-class CRM concept** layered over `RepairOrder` (no new aggregate root).
2. **Unified communications log** — every phone call/SMS/messenger thread is a row tied to a customer and optionally to a deal/RO.
3. **Tasks** — managed reminders with due dates, owner, link-back to customer/deal, status.
4. **Customer 360** — single page that aggregates: profile, vehicles, deals, RentalBookings, PartOrders, communications, tasks, loyalty, tags, notes.
5. **Pipeline view** — kanban over open deals by stage (ESTIMATE → APPROVED → IN_PROGRESS → READY).
6. **Modularity** — CRM owns its directory tree, exposes a typed read API to other modules; other modules expose typed read APIs to CRM. No cross-module deep imports.

## Non-Goals

- Email automation / drip campaigns. Out of scope for v1; revisit after marketing PRD.
- Lead capture from the public site beyond what booking/parts forms already do.
- Custom field framework. We pick the canonical fields each entity needs and stop.
- A built-in dialer / softphone. Phone calls are logged manually or via an integration we don't write.
- WhatsApp Business API / Telegram bot integration in v1 — the **schema** is messenger-agnostic so a future webhook can write into it.

## Modules and Boundaries

```
crm/
  customers/          (existing — extends, doesn't replace)
  deals/              (NEW — view of RepairOrder + future PartOrder/RentalBooking deals)
  communications/     (NEW — call / message log)
  tasks/              (NEW — follow-ups & reminders)
  pipeline/           (NEW — kanban over deals)
service/, parts/, rentals/   (no inverse imports of crm/)
```

Cross-module reads happen via thin module-public types in `lib/<module>/public.ts`:
- `service/public.ts` exports `RepairOrderSummary` (id, status, total, dateTime, vehicle name).
- `rentals/public.ts` exports `RentalBookingSummary`.
- `parts/public.ts` exports `PartOrderSummary`.
- `crm/public.ts` exports `Deal` (composed view), `CustomerSummary`.

CRM **never imports inside** `service/components/**` or `service/actions/**` — only the public type module.

## Data Model

### `Deal` (view, not new table)
A Deal is a `RepairOrder` projected through CRM lenses. The schema doesn't gain a `Deal` model. Instead:
- Existing `RepairOrder.status` keeps doing both jobs (booking stage + deal stage).
- A computed `dealStage` derived view: `ESTIMATE → "open"`, `APPROVED → "won-pending-work"`, `CLOSED/PAID → "won-completed"`, `CANCELLED → "lost"`.
- No new column unless analysis later shows the conflation hurts.

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
  authorUserId    String?      // manager who logged it; null = system
  channel         CommChannel
  outcome         CommOutcome  @default(N_A)
  body            String?      // message text or call summary
  durationSec     Int?         // for calls
  externalId      String?      // smsc.ru msg id, future webhook id
  repairOrderId   String?
  partOrderId     String?
  rentalBookingId String?
  createdAt       DateTime     @default(now())

  customer       User           @relation("CommLogCustomer", fields: [customerUserId], references: [id], onDelete: Cascade)
  author         User?          @relation("CommLogAuthor", fields: [authorUserId], references: [id], onDelete: SetNull)
  repairOrder    RepairOrder?   @relation(fields: [repairOrderId], references: [id], onDelete: SetNull)
  partOrder      PartOrder?     @relation(fields: [partOrderId], references: [id], onDelete: SetNull)
  rentalBooking  RentalBooking? @relation(fields: [rentalBookingId], references: [id], onDelete: SetNull)

  @@index([customerUserId, createdAt])
  @@index([channel])
  @@index([repairOrderId])
}
```

### NEW: `CrmTask`
```prisma
enum CrmTaskStatus {
  OPEN
  DONE
  CANCELLED
}

model CrmTask {
  id              String         @id @default(cuid())
  title           String
  body            String?
  dueAt           DateTime
  status          CrmTaskStatus  @default(OPEN)
  ownerUserId     String         // manager responsible
  customerUserId  String?
  repairOrderId   String?
  partOrderId     String?
  rentalBookingId String?
  completedAt     DateTime?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  owner          User           @relation("CrmTaskOwner", fields: [ownerUserId], references: [id], onDelete: Cascade)
  customer       User?          @relation("CrmTaskCustomer", fields: [customerUserId], references: [id], onDelete: SetNull)
  repairOrder    RepairOrder?   @relation(fields: [repairOrderId], references: [id], onDelete: SetNull)
  partOrder      PartOrder?     @relation(fields: [partOrderId], references: [id], onDelete: SetNull)
  rentalBooking  RentalBooking? @relation(fields: [rentalBookingId], references: [id], onDelete: SetNull)

  @@index([ownerUserId, status, dueAt])
  @@index([customerUserId])
  @@index([dueAt])
}
```

### Light additions to `CustomerProfile`
```prisma
model CustomerProfile {
  // ...existing
  source          String?       // "booking", "parts", "rentals", "walk-in", "referral"
  referrerUserId  String?       // who brought them
  firstSeenAt     DateTime      @default(now())
  lastTouchAt     DateTime?     // updated on any communication or order
}
```

## New Surfaces

### `/admin/customers/[id]` — Customer 360
Existing page extended with:
- **Сделки** tab — all RepairOrders + PartOrders + RentalBookings projected as deal cards with stage.
- **История общения** — CommunicationLog timeline; "+ Новая запись" inline form.
- **Задачи** — CrmTasks for this customer, open by default.
- **Лояльность** — current points, last 10 transactions (existing data, not yet shown here).
- **Метрики** — LTV, avg ticket, days since last visit, deal count by stage.

### `/admin/estimates` (= /admin/deals)
List view from the IA-split PRD, plus filter chips for:
- Stage (Открытые / Согласованные / Завершённые / Все)
- Owner (master assigned)
- Channel (Service / Parts / Rentals)
- Tag (CRM tag)

### `/admin/pipeline`
Kanban board over open deals.
- Columns: Смета → Согласовано → В работе → Готов → Завершено.
- Card: client name, vehicle, total, master, days-in-stage.
- Drag-to-stage triggers `updateRepairOrderStatus`.
- Read-only for MANAGER on completed columns; ADMIN can drag back.

### `/admin/communications`
Optional v1 surface — global communications inbox.
- Filter by channel, outcome, date range.
- Defer if Customer 360 satisfies the need.

### `/admin/tasks`
Manager's task list.
- Filter by owner (default = self), status, due-window.
- "Today" / "Overdue" / "This week" tabs.
- Inline complete + reschedule.

## Server actions / API

```
crm/actions/
  log-communication.ts      // logCommunication(input) — manager UI; smsc.ru webhook will reuse
  task-crud.ts              // create/update/complete/reschedule
  customer-touch.ts         // bumpLastTouch(customerUserId) — called from log-communication, RO update, etc.
crm/queries/
  customer-360.ts           // assembles the unified view
  pipeline.ts               // kanban data
  metrics.ts                // LTV, avg ticket, days since last visit
```

`bumpLastTouch` is the single point that updates `CustomerProfile.lastTouchAt` so we don't have drift across modules.

## Inbound Webhook Contracts (deferred but designed-for)

The schema accepts inbound events without changes:
- smsc.ru delivery report → `CommunicationLog{channel: SMS_OUTBOUND, outcome: DELIVERED, externalId: ...}`.
- WhatsApp Business webhook → `CommunicationLog{channel: WHATSAPP, ...}` once integration ships.
- Twilio call webhook → `CommunicationLog{channel: PHONE_INBOUND, durationSec, body: transcript}`.

No schema migration is needed when those integrations land.

## Acceptance Criteria (v1)

- [ ] `CommunicationLog` and `CrmTask` migrations applied; `CustomerProfile` gains `source`/`firstSeenAt`/`lastTouchAt`.
- [ ] Customer detail page has Сделки / История общения / Задачи tabs.
- [ ] Manager can log a phone call / message inline on the customer page.
- [ ] Tasks page shows my open tasks with overdue chip.
- [ ] Pipeline page renders deals as kanban; drag triggers status update.
- [ ] `lastTouchAt` updates on any communication, RO update, or order.
- [ ] Module boundaries hold (ESLint clean): CRM imports only `*/public.ts` from other modules.
- [ ] Existing tags + notes timeline still work, untouched.

## Open Questions

- Are we OK shipping v1 without WhatsApp/Telegram inbound? Recommendation: yes, schema is messenger-agnostic.
- Do we want manager-level deal ownership distinct from `masterUserId`? Recommendation: add `RepairOrder.ownerUserId` (deal owner = sales) when split first hits friction; not now.
- LTV definition: gross revenue or net of declined JobLines? Recommendation: gross from `RepairOrder.total + PartOrder.total + RentalBooking.totalCost`; document.

## Phased Delivery

| Phase | Includes | Depends on |
|---|---|---|
| 1 | IA split (Records vs Deals), `/admin/estimates` real list | `2026-05-10-service-vs-deal-ia-split.md` |
| 2 | `CommunicationLog` + Customer 360 communications tab + manual logging | Phase 1 |
| 3 | `CrmTask` + tasks list + reminders | Phase 2 |
| 4 | Pipeline kanban | Phase 3 |
| 5 | Inbound webhooks (smsc.ru status, WhatsApp) | Phase 2 |
