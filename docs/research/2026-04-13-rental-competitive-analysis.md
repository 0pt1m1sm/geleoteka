# Rental Module — Competitive Analysis: RentSyst

Created: 2026-04-13
Author: aleksandr's.spiskov@gmail.com
Research tier: Standard (direct site inspection via Chrome DevTools MCP)
Sources:
- https://rentsyst.com/ (homepage)
- https://rentsyst.com/price/ (full pricing + feature matrix)
- Capterra / G2 / Software Advice mentions on homepage (third-party review aggregators)

## TL;DR

- **RentSyst is a B2B SaaS CRM for car rental operators**, not a marketplace. They sell software TO rental businesses (€55/mo base, €2-3/vehicle at scale, 6 tiers, patented, 14-day free trial). They are **not competing with Geleoteka for end renters** — they're the off-the-shelf alternative to what Geleoteka would build if it wanted to operate a real rental business.
- **Geleoteka's current rental module is a lead-capture form + admin booking list.** It matches roughly what a RentSyst customer would get BEFORE activating any integrations. The gap is large but most of it is irrelevant to Geleoteka's current scale (3 G-Class cars).
- **The right mental model: RentSyst defines "what a professional rental operation needs."** Use their feature matrix as a reference for the rental module roadmap, but prioritize based on Geleoteka's actual use case (niche G-Class specialist in Russia), not their generic target (mid-size European rental operators).
- **Strategic note:** if Geleoteka's modules are refactored into clean, isolated units (see PRD `2026-04-13-rental-module-boundary.md`), this analysis also doubles as a feature roadmap for a hypothetical future SaaS pivot.

## What RentSyst Is

### Positioning

- **Tagline:** "CRM system for car rental business"
- **Self-description:** "Functional pocket office for car rental business. Cloud software accessible from any device and from anywhere in the world (web-application)"
- **Customer profile** (from their testimonials):
  - NBC Cars (CFO): "orders don't get lost… no more excel spreadsheets"
  - RV Drive (CEO): invoices + cash management, motorhome rental
  - Biker Solutions Motorcycle Park (CEO): reporting + statistics per client/vehicle
- **Geographic focus:** Europe-first (EUR pricing primary, PEPPOL e-invoicing support, "9 am to 6 pm gmt+2" support hours). USD option available.

### Pricing Model

6 tiers, priced by vehicle count. Feature access scales with tier — more expensive tiers unlock more capabilities.

| Tier | Vehicles | Base price | Per-vehicle | Effective monthly (annual billing, ~10% discount) |
|---|---|---|---|---|
| Beginner | 0-15 | €55 flat | — | ~€55/mo |
| Basic | 16-50 | — | €3.00 | ~€48-150 |
| Standard | 51-100 | — | €2.70 | ~€138-270 |
| Professional | 101-200 | — | €2.50 | ~€253-500 |
| Expert | 201-400 | — | €2.00 | ~€402-800 |
| Enterprise | 401+ | — | — | "Let's talk" |

**GPS telematics is an extra €2.50/vehicle/month** on top of the base tier.

**Paid services:** €50 training (1 hr), €150 onboarding (2 hrs), €100 setup, €300 payment gateway integration. Free installation. 14-day free trial.

## Feature Inventory (from pricing matrix)

### General / Operations

| Feature | What it does |
|---|---|
| Fleet Management | Register, tag, and status-track every vehicle |
| Daily task manager | Assign and schedule operations tasks (cleaning, prep, handover) |
| Calendar (timeline) | Gantt-style view of all bookings across the fleet — the core operator UI |
| Payments & cashflow | Track incoming payments, deposits, refunds, cash register |
| Reservation checklist | Pre-rent walkthrough checklist per booking |
| Maintenance | Service intervals, maintenance log per vehicle |
| Damage management | Log damages pre/post rental with photos, link to claims |
| Client management | Renter CRM — history, documents, blacklist |
| Violations & fines | Track police fines received for a specific rental, forward to renter |
| Reports & statistics | Revenue, utilization, client reports |
| Analytics | "Coming soon" — business intelligence layer |

### Booking & Pricing Features

| Feature | What it does |
|---|---|
| Short term rentals | Daily/weekly booking model |
| Long term leasing | Monthly subscription model (different pricing / contract) |
| Dynamic pricing | Seasonal, demand-based, day-of-week rate adjustments |
| Equipment management | Child seat, ski rack, GPS, extra driver — priceable add-ons |
| Digital agreement editor | Build contract templates with variable substitution |
| Digital signature | E-sign the agreement at handover |
| User management (roles) | Manager / operator / viewer role permissions |
| Sub-companies | Multi-branch / multi-entity support |
| Notifications | Booking confirmations, reminders, status changes |
| Email templates editor | Customize transactional emails |
| Check-in / check-out | Photo capture + condition record at handover/return |
| OverBooking prevention | Calendar-aware — blocks double-booking the same car |
| Fuel policy | Full-to-full / prepaid / same-level, with overage fee |
| Mileage limits | Per-day or total, with overage pricing |
| Discounts | Codes, periods, tiered |
| Loyalty program | Points / tier system for repeat renters |

### Integrations

| Feature | What it does |
|---|---|
| Online reservation (booking engine) | Embed a booking widget on your own website |
| Online payments | Charge cards for deposits + rental fees |
| Card authorization | Hold a security deposit on the card without capturing |
| Accounting | Export to accounting software |
| E-invoicing | EU-compliant electronic invoices |
| Peppol | EU public procurement invoice network |
| Car Brokers (OTA) | Kayak, Rentalcars.com, etc. — receive bookings from aggregators |
| Agent management (referrals) | Track commissions from travel agents / affiliates |
| API access | Programmatic access to RentSyst data |
| Integration request | Build a custom integration (paid, €300+) |

### GPS & Telematics (€2.50/vehicle/mo add-on)

| Feature | What it does |
|---|---|
| GPS dashboard | Live position of every vehicle |
| Vehicle moving history | Replay routes |
| Tech parameters | RPM, fuel level, engine temp, etc. |
| Driver behavior alerts | Speeding, harsh braking, idling |
| Remote controls | Engine immobilization, door lock/unlock |
| GPS movement activity logs | Compliance-grade event trail |

### Extras / Platform

| Feature | What it does |
|---|---|
| Web-app | Accessible from any device |
| Multiple languages | UI translations |
| Driver's cabinet | Renter self-service portal (their bookings, documents, payments) |
| Safety & Back-up | Data redundancy |
| Data export | Export to CSV/JSON |
| Fleet import | Bulk import vehicles from spreadsheet |
| 2FA & security logs | Admin account security |
| Unlimited data storage | No per-record limits |

## Geleoteka's Current Rental Module (as of 2026-04-13)

### Public surface

- `/rentals` — Flat grid of 3 G-Class cars (G 500, G 400d, G 63 AMG)
- `/rentals/[id]` — Detail page: image gallery, spec table (engine, HP, transmission, features, seats, color, mileage), description, booking form
- Booking form captures: `startDate`, `endDate`, `contactName`, `contactPhone`, `contactEmail`, `notes`. Calculates `totalCost` client-side from `dailyRate × days`.

### Admin surface

- `/admin/rentals` — Fleet list, click-to-edit
- `/admin/rentals/new` — Add car form
- `/admin/rentals/[id]` — Edit car form (model, year, dailyRate, description, engine, HP, transmission, features, seats, color, plate, mileage, isAvailable)
- `/admin/rentals/bookings` — Booking list with status changer (PENDING → CONFIRMED → ACTIVE → COMPLETED / CANCELLED)

### Data model

```prisma
model RentalCar {
  id, model, year, dailyRate, photos[], description,
  isAvailable, plate, color, mileage,
  engine?, horsepower?, transmission?, features[], seats
}

model RentalBooking {
  id, carId, userId?, status, startDate, endDate, totalCost,
  contactName, contactPhone, contactEmail, notes
}
```

That's it. No calendar, no contracts, no payment, no documents, no damage, no extras, no pricing tiers, no emails, no renter cabinet (the `/cabinet/rentals` page exists as a portal entry but is currently a stub).

## Gap Analysis

### ⭐ Must-have for "professional rental module" (Phase 2+ roadmap)

Ordered by value × feasibility, based on the "growing rental business + optionality to sell as platform" goal.

| # | Feature | Why it matters | Rough effort |
|---|---|---|---|
| 1 | **Calendar/timeline view** in admin | Core operator UI. "Which car is free next Saturday?" is unanswerable without it. RentSyst leads with this as their primary screen. | Medium (2-3 days) |
| 2 | **Overbooking prevention** | Hard guarantee that two bookings on the same car can't overlap. Implicit in every serious system. | Small (1 day) — DB-level unique constraint + UI-level availability check |
| 3 | **Email notifications on status change** | Renter doesn't get any email today. Booking confirmation, status change, reminder before pickup are table-stakes. Leverages existing `sendStatusChange` from the service module. | Small-medium (2 days) |
| 4 | **Digital rental agreement (PDF generation)** | Legal + insurance exposure. G-Class rental without a signed contract is reckless. Start with PDF; e-signature comes later. | Medium (3-4 days) |
| 5 | **Renter document capture** (passport, license photos) | Russian law requires ID + license verification per rental. Currently not in the model. | Small-medium (2 days) — file upload + storage (Railway volume or S3-compatible) |
| 6 | **Damage check-in/check-out photos** | Dispute prevention at return. Photos attached to the booking record. | Medium (3 days) — ties into the check-in/out flow and storage infra |
| 7 | **Extras / add-ons** | Child seat, delivery, extra driver, additional km — standard rental options. Needs a 1:many model (`BookingExtra`). | Medium (3-4 days) |
| 8 | **Mileage limit + overage pricing** | Standard rental term. Field on `RentalCar` for allowance, field on `RentalBooking` for actual + fee. | Small (1 day) |
| 9 | **Fuel policy** | Full-to-full is the default everywhere; currently no field. | Small (half day) |
| 10 | **Renter's cabinet** activation | Portal page exists but is a stub. "My bookings" list + booking detail with document/contract download. | Small-medium (2 days) |
| 11 | **Pre-authorization / security deposit** | Hold amount on card at pickup. Requires online payment first. | Large — depends on payment integration |
| 12 | **Online payments** | Charge deposit + rental fee online. Options: Stripe (if international OK), YooKassa / CloudPayments (Russia-first). | Large (1-2 weeks) |

### 💡 Nice-to-have (Phase 3+)

- **Long-term leasing** — separate pricing model. Only if Geleoteka actually offers monthly rates.
- **Dynamic pricing** — seasonal rates (New Year spike, summer road trip season). Useful once volume justifies it.
- **Discount codes** — promo codes for marketing campaigns.
- **Loyalty program** — possibly integrate with existing Geleoteka loyalty module.
- **Digital signature** — upgrade from PDF to e-signed PDF. Legal weight varies by jurisdiction.
- **Multi-language** — if English-speaking tourist audience is real, otherwise skip.
- **Email template editor** — start with hardcoded templates, add editor only if operators need it.
- **Reservation checklist** — pre-rent prep items for the operator. Nice for ops discipline.
- **Violations & fines** — receive police fine → link to rental → forward to renter. Useful but niche.
- **Reports & statistics** — utilization, revenue, per-customer. Worth building once volume is there.
- **Client management (CRM for renters)** — blacklist, notes, history. Can leverage existing User model.

### 🚫 Out of scope for Geleoteka

| Feature | Why out |
|---|---|
| **GPS telematics** | Hardware cost (~$50/car one-time + mo) + G-Class renter demographic is sensitive about tracking. Not a deal-breaker for this niche. |
| **OTA/Car Brokers** (Kayak, Rentalcars.com) | Geleoteka is a G-Class specialist, not a listing on aggregator sites. Brand positioning is wrong. |
| **PEPPOL e-invoicing** | EU-specific; Geleoteka is Russia. |
| **Sub-companies / multi-branch** | Single location, single entity. Irrelevant until franchise happens. |
| **Agent management / referrals** | Travel agent distribution model. Wrong channel for this business. |
| **Daily task manager** | 3 cars doesn't need Gantt-style ops scheduling. Overkill for Geleoteka's ops headcount. |
| **Sub-company hierarchies** | Single-entity business. |

### 🎯 What Geleoteka already has that RentSyst either doesn't or charges extra for

| Feature | Geleoteka status |
|---|---|
| Service + parts + rental in one platform | **Unique.** RentSyst is rental-only. For a G-Class specialist workshop, the integrated experience (service history → estimate → parts order → loaner car) is a real differentiator. |
| Founder cost-split tracking | **Geleoteka-specific.** Not a rental feature, but an interesting ownership accounting layer that RentSyst doesn't do. |
| Loyalty program | Already in the schema and partially wired (`LoyaltyAccount`, `LoyaltyTransaction`). Can be reused. |
| SMS infrastructure | Via `lib/sms.ts` → `sendStatusChange` — already used by service appointment status changes. Rental module can reuse. |
| Existing user/auth system | JWT + httpOnly cookie — renters can share the same user account as service customers. RentSyst requires a separate "driver's cabinet" login. |

## Strategic Recommendations

### If Geleoteka is growing the rental business (current decision)

**Phase 2 — operational integrity** (recommended first implementation phase AFTER the architecture refactor):

1. Calendar/timeline view in admin
2. Overbooking prevention (DB constraint + UI check)
3. Email notifications on status change (reuse `lib/sms.ts` pattern)
4. Fuel policy + mileage limit fields

**Phase 3 — revenue enablement:**

5. Digital rental agreement PDF
6. Renter document capture (passport + license photos)
7. Damage check-in/out with photos
8. Renter cabinet activation (`/cabinet/rentals`)

**Phase 4 — payment & polish:**

9. Extras/add-ons pricing
10. Online payments (YooKassa or CloudPayments for Russia)
11. Security deposit pre-authorization
12. Discount codes

### If Geleoteka considers a platform pivot later

The competitive analysis above becomes a feature checklist for parity with RentSyst. The architecture refactor PRD preserves that optionality *without committing to it* — clean module boundaries mean Phase 2+ features can eventually be white-labelled per tenant.

**Realistic platform-play assessment:** RentSyst is patented, 6+ years mature, has OTA integrations, telematics hardware partnerships, and EU accounting integrations. Competing on features alone is a losing bet. The only defensible pivot would be a *niche* SaaS — "rental management for specialist workshops" (G-Class, Porsche, Tesla specialists) — where the service + parts + rental integration is the moat. That's a plausible but separate product decision; this analysis just preserves the option.

## Open Questions (deferred to future PRDs)

- **Payment provider:** Stripe (international, clean API, 2.9% + ₽ conversion) vs YooKassa (Russia-native, no card-authorization hold, lower fees) vs CloudPayments (Russia-native, supports auth-hold, higher fees). Decision impacts the architecture of the payment integration significantly.
- **File storage:** Railway persistent volume (simple, coupled to Railway) vs S3-compatible (Cloudflare R2, Backblaze B2 — cheaper, decoupled). Impacts document and damage-photo capture.
- **Contract PDF generation:** Server-side with a template engine (Puppeteer / `@react-pdf/renderer` / `pdfkit`) vs client-side preview + server-side rendering. Impacts Phase 3.
- **E-signature legal weight in Russia:** Is a simple "I agree" checkbox sufficient, or do we need a qualified e-signature? Affects whether e-sign is Phase 3 or Phase 5.

## Sources

- [RentSyst homepage](https://rentsyst.com/) — product positioning, customer testimonials
- [RentSyst pricing page](https://rentsyst.com/price/) — complete feature matrix by tier
- [RentSyst blog](https://blog.rentsyst.com/) — Q1-2026 release notes (Broker integrations, PEPPOL)
- [RentSyst on Capterra](https://www.capterra.com/p/192757/RentSyst/) — third-party reviews
- [RentSyst API docs](https://documenter.getpostman.com/view/13468431/2s9YR6bEqX) — available on all tiers
