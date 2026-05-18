# SMTP / Email Integration Implementation Plan

Created: 2026-05-12
Author: aleksandr.spiskov@gmail.com
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Wire transactional email delivery into Geleoteka via Resend so booking confirmations, estimate-sent notifications, registration welcomes, part-order receipts, and rental-booking confirmations actually reach the customer. Today, nothing leaves the server — every flow either logs only or stays internal.

**Architecture:** Mirror the existing `lib/sms.ts` pattern: a generic `sendEmail(to, subject, html, text?)` wrapper around the Resend HTTP API with a mock fallback when `RESEND_API_KEY` is unset (so dev environments without creds keep working). On top of that, five typed sender helpers — one per flow — that own their subject + HTML template + plain-text fallback. Templates live in `lib/email/templates/` as small TSX-free string-builder functions (no extra deps: no react-email, no MJML). Wire each helper at exactly one call site in the corresponding server action; failures are fire-and-forget (logged via `console.error`, never thrown back to the user). Sender is `Geleoteka <info@geleoteka.ru>` once the domain is verified in Resend; until then, a `RESEND_FROM_FALLBACK` (e.g. `onboarding@resend.dev`) is used so dev/staging works.

**Tech Stack:** Resend HTTP API (no SDK — straight `fetch`, matching the `lib/sms.ts` pattern), Russian copy, Next.js 16 server actions, Prisma 6 (no schema changes).

## Scope

### In Scope

**Core library**

- `lib/email/send.ts` — `sendEmail({ to, subject, html, text? }): Promise<{ success: true } | { success: false; error: string }>`. Reads `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_FROM_FALLBACK` from env at module load. Mock mode (returns `{ success: true }` after `console.log`) when `RESEND_API_KEY` is unset — same shape as `lib/sms.ts:15`. Calls `POST https://api.resend.com/emails` with the Authorization header, returns the documented shape.
- `lib/email/templates/_layout.ts` — shared HTML wrapper: Geleoteka header strip (gold logo block + tagline), max-width 600px content area, footer with legal contact line, plain-text alternative builder. Pure string templating, no JSX, no inlined external assets — logo is a small inline `<svg>` or a `<table>`-based gold G mark so Outlook/mail.ru render it.
- `lib/email/templates/booking-confirmation.ts` — `renderBookingConfirmation({ customerName, dateTime, vehicleSummary, services, managerName?, managerPhone?, address }): { subject, html, text }`. Subject «Geleoteka — запись на ДД.ММ в HH:MM». Body: confirmation of slot + service summary + address + manager contact. **No claim-account CTA** — see Out of Scope.
- `lib/email/templates/estimate-sent.ts` — `renderEstimateSent({ customerName, estimateNumber, total, validUntil, viewUrl, pdfUrl })`. Subject «Geleoteka — смета №X на согласование». Body: total, validity date, primary CTA «Открыть смету» → `viewUrl`, secondary text-link «Скачать PDF».
- `lib/email/templates/registration-welcome.ts` — `renderRegistrationWelcome({ customerName, loginUrl })`. Subject «Geleoteka — добро пожаловать». Body: 2–3 sentences + CTA «Открыть личный кабинет».
- `lib/email/templates/part-order-confirmation.ts` — `renderPartOrderConfirmation({ customerName, orderId, items: [{ name, qty, unitPrice, total }], total, contactPhone, cabinetUrl? })`. Subject «Geleoteka — заказ запчастей принят». Body: line items + total + delivery/pickup note + (logged-in only) "Смотреть в личном кабинете" link.
- `lib/email/templates/rental-booking-confirmation.ts` — `renderRentalBookingConfirmation({ customerName, vehicleSummary, startAt, endAt, totalDays, totalPrice, pickupAddress, managerPhone? })`. Subject «Geleoteka — бронь автомобиля подтверждена». Body: dates, car, total, address, contact. **No claim-account CTA** — see Out of Scope.
- `lib/email/helpers.ts` — five thin helpers, one per template: `sendBookingConfirmationEmail`, `sendEstimateSentEmail`, `sendRegistrationWelcomeEmail`, `sendPartOrderConfirmationEmail`, `sendRentalBookingConfirmationEmail`. Each: validates `to` is present (no-op + log when empty), calls the template, calls `sendEmail`, logs on failure, returns `{ success }` (callers ignore the return — fire-and-forget).
- `lib/email/index.ts` — barrel re-export so call sites do `import { sendBookingConfirmationEmail } from "@/lib/email"` (matches the `lib/sms.ts` style of one-liner imports).

**Call-site integrations**

- `app/actions/booking.ts` — at line ~163 (next to the existing `sendBookingConfirmation` SMS call), add a parallel `sendBookingConfirmationEmail(...)` call inside the same dynamic-import block. Both run; either failing doesn't affect the other or the booking's success.
- **EXACTLY ONE call site: `app/actions/crm/estimates.ts:sendEstimate` (lines 121–154)** — the role-gated manager action. After the transaction commits and BEFORE returning, dispatch `sendEstimateSentEmail(...)` with the customer's email, estimate number, total, validUntil, the customer-facing `viewUrl` (cabinet path for logged-in, `/estimate/<token>` for guests), and a `pdfUrl` (`/api/estimates/<id>/pdf` for logged-in, `/api/estimates/<id>/pdf?token=<token>` for guests). **DO NOT wire into `app/actions/customer-estimates.ts`** — that file is the customer-side approve/decline surface (gated by `getSession` only, NOT role-gated); wiring there would let any logged-in CLIENT trigger sends.
- `app/actions/register.ts` — after the user is created, dispatch `sendRegistrationWelcomeEmail({ customerName, loginUrl: \`${origin}/login\` })`. Origin pulled from `headers().get("host")` + protocol detection (already used elsewhere in this codebase — see `repair-order` notification helper or `request-password-reset` if needed).
- `app/actions/part-orders.ts` — at the end of `createPartOrder` (after the `decrement` writes succeed, before returning), dispatch `sendPartOrderConfirmationEmail(...)` with the contact email + order items + total + claim token (for guests).
- `app/actions/rentals.ts` (`createRentalBooking` at line 146) — after the booking is persisted, dispatch `sendRentalBookingConfirmationEmail(...)` with the customer email, vehicle summary, dates, total, pickup address from CMS, and guest claim URL when applicable.

**Operational glue**

- `.env.example` — add `RESEND_API_KEY=`, `RESEND_FROM="Geleoteka <info@geleoteka.ru>"`, `RESEND_FROM_FALLBACK="onboarding@resend.dev"`. Do NOT add the real key here; document in a `## Setup` block of the in-repo README how to get a key from Resend dashboard + verify the `geleoteka.ru` domain (SPF + DKIM TXT records to add at the DNS provider). Until verified, the helper falls back to `RESEND_FROM_FALLBACK`.
- `README.md` (or `docs/setup-email.md` if README is already crowded) — short "Email setup" section: Resend signup → verify domain → add Railway env vars. Include the verbatim TXT-record format Resend gives (we don't predict it — implementer reads from Resend UI).

### Out of Scope

- **Password reset email.** Reset is currently SMS-based via `app/actions/request-password-reset.ts` (logs the code to console — separate SMS-delivery bug). Adding an email-alternative reset is a UX change (new "reset via email" form, dual-channel decision) that belongs in its own plan.
- **Email-based identity verification at registration.** No double-opt-in flow. Registration creates an active account immediately; the welcome email is informational, not gating.
- **Marketing / bulk / newsletter sends.** Resend supports it; we don't ship that here.
- **Customer-to-staff inbound email.** No SMTP receive, no parsing of replies. Reply-to is set to `info@geleoteka.ru` so replies go to the human inbox, but the app doesn't read them.
- **In-app `Notification` row creation alongside emails.** The `Notification` table exists in the schema for an in-app inbox, but the existing SMS helpers don't write to it either — we mirror that. Adding `Notification` writes is a separate concern.
- **Retry queue for failed deliveries.** Fire-and-forget per Q3 decision. A retry layer (Redis-backed BullMQ or similar) is its own plan if/when it's needed.
- **Per-customer email preferences / unsubscribe.** These are transactional emails — under both Russian (152-ФЗ) and EU/CAN-SPAM rules, transactional doesn't need an unsubscribe link. Marketing-class emails (which we don't send) would.
- **react-email / MJML / external template engine.** String-builder functions only. The five templates share one layout helper and stay small (<100 LOC each). Adding a template engine adds bundle weight and a build-time dep with no ergonomic win at this scale.
- **PDF attachments on email.** Estimate-sent email links to the PDF URL (`/api/estimates/<id>/pdf?token=...`) — does not attach. Resend supports attachments; we skip them because attachments inflate every email by ~25 KB minimum, hurt deliverability, and the same URL is anyway needed for the in-app "Скачать PDF" button.
- **Localisation.** Russian only — matches the rest of the customer-facing surface.
- **Repair-order status-change notifications** (e.g. "your car is ready for pickup" when a RepairOrder moves to COMPLETED). Deferred to a future iteration — not in this plan. The SMS module already emits `sendStatusChange` at `app/actions/admin.ts:72`; adding an email counterpart is one more `await import("@/lib/email")` block but materially expands review scope and template surface.
- **Guest claim-account CTAs in emails.** No claim CTA in `booking-confirmation`, `part-order-confirmation`, or `rental-booking-confirmation` emails. Reason: the existing claim flow is implemented only inside `components/shared/PostCheckoutAuthPanel.tsx`, which renders immediately after checkout submit and consumes `{ kind, orderId, claimToken, email }` as in-memory props. There is no `/claim/<token>` or `/cabinet?claim=<token>` route that can reconstruct this context from a link. Adding such a route requires: a new `app/(public)/claim/[token]/page.tsx` that resolves `claimToken` across four entity types (`Deal`, `RepairOrder`, `PartOrder`, `RentalBooking`), figures out `kind` and `email`, and renders `PostCheckoutAuthPanel`. That's a feature in its own right — logged as **TD-003** in `docs/tech-debt.md`. For now, guests who miss the post-checkout panel use the standard `/register` flow to create an account; their orders attach by phone+email match.
- **Claim-token TTL.** Current claim tokens (`Deal.claimToken`, `RepairOrder.claimToken`, `PartOrder.claimToken`, `RentalBooking.claimToken`) have no expiration field — they live until the guest claims their account. This pre-dates email integration; SMS already transmits the same tokens. Adding `claimTokenExpiresAt` columns + claim-on-use invalidation is logged as **TD-002** in `docs/tech-debt.md` for a separate plan. **Note:** with claim CTAs removed from emails (per the line above), the email surface no longer transmits claim tokens — only SMS does. The TTL gap remains for SMS but the email iteration does not widen it.

## Approach

**Chosen:** Mirror `lib/sms.ts` exactly — one generic transport (`sendEmail`), five typed helpers (one per flow), templates as plain string-builder functions. Provider is Resend (HTTP API, no SDK, no SMTP dependency).

**Why:** The SMS module's shape is already battle-tested in this codebase. New devs already understand the pattern. Resend's HTTP API is one `fetch` call — no new dependency to vet or pin. String templates avoid the bundle/typing surface area of react-email when our needs are five fixed messages. The cost is no automatic preview tooling — when an implementer wants to see what an email looks like, they paste the rendered HTML into a Resend preview or save it to `/tmp/preview.html` and open it. Acceptable for five small templates.

**Alternatives considered:**

- **Direct SMTP via nodemailer + Yandex 360.** Better Russian deliverability long-term, but: (a) adds nodemailer to deps, (b) requires SMTP username+password in env (currently we'd ask the user for credentials they haven't yet provisioned), (c) Yandex business mail requires App Password setup with 2FA. Resend gets to 80% of the value in 10% of the operational cost. Re-evaluate if deliverability to mail.ru/yandex.ru is genuinely poor after launch.
- **react-email + JSX templates.** Cleaner DX with previews and component reuse. Adds `@react-email/components` (~30 KB) and a build step coupling. Rejected — five templates aren't worth the complexity.
- **Postmark.** Best transactional reputation; ~$15/mo after free trial. Same EU/US server profile as Resend (same RU-deliverability risk) but paid. Resend free tier covers our expected first-3-months volume.

## Context for Implementer

- **`lib/sms.ts` is the reference pattern.** Inspect it before writing `lib/email/send.ts`: env-var reading at module top, mock-mode fallback, narrow result type `{ success: true } | { success: false; error: string }`, dynamic-import call sites in actions (e.g. `app/actions/booking.ts:162` — `const { sendBookingConfirmation } = await import("@/lib/sms");`). Use the same dynamic-import idiom so the email module is excluded from the bundle of routes that don't send.
- **No `Notification` row writes.** The SMS module also doesn't touch `Notification`. Keep parity to avoid a half-migrated state.
- **Prisma client is at `@/app/generated/prisma/client`** with `@ts-nocheck` — type assertions are the norm in this codebase. The email module doesn't touch Prisma though; this is only relevant for read sites in server actions.
- **Russian copy.** Geleoteka brand uses gold (#d4af37) on black. For email, use white-card content area with a gold accent strip; never reverse to black (background renders unpredictably across mail clients). Tone: professional, neutral, no exclamation marks unless mirroring an existing UX string.
- **Customer email may be empty** in theory: the `User.email` column is `String @unique` (non-null at the DB level), but the value can be a synthetic guest-flow placeholder (e.g. `e2e-claim-<id>@example.com` seen on the test estimate). Helpers must guard with a `if (!isPlausibleEmail(to)) return;` short-circuit. Define `isPlausibleEmail` in `lib/email/send.ts` (matches a basic regex + rejects `example.com`, `example.org`, `example.test` domains and any address with a UUID-like local part of 16+ hex chars).
- **Origin / URL building.** Use `process.env.NEXT_PUBLIC_APP_URL` (already used elsewhere; check before assuming — fall back to `https://geleoteka.ru` for production paths if unset, document in setup notes). Do NOT build URLs from request headers inside the email-render path — those run in the action body before the email render call, so the URL is already known.
- **Customer-onboarding claim tokens.** `Deal.claimToken` (and parallel tokens on `PartOrder`, `RentalBooking`, `RepairOrder` — see `prisma/schema.prisma`) are one-shot secrets surfaced after guest creation. When a flow is a guest flow, include the relevant claim URL in the email (the one-shot URL that lands them on the post-checkout "claim your account" panel). When the user is logged in already, omit the claim block.
- **Resend API surface used:** `POST https://api.resend.com/emails` with `Authorization: Bearer ${RESEND_API_KEY}` and JSON body `{ from, to, subject, html, text, reply_to }`. Response shape `{ id: string } | { name: string, message: string, statusCode: number }`. Treat any non-`id` response as failure.
- **Wrap calls in `try/catch` at the helper boundary.** Network failure must not bubble. Log `console.error("[EMAIL ERROR]", ...)` matching the SMS module's exact log prefix style (`lib/sms.ts:34`).
- **Fire-and-forget pattern — MANDATORY at every call site.** Every call to a sender helper MUST be written as:

  ```ts
  void sendBookingConfirmationEmail(...).catch(() => {});
  ```

  Never write a bare `sendBookingConfirmationEmail(...)` (no `void`, no `.catch`) — without the explicit `.catch`, Node 18+ raises an `unhandledRejection` event that Next.js renders as a 500, defeating the entire fire-and-forget contract.
- **`sendEmail` internal hardening.** The transport wraps its ENTIRE body — every `fetch`, every `await res.json()`, every URL build — in a single outer `try/catch`. A synchronous throw inside the async wrapper (e.g. a malformed input or a JSON.parse on a non-JSON Resend response) must still produce `{ success: false, error }`, never re-throw.
- **Existing `findOrCreateGuestCustomer` + `generateClaimToken`** in `lib/customer-onboarding.ts` are the source of customer + claim-token for the booking flow. The email is sent AFTER the guest customer exists, so `customer.email` is always set by then.

## Runtime Environment

- **Start:** `npm run dev` (port 443, HTTPS — see `.claude/rules/geleoteka-project.md`).
- **Production:** Railway auto-deploys from `main`. New env vars (`RESEND_API_KEY`, `RESEND_FROM`, `RESEND_FROM_FALLBACK`) must be added to the Railway project settings before the first email-sending request lands in production. Without `RESEND_API_KEY`, helpers fall back to mock mode silently — production stays safe, just no emails go out.
- **Domain verification:** Until `geleoteka.ru` is verified in Resend (SPF + DKIM TXT records propagated), the `RESEND_FROM` should be left at the `RESEND_FROM_FALLBACK` value (`onboarding@resend.dev` works for testing) — Resend rejects sends from unverified custom domains.
- **No new endpoints**, no DB migration, no schema change.

## Assumptions

- **All five flow actions have customer.email available at the relevant call site.** Supported: `app/actions/booking.ts` collects `email` in `BookingInput` (line 22) and persists it on the user; `register.ts` requires `email`; `crm/estimates.ts:sendEstimate` works on a Deal with a Customer User who has `email` (User.email is `@unique` non-null per `prisma/schema.prisma:215`); `part-orders.ts` uses `contactEmail` from the order form; `rentals.ts:createRentalBooking` will (after reading the code) follow the same pattern. Tasks 4–8 depend on this.
- **The synthetic guest-flow placeholder email pattern is recognizable.** Supported: `e2e-claim-1778162919394@example.com` seen in the test deal — `@example.{com,org,test}` domains are RFC 2606 reserved. The `isPlausibleEmail` filter targets these explicitly. Task 1 depends on this.
- **Resend free-tier limits (100/day, 3000/mo) cover early production volume.** Supported: Geleoteka's current customer count is in the tens; even doubling each customer's email volume during onboarding stays well under 100/day. Task 1 + setup docs depend on this.
- **`process.env.NEXT_PUBLIC_APP_URL` is the right URL-source.** Supported by: existing pattern usage in this codebase (`lib/auth.ts` uses similar env access; PDF route uses `new URL(req.url).origin` for runtime-derived origin). If `PUBLIC_URL` is not present, implementer must add it to `.env.example` with default `https://geleoteka.ru` and document fall-back behaviour. Tasks 4–8 depend on this.
- **Resend's `reply_to` field is honored**, so customer replies go to `info@geleoteka.ru` (a human inbox), not the no-reply transactional sender. Resend docs confirm this; implementer should set `reply_to: "info@geleoteka.ru"` on every send. Task 1 depends on this.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Resend RU deliverability worse than expected — letters land in spam at mail.ru / yandex.ru. | Medium | Medium (customers don't see emails) | Setup doc explicitly calls out domain warm-up: first 7 days send only to a single test inbox before opening to real customers. If post-launch bounce/spam rate from mail.ru exceeds 20%, fall back to SMTP via Yandex 360 — this requires a one-file swap inside `lib/email/send.ts` since the helper boundary is provider-agnostic. **Verification:** monitor Resend dashboard "Activity" tab for 7 days post-launch. |
| `RESEND_API_KEY` not added in production → silent mock mode → customers get nothing → no error visible. | Medium | High (silent failure mode) | `sendEmail` logs `console.log("[EMAIL MOCK]", ...)` in mock mode (visible in Railway logs). Additionally, add a `lib/email/send.ts:isProductionConfigured()` helper used at app boot (or in `/api/health` later) that returns false when the API key is absent in prod — surfaces the misconfiguration. **Verification:** TS-006 simulates missing env. |
| Customer email is the synthetic placeholder `@example.com`, send still attempted → Resend returns 422 → log spam. | High | Low (no real failure, but logs get noisy) | `isPlausibleEmail` filter rejects RFC-2606 reserved domains before calling Resend. Helper logs an info-level `[EMAIL] skipping send to placeholder address` line and returns success. **Verification:** TS-002. |
| Estimate-sent email leaks the customer's claim URL to staff CC'd recipient. | Low | High (security — claim URL grants account access) | We never add CC. The `to` list has exactly one address — the customer's. `reply_to` goes to staff. **Verification:** read-through of helpers + unit-level check (no `cc` field in any `sendEmail` call) — codified in the `send.ts` signature (no `cc` parameter accepted). |
| Heavy HTML template body inflates email size past 102 KB → Gmail clipping. | Low | Low (only affects very long part-order receipts) | Template builders cap items at 20 in part-order receipt; if more, render "и ещё N позиций — см. в личном кабинете" with a link. **Verification:** TS-005 covers the 20+ item case. |
| Resend's `from` field receives a verified-domain `info@geleoteka.ru` but DNS records haven't propagated → 422 every send. | Medium | High (no emails go out until DNS resolves) | `RESEND_FROM_FALLBACK="onboarding@resend.dev"` is the bootstrap value used in `.env.example`. Implementer sets it to the verified domain only after Resend dashboard shows green status on SPF + DKIM. Doc this in setup notes. **Verification:** TS-007. |
| Booking failure path: action throws AFTER booking persisted but BEFORE email dispatch → customer has a confirmed booking and no email. | Medium | Low (manager sees the deal in CRM regardless) | This is the documented fire-and-forget contract — email is informational, never a precondition. Manager still sees the booking in `/admin/repair-orders`. SMS confirmation runs in the same block and ALSO might fail; both paths log to console. **Verification:** TS-003 unsets `RESEND_API_KEY` and verifies booking still completes successfully. |
| Claim-account CTAs embedded in guest-flow emails — **dropped** as of plan rev 1: no `/cabinet?claim=…` route exists, so the CTAs were removed from `booking-confirmation`, `part-order-confirmation`, `rental-booking-confirmation`. | n/a | n/a | See Out of Scope (claim CTAs) and TD-003. |
| **Estimate-sent email reuses the existing token-based guest-view URL** (`/estimate/<token>?id=<estimateId>` + `/api/estimates/<id>/pdf?token=<token>`). This is the same URL pattern the current SMS confirmation already transmits — **not** a new exposure surface. Distinction: this token grants ONLY estimate-view + PDF read for the deal it belongs to; it is NOT a claim-account CTA (those were removed). | Low | Medium | (a) URL is HTTPS-only; (b) Token-recipient correlation: the email goes to the customer email row that owns the same Deal as the token; (c) When the customer is a fully registered account (`isTempPassword=false`), the cabinet URL is used instead of the token URL; (d) Long-lived-token TTL gap remains an open item — logged as TD-002. |

## Goal Verification

### Truths

1. After `npm run dev` with `RESEND_API_KEY` unset, a booking POST completes successfully, the deal is created, and `/admin/crm/deals` shows it; the server log contains exactly one `[EMAIL MOCK]` line for the booking-confirmation email with the customer's address.
2. With `RESEND_API_KEY=<real-key>` set and `RESEND_FROM` pointing at a verified domain (or fallback), submitting a booking causes a single HTTP POST to `https://api.resend.com/emails`; the customer receives a Russian-language email "Geleoteka — запись на …" within 60 seconds. (Verified by submitting from a test email account and checking the inbox.)
3. `lib/email/send.ts` rejects placeholder addresses: passing `{ to: "x@example.com", ... }` returns `{ success: true }` WITHOUT a Resend POST, and the log shows `[EMAIL] skipping placeholder address`.
4. Each of the five integration points dispatches **exactly one** email per business event: one booking confirmation per booking, one estimate-sent per `sendEstimate` action, etc. No duplicates from retries or double-invokes.
5. The estimate-sent email's primary CTA link, when clicked, lands on `/cabinet/estimates/<id>` (for an authenticated customer) or `/estimate/<token>` (for a guest). The PDF link, when clicked, returns `application/pdf` with the same auth gate as the cabinet PDF route.
6. The registration welcome email contains a working link to `/login` and the customer's display name (not "%CUSTOMER%" or any unsubstituted placeholder).
7. The part-order confirmation email contains a line item table with correct unit prices and totals matching the persisted `PartOrder.items`.
8. The rental-booking confirmation email contains the start/end dates in Russian format (e.g. «25 мая 2026 г.»), the vehicle make/model/year, and the total price.
9. Email helpers never throw a synchronous error to the calling server action. Forcing a 500 from the Resend API (via invalid key) leaves the booking flow returning `success: true`; the failure is visible only in `console.error`.
10. `npx tsc --noEmit` passes with zero errors. `npm run lint` exits 0 with no new warnings.

### Artifacts

- `lib/email/send.ts` (new) — transport.
- `lib/email/helpers.ts` (new) — five typed senders.
- `lib/email/index.ts` (new) — barrel.
- `lib/email/templates/_layout.ts` (new) — shared HTML scaffold.
- `lib/email/templates/booking-confirmation.ts` (new).
- `lib/email/templates/estimate-sent.ts` (new).
- `lib/email/templates/registration-welcome.ts` (new).
- `lib/email/templates/part-order-confirmation.ts` (new).
- `lib/email/templates/rental-booking-confirmation.ts` (new).
- `app/actions/booking.ts` (modified) — add email dispatch next to SMS dispatch.
- `app/actions/crm/estimates.ts` (modified) — dispatch in `sendEstimate`.
- `app/actions/register.ts` (modified) — dispatch after user create.
- `app/actions/part-orders.ts` (modified) — dispatch after order persist.
- `app/actions/rentals.ts` (modified) — dispatch in `createRentalBooking`.
- `.env.example` (modified) — three new env keys + comments.
- `docs/setup-email.md` (new) — Resend signup, domain verification, Railway env setup.

## E2E Test Scenarios

### TS-001: Booking confirmation email (real send via Resend)

**Priority:** Critical
**Preconditions:** `RESEND_API_KEY` and `RESEND_FROM` set in dev env. A test inbox the dev controls. Domain verified in Resend OR `RESEND_FROM` set to `RESEND_FROM_FALLBACK`.

**Mapped Tasks:** Task 1, Task 7 (booking wiring)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open `/booking` in a fresh browser session, complete the 3-step wizard with the test inbox as the contact email. Submit. | Booking succeeds; URL transitions to the post-submit panel. |
| 2 | Inspect server logs | Exactly one line: `[EMAIL] sent to <test-email> id=re_...`. No `[EMAIL ERROR]`. |
| 3 | Open the test inbox | Within 60 seconds, a new email arrives with subject «Geleoteka — запись на ДД.ММ в HH:MM». Sender is `Geleoteka <…>`. Reply-to is `info@geleoteka.ru`. |
| 4 | Open the email body | Brand strip with gold "G" mark; greeting with customer name; slot date+time in Russian format; vehicle summary; service list; address line; manager phone (if owner set). |

### TS-002: Placeholder email is skipped silently

**Priority:** Critical
**Preconditions:** Same as TS-001. A booking submitted with `email = "test@example.com"` (RFC 2606 reserved).

**Mapped Tasks:** Task 1 (filter)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Submit a booking with `email = "test@example.com"` | Booking succeeds. |
| 2 | Server log | Single line: `[EMAIL] skipping placeholder address test@example.com`. No Resend POST attempted (network panel / Resend dashboard shows no event). |
| 3 | Repeat with `email = "abc1234567890def@example.org"` (long hex local + reserved domain) | Same skip behaviour. |

### TS-003: Fire-and-forget — booking still succeeds when Resend is unavailable

**Priority:** Critical
**Preconditions:** Set `RESEND_API_KEY="re_INVALID_TEST"` so every Resend request returns 401.

**Mapped Tasks:** Task 1 (error handling)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Submit a booking | Booking succeeds; URL transitions to post-submit panel. |
| 2 | Server log | `[EMAIL ERROR] 401 Unauthorized` line. Booking flow unaffected. |
| 3 | DB | Deal + RepairOrder rows exist. |
| 4 | Customer cabinet | `/cabinet/notifications` (if logged in) shows the booking. SMS still went via `lib/sms.ts` (independent code path). |

### TS-004: Estimate-sent email (admin → customer)

**Priority:** Critical
**Preconditions:** Valid Resend env, DRAFT estimate at `/admin/crm/estimates/<id>` for a customer with the test inbox as their email.

**Mapped Tasks:** Task 1, Task 8 (estimate wiring)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | At the estimate page, click "Отправить клиенту" (EstimateActions) | Action succeeds; status flips to SENT. |
| 2 | Test inbox | Email arrives with subject «Geleoteka — смета №X на согласование» (or similar pattern using the actual estimate number). |
| 3 | Body | Customer name + total + validity date + two CTAs: «Открыть смету» (links to `/cabinet/estimates/<id>` or `/estimate/<token>`) + secondary text-link «Скачать PDF» (links to `/api/estimates/<id>/pdf...`). |
| 4 | Click «Открыть смету» from the inbox | Lands on the cabinet/token URL; page renders the estimate (no auth dialog if claim token is in URL). |
| 5 | Click «Скачать PDF» from the inbox | Browser downloads `smeta-X.pdf` with HTTP 200. |

### TS-005: Part-order confirmation — long item list capped at 20

**Priority:** High
**Preconditions:** Valid Resend env. A test PartOrder with 22 items.

**Mapped Tasks:** Task 1, Task 9 (parts wiring)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Submit a part order with 22 distinct items via the public parts cart with the test inbox as contact email | Order succeeds. |
| 2 | Test inbox | Email arrives. |
| 3 | Body | Item table shows exactly 20 rows; the 21st-and-22nd-row area shows the line «и ещё 2 позиции — см. в личном кабинете» with a link to `/cabinet/orders/<id>` (or analogous). Total at the bottom reflects all 22 items, not just the 20 rendered. |

### TS-006: Production mode misconfiguration is visible

**Priority:** High
**Preconditions:** Set `NODE_ENV=production` and explicitly UNSET `RESEND_API_KEY`. Restart dev (or run `npm start` after `npm run build`).

**Mapped Tasks:** Task 1 (isProductionConfigured)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Inspect boot log | A `[EMAIL] WARNING: RESEND_API_KEY not set in production — emails will be mock-only` line is printed at module load (or on first send). |
| 2 | Submit a booking | Booking succeeds (no user-facing error). Mock send is logged. |
| 3 | (When `/api/health` is later added — out of scope for THIS plan) it should report `email: misconfigured`. | Out-of-scope hook — note the contract for the future health endpoint. |

### TS-007: Domain not yet verified — fallback sender used

**Priority:** High
**Preconditions:** `RESEND_FROM="info@geleoteka.ru"` (NOT yet verified in Resend). `RESEND_FROM_FALLBACK="onboarding@resend.dev"`. `RESEND_API_KEY` valid.

**Mapped Tasks:** Task 1 (fallback logic)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Submit a booking | Booking succeeds. |
| 2 | Test inbox | Email arrives from the fallback sender (`onboarding@resend.dev`) — NOT a Resend 422 error. |
| 3 | Server log | One-time-per-boot warning: `[EMAIL] using fallback sender; verify geleoteka.ru domain in Resend dashboard`. |

### TS-008: Rental booking confirmation

**Priority:** High
**Preconditions:** Valid Resend env. A test rental booking via `/rentals/<id>` for a car with the test inbox as contact email.

**Mapped Tasks:** Task 1, Task 10 (rentals wiring)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Submit a rental booking via the rentals form | Booking succeeds. |
| 2 | Test inbox | Email arrives with subject «Geleoteka — бронь автомобиля подтверждена». |
| 3 | Body | Car make/model/year, start + end dates in Russian, total price, pickup address from CMS, manager phone (if assigned). |

## Progress Tracking

- [x] Task 1: `lib/email/send.ts` transport + placeholder/fallback filters + mock mode
- [x] Task 2: `lib/email/templates/_layout.ts` shared HTML scaffold + Russian footer + brand strip
- [x] Task 3: Five template builders (`booking-confirmation`, `estimate-sent`, `registration-welcome`, `part-order-confirmation`, `rental-booking-confirmation`)
- [x] Task 4: `lib/email/helpers.ts` + `lib/email/index.ts` — five typed senders, all fire-and-forget
- [x] Task 5: `.env.example` + `docs/setup-email.md` — env keys, Resend setup steps, domain verification doc
- [x] Task 6: Booking flow wiring (`app/actions/booking.ts`)
- [x] Task 7: Estimate-sent wiring (`app/actions/crm/estimates.ts`)
- [x] Task 8: Registration welcome wiring (`app/actions/register.ts`)
- [x] Task 9: Part-order confirmation wiring (`app/actions/part-orders.ts`)
- [x] Task 10: Rental-booking confirmation wiring (`app/actions/rentals.ts`)

**Total Tasks:** 10 | **Completed:** 10 | **Remaining:** 0

## Implementation Tasks

### Task 1: `lib/email/send.ts` transport

**Objective:** Create the generic `sendEmail` wrapper around Resend HTTP API with mock fallback, placeholder-address filter, fallback-sender logic, and production-misconfiguration warning.

**Dependencies:** None
**Mapped Scenarios:** TS-001, TS-002, TS-003, TS-006, TS-007

**Files:**

- Create: `lib/email/send.ts`

**Trivial:** No — core security-relevant module (placeholder filter, fail-mode contract).

**Key Decisions / Notes:**

- Read env at module top, matching `lib/sms.ts:1-5`:

  ```ts
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const RESEND_FROM = process.env.RESEND_FROM;
  const RESEND_FROM_FALLBACK = process.env.RESEND_FROM_FALLBACK ?? "onboarding@resend.dev";
  const PUBLIC_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://geleoteka.ru";
  ```

- Boot-time production warning (logged once per module load via a top-level `if` block):

  ```ts
  if (process.env.NODE_ENV === "production" && !RESEND_API_KEY) {
    console.warn("[EMAIL] WARNING: RESEND_API_KEY not set in production — emails will be mock-only");
  }
  ```

- Effective sender computation:

  ```ts
  const effectiveFrom = RESEND_FROM ?? RESEND_FROM_FALLBACK;
  // If RESEND_FROM is set but is NOT the fallback AND NODE_ENV=production AND there's no verification proof,
  // we cannot detect that programmatically from Resend at runtime, so we trust the env config.
  ```

- Public function shape:

  ```ts
  export interface SendEmailInput {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }
  export type SendEmailResult = { success: true; id?: string } | { success: false; error: string };

  export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> { ... }
  ```

  No `cc`, no `bcc`, no `attachments`, no `from` parameter. Sender is always controlled at module level — call sites cannot override.
- Inside `sendEmail`:
  1. `if (!isPlausibleEmail(input.to)) { console.log("[EMAIL] skipping placeholder address", input.to); return { success: true }; }`
  2. `if (!RESEND_API_KEY) { console.log("[EMAIL MOCK]", { to: input.to, subject: input.subject }); return { success: true }; }`
  3. Wrap the fetch in try/catch. Body:

     ```ts
     const res = await fetch("https://api.resend.com/emails", {
       method: "POST",
       headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
       body: JSON.stringify({
         from: effectiveFrom,
         to: input.to,
         subject: input.subject,
         html: input.html,
         text: input.text,
         reply_to: "info@geleoteka.ru",
       }),
     });
     const data = await res.json();
     if (!res.ok || !data.id) {
       console.error("[EMAIL ERROR]", res.status, data);
       return { success: false, error: data.message ?? `HTTP ${res.status}` };
     }
     console.log(`[EMAIL] sent to ${input.to} id=${data.id}`);
     return { success: true, id: data.id };
     ```

- `isPlausibleEmail(value: string): boolean`:

  ```ts
  const RESERVED_DOMAINS = new Set(["example.com", "example.org", "example.net", "example.test", "test"]);
  const BASIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function isPlausibleEmail(value: string): boolean {
    if (!value) return false;
    if (!BASIC_EMAIL_RE.test(value)) return false;
    const [local, domain] = value.toLowerCase().split("@");
    if (RESERVED_DOMAINS.has(domain)) return false;
    // synthetic-claim heuristic: 16+ hex chars in the local part
    if (/^[0-9a-f]{16,}$/i.test(local)) return false;
    if (local.startsWith("e2e-claim-")) return false;
    return true;
  }
  ```

- Export `PUBLIC_URL` so templates can build absolute URLs without re-reading env.

**Definition of Done:**

- [ ] `sendEmail` returns `{ success: true }` (mock) when `RESEND_API_KEY` unset.
- [ ] `sendEmail` returns `{ success: true }` (skip) when `to` matches `example.com|org|net|test` domain or hex placeholder local.
- [ ] On Resend HTTP success, logs `[EMAIL] sent to <addr> id=<re_...>` and returns the id.
- [ ] On Resend HTTP failure, logs `[EMAIL ERROR] <status> <body>` and returns `{ success: false, error }`.
- [ ] No `cc`, `bcc`, or `attachments` accepted in the public signature.
- [ ] `npx tsc --noEmit` exits 0.

**Verify:**

- `npx tsc --noEmit`
- Manual: TS-002, TS-003, TS-006 (mock + invalid key + production warning).

---

### Task 2: `lib/email/templates/_layout.ts` shared HTML scaffold

**Objective:** Build the brand-strip + content-card + footer wrapper used by all five templates. Output is `{ html, text }` so templates compose both representations from one helper.

**Dependencies:** Task 1 (uses `PUBLIC_URL`)
**Mapped Scenarios:** TS-001 (visual inspection of email)

**Files:**

- Create: `lib/email/templates/_layout.ts`

**Trivial:** No — visual baseline for every email.

**Key Decisions / Notes:**

- Export: `wrapEmail({ previewText, sections }): { html, text }` where `sections` is an array of `{ heading?: string, body: string, cta?: { label: string, href: string } }`.
- HTML uses table-based layout (Outlook compatibility): outer `<table width="100%">` with a centred `<table width="600">` content card.
- Brand strip: a single `<td>` with `background: #0a0a0a; color: #d4af37` and the text "GELEOTEKA" in a gold accent. No external image — Outlook/mail.ru block external images by default and the "G" mark is decorative. Use letter-spacing + bold to give it the same identity.
- Content area: `background: #ffffff`, `padding: 32px`, `font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`, `color: #1a1a1a`.
- Section heading style: `font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #6b6b6b; margin-bottom: 8px`.
- Section body: `font-size: 15px; line-height: 1.55; color: #1a1a1a; margin-bottom: 24px`.
- CTA button: `<a>` styled inline as `display: inline-block; background: #d4af37; color: #1a1a1a; padding: 12px 24px; border-radius: 2px; text-decoration: none; font-weight: 600`.
- Footer: small grey type with `Геleoteka · Москва, ул. Примерная, 15 · info@geleoteka.ru · +7 (495) 123-45-67` plus a one-line legal note: «Это автоматическое уведомление по вашему обращению в Geleoteka.»
- Plain-text builder: walk the same `sections` array, output `HEADING\n\nbody\n\nCTA: label — href\n\n` per section, ending with the footer line.
- Inline CSS only — no `<style>` block in `<head>` (Gmail strips it for some clients; inline is safest). Templates pass the result of `wrapEmail` straight to `sendEmail`.

**Definition of Done:**

- [ ] `wrapEmail({...})` returns valid HTML that renders correctly in Gmail web, Apple Mail, Outlook web, and mail.ru web (visually verified during TS-001).
- [ ] `text` output is non-empty and contains every section's body and CTA href.
- [ ] No external image references, no `<style>` block, no `<script>`.
- [ ] `npx tsc --noEmit` exits 0.

**Verify:**

- `npx tsc --noEmit`
- Render harness: write a small `scripts/render-email-preview.ts` (in this task — kept as a permanent dev tool) that takes a template name and writes `/tmp/email-preview.html`. Open in browser to inspect. Document the script in `docs/setup-email.md` (Task 5).

---

### Task 3: Five template builders

**Objective:** Implement the five message-specific template builders, each returning `{ subject, html, text }`.

**Dependencies:** Task 2 (uses `wrapEmail`)
**Mapped Scenarios:** TS-001, TS-004, TS-005, TS-008 (each template's visual + content check)

**Files:**

- Create: `lib/email/templates/booking-confirmation.ts`
- Create: `lib/email/templates/estimate-sent.ts`
- Create: `lib/email/templates/registration-welcome.ts`
- Create: `lib/email/templates/part-order-confirmation.ts`
- Create: `lib/email/templates/rental-booking-confirmation.ts`

**Trivial:** No — Russian copy + URL building + line-item rendering across five flows.

**Key Decisions / Notes:**

- **`booking-confirmation.ts`:**

  ```ts
  export interface BookingConfirmationInput {
    customerName: string;
    dateTime: Date;
    vehicleSummary: string; // "Mercedes-Benz G-Class 2020"
    services: string[];     // human-readable service names
    managerName?: string;
    managerPhone?: string;
    address: string;        // pickup/service address from CMS
  }
  export function renderBookingConfirmation(input: BookingConfirmationInput): { subject: string; html: string; text: string }
  ```

  Subject: `Geleoteka — запись на ${formatDateRu(dateTime)} в ${formatTime(dateTime)}`. Sections: greeting → slot/services summary → address+manager. No claim CTA (per Out of Scope).
- **`estimate-sent.ts`:** input `{ customerName, estimateNumber, total, validUntil, viewUrl, pdfUrl }`. Subject: `Geleoteka — смета №${estimateNumber} на согласование`. Sections: greeting → total + validity → CTA "Открыть смету" + secondary text-link "Скачать PDF".
- **`registration-welcome.ts`:** input `{ customerName, loginUrl }`. Subject: `Geleoteka — добро пожаловать`. Sections: 2-sentence welcome → CTA "Открыть личный кабинет".
- **`part-order-confirmation.ts`:** input `{ customerName, orderId, items, total, contactPhone, cabinetUrl? }`. Subject: `Geleoteka — заказ запчастей №${orderId.slice(-6).toUpperCase()} принят`. Sections: greeting → item table (cap at 20, render "и ещё N позиций — см. в личном кабинете" line linking to `cabinetUrl` when `items.length > 20` AND `cabinetUrl` is set) → total → contact. CTA «Смотреть в личном кабинете» shown only when `cabinetUrl` is set (logged-in customers).
- **`rental-booking-confirmation.ts`:** input `{ customerName, vehicleSummary, startAt, endAt, totalDays, totalPrice, pickupAddress, managerPhone? }`. Subject: `Geleoteka — бронь автомобиля подтверждена`. Sections: greeting → car + dates → total + days → pickup address + manager. No claim CTA.
- All Russian date formatting uses the existing `formatDateRu` helper from `@/lib/utils` (already used in `lib/estimate-pdf-document.tsx`). Russian price formatting via `formatPrice` from the same module (returns `"32 000 ₽"`).
- Item-list rendering in part-order template: `<table>` with rows `Наименование | Кол-во | Цена | Сумма` — keep it 4 columns max for readability in narrow mail clients.

**Definition of Done:**

- [ ] All five templates exported with the documented input shape.
- [ ] Each renders both `subject` (non-empty, starts with "Geleoteka — ") and `html`/`text`.
- [ ] Item list in part-order template caps at 20 visible rows (TS-005).
- [ ] Russian date format matches the existing PDF (e.g. «25 мая 2026 г.»).
- [ ] `npx tsc --noEmit` exits 0.

**Verify:**

- `npx tsc --noEmit`
- Render harness: `scripts/render-email-preview.ts <template-name>` produces `/tmp/email-preview.html`; open in browser and visually verify against each TS's body description.

---

### Task 4: `lib/email/helpers.ts` typed senders + `lib/email/index.ts` barrel

**Objective:** Provide five thin sender functions, one per flow. Each combines a template + `sendEmail` + `try/catch` and is the only interface call sites use.

**Dependencies:** Task 1, Task 3
**Mapped Scenarios:** All TS-NNN (each helper is exercised by one TS).

**Files:**

- Create: `lib/email/helpers.ts`
- Create: `lib/email/index.ts`

**Trivial:** No — five functions with try/catch boundaries.

**Key Decisions / Notes:**

- Each helper signature mirrors its template input plus a `to` parameter:

  ```ts
  export async function sendBookingConfirmationEmail(
    to: string,
    input: BookingConfirmationInput,
  ): Promise<{ success: boolean }> {
    try {
      const { subject, html, text } = renderBookingConfirmation(input);
      const res = await sendEmail({ to, subject, html, text });
      if (!res.success) console.error("[EMAIL HELPER] booking failed", res.error);
      return { success: res.success };
    } catch (err) {
      console.error("[EMAIL HELPER] booking threw", err);
      return { success: false };
    }
  }
  ```

  Same shape for `sendEstimateSentEmail`, `sendRegistrationWelcomeEmail`, `sendPartOrderConfirmationEmail`, `sendRentalBookingConfirmationEmail`.
- `lib/email/index.ts` re-exports only the five helpers (NOT `sendEmail` directly — call sites must go through the typed helpers so the call shape is auditable):

  ```ts
  export {
    sendBookingConfirmationEmail,
    sendEstimateSentEmail,
    sendRegistrationWelcomeEmail,
    sendPartOrderConfirmationEmail,
    sendRentalBookingConfirmationEmail,
  } from "./helpers";
  ```

**Definition of Done:**

- [ ] All five helpers exported with documented signatures.
- [ ] Each wraps its body in try/catch; throws are caught and logged.
- [ ] Barrel `lib/email/index.ts` does NOT export `sendEmail` (only the typed helpers).
- [ ] `npx tsc --noEmit` exits 0.

**Verify:**

- `npx tsc --noEmit`

---

### Task 5: `.env.example` + `docs/setup-email.md`

**Objective:** Document required env vars, Resend signup, domain verification, and Railway setup so the implementer or a future operator can stand up email delivery without reading source.

**Dependencies:** Task 1
**Mapped Scenarios:** TS-001, TS-006, TS-007

**Files:**

- Modify: `.env.example`
- Create: `docs/setup-email.md`

**Trivial:** Partially — `.env.example` is ≤5 net-new lines; the doc is fresh content. Bundled here for review locality.

**Key Decisions / Notes:**

- `.env.example` additions (placed in a new "Email (Resend)" block):

  ```
  # Email (Resend) — transactional sender for booking/estimate/order confirmations.
  # Get a key at https://resend.com → API Keys. Without it, helpers run in mock mode.
  RESEND_API_KEY=
  # Sender after domain verification. Until verified, leave at the fallback below.
  RESEND_FROM="Geleoteka <info@geleoteka.ru>"
  RESEND_FROM_FALLBACK="onboarding@resend.dev"
  # Public origin used in outgoing email links.
  PUBLIC_URL="https://geleoteka.ru"
  ```

- `docs/setup-email.md` sections:
  1. **Provider:** Resend, why chosen, free tier limits (100/day, 3000/mo).
  2. **Get an API key:** signup → dashboard → API Keys → create — keep in 1Password, paste into Railway env.
  3. **Verify the `geleoteka.ru` domain:** dashboard → Domains → Add → copy the TXT records (SPF + DKIM) → add at DNS provider → click "Verify". Up to 24h for propagation; usually <1h.
  4. **Switch `RESEND_FROM`** once status is green.
  5. **Local dev:** leave `RESEND_API_KEY` empty for mock mode; templates still render and log.
  6. **Preview templates:** `npx tsx scripts/render-email-preview.ts <template-name>` writes `/tmp/email-preview.html`. Templates: `booking | estimate | welcome | part-order | rental`.
  7. **Deliverability monitoring:** Resend dashboard Activity tab — keep an eye on bounce/spam rate during the first week.

**Definition of Done:**

- [ ] `.env.example` updated with all four keys + comments.
- [ ] `docs/setup-email.md` exists with the seven sections listed.
- [ ] No secret values in either file.

**Verify:**

- Read both files; no real keys present.

---

### Task 6: Booking flow wiring

**Objective:** Add `sendBookingConfirmationEmail` dispatch to `app/actions/booking.ts` next to the existing SMS dispatch, fire-and-forget.

**Dependencies:** Task 4
**Mapped Scenarios:** TS-001, TS-002, TS-003

**Files:**

- Modify: `app/actions/booking.ts`

**Trivial:** Partially — call site is small (~6 net lines) but covered by three TS scenarios; not eligible for `Trivial:` because new error path.

**Key Decisions / Notes:**

- Locate the existing dynamic-import block at `app/actions/booking.ts:162-163`:

  ```ts
  const { sendBookingConfirmation } = await import("@/lib/sms");
  await sendBookingConfirmation(...);
  ```

- Extend that block:

  ```ts
  const { sendBookingConfirmation } = await import("@/lib/sms");
  await sendBookingConfirmation(...);
  const { sendBookingConfirmationEmail } = await import("@/lib/email");
  void sendBookingConfirmationEmail(input.email, {
    customerName: input.name,
    dateTime: appointmentDate,
    vehicleSummary: `${input.model} ${input.year} г.`,
    services: resolvedServiceNames,
    address: addressFromCms,
    managerName: dealOwnerName ?? undefined,
    managerPhone: dealOwnerPhone ?? undefined,
  }).catch(() => {}); // fire-and-forget; helper already logs internally
  ```

- `resolvedServiceNames`: the action already maps `serviceIds` to service rows for the deal — reuse that array.
- `addressFromCms`: load via `getCMSText("contacts.address")` (or the existing `loadRequisites().contactAddress` if available — pick the helper already imported nearby to avoid a new import).
- Guard the email dispatch with `if (input.email) { ... }` — if the form submits with empty email, skip silently (the helper already filters placeholders).

**Definition of Done:**

- [ ] Booking action dispatches both SMS AND email after the deal is committed.
- [ ] Email failure does not affect the booking's success.
- [ ] Empty `input.email` causes a silent skip.
- [ ] `npx tsc --noEmit` exits 0.

**Verify:**

- `npx tsc --noEmit`
- TS-001, TS-002, TS-003.

---

### Task 7: Estimate-sent wiring

**Objective:** Dispatch `sendEstimateSentEmail` from `sendEstimate` (`app/actions/crm/estimates.ts`) after the SENT-stage transaction commits.

**Dependencies:** Task 4
**Mapped Scenarios:** TS-004

**Files:**

- Modify: `app/actions/crm/estimates.ts`

**Trivial:** No — new dispatch with URL-construction branching (logged-in vs guest).

**Key Decisions / Notes:**

- `sendEstimate` at line 121 currently:
  1. Loads the estimate.
  2. Transitions stage DRAFT → SENT inside a transaction.
  3. Bumps the Deal stage when applicable.
  4. Calls `revalidatePath`.
  5. Returns `{ error: null, estimateId }`.
- AFTER step 4 (transaction committed, paths revalidated), and BEFORE the return, add:

  ```ts
  // Load minimal email payload — separate query so the original tx is small.
  const emailPayload = (await db.estimate.findUnique({
    where: { id: estimateId },
    select: {
      number: true, total: true, validUntil: true,
      deal: { select: {
        claimToken: true,
        customer: { select: { email: true, name: true } },
      } },
    },
  })) as { number: string | null; total: number; validUntil: Date | null;
            deal: { claimToken: string | null; customer: { email: string; name: string } } } | null;

  if (emailPayload?.deal.customer.email) {
    const PUBLIC_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://geleoteka.ru";
    const token = emailPayload.deal.claimToken;
    const viewUrl = token
      ? `${PUBLIC_URL}/estimate/${token}?id=${estimateId}`
      : `${PUBLIC_URL}/cabinet/estimates/${estimateId}`;
    const pdfUrl = token
      ? `${PUBLIC_URL}/api/estimates/${estimateId}/pdf?token=${token}`
      : `${PUBLIC_URL}/api/estimates/${estimateId}/pdf`;
    const { sendEstimateSentEmail } = await import("@/lib/email");
    void sendEstimateSentEmail(emailPayload.deal.customer.email, {
      customerName: emailPayload.deal.customer.name,
      estimateNumber: emailPayload.number ?? estimateId.slice(-6).toUpperCase(),
      total: emailPayload.total,
      validUntil: emailPayload.validUntil,
      viewUrl,
      pdfUrl,
    }).catch(() => {});
  }
  ```

- This re-fetch is acceptable because `sendEstimate` is a manager-triggered action with no latency budget. Avoids extending the original transaction.

**Definition of Done:**

- [ ] After SENT-transition succeeds, the customer email is dispatched.
- [ ] When the deal has a `claimToken`, the email links to `/estimate/<token>?id=<estimateId>`.
- [ ] When no `claimToken` (logged-in customer), links to `/cabinet/estimates/<id>`.
- [ ] PDF URL follows the same auth-source pattern.
- [ ] Email failure does not affect the SENT transition.
- [ ] `npx tsc --noEmit` exits 0.

**Verify:**

- `npx tsc --noEmit`
- TS-004 (real send, click the inbox CTA, verify navigation).

---

### Task 8: Registration welcome wiring

**Objective:** Dispatch `sendRegistrationWelcomeEmail` from `app/actions/register.ts` after the user is created.

**Dependencies:** Task 4
**Mapped Scenarios:** Truth #6 (welcome email contains working /login link + customer name)

**Files:**

- Modify: `app/actions/register.ts`

**Trivial:** Yes — 5 net-new lines, no new branch (existing `if (existing)` guard already gates), no new error path (helper handles its own try/catch). Covered by manual smoke-test post-implementation. **Justification:** "≤ 5 net new lines, single dispatch after successful user-create with helper that owns its error handling; verified by submitting /register with a test inbox."

**Key Decisions / Notes:**

- After the successful `db.user.create({...})` call, insert:

  ```ts
  const PUBLIC_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://geleoteka.ru";
  const { sendRegistrationWelcomeEmail } = await import("@/lib/email");
  void sendRegistrationWelcomeEmail(email, {
    customerName: name,
    loginUrl: `${PUBLIC_URL}/login`,
  }).catch(() => {});
  ```

- Place immediately before the existing redirect/session-create logic — order doesn't matter, but earlier is better in case the rest of the action throws.

**Definition of Done:**

- [ ] `register.ts` dispatches the welcome email after user creation.
- [ ] `npx tsc --noEmit` exits 0.

**Verify:**

- `npx tsc --noEmit`
- Submit `/register` with the test inbox; verify email arrives with the login link.

---

### Task 9: Part-order confirmation wiring

**Objective:** Dispatch `sendPartOrderConfirmationEmail` from `app/actions/part-orders.ts` after the order is persisted.

**Dependencies:** Task 4
**Mapped Scenarios:** TS-005

**Files:**

- Modify: `app/actions/part-orders.ts`

**Trivial:** No — line-item shaping into the template input + claim-token URL building.

**Key Decisions / Notes:**

- After the `decrement` writes succeed and the order row is persisted, before returning, shape the item list and dispatch:

  ```ts
  const items = orderItemsForEmail.map((row) => ({
    name: row.partName,       // human-readable; resolve from Part during the action
    qty: row.qty,
    unitPrice: row.unitPrice,
    total: row.total,
  }));
  const PUBLIC_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://geleoteka.ru";
  // cabinetUrl: only meaningful when the user is logged in (has a real account).
  // Guest flow leaves it undefined — template renders without the link.
  const cabinetUrl = session?.id ? `${PUBLIC_URL}/cabinet/orders/${order.id}` : undefined;
  const { sendPartOrderConfirmationEmail } = await import("@/lib/email");
  void sendPartOrderConfirmationEmail(contactEmail, {
    customerName: contactName,
    orderId: order.id,
    items,
    total: order.total,
    contactPhone: contactPhone,
    cabinetUrl,
  }).catch(() => {});
  ```

- `partName` resolution: the action likely already joins through `PartOrderItem.part` for stock-decrement. Reuse the same `findMany` to pull `part.name` into `orderItemsForEmail`. If not, add a single `findMany({ where: { id: { in: partIds } }, select: { id, name } })` and map.

**Definition of Done:**

- [ ] After order persists, email dispatched with full line item list.
- [ ] When `items.length > 20`, template renders the 20-row cap + "и ещё N" line (template handles cap; action passes full list).
- [ ] Logged-in flow includes `cabinetUrl`; guest flow omits (no working claim landing route in this scope).
- [ ] `npx tsc --noEmit` exits 0.

**Verify:**

- `npx tsc --noEmit`
- TS-005.

---

### Task 10: Rental-booking confirmation wiring

**Objective:** Dispatch `sendRentalBookingConfirmationEmail` from `createRentalBooking` (`app/actions/rentals.ts:146`) after the booking is persisted.

**Dependencies:** Task 4
**Mapped Scenarios:** TS-008

**Files:**

- Modify: `app/actions/rentals.ts`

**Trivial:** No — vehicle-summary + dates + total shaping.

**Key Decisions / Notes:**

- Locate `createRentalBooking` at line 146. After the booking is persisted (the `db.rentalBooking.create({...})` call succeeds), and AFTER the customer-onboarding `findOrCreateGuestCustomer` resolves (so `customer.email` is known), dispatch:

  ```ts
  const vehicleSummary = `${vehicle.make} ${vehicle.model} ${vehicle.year} г.`;
  const { sendRentalBookingConfirmationEmail } = await import("@/lib/email");
  void sendRentalBookingConfirmationEmail(customer.email, {
    customerName: customer.name,
    vehicleSummary,
    startAt: input.startAt,
    endAt: input.endAt,
    totalDays: computedTotalDays,
    totalPrice: booking.totalPrice,
    pickupAddress: addressFromCms,
    managerPhone: dealOwnerPhone ?? undefined,
  }).catch(() => {});
  ```

- `addressFromCms` via `loadRequisites().contactAddress` (already imported elsewhere) or `getCMSText("contacts.address")` — use whichever the file already imports to avoid widening the surface.
- `dealOwnerPhone`: if the rental booking creates a Deal with an owner, pull the owner's phone. If unset, omit; the template handles undefined.

**Definition of Done:**

- [ ] After `RentalBooking` persists, email is dispatched.
- [ ] Dates render in Russian format in the inbox.
- [ ] No claim-CTA in email body (post-checkout panel handles claim flow at the moment of checkout, not later).
- [ ] `npx tsc --noEmit` exits 0.

**Verify:**

- `npx tsc --noEmit`
- TS-008.
