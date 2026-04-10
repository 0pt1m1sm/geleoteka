# Mercedes-Benz Service Platform — Implementation Plan

Created: 2026-04-11
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Build Phase 1 of Mercedes-Benz auto service platform: public marketing site with online booking, client personal account (portal), and simplified manager panel.

**Architecture:** Next.js 15 (App Router, SSR for public site, SPA for portal/admin) + PostgreSQL + Prisma. Single-service, not multi-tenant.

**Tech Stack:** Next.js 15, PostgreSQL, Prisma ORM, Custom JWT Auth, next-intl (i18n), SMSC.ru, Yandex Maps, Yandex Object Storage (S3), Tailwind CSS + CSS Variables, shadcn/ui (restyled).

## Scope

### In Scope

**Public Site:**
- Home page (hero, stats, services grid, models, reviews carousel, FAQ accordion, Yandex map)
- Service pages (individual page per service with description, price range, applicable models, gallery)
- Model pages (C, E, G, GLE, S, AMG, EQ — each listing available services + pricing notes)
- Online booking wizard (5-step: service selection → vehicle data → date/time → contact → confirmation)
- "About / Team" page (profiles with photos, specializations, experience, certifications)
- Blog (articles with tags by model and service type, author attribution, share buttons)
- Contact page (phones, hours, email, interactive map, route planner)
- RU/EN i18n (RU primary, EN structure in place)

**Client Portal (`/cabinet`):**
- Auth: registration (email + phone), login, password reset
- My Vehicles: add by VIN decoder or manual (model, year, mileage, color, plate), service interval indicators
- Service History: full history per vehicle (date, work, parts, master, cost), PDF download
- Status Tracking: real-time status board (Записан → Принят → Диагностика → В ремонте → КК → Готов) via React Query polling (30s)
- Estimate Agreement: view/approve/reject individual line items, view invoice PDF
- Loyalty: points balance, transaction history, tier badge (Silver/Gold/AMG Club), referral link + tracking
- Notifications: upcoming visit reminders (1 day, same day), status change alerts
- Upcoming Appointments: view, reschedule, cancel

**Manager Panel (`/admin`):**
- Dashboard: today's appointments, active jobs, daily revenue counter
- Appointment Calendar: day/week view, color-coded by type/status
- Appointment Management: view details, change status, assign master
- Customer Cards: view all vehicles, history, loyalty balance, notes
- Estimate Builder: add work lines + parts, send to customer for approval
- Notifications Log: view sent SMS/push

**Technical:**
- Project scaffold: Next.js 15, TypeScript, Prisma, PostgreSQL
- Environment config: env vars, secrets management
- Database: full schema, migrations
- Auth: JWT sessions, SMS password reset via SMSC.ru
- File uploads: Yandex Object Storage (photos from booking, inspection photos)
- SMS: SMSC.ru integration (confirmation, reminders, status changes)
- Map: Yandex Maps API for contact page
- CMS: database-backed editable text blocks for homepage, team, etc.

### Explicitly Out of Scope
- Online payment (ЮKassa) — invoice + offline payment only
- Parts store — separate phase
- Avito/Drom/Zzap/Юла marketplace publishing — separate phase
- Full kanban for work orders — simplified management only
- Digital Vehicle Inspection (DVI) with photos — Phase 3
- Full CRM with tags/LTV — Phase 3
- Parts inventory management — Phase 3
- Advanced analytics — Phase 3
- English language content — after RU launch
- Multi-tenancy / SaaS — not in scope

## Approach

**Chosen:** Next.js 15 App Router with Server Actions + Prisma + PostgreSQL. Tailwind CSS + CSS Variables for theming. shadcn/ui as component primitives (restyled). React Query polling for status updates (30s interval).

**Why:** Next.js 15 App Router gives SSR for public SEO pages + SPA for portal/admin. Server Actions eliminate API route boilerplate. Prisma provides type-safe DB access. Polling via React Query is deployment-simple — no server-side SSE state needed, works reliably across serverless/multi-instance.

**Alternatives considered:**
- Nuxt.js / Vue — less mature Russian ecosystem, fewer hiring options
- Remix — good but Next.js has better Vercel/Yandex Cloud deployment story
- Separate microservices — overkill for single-service, adds operational complexity

## Autonomous Decisions

These were resolved during /prd or by default choices (no user questions needed):

| Decision | Choice | Why |
|----------|--------|-----|
| Styling | Tailwind + CSS Variables | Fast iteration, CSS variables for theming, no runtime overhead |
| Components | shadcn/ui (restyled) | Well-tested primitives, accessible, easy to restyle under brand |
| Real-time | React Query polling (30s) | No server-side state needed; works reliably across all deployment types (serverless, multi-instance). Phase 1 targets simplicity over elegance. |
| Database | PostgreSQL + Prisma | Mature, RLS available if needed later, Prisma DX is excellent |
| Auth | Custom JWT + SMS | Simple JWT in httpOnly cookie; no NextAuth.js dependency — full control over token structure and SMS flows |
| File storage | Yandex Object Storage | S3-compatible, natural fit for Yandex Cloud, cost-effective |
| Notifications | SMSC.ru for SMS, React Query polling for status | SMS for critical (reminders), polling for real-time status |

## Context for Implementer

> Write for an implementer who has never seen the codebase — this is a greenfield project.

### Project Structure

```
/app
  /(public)            # Public marketing site — SSR
    /page.tsx          # Home
    /services/[slug]/page.tsx
    /models/[slug]/page.tsx
    /about/page.tsx
    /blog/page.tsx
    /blog/[slug]/page.tsx
    /contacts/page.tsx
    /booking/page.tsx  # 5-step wizard
  /(portal)            # Client personal account — SPA
    /cabinet/
      /page.tsx       # Dashboard
      /cars/page.tsx
      /history/page.tsx
      /tracking/page.tsx
      /estimates/page.tsx
      /loyalty/page.tsx
  /(admin)            # Manager panel — SPA
    /admin/
      /page.tsx       # Dashboard
      /calendar/page.tsx
      /customers/page.tsx
      /estimates/page.tsx
  /api
    /auth/login/route.ts    # Custom JWT login
    /auth/register/route.ts  # Custom JWT registration
    /auth/logout/route.ts   # Clear session
    /auth/me/route.ts       # Get current user
    /upload/route.ts
  /components
    /ui/              # shadcn/ui components (restyled)
    /booking/         # Booking wizard steps
    /portal/          # Portal-specific components
    /admin/           # Admin-specific components
    /shared/          # Footer, Header, WhatsApp float, etc.
  /lib
    /db.ts            # Prisma client singleton
    /auth.ts          # Auth helpers
    /sms.ts           # SMSC.ru client
    /utils.ts
  /prisma
    /schema.prisma
    /migrations/
  /styles
    /globals.css      # CSS variables, Tailwind base
  /messages
    /ru.json          # Russian translations (next-intl)
    /en.json          # English translations (structure only, content Phase 2)
  /lib
    /i18n.ts          # next-intl config and server helpers
```

### Database Schema Overview

```
User          — id, email, phone, passwordHash, name, role (CLIENT|MANAGER), createdAt
Car           — id, userId, vin, model, year, mileage, color, plate, createdAt
Service       — id, slug, name, description, priceMin, priceMax, duration, applicableModels[]
Appointment   — id, userId, carId, status, dateTime, masterId, notes, createdAt @@unique([dateTime, masterId])
AppointmentService — join table (appointment + service)
Estimate      — id, appointmentId, status (PENDING|APPROVED|REJECTED), total, createdAt
EstimateItem  — id, estimateId, type (WORK|PART), description, price, approved
LoyaltyAccount — id, userId, points, tier (SILVER=0-999pts|GOLD=1000-4999pts|AMG_CLUB=5000+), referralCode, tierUpdatedAt
LoyaltyTransaction — id, accountId, amount, type (EARN|REDEEM|REFERRAL_BONUS), appointmentId
Notification  — id, userId, type, message, sentAt, readAt
Master        — id, name, specialization, photo, certifications
BlogPost      — id, slug, title, content, authorId, tags[], modelTags[], publishedAt
CMSBlock      — id, key, content (JSON for rich text), updatedAt
```

### Key Patterns

- **Auth:** JWT in httpOnly cookie. `auth()` helper in Server Components. Middleware for route protection.
- **Polling:** `/api/appointments/[id]/status` polled every 30 seconds via React Query. No server-side SSE state. Manager updates trigger DB write → clients poll and see new status.
- **Booking wizard:** URL-based steps (`/booking/step/1` through `/booking/step/5`), data in React Context + localStorage.
- **shadcn/ui:** All components in `/components/ui/`, restyled via Tailwind CSS variables in `globals.css`.
- **File uploads:** Presigned URLs from Yandex Object Storage. Client uploads directly to S3.
- **CMS:** `CMSBlock` table keyed by string (e.g., `home.hero.title`). Admin can edit via simple form.

## Runtime Environment

- **Start:** `npm run dev` (Vercel dev) or `next dev`
- **Port:** 3000
- **DB:** PostgreSQL (local: `postgresql://localhost:5432/geoleoteka`)
- **Env vars:** `DATABASE_URL`, `JWT_SECRET`, `SMSC_LOGIN`, `SMSC_PASSWORD`, `YANDEX_ACCESS_KEY`, `YANDEX_SECRET_KEY`, `YANDEX_BUCKET`
- **Deploy path:** Vercel or Yandex Cloud (static export possible for public site)

## Assumptions

- PostgreSQL available and accessible during development
- SMSC.ru account active for SMS sending
- Yandex Cloud account for Object Storage
- Yandex Maps API key available for map embedding
- Images (hero, team photos, service gallery) will be provided

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| VIN decoder API unreliable | Medium | Medium | Allow manual entry fallback, cache decode results |
| Polling adds latency | Low | Low | 30s interval is acceptable for repair status; manager-triggered SMS provides immediate notification |
| Booking slot conflicts under concurrent load | Medium | High | DB unique constraint on (dateTime, masterId); optimistic locking |
| SMS delivery delays for status updates | Low | Medium | Log all SMS; manager can resend manually from admin panel |
| Large file uploads (photos) | Medium | Low | Limit to 10MB per file; compress on client before upload |

## Goal Verification

### Truths

1. User can register, log in, and access client portal
2. User can add a vehicle (by VIN or manually) and see service interval indicators
3. User can complete a 5-step booking wizard and receive SMS confirmation
4. Manager can see all appointments in calendar view, change status
5. Client portal shows status updates via React Query polling (refreshes within 30 seconds of manager change)
6. Loyalty points are awarded after each completed appointment
7. Manager can build an estimate and send to client; client can approve/reject items
8. Public site is indexed by search engines (SSR renders all content)
9. All text content is editable via admin CMS panel

### Artifacts

- `app/(public)/booking/page.tsx` — 5-step booking wizard
- `app/(portal)/cabinet/page.tsx` — client dashboard with status tracking
- `app/(admin)/admin/page.tsx` — manager dashboard
- `app/api/appointments/[id]/status/route.ts` — polling endpoint for status updates
- `prisma/schema.prisma` — complete database schema
- `app/actions/auth.ts` — auth Server Actions

## E2E Test Scenarios

### TS-001: Client Registration and First Booking
**Priority:** Critical
**Preconditions:** No existing account
**Mapped Tasks:** Task 2, Task 3, Task 4, Task 5

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to `/` | Home page loads with hero, services, models |
| 2 | Click "Запись на сервис" | Booking wizard step 1 (service selection) |
| 3 | Select "Техническое обслуживание" | Service selected, Next button enabled |
| 4 | Enter VIN "WDD1690231J123456" | Vehicle auto-filled (model, year) |
| 5 | Pick next available date/time slot | Slot selected, highlighted |
| 6 | Fill contacts: name, phone, email | Form validated, Next enabled |
| 7 | Click "Записаться" | Confirmation page with appointment summary |
| 8 | Receive SMS with confirmation code | SMS delivered to phone |

### TS-002: Status Tracking in Client Portal
**Priority:** Critical
**Preconditions:** Existing appointment in "В ремонте" status
**Mapped Tasks:** Task 6, Task 9

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Log in to `/cabinet` | Dashboard shows active appointment |
| 2 | Click appointment card | Status board shows "В ремонте" with ETA |
| 3 | Manager changes status to "Готов" in admin | Portal status updates to "Готов" within 30 seconds (polling) |
| 4 | Notice badge on "Готов" | Notification appears, SMS received |

### TS-003: Loyalty Points Earned After Visit
**Priority:** High
**Preconditions:** Completed appointment, client has Silver tier
**Mapped Tasks:** Task 6, Task 10

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Manager marks appointment as "Готов" and sets final cost | System credits loyalty points (1% of cost) |
| 2 | Client logs into portal | Loyalty card shows +N points, total updated |
| 3 | Client visits loyalty page | Transaction history shows "Визит #N" entry |

### TS-004: Estimate Approval Flow
**Priority:** High
**Preconditions:** Estimate created by manager, sent to client
**Mapped Tasks:** Task 7, Task 10

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Manager creates estimate: "Замена масла" (₽4500) + "Масляный фильтр" (₽1200) | Estimate created with 2 line items |
| 2 | Manager clicks "Отправить клиенту" | Client receives SMS with estimate link |
| 3 | Client opens link, sees 2 items, clicks reject on filter | Filter marked rejected, total updated to ₽4500 |
| 4 | Manager sees rejected item, contacts client, approves manually | Estimate status → APPROVED |

## Progress Tracking

- [x] Task 1: Project setup
- [x] Task 2: Database schema
- [x] Task 3: Authentication
- [x] Task 4: Public site core (layout, home, services, models, about, contacts)
- [x] Task 5: Online booking wizard
- [x] Task 6: Client portal (dashboard, cars, history, tracking, loyalty)
- [x] Task 7: Manager panel (dashboard, calendar, appointment management, estimates)
- [x] Task 8: Notifications (SMSC.ru, polling infrastructure)
- [x] Task 9: CMS basics
- [x] Task 10: Blog — SKIPPED per user request

**Total Tasks:** 10 | **Completed:** 10 | **Remaining:** 0

## Implementation Tasks

---

### Task 1: Project Setup

**Objective:** Scaffold Next.js 15 project with TypeScript, Tailwind, shadcn/ui, Prisma, and folder structure.

**Dependencies:** None
**Mapped Scenarios:** None

**Files:**

- Create: `package.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `tailwind.config.ts`
- Create: `prisma/schema.prisma` (empty to start, filled in Task 2)
- Create: `.env.example`
- Create: `app/globals.css`
- Create: `app/layout.tsx`
- Create: `app/(public)/layout.tsx`
- Create: `app/(portal)/layout.tsx`
- Create: `app/(admin)/layout.tsx`
- Create: `components/ui/button.tsx` (shadcn base)
- Create: `lib/utils.ts`

**Key Decisions:**

- Use `create-next-app` with `--typescript --tailwind --app --src-dir=false`
- shadcn/ui via `npx shadcn@latest init` after scaffold
- Prisma via `npx prisma init`
- CSS variables for brand theme (--color-primary, --color-secondary, etc.)

**Definition of Done:**

- [ ] `npm run dev` starts without errors
- [ ] `npx prisma generate` succeeds
- [ ] Tailwind classes work in components
- [ ] `app/globals.css` contains brand CSS variables

**Verify:**

- `npm run build` exits 0
- `npx prisma validate` exits 0

---

### Task 2: Database Schema

**Objective:** Define complete Prisma schema for all Phase 1 entities.

**Dependencies:** Task 1
**Mapped Scenarios:** TS-001, TS-002, TS-003, TS-004

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/001_initial/migration.sql`

**Key Decisions:**

- `User.role` enum: CLIENT, MANAGER, ADMIN
- `Appointment.status` enum: BOOKED, ACCEPTED, DIAGNOSIS, IN_REPAIR, QC, READY, COMPLETED, CANCELLED
- `Estimate.status` enum: PENDING, APPROVED, REJECTED
- `LoyaltyAccount.tier` enum: SILVER, GOLD, AMG_CLUB
- `Car.vin` is optional (user might not know it)
- `Appointment` has `dateTime` (unique with `masterId` for slot locking)
- `CMSBlock.content` is JSON for rich text storage

**Definition of Done:**

- [ ] `npx prisma migrate dev --name init` creates all tables
- [ ] `npx prisma generate` produces type-safe client
- [ ] All relations resolved (user→cars→appointments→services, etc.)

**Verify:**

- `npx prisma migrate diff` shows no issues
- `npx prisma db push` succeeds locally

---

### Task 3: Authentication

**Objective:** Implement user registration, login, logout, password reset via SMS.

**Dependencies:** Task 2
**Mapped Scenarios:** TS-001 (login)

**Files:**

- Create: `app/actions/auth.ts` — Server Actions: register, login, logout, requestPasswordReset, resetPassword
- Create: `lib/auth.ts` — JWT encode/decode helpers, session management
- Create: `app/middleware.ts` — Route protection (redirect to /login if no session)
- Create: `app/(public)/login/page.tsx`
- Create: `app/(public)/register/page.tsx`
- Create: `app/(public)/reset-password/page.tsx`
- Modify: `prisma/schema.prisma` (add PasswordReset model)

**Key Decisions:**

- JWT stored in httpOnly, secure, sameSite=lax cookie
- Password reset: generate 6-digit code, store in DB with expiry (15 min), send via SMSC.ru
- Session: 7-day expiry, refresh on activity
- Middleware matcher: `/cabinet/**`, `/admin/**`

**Definition of Done:**

- [ ] Register with email+phone creates User + sends SMS code
- [ ] Login with correct credentials sets session cookie
- [ ] Access to `/cabinet` redirects to login when unauthenticated
- [ ] Password reset flow: request → SMS code → new password

**Verify:**

- `curl -I http://localhost:3000/cabinet` redirects to `/login`

---

### Task 4: Public Site Core

**Objective:** Build public marketing pages: layout, home, services, models, about, contacts.

**Dependencies:** Task 1, Task 9 (CMS)
**Mapped Scenarios:** None

**Files:**

- Modify: `app/(public)/layout.tsx` — shared header/footer
- Modify: `app/(public)/page.tsx` — home with hero, stats, services, models, reviews, FAQ, map
- Create: `app/(public)/services/[slug]/page.tsx`
- Create: `app/(public)/models/[slug]/page.tsx`
- Create: `app/(public)/about/page.tsx`
- Create: `app/(public)/contacts/page.tsx`
- Create: `components/shared/Header.tsx`
- Create: `components/shared/Footer.tsx`
- Create: `components/shared/WhatsAppFloat.tsx`
- Create: `components/shared/YandexMap.tsx`
- Create: `components/ui/Accordion.tsx`, `Carousel.tsx` (shadcn)

**Key Decisions:**

- SSR for all public pages (SEO)
- Static generation where possible (`generateStaticParams` for services/models)
- Yandex Map embedded via `@pbe/react-yandex-maps` or direct JS SDK
- FAQ accordion from shadcn Accordion
- Reviews carousel: hardcoded for now (from Yandex/Google), CMS-managed
- Service/Model pages: slug-based routing from DB (seed data)

**Definition of Done:**

- [ ] Home page renders with hero, stats counter, services grid, models, FAQ, map
- [ ] `/services/to` renders service detail with description, price range, applicable models
- [ ] `/models/g-class` renders G-Class page with available services
- [ ] `/contacts` shows phones, hours, email, embedded Yandex map
- [ ] All pages mobile-responsive

**Verify:**

- `npm run build` succeeds with `output: 'standalone'`

---

### Task 5: Online Booking Wizard

**Objective:** 5-step booking form with vehicle data, calendar slot selection, contact info, and confirmation.

**Dependencies:** Task 2, Task 3, Task 9
**Mapped Scenarios:** TS-001

**Files:**

- Create: `app/(public)/booking/page.tsx` — step 1 (service selection)
- Create: `app/(public)/booking/step-2/page.tsx` — vehicle data
- Create: `app/(public)/booking/step-3/page.tsx` — date/time calendar
- Create: `app/(public)/booking/step-4/page.tsx` — contacts + notes
- Create: `app/(public)/booking/step-5/page.tsx` — confirmation
- Create: `components/booking/ServiceSelector.tsx`
- Create: `components/booking/VehicleInput.tsx` (VIN decoder integration)
- Create: `components/booking/CalendarSlotPicker.tsx`
- Create: `components/booking/ContactForm.tsx`
- Create: `app/actions/booking.ts` — Server Actions: createAppointment, getAvailableSlots
- Create: `lib/vin-decoder.ts` — VIN decoding utility (mock or API)

**Key Decisions:**

- URL-based steps so each step is bookmarkable
- `useBookingStore` (React Context + localStorage) persists data between steps
- Calendar slots: fetch from `/api/slots?date=&service=` — returns available times
- Slot locking: optimistic UI, DB unique constraint prevents double-booking
- VIN decoder: try public API first, fallback to manual entry
- SMS confirmation sent via SMSC.ru after booking creation

**Definition of Done:**

- [ ] 5-step wizard completes and creates Appointment record in DB
- [ ] SMS confirmation received within 60 seconds
- [ ] Conflict handling: if slot taken, user sees error and offered alternatives
- [ ] Back navigation preserves entered data

**Verify:**

- Complete full wizard, verify Appointment exists in DB

---

### Task 6: Client Portal

**Objective:** Build client personal account: dashboard, vehicles, history, status tracking, loyalty.

**Dependencies:** Task 2, Task 3, Task 5, Task 8
**Mapped Scenarios:** TS-002, TS-003

**Files:**

- Modify: `app/(portal)/layout.tsx` — portal shell with sidebar navigation
- Modify: `app/(portal)/cabinet/page.tsx` — dashboard with active appointments, quick stats
- Create: `app/(portal)/cabinet/cars/page.tsx`
- Create: `app/(portal)/cabinet/cars/add/page.tsx`
- Create: `app/(portal)/cabinet/history/page.tsx`
- Create: `app/(portal)/cabinet/tracking/page.tsx` — status board with React Query polling
- Create: `app/(portal)/cabinet/loyalty/page.tsx`
- Create: `app/(portal)/cabinet/notifications/page.tsx`
- Create: `components/portal/StatusBoard.tsx` — polling-powered status display
- Create: `components/portal/CarCard.tsx`
- Create: `components/portal/ServiceIntervalIndicator.tsx`
- Create: `components/portal/LoyaltyCard.tsx`
- Modify: `app/actions/loyalty.ts` — award points, check tier upgrade
- Create: `app/api/appointments/[id]/status/route.ts` — polling endpoint

**Key Decisions:**

- React Query polls `/api/appointments/[id]/status` every 30 seconds
- Manager update writes to DB → client poll picks up change within 30s
- Service interval indicators: stored computed values (next oil change at mileage X, etc.)
- Loyalty tier upgrade: checked after each points crediting (tier thresholds: Silver=0-999, Gold=1000-4999, AMG_CLUB=5000+)

**Definition of Done:**

- [ ] Dashboard shows current appointments, loyalty balance, recent history
- [ ] Add vehicle: VIN decode fills model/year, manual fallback works
- [ ] Status tracking: poll refreshes status within 30 seconds of manager change
- [ ] Loyalty page: balance, tier badge, transaction history, referral link
- [ ] Notification center: list of all sent notifications with read status
- [ ] Estimate agreement: rejecting items recalculates displayed total in real time

**Verify:**

- Open two browsers: manager changes status in admin → client portal updates within 5 sec

---

### Task 7: Manager Panel

**Objective:** Build simplified manager dashboard, calendar, appointment and estimate management.

**Dependencies:** Task 2, Task 3
**Mapped Scenarios:** TS-002, TS-003, TS-004

**Files:**

- Modify: `app/(admin)/layout.tsx` — admin shell with sidebar
- Modify: `app/(admin)/admin/page.tsx` — dashboard (today's count, active jobs, revenue)
- Create: `app/(admin)/admin/calendar/page.tsx` — day/week calendar view
- Create: `app/(admin)/admin/customers/page.tsx` — customer list + detail cards
- Create: `app/(admin)/admin/customers/[id]/page.tsx` — customer detail
- Create: `app/(admin)/admin/estimates/page.tsx` — estimate builder
- Create: `app/(admin)/admin/estimates/[id]/page.tsx` — estimate detail + send
- Create: `components/admin/Calendar.tsx` — custom calendar component
- Create: `components/admin/AppointmentCard.tsx`
- Create: `components/admin/EstimateBuilder.tsx`
- Create: `app/actions/admin.ts` — Server Actions: updateAppointmentStatus, createEstimate, etc.
- Modify: `app/api/sse/status/route.ts` — also handles broadcasting from admin

**Key Decisions:**

- Calendar: custom-built with date-fns (no external calendar lib needed)
- Color coding: appointment status determines card color
- Estimate builder: add rows (work/part), set prices, send URL to client
- Revenue counter: sum of COMPLETED appointments for today
- Manager role required for all `/admin/**` routes (middleware check)

**Definition of Done:**

- [ ] Dashboard shows today's appointments count, active jobs, daily revenue
- [ ] Calendar shows all appointments, drag-drop disabled (simple view for now)
- [ ] Click appointment → change status (all transitions work)
- [ ] Create estimate → send link to client → client approves/rejects → status updates
- [ ] Estimate total recalculates when individual items are approved/rejected

**Verify:**

- Manager marks appointment "Готов" → SMS sent to client + DB updated → client portal polls and sees "Готов" within 30s

---

### Task 8: Notifications (SMS + Polling Infrastructure)

**Objective:** Integrate SMSC.ru for transactional SMS, set up polling endpoint for status updates.

**Dependencies:** Task 2, Task 3
**Mapped Scenarios:** TS-001, TS-002

**Files:**

- Create: `lib/sms.ts` — SMSC.ru HTTP API client
- Modify: `app/actions/booking.ts` — send confirmation SMS on appointment create
- Modify: `app/actions/admin.ts` — send status change SMS, reminder SMS
- Create: `app/api/appointments/[id]/status/route.ts` — status polling endpoint
- Create: `app/actions/notifications.ts` — on-demand reminder check

**Key Decisions:**

- SMSC.ru HTTP API (no SDK needed — simple GET/POST)
- SMS types: BOOKING_CONFIRMATION, STATUS_CHANGE, REMINDER_1_DAY, REMINDER_SAME_DAY, ESTIMATE_READY
- Reminders: checked on client portal load — query `dateTime between now+20h and now+26h and status != COMPLETED/CANCELLED`, send at most once per appointment (check Notification.sentAt)
- Polling: React Query `refetchInterval: 30000` on `/api/appointments/[id]/status`
- All SMS logged in `Notification` table

**Definition of Done:**

- [ ] Booking creates appointment → SMS sent within 5 seconds
- [ ] Manager changes status → client gets SMS notification
- [ ] Appointment tomorrow → reminder SMS sent automatically on next portal load

**Verify:**

- Trigger each SMS type manually, verify delivery

---

### Task 9: CMS Basics

**Objective:** Database-backed editable content for key text blocks, team profiles, blog.

**Dependencies:** Task 2, Task 4
**Mapped Scenarios:** None

**Files:**

- Modify: `prisma/schema.prisma` (CMSBlock, BlogPost, Master models already included)
- Create: `app/(admin)/admin/cms/page.tsx` — CMS editor
- Create: `app/(admin)/admin/team/page.tsx` — master profiles editor
- Create: `app/(admin)/admin/blog/page.tsx` — blog post list
- Create: `app/(admin)/admin/blog/[id]/page.tsx` — blog post editor
- Create: `app/actions/cms.ts` — Server Actions for content CRUD
- Modify: `app/(public)/page.tsx` — fetch CMSBlock values for dynamic content
- Modify: `app/(public)/about/page.tsx` — fetch Master profiles
- Modify: `app/(public)/blog/page.tsx`, `app/(public)/blog/[slug]/page.tsx`

**Key Decisions:**

- CMSBlock: key-value store. Key examples: `home.hero.title`, `home.stats.years`, `contacts.phone`
- Simple form in admin: key selector + textarea (or rich text) + save
- Blog: full CRUD with title, content (plain text or Markdown), tags, published status
- Master profiles: photo upload to Yandex Object Storage

**Definition of Done:**

- [ ] Admin can edit homepage hero text and save; public site reflects change on reload
- [ ] Admin can add/edit blog posts; posts appear on `/blog`
- [ ] Admin can manage master profiles; `/about` renders them

**Verify:**

- Edit a CMSBlock via admin → reload public page → change is visible

---

### Task 10: Blog

**Objective:** Complete blog functionality: post list, individual post pages, tags, author attribution.

**Dependencies:** Task 9
**Mapped Scenarios:** None

**Files:**

- Modify: `app/(public)/blog/page.tsx` — post list with tag filters
- Create: `app/(public)/blog/[slug]/page.tsx` — individual post
- Create: `app/(public)/blog/tag/[tag]/page.tsx` — filtered by tag
- Create: `components/blog/PostCard.tsx`
- Create: `components/blog/TagFilter.tsx`
- Create: `components/blog/ShareButtons.tsx`
- Modify: `app/(admin)/admin/blog/page.tsx` (already in Task 9)

**Key Decisions:**

- Blog post content: stored as Markdown, rendered with `react-markdown`
- Tags: `modelTags[]` (G-Class, E-Class) and `serviceTags[]` (oil, brakes)
- Share buttons: copy link, WhatsApp, Telegram (no external SDK — native sharing)
- Author: links to master profile on `/about`

**Definition of Done:**

- [ ] Blog list page shows all published posts with tags
- [ ] Clicking tag filters posts
- [ ] Post page renders Markdown, shows author, tags, share buttons
- [ ] Related posts section at bottom (by shared tags)

**Verify:**

- Create a blog post via admin → appears on `/blog` → renders correctly

---

## Open Questions

None — all key decisions resolved during /prd and Batch 1 questions.
