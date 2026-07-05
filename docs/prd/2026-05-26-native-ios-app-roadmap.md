# Native iOS Customer App & Mobile Platform — Roadmap

Created: 2026-05-26
Author: aleksandr.spiskov@gmail.com
Category: Feature
Status: Deferred — 2026-05-26: parked in favor of codebase preparation/optimization first; revisit when ready. Decisions and research below remain valid.
Research: Deep

> **This is a high-level roadmap PRD** — an umbrella to track the whole initiative. Each phase below spawns its own deeper PRD or `/spec` when it's picked up. It is intentionally broader and shallower than a single-feature PRD.

## Problem Statement

Geleoteka is a Next.js web platform for G‑Class auto service (public site, client cabinet, admin, warehouse WMS). The product direction is a **multi‑tenant, multi‑module SaaS** (one platform, many tenant organizations, each enabling modules — service, rentals, parts shop, warehouse) — **not white‑label**. The first mobile surface is a **native Swift iOS customer app** that lets a tenant's end‑customers use their personal cabinet, track orders, and place new orders. The immediate, concrete milestone is **that customer app deployed to TestFlight**, built professionally because this is a commercial product. The team accepts large refactors to do it right.

The forcing constraint: a native app **cannot** call Next.js server actions, so a real, addressable, token‑authenticated API is a hard prerequisite — and that API should be tenant‑aware from day one to fit the SaaS direction.

## Core User Flows

The customer iOS app (v1 surface = **Site modules — service / rental / shop — plus the cabinet**). Payments are deferred (browse + cart only).

### Flow 1: Sign in / register
1. Customer opens the app, signs in (email/password → bearer + refresh tokens stored in Keychain) or registers.
2. App resolves the customer's tenant from their credentials and loads tenant‑scoped data.
3. Account deletion is available in‑app (Apple Guideline 5.1.1(v)).

### Flow 2: Cabinet & order tracking
1. Customer views their cabinet: profile, active and past orders (repair orders, parts orders, rentals).
2. Customer opens an order to see live status (and estimates where applicable).

### Flow 3: Book a service
1. Customer browses the tenant's services, picks a slot, and submits a booking.
2. The booking appears in the cabinet with status.

### Flow 4: Rent a car
1. Customer browses available rental vehicles and dates, and submits a rental request.

### Flow 5: Parts shop (browse + cart, no checkout in v1)
1. Customer browses the parts catalog and builds a cart / draft order.
2. Checkout/payment is handed off (web or a later phase) — **not** implemented natively in v1.

## Scope

### In Scope (this roadmap)
- A phased path from today's web platform to a **customer iOS app on TestFlight**, then to a maturing multi‑tenant SaaS.
- A **tenant‑aware mobile API** (REST, versioned, OpenAPI) over a shared data‑access layer.
- The **customer app** covering Site (service / rental / shop) + cabinet, with payments deferred.

### Explicitly Out of Scope
- **White‑label / per‑vendor branded app builds** — the product is multi‑tenant SaaS, not white‑label; this removes Apple 4.2.6 clone concerns and per‑vendor signing/distribution work.
- **Native payments / checkout in v1** — browse + cart only; physical‑goods payment can later use external/web payment (no Apple IAP required), but is deferred.
- **A dedicated tenant‑operations mobile app** — deferred; the **web admin already serves operations**. If a mobile ops need appears later, lean toward **combining** (role‑gated operator screens in the same app) rather than a separate app, since the white‑label driver for separation is gone.
- **Android** — iOS first.

## Phased Roadmap (tracking)

### Phase 0 — Logistics prerequisites (start in parallel; has lead time)
- [ ] Enroll in the **Apple Developer Program as an Organization** (requires a **D‑U‑N‑S number** + legal entity; an individual account is the wrong vehicle for a commercial product).
- [ ] Provision a **Mac + Xcode**; reserve an `App Store Connect` record + bundle id (e.g. `ru.geleoteka.app`).

### Phase 1 — Mobile API foundation + token auth + tenant scoping  *(→ its own PRD/`spec`)*
- [ ] Introduce a **shared data‑access / service layer**; refactor existing server actions to call it (the "big refactor" — one source of business logic).
- [ ] Add versioned **`/api/v1` REST Route Handlers** inside the Next.js app over that layer.
- [ ] **Bearer JWT + rotating refresh tokens** (login / refresh / logout endpoints); designed for iOS Keychain storage; reuse `lib/auth.ts` signing.
- [ ] **Tenant scoping** on every request via token claims + **Postgres RLS** (defense‑in‑depth with a Prisma filter).
- [ ] Publish an **OpenAPI contract** + a **minimum‑supported‑version / force‑upgrade** flag mechanism (build it early).
- [ ] **First delivery slice (recommended):** auth + cabinet + order‑tracking **reads**, so a real app can reach TestFlight fastest and de‑risk the pipeline. **Fast‑follow:** service‑booking / rental / shop‑browse **writes**.

### Phase 2 — Customer iOS app → TestFlight  *(→ its own PRD/`spec`)*
- [ ] **SwiftUI + `@Observable` MVVM**; `URLSession` + **Apple Swift OpenAPI Generator** for a typed client from the contract.
- [ ] **Keychain** token store with an **actor‑serialized refresh** flow (single‑flight on 401).
- [ ] App slices mirroring Phase 1: auth + cabinet + order tracking first → then service / rental / shop (browse + cart).
- [ ] **Account deletion** in‑app; guest/browse without forced login for non‑account content (Guideline 5.1.1).
- [ ] Signing + delivery: **Xcode Cloud** to start → **Fastlane `match` + CI** as the team/pipeline grows.
- [ ] **TestFlight internal** testing first (no Beta App Review); external pilot later (Beta App Review; 90‑day build expiry).

### Phase 3 — Multi‑tenant SaaS platform maturation  *(backdrop track; later)*
- [ ] True tenant onboarding, per‑tenant module enablement, tenant‑scoped everything end‑to‑end, (and billing) — the platform productization. The API/auth in Phase 1 must be tenant‑aware so this isn't a rewrite; full productization is its own initiative and does **not** block the first TestFlight app for the current tenant.
- [ ] (If needed) tenant‑operations mobile surface — revisit combine‑vs‑separate then.

## Technical Context

- **Stack today:** Next.js 16 (App Router, server actions), React 19, TypeScript, Prisma 6 + PostgreSQL, custom JWT in httpOnly cookies, deployed on Railway. Schema already carries a `tenantKey` discriminator (tenant‑ready, currently effectively single‑tenant).
- **API:** REST chosen over GraphQL/tRPC (tRPC's type‑safety benefit is web‑only; REST is the universally consumable choice and OpenAPI→Swift codegen friendly). Host inside Next.js initially; extraction to a dedicated service is a later option made cheap by the shared service layer (transport swap, not logic rewrite).
- **Auth:** dual‑mode — cookies stay for web; bearer + refresh for native. Embed tenant id + role as JWT claims; never trust a client‑supplied tenant.
- **iOS:** SwiftUI / `@Observable` / SPM; VisionKit `DataScannerViewController` (iOS 16+/A12+) is the path for QR scanning **if/when** a warehouse/ops surface lands on mobile (not in the customer app). Deployment target likely iOS 17 for `@Observable` ergonomics.
- **Ramp cost (honest):** first native app for a web team is a real new‑platform ramp — code signing/provisioning and Swift 6 strict concurrency are the main cost centers; budget weeks, not days, for the first engineer.

## Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| App framework | Native **Swift / SwiftUI** | User wants a professional native app; commercial product |
| Two‑codebase maintenance | **Accepted** — native Swift chosen over Capacitor (one codebase) and React Native (shared logic) | Native quality deliberately prioritized over single‑codebase simplicity; duplication is limited to the **presentation layer** because all business logic is single‑source behind the Phase‑1 API |
| Product model | **Multi‑tenant multi‑module SaaS** (NOT white‑label) | User clarified; removes Apple 4.2.6 / per‑vendor‑build complexity |
| First app | **Customer app** (cabinet + Site: service/rental/shop) | The primary audience; natural first App Store app |
| Tenant‑ops mobile app | **Deferred** (web admin serves ops); lean **combine** later if needed | No white‑label driver for separation; ops not a v1 need |
| API style | **REST**, versioned `/api/v1`, OpenAPI | Universally consumable; Swift codegen; future third‑party use |
| API host | **Inside Next.js** over a shared DAL | Lower effort/single deploy; extraction later is a transport swap |
| Refactor | **Server actions → shared data‑access layer** | One source of business logic for web + mobile API |
| Auth (native) | **Bearer JWT + rotating refresh, Keychain** | Cookies don't translate to native; standard secure pattern |
| Tenant isolation | **Token claims + Postgres RLS** (early) | Durable isolation for a multi‑tenant product; retrofitting RLS is risky |
| Swift API client | **Apple Swift OpenAPI Generator** | Build‑time, always in sync with the server contract |
| QR scanning (future ops) | **VisionKit DataScanner** | Modern, low‑effort; only relevant if ops goes mobile |
| Delivery | **Xcode Cloud → Fastlane match** | Lowest setup to first TestFlight, then portable/reproducible |
| Apple account | **Organization enrollment (D‑U‑N‑S)** | Company owns app/certs/TestFlight; required for commercial |
| Payments (v1) | **Deferred — browse + cart only** | Smallest first scope; physical‑goods external payment possible later (no IAP) |
| First delivery slice | **Auth + cabinet + order‑tracking reads → TestFlight**, writes fast‑follow | Fastest real app on TestFlight; de‑risks the native↔API↔auth↔tenant pipeline |

## Research Findings (Deep)

Four parallel research streams (2026‑05‑26) informed the decisions above.

- **API layer:** Server Actions aren't addressable by native clients → a real API is required. Next.js officially supports being an API host (Route Handlers); the de‑duplication answer is a shared Data Access Layer called by both server actions and API routes. Native auth = bearer + rotating refresh in Keychain; additive/backward‑compatible versioning + an early force‑upgrade gate (App Store apps can't be force‑updated synchronously). Multi‑tenancy = shared DB + `tenantId`‑per‑row + Postgres RLS, scoped from token claims.
- **App strategy / Apple:** Industry default for consumer + staff is separate apps, but the strongest separation driver (white‑label/ABM distribution) does **not** apply here. Apple essentials that **do** apply to the customer app: 4.2 minimum functionality (the consumer side is rich, so low risk), 2.1 demo accounts for review, **5.1.1(v) account deletion** (mandatory), 4.8 Sign in with Apple only if a third‑party social login is added. TestFlight: internal (≤100, no review, immediate) first; external (≤10k, Beta App Review on first build); 90‑day build expiry.
- **White‑label (now out of scope):** Confirmed that the multi‑tenant‑SaaS framing avoids Apple 4.2.6 clone/template rejection and per‑vendor build pipelines entirely — a single tenant‑aware app under our own account is the clean path.
- **Swift delivery:** SwiftUI + `@Observable` MVVM, `URLSession` + Swift OpenAPI Generator, VisionKit DataScanner (future ops), Keychain + actor‑serialized refresh, Xcode Cloud → Fastlane match. Hard prereqs: Apple Developer Program (Organization, D‑U‑N‑S), App Store Connect, bundle id, code signing. First‑native‑app ramp is weeks; signing and Swift 6 concurrency are the main hurdles.

_Full source lists were captured during research; key references: Next.js "Building APIs" (official), Apple App Review Guidelines (4.2 / 5.1.1 / 4.8), Apple Swift OpenAPI Generator, VisionKit DataScannerViewController, Prisma + RLS multi‑tenancy, Fastlane match / Xcode Cloud._

## Open Questions (resolve when each phase is picked up)
- iOS **minimum deployment target** (17 for `@Observable` ergonomics vs 16 for older devices).
- **Payment** integration timing and provider for the parts shop (post‑v1).
- Scope and sequencing of **full multi‑tenancy productization** (Phase 3) — its own PRD.
- Exact **first‑TestFlight feature cut** within Phase 2 (confirm reads‑first vs a fuller first build).
