# Public Site Polish v2 — Reviews + Hero Hover + Booking Simplification

Created: 2026-05-04
Author: aleksandr's.spiskov@gmail.com
Category: UX
Status: Draft
Research: Standard (in flight; findings synthesized into PRD when available)

## Problem Statement

Three pieces of post-launch feedback after the public-site-refresh deploy:

1. **Reviews section feels visually anemic.** The Yandex Maps iframe widget is a fixed ~560px box centered on a wide content area, leaving large dead margins. Worse, on first paint the widget hasn't loaded yet — the user sees an empty box that looks broken before the iframe content settles. Trust signals should _lead_, not flicker in.

2. **The hero is good but static.** The full-height transparent split is the right shape. But it's a still picture: nothing happens when the user reaches for either side. A subtle hover-driven expansion (the targeted half grows, the other narrows) would communicate that each side is a real entry point and reward intent.

3. **The booking flow is too long and asks the wrong questions early.** Five steps, with service selection first — but a typical first-time customer doesn't know which service they need (the "ремонт двигателя" path is for someone who's diagnosed already; most arrivals are "что-то стучит / пора ТО / надо посмотреть"). The wizard also makes email mandatory and ends in a register-or-not abyss with no path into the customer's cabinet for repeat business.

**Why now:** the public-site-refresh just landed in production, the data-model-redesign is verified, and these three pieces are the lowest-hanging UX wins before the next acquisition push. Each is small enough to ship in one /spec and they share a single deployment.

## Core User Flows

### Flow 1: Visitor reaches Reviews section
1. Visitor scrolls past hero / stats / services / why-us
2. Reaches "Отзывы клиентов" — the section width fills the viewport content area (no dead side margins). On the left, the Yandex iframe (now `width=560`) sits inside a centered card. On the right (desktop only, ≥`md`), a brand panel: large "4.9★" rating, "230+ отзывов на Яндекс Картах" copy, and a primary "Все отзывы →" button linking to the public profile
3. Before the iframe finishes loading, a skeleton placeholder occupies its slot (gradient pulse, same `min-h: 800px` so no CLS). Once `iframe onLoad` fires, the placeholder fades out
4. Mobile (<`md`): the panel stacks above the iframe; iframe remains horizontally scrollable inside its container as before

### Flow 2: Visitor hovers a hero half
1. Visitor lands on `/`, sees the 50/50 split-hero (Сервис | Запчасти)
2. Visitor hovers the left half (Сервис) → smooth 600ms transition: left grows to ~70% width, right shrinks to ~30%. The dark-photo background remains continuous, so the photo subtly "shifts" as the columns rebalance
3. Visitor moves cursor away → both halves return to 50/50
4. Visitor hovers the right half → mirror image
5. Mobile / touch / `prefers-reduced-motion`: no expansion (CSS `:hover` doesn't fire on touch by default; respect `prefers-reduced-motion` query for accessibility)

### Flow 3: Visitor books service (new 3-step flow)
1. Visitor clicks "Записаться на сервис" from hero or anywhere → lands on `/booking`
2. **Step 1 — Что и для какого автомобиля.** One page, two cards stacked:
   - **Услуги** card: grid of all service tiles (10 services, including new ones: Кузовной ремонт, Электрика, АКПП, Двигатель). Multi-select. **"Другое" tile is the catch-all** for "не знаю что именно — приеду на диагностику", revealed by default like the rest
   - **Автомобиль** card: Model dropdown + Year input + optional VIN + optional mileage. **After both Model and Year are filled**, helper text appears below year: `"Кузов: W463 / W464 (определяется по году)"` — inferred from `MODELS[model].generations` and the year ranges
   - Single "Далее →" button enabled when ≥1 service AND model+year are set
3. **Step 2 — Когда.** Calendar slot picker (unchanged from current step 3). "Далее →" enables when slot picked
4. **Step 3 — Контакты и подтверждение.** Single page with three regions:
   - Contact form: Name (required), Phone (required), **Email (optional — labeled "необязательно", placed last)**, Notes (optional), Loaner / Wait-at-service checkboxes (optional)
   - Summary card: services chosen + vehicle + datetime, all editable via "← Изменить" links that jump back
   - Top-right of the contact card: a discreet `Уже есть аккаунт? Войти →` link (modal or `/login?return=/booking/step-3`) for the rare returning customer who wants to attach the booking to their account upfront
   - **One primary button**: `Записаться` (no auth fork). Submits as guest unconditionally. The existing `createRepairOrder` action already creates a soft-account User row keyed by phone/email — that's the guest behavior we want.
5. **Confirmation screen** (after submit):
   - Success state: ✓ icon, "Запись подтверждена!", SMS-сейчас-придёт copy
   - **Post-purchase auth capture card** (only shown if no session was active during submit): "Хотите отслеживать статус ремонта? Установите пароль и эта запись сохранится в личном кабинете" with a single password input + button `Сохранить и войти`. On submit: sets the password on the just-created User row + opens a session cookie + redirects to `/cabinet/tracking`. Skipping the prompt is allowed via "Готово →" or "На главную" — booking is already submitted, this is purely upgrade
   - If user WAS logged in during submit (rare since we don't push login at step 3): skip the post-purchase prompt, show "Перейти в кабинет →" directly
6. SMS confirmation fires regardless of auth state (uses phone, not email — email is optional)

## Scope

### In Scope

**Item 1 — Reviews redesign (`app/(public)/page.tsx` Reviews section):**
- Two-column layout on desktop (`md+`): iframe card on left, brand panel on right; mobile stacks panel-above-iframe
- Brand panel content: "4.9★" badge (larger size), "Источник: Яндекс Карты" attribution, current "Все отзывы →" CTA promoted to primary button
- Iframe width bumped to `width=760` (Yandex's max) for desktop denser content; mobile container still `overflow-x-auto`
- New `ReviewsSkeleton` component: gradient-pulsing card with `min-h: 800px` matching iframe size, hidden via React state when iframe `onLoad` fires
- Iframe wrapped in a Client Component to manage the loading state

**Item 2 — Hero hover-expansion (`app/(public)/page.tsx` hero):**
- Hero outer container switches from `grid grid-cols-1 md:grid-cols-2` to `grid grid-cols-1 md:[grid-template-columns:1fr_1fr]` with a transition on `grid-template-columns` (CSS animatable in modern browsers)
- Add `:has()` selector rules: when a child half is hovered, expand it to `2fr 1fr` or `1fr 2fr`
- 600ms cubic-bezier transition for natural easing
- Wrap rules in `@media (prefers-reduced-motion: no-preference)` — touch devices and reduced-motion users see the static 50/50

**Item 3 — Booking flow simplification:**
- Compress to 3 steps (`/booking` = step 1, `/booking/step-2` = calendar, `/booking/step-3` = contact+confirm)
- Delete current `step-2`, `step-3`, `step-4`, `step-5` directories; remap to new step paths
- Combine `ServiceSelector` + `VehicleInput` into a new `Step1ServiceVehicle` component
- Calendar step renamed `Step2Calendar` (was `step-3`)
- `Step3ContactConfirm` combines current `ContactForm` + `BookingConfirmation` summary + new auth fork
- New seed services: Кузовной ремонт, Электрика, АКПП. Rename "Ремонт двигателя" → "Двигатель". Add "Другое" catch-all service. Total: 10 services
- Helper text logic: `MODELS[model].generations` parses comma-separated generations; show as `"Кузов: <gen1> / <gen2>"` after model + year are both filled
- Email field becomes optional in `BookingData` validation (existing `createRepairOrder` already tolerates empty email per code review — confirm)
- **No auth fork at step 3.** Single primary "Записаться" button submits guest. A small "Уже есть аккаунт? Войти →" link in the corner handles the returning-customer edge case (modal or login route).
- **New `BookingPostPurchaseAuth` component** rendered on the success state: shows when `result.success && !sessionExisted`. Single password input + "Сохранить и войти" button. On submit: a new server action `attachPasswordAndLogin(repairOrderId, password)` updates the User's `passwordHash`, sets the session cookie, redirects to `/cabinet/tracking`. Dismissable via "На главную" — booking is already saved either way.

### Explicitly Out of Scope

- Multi-vehicle "Гараж" wired into booking — out of /spec public-site-refresh, still out
- Yandex iframe styling overrides (cross-origin, can't)
- Hero animation library (Motion / Framer Motion) — pure CSS only, zero new deps
- Persisting an in-progress booking across login (e.g., user clicks "log in", logs in, comes back) — stays simple: login happens inline within step 3, no cross-page persistence
- VIN decoder (still deferred)
- Recommended-services AI engine (e.g., "based on your year + km, you might need…") — out of scope
- Replacing service tiles with "describe your concern" free-text — out of scope; "Другое" service is the safety valve
- Booking analytics events (track step funnel) — out of scope
- A/B testing the new flow against the old — no infra; ship and observe
- New schema fields on Service (e.g., `isPopular`) — show all 10 services, no curation flag needed
- Backwards-compat redirects from old `/booking/step-3,4,5` URLs — visitors who bookmarked mid-wizard will hit 404; acceptable per scale

## Technical Context

- **Hero animation:** Tailwind v4 supports arbitrary `grid-template-columns` values in classes via `[grid-template-columns:1fr_1fr]` syntax. The `transition-[grid-template-columns]` utility (or `transition-all`) handles the animation. The `has-[X:hover]:` selector variant is the cleanest way; or write a small block in `globals.css` under `@layer components`.

- **Reviews skeleton:** the iframe is third-party content (`yandex.ru`). Cross-origin iframes can fire `onLoad` reliably even when the inner content is blocked (e.g., by an ad blocker). We can listen on `<iframe ref={...} onLoad={() => setLoaded(true)}>` from a Client Component. The skeleton is a pulsing gradient card behind/above the iframe; on `onLoad`, fade it out via `opacity-0 transition-opacity`.

- **Booking step routing:** Next.js App Router doesn't redirect file-based routes. Deleting `step-3,4,5/page.tsx` makes them 404 directly. Old visitor refreshes mid-flow → 404 → restart. Acceptable per the "out of scope" note.

- **`createRepairOrder` already handles missing email** at the server level: there's no validation that rejects empty email. Today's client-side `canProceed` requires it; lifting that requirement is a one-liner.

- **Auth fork submit handling:** existing server actions:
  - `createRepairOrder(data)` — used today, creates anonymous User if needed
  - `register(formData)` — creates account, sets session cookie
  - `login(formData)` — verifies + sets session cookie
  - For the "create account" path: call `register` first, then `createRepairOrder` (the just-set session cookie means the second call attaches RO to the new User automatically per the existing session-lookup logic in `createRepairOrder`)
  - For the "log in" path: same shape — call `login`, then `createRepairOrder`. Order matters; both calls must complete in one user-facing submit.

- **`/cabinet/tracking` already exists** and shows the user's active RepairOrders. After login/register completes, redirect there.

- **Existing code:**
  - `app/(public)/page.tsx` — hero + Reviews section
  - `app/(public)/booking/{page,step-2,step-3,step-4,step-5}/page.tsx` — wizard pages
  - `components/booking/{BookingProvider,ServiceSelector,VehicleInput,CalendarSlotPicker,ContactForm,BookingConfirmation,StepIndicator}.tsx`
  - `app/actions/booking.ts:createRepairOrder` — submission handler
  - `app/actions/login.ts:login`, `app/actions/register.ts:register` — auth actions
  - `prisma/seed.ts` — 9 seeded services (need to add 4 new + rename 1)
  - `lib/models-data.ts:MODELS` — generations strings used for chassis-code helper

## Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Bundle scope | All 3 items in one PRD | User confirmed; ships as a single polish release |
| Research tier | Standard, focused on booking | Items 1+2 are well-known CSS patterns; item 3 benefits |
| Booking step count | 3 steps | Halves wizard; balances progressive disclosure vs friction |
| Step 1 layout | Two stacked cards (Services + Vehicle) on one page | Combines previously-separate steps; keeps each visually distinct |
| Service catalog | All 10 services, including "Другое" catch-all | User selected all; no popular/specialty curation, "Другое" answers the "I don't know" case |
| New services | Add Кузовной ремонт, Электрика, АКПП, Другое; rename Ремонт двигателя → Двигатель | User-defined service set |
| Chassis-code helper | Static lookup from `MODELS[].generations`, comma-split | No new data; year-range mapping deferred (just show all generations the model has) |
| Email field | Optional | User decision; phone is the primary contact channel for SMS |
| Auth at checkout | **Post-purchase capture** (no fork at step 3) | Research convergence (Baymard, Corbado, ecomhint): forced auth choice at checkout costs ~26% abandonment even with guest as default. Highest-converting RU/Western pattern is "submit as guest unconditionally → optional password capture on confirmation". Returning users get a discreet "Уже есть аккаунт? Войти →" link at step 3. |
| Email field | Optional, placed last | RU norm is to omit entirely (gipix-lite/STOCRM/YCLIENTS don't have email field at all) — user chose to keep it for future newsletter/receipt channels |
| Hero animation tech | Pure CSS via `:has(:hover)` + `transition-[grid-template-columns]` | Zero JS, zero deps, modern browsers; respects `prefers-reduced-motion` |
| Reviews layout | 2-column desktop, stacked mobile | Fills dead space without violating Yandex iframe constraints |
| Iframe width | 760px (Yandex max) | Denser content, less dead space |
| Skeleton mechanism | React state + `iframe onLoad` | Works even when iframe content blocked (onLoad still fires) |

## Research Findings

Standard research completed. Source file: `/tmp/prd-research-booking.md`. Key findings that inform the PRD:

### Russian-market СТО patterns (canonical)
- **Single-screen, 5 fields**: Name (one field, not full ФИО), Phone (with mask), Make+Model, Service tile, Date/Time slot. Form CR norm 8–15%.
- **Mercedes RU dealers** (Avtodom, Panavto, MBR.ru): tile-based service catalog → simple contact form. Effectively 1–2 steps. **Never** a 5-step wizard.
- Top-5 conversion killers: fake slots, non-mobile form, no <2 min confirmation, shared queue across specialists, no CRM integration. >70% of СТО traffic is mobile.
- **"Не уверен / Другое" is NOT first-class** in any RU dealer surveyed. The de-facto path is selecting "Диагностика" + optional "Опишите проблему" free-text. Our explicit "Другое" tile is a small bet that goes against canonical RU practice — defensible but worth measuring.

### Email collection — RU norm is to OMIT
- gipix-lite, STOCRM, YCLIENTS, AvtoDealer (the dominant RU booking SaaS) **don't even have an email field**.
- Phone with `+7 (___) ___-__-__` mask is mandatory; SMS or WhatsApp confirmation within 2 min.
- Yandex, Avito, Ozon, Wildberries all use phone+SMS code, not email+password. Email-first feels foreign on RU consumer flows.
- **Implication for this PRD:** "email optional" is fine and matches user choice; "email omitted" would be even more RU-canonical. Email kept here to preserve future newsletter / receipt channels, but downgrade to last position in the form, label `необязательно` clearly.

### Auth at checkout — strong evidence for post-purchase, not inline
- **Forced registration → ~26% abandon** at the registration step (Baymard 2025).
- Guest checkout offered → up to **+45% checkout conversion** (PayPal); +10–30% (Krepling).
- Mobile gap: guest completes ~26% more on mobile.
- 70% of customers prefer not creating an account.
- **Repeat-purchase advantage**: registered users 64% vs guests 52% on subsequent visits — but only matters _after_ first conversion.
- **Industry consensus** (Baymard, Corbado, ecomhint): the highest-converting pattern is **complete booking as guest unconditionally → confirmation screen offers post-purchase optional account** ("Сохранить запись в личном кабинете? Установите пароль"). Wayfair-style forced login is justified only for high-consideration multi-session flows — wrong for single-session service booking.
- Layout when inline fork is used: three equal cards inline on one screen, guest as default-selected radio. Account creation MUST merge with booking submit (never two submit actions). Avoid modals; avoid separate routes.

### Progressive disclosure for "I don't know" cases
- Western pattern (Paperform, Twine, Kukui): capture **symptom description + photos**, not service taxonomy. Pre-qualify before arrival rather than ask the customer to self-diagnose.
- "Diagnostics" tile is the established RU equivalent of "Other / Not sure" — it explicitly signals "figure out what's wrong."
- 4–6 broad service buckets > full price-list. Always include "Другое / Не знаю — нужна диагностика" routing to free-text + photo flow.

### Sources
- gipix-lite.ru blog (2026 RU СТО conversion analysis)
- baymard.com/research/checkout-usability + cart-abandonment-rate
- ecomhint.com guest-vs-account piece
- corbado.com/blog/guest-checkout-vs-forced-login
- Mercedes-Avtodom, Panavto Mercedes, STOCRM, YCLIENTS public booking widgets

### Notes / gaps
- Yandex / Drom / Auto.ru / Major / Rolf direct booking pages were not retrievable in this session (zero-result Cyrillic queries — likely limited RU index, not anti-bot blocking). Mercedes-Avtodom + Panavto + MBR + gipix-lite converge enough to treat "single-screen, 5-field, phone+SMS" as canonical.
- Tekmetric/Shopmonkey/ServiceTitan exact intake copy not directly retrievable; Western pattern inferred from industry write-ups.
