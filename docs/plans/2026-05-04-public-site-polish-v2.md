# Public Site Polish v2 Implementation Plan

Created: 2026-05-04
Author: aleksandr's.spiskov@gmail.com
Status: PENDING
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Three coordinated UX improvements after public-site-refresh — (1) Reviews section visual + loading skeleton; (2) Hero hover-expansion via CSS grid-template-columns animation + `:has()`; (3) Booking flow compression to 3 steps with service catalog cleanup + chassis-code helper. Driven by `docs/prd/2026-05-04-public-site-polish-v2.md`.

**Architecture:** Three independent surfaces, all in `app/(public)/`. Reviews + Hero are page-level edits in `app/(public)/page.tsx` plus minor `globals.css` additions. Booking is a wizard restructure: delete `step-3,4,5/page.tsx`, new combined Step1 component (Service + Vehicle), renamed Step2 (calendar), new Step3 (contact + confirm — single page). Seed data renames 3 existing services and adds 1 new ("Другое").

**Descoped from this iteration** (per Codex/Claude reviewer findings — security + identity model):
- Post-purchase auth capture (`BookingPostPurchaseAuth` + `attachPasswordAndLogin`) — RO-id-as-auth-boundary is account-takeover risk; needs SMS-OTP or signed claim tokens. Defer to a dedicated booking-auth PRD.
- Optional email — current `User.email @unique` schema + login keying on email mean blank-email guests are unrecoverable. Defer until phone-OTP login + profile edit flow is built.
- "Уже есть аккаунт? Войти →" return link at Step 3 — login.ts hardcodes `/cabinet` redirect; would need separate refactor to honor `?return=`.

**Tech Stack:** Next.js 16.2.3, React 19, Tailwind v4 (with `:has()` + `grid-template-columns` transition), Prisma 6, no new runtime deps.

## Scope

### In Scope

- **A. Reviews redesign** in `app/(public)/page.tsx` Reviews section: 2-column layout on `lg+` (iframe left, brand-panel right with 4.9★ + Все отзывы CTA), stacks on mobile. Iframe `width=760` (Yandex max). New `ReviewsIframeWithSkeleton` Client Component manages loading state via `iframe onLoad`.
- **B. Hero hover-expansion** in `app/(public)/page.tsx` hero: replace `grid-cols-1 md:grid-cols-2` with arbitrary `[grid-template-columns:1fr_1fr]` on `md+` and add `:has()` rules in `globals.css` to expand the hovered half to `2fr 1fr`. 600ms cubic-bezier transition. `prefers-reduced-motion` query disables animation.
- **C. Booking flow compression to 3 steps:**
  - Delete `app/(public)/booking/step-4/page.tsx`, `step-5/page.tsx`. Renumber existing step-3 (calendar) to step-2 contents; existing step-2 (vehicle) merges into step-1.
  - Step 1 (`app/(public)/booking/page.tsx`): new combined component `Step1ServiceVehicle` (Services tile grid + Vehicle card). Generates chassis-code helper from `MODEL_GENERATIONS[model]` after model+year filled.
  - Step 2 (`app/(public)/booking/step-2/page.tsx`): rendered Calendar (was step-3). Reuses `CalendarSlotPicker` unchanged.
  - Step 3 (`app/(public)/booking/step-3/page.tsx`): new combined component `Step3ContactConfirm`. Contact form (Name + Phone + **Email all required as today**) + Summary card with "← Изменить" links + single primary "Записаться" button. On success: existing confirmation state ("Запись подтверждена!" + "На главную" / "Личный кабинет" links) — same as today's `BookingConfirmation`.
- **D. Seed services update** (`prisma/seed.ts`): rename existing services (slug stays the same, only `name` changes): `repair` "Ремонт двигателя" → "Двигатель"; `transmission` "Трансмиссия" → "АКПП"; `electric` "Электрика и электроника" → "Электрика". Add ONE new service: slug `other` name "Другое". Total goes 9 → 10 services.
- **E. `StepIndicator` updated** for 3 steps (was 5).

### Explicitly Out of Scope

- Photo upload on booking — deferred (research suggested but not user-confirmed)
- AI-recommended-services engine — deferred
- Forced login at step 3 — explicitly rejected per Baymard research
- Multi-vehicle "Гараж" wired into booking — out
- Backwards-compat redirects from old `/booking/step-{4,5}` URLs — visitors mid-wizard hit 404, acceptable per scale
- WhatsApp confirmation alongside SMS — out (use existing SMS via `lib/sms.ts`)
- Booking funnel analytics events — out
- A/B testing the new flow — no infra
- New schema fields on `Service` (e.g., `isPopular`, `category`) — show all 12 services flat
- Hero animation library (Motion/Framer) — pure CSS only

## Approach

**Chosen:** **Surgical replacement of the booking wizard** (not a full rewrite). Reviews and Hero are localized in-place edits. Booking deletes 3 step files, adds 2 new combined Client Components, renumbers routes. Existing `BookingProvider`, `CalendarSlotPicker`, `createRepairOrder` action all stay.

**Why:** Localized changes minimize blast radius. The booking wizard's state machine (`BookingProvider` localStorage-backed) doesn't need to change — only the step component composition. Cost: visitors with bookmarks to old step paths hit 404, which the PRD accepts.

**Alternatives considered:**
- Full booking rewrite as a single-page form with progressive disclosure (no separate step routes) — rejected: bigger refactor, breaks existing URL-based step indicator and back-button semantics.
- Keep 5 steps but slim each — rejected: user confirmed 3-step target; "slim each" doesn't deliver the conversion improvement.

## Context for Implementer

> Write for an implementer who has never seen the codebase.

### Key patterns

- **Client Components for interactive bits**, Server Components for pages. Wizard pages today are server-component shells that render Client Components from `components/booking/*`.
- **`BookingProvider`** (`components/booking/BookingProvider.tsx`) is a `useSyncExternalStore` + localStorage Context provider keyed `booking-data`. The cached-snapshot pattern is REQUIRED per `geleoteka-conventions.md`.
- **Server Actions** in `app/actions/*.ts` with `"use server"`. Existing: `login`, `register`, `createRepairOrder`. New: `attachPasswordAndLogin`.
- **Auth in pages**: `getSession()` + redirect. JWT cookie via `setSessionCookie(token)` in `lib/auth.ts`.
- **Tailwind v4 theme tokens** are exposed via `@theme inline` in `globals.css` (`bg-accent`, `text-foreground`, etc.) — use these instead of arbitrary `[#hex]` values.
- **CSS in `globals.css`** under `@layer components` for hand-written rules that need to coexist with Tailwind utilities. Place hero-hover `:has()` rules there.

### Gotchas

- **`createRepairOrder`** (`app/actions/booking.ts`) already accepts empty `email` at the action level — only the client-side `canProceed` in `ContactForm` requires it. Removing the client check is sufficient; no server change for optional-email.
- **`BookingProvider.BookingData.email`** stays as `string` (default `""`); empty string flows through to `createRepairOrder` as `email: ""`. Server side currently does NOT search `db.user.findUnique({ where: { email: "" } })` correctly — it would match any user with empty-string email. Need to guard the `findUnique({ where: { email } })` with `email && data.email.length > 0` so empty email skips the email lookup. This is a small bug to fix in this PRD.
- **Old step paths**: `app/(public)/booking/step-2/page.tsx` (Vehicle), `step-3/page.tsx` (Calendar), `step-4/page.tsx` (Contact), `step-5/page.tsx` (Confirmation). After this work: `step-2` becomes Calendar (was step-3), `step-3` becomes Contact+Confirm (was step-4 merged with step-5), `step-4` and `step-5` directories deleted.
- **`StepIndicator`**: currently a 5-step rendering (`components/booking/StepIndicator.tsx`). Update to 3 steps with new labels: "Услуги и авто" / "Дата и время" / "Контакты".
- **`MODELS[].generations`** is a comma-separated string (e.g., `"W463, W464"` for G-Class, `"C63, E63, GT, G63, GLE 63"` for AMG). After model is selected, parse + display all known generations as helper text after the year input. Year-range mapping (which generation is active in 2018 vs 2020) is **out of scope**: just show all generations the model has.
- **Yandex iframe `onLoad`** fires reliably on cross-origin iframes even when the iframe content is blocked by an ad blocker — onLoad signals the iframe element loaded, not whether its inner content rendered. This is good enough for hiding the skeleton.
- **`:has()` selector**: Chrome 105+, Firefox 121+, Safari 15.4+. Mobile Safari 15.4+ covers ~95% of users. Acceptable browser baseline.
- **`grid-template-columns` is animatable** via `transition: grid-template-columns 600ms` in modern browsers (Chrome 111+, Firefox 122+, Safari 16+). Slightly newer baseline than `:has()`. Older browsers see instant snap, no animation — acceptable graceful fallback.
- **Seed services** are in `prisma/seed.ts` lines ~5-95. The seed runs `prisma.service.upsert({ where: { slug } })` so renaming "ремонт-двигателя" slug to "dvigatel" would create a new service — keep slug stable as `engine-repair` and just update name. Same for adding 4 new services with new slugs.
- **DB update for seed changes**: locally just `prisma migrate reset` + reseed. Production needs SEPARATE seed run (the production seed is idempotent because of upsert, but the rename still requires running it). Plan: include "run seed in prod via railway run" in the deploy task.

### Key files

| File | Purpose | Change |
|------|---------|--------|
| `app/(public)/page.tsx` | Homepage, hero + Reviews section | Modify hero grid + Reviews layout |
| `app/globals.css` | Tailwind v4 theme + custom rules | Add `:has()` hero rules + `@media prefers-reduced-motion` |
| `app/(public)/booking/page.tsx` | Step 1 page | Replace ServiceSelector with new Step1ServiceVehicle |
| `app/(public)/booking/step-2/page.tsx` | Will become Calendar (was Vehicle) | Replace contents to render CalendarSlotPicker |
| `app/(public)/booking/step-3/page.tsx` | Will become Contact+Confirm (was Calendar) | Replace contents to render Step3ContactConfirm |
| `app/(public)/booking/step-4/page.tsx` | Was Contact | DELETE |
| `app/(public)/booking/step-5/page.tsx` | Was Confirmation | DELETE |
| `app/(public)/booking/layout.tsx` | Wizard shell | No change |
| `components/booking/Step1ServiceVehicle.tsx` | New combined Step 1 | CREATE |
| `components/booking/Step3ContactConfirm.tsx` | New combined Step 3 | CREATE |
| `components/booking/BookingPostPurchaseAuth.tsx` | New post-purchase password card | CREATE |
| `components/booking/ReviewsIframeWithSkeleton.tsx` | New Client Component for Reviews | CREATE in `components/shared/` |
| `components/booking/ServiceSelector.tsx` | Old standalone Service picker | DELETE (folded into Step1ServiceVehicle) |
| `components/booking/VehicleInput.tsx` | Old standalone Vehicle input | DELETE (folded into Step1ServiceVehicle) |
| `components/booking/ContactForm.tsx` | Old contact form | DELETE (folded into Step3ContactConfirm) |
| `components/booking/BookingConfirmation.tsx` | Old confirmation | DELETE (folded into Step3ContactConfirm) |
| `components/booking/StepIndicator.tsx` | Step indicator | Update to 3 steps |
| `app/actions/booking.ts` | `createRepairOrder` | Add `attachPasswordAndLogin` action; guard empty-email lookup |
| `prisma/seed.ts` | Seed services | Rename Ремонт двигателя → Двигатель; add 4 new services |
| `lib/models-data.ts` | `MODELS` + `MODEL_GENERATIONS` | No change (re-used) |

## Runtime Environment

- Dev: `npm run dev` (port 443, HTTPS)
- DB: PostgreSQL `geleoteka` on `localhost:5432`
- Production: Railway, auto-deploy from `main`. Includes `npx prisma migrate deploy` preDeployCommand.
- Admin: `admin@geleoteka.ru` / `admin123`. Client: `client@test.ru` / `admin123`.

## Assumptions

- `BookingProvider` localStorage state survives the wizard's existing localStorage key — no migration needed since `BookingData` shape doesn't change. Tasks 4 + 7 depend on this.
- Yandex iframe `onLoad` event fires within ~1–3 seconds on a normal connection. Skeleton shown during this window. — Task 1 depends on this.
- Tailwind v4's `[grid-template-columns:1fr_1fr]` arbitrary value compiles correctly with `transition-all` or `transition-[grid-template-columns]`. Verified via project's existing arbitrary-value usage. Task 2 depends on this.
- The seed's `upsert` pattern keyed by `slug` is idempotent. Renaming "Ремонт двигателя" requires either updating the existing slug `engine-repair` to a new slug, OR keeping the slug and only updating `name`. We choose the latter — keep slug stable, change display name. Task 3 depends on this.
- `prefers-reduced-motion: reduce` users see the static 50/50 hero (no transition) — verified via CSS media query. Task 2 depends on this.
- Production seed run via `railway run npx prisma db seed` from local terminal connects to prod DB through `DATABASE_PUBLIC_URL` env var (already verified during the prior recovery work). Task 8 depends on this.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Visitors with bookmarks to `/booking/step-4,5` hit 404 mid-wizard | Medium | Low | Acceptable per PRD; wizard is short-lived (≤5 min sessions); 404 page already shows "На главную" CTA. Optionally add Next.js `redirect()` from `step-4,5` to `step-3` if user wants — out of scope by default. |
| `:has()` selector unsupported in old browsers (Firefox <121, etc.) | Low | Low | Graceful fallback: no animation, static 50/50. No layout breakage. |
| Yandex iframe `onLoad` doesn't fire (ad blocker scenarios) | Medium | Low | Skeleton has a max-wait timer (e.g., 4s) that hides it regardless. Implementer note in Task 1. |
| Empty-email lookup in `createRepairOrder` matches a wrong user | Low | High | Guard `if (!user && email && email.length > 0) user = await db.user.findUnique({ where: { email } })`. Same for phone. Task 5 must include this guard. |
| Post-purchase password capture breaks because the just-created User is the random-password anonymous one (and we need to update it, not create new) | Medium | Medium | `attachPasswordAndLogin` operates on existing User by id (passed as `repairOrderId` → looks up RO → gets `userId`). It updates `passwordHash` via `db.user.update`, doesn't create. Task 6 must verify `RepairOrder.userId` lookup chain. |
| Production seed doesn't run automatically on deploy — new services missing | High | High | Document explicit step in Task 8 deploy plan: `railway run npx prisma db seed` after first deploy. Without this, new service tiles will be empty. |
| `BookingProvider.BookingData.serviceIds` references stale service IDs from before the rename if a user had the wizard open across the deploy | Low | Low | Service IDs are random `cuid()`-style; renaming `name` doesn't change `id`. The 4 new services get new `id`s; existing `id`s remain valid. localStorage sync is fine. |

## Goal Verification

### Truths

1. Visiting `/` Reviews section shows: a 2-column layout on `lg+` (iframe left, brand panel right with 4.9★ + Все отзывы CTA + "Источник: Яндекс Карты") and stacks on mobile.
2. On first paint of Reviews section, before iframe loads, a pulsing skeleton occupies the iframe slot. Once iframe `onLoad` fires (or after 4s timeout), skeleton fades out.
3. Hovering left half of hero on desktop expands it to 2fr / right shrinks to 1fr (~67%/33%) over 600ms; right hover mirrors. Mobile / `prefers-reduced-motion` shows static 50/50.
4. Visiting `/booking` shows Step 1 with both Services tile grid AND Vehicle card on the same page. Selecting ≥1 service AND filling model+year enables "Далее →".
5. After model+year are filled in Step 1, helper text "Кузов: <gen1> / <gen2>" appears under the year field, derived from `MODELS[model].generations`.
6. Step 2 is the calendar slot picker.
7. Step 3 has Contact form (Name + Phone + Email all required, like today), Summary card with edit links, single primary "Записаться" button. No auth-link, no auth fork, no post-purchase password card.
8. Submitting Step 3 successfully shows existing confirmation state ("Запись подтверждена!" + "На главную" / "Личный кабинет" links) — no behavior change vs today's `BookingConfirmation`.
9. After running production seed: tiles show "Двигатель" (was "Ремонт двигателя"), "АКПП" (was "Трансмиссия"), "Электрика" (was "Электрика и электроника"), and new "Другое".
10. `npx tsc --noEmit` exits 0; `npm run lint` 0 errors; `npm run build` succeeds.

### Artifacts

- `app/(public)/page.tsx` — hero hover rules + Reviews 2-column layout
- `app/globals.css` — `:has()` rules + `prefers-reduced-motion` media query
- `components/shared/ReviewsIframeWithSkeleton.tsx` — new
- `components/booking/Step1ServiceVehicle.tsx`, `Step3ContactConfirm.tsx`, `BookingPostPurchaseAuth.tsx` — new
- `components/booking/StepIndicator.tsx` — updated to 3 steps
- `app/(public)/booking/{page,step-2,step-3}/page.tsx` — wizard restructured
- `app/(public)/booking/step-{4,5}/page.tsx` — deleted
- `components/booking/{ServiceSelector,VehicleInput,ContactForm,BookingConfirmation}.tsx` — deleted
- `app/actions/booking.ts` — `attachPasswordAndLogin` added; empty-email guard
- `prisma/seed.ts` — services updated

## E2E Test Scenarios

### TS-001: Reviews 2-column layout + skeleton
**Priority:** High
**Preconditions:** Anonymous visitor, viewport 1280×800, fast connection
**Mapped Tasks:** Task 1

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/`, scroll to Reviews | 2-column layout: iframe left, brand panel right with 4.9★ + Все отзывы CTA |
| 2 | Hard-reload page, scroll fast to Reviews | Skeleton (gradient pulse) visible momentarily before iframe loads |
| 3 | Wait for iframe to load | Skeleton fades out, iframe content visible |
| 4 | Resize to 375×667 | Brand panel stacks above iframe; iframe horizontal scrolls within container |

### TS-002: Hero hover expansion
**Priority:** High
**Preconditions:** Desktop 1280×800, no `prefers-reduced-motion`
**Mapped Tasks:** Task 2

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/`, observe hero | 50/50 split, vertical gold divider centered |
| 2 | Hover over left half (Сервис) | Smooth ~600ms transition: left grows to ~67%, right shrinks to ~33% |
| 3 | Move cursor away | Both halves return to 50/50 |
| 4 | Hover over right half (Запчасти) | Right grows to ~67%, left shrinks to ~33% |
| 5 | Open Chrome DevTools Rendering panel, enable "Emulate CSS prefers-reduced-motion: reduce" | Hover no longer animates; halves stay 50/50 |

### TS-003: Booking Step 1 — combined Service + Vehicle
**Priority:** Critical
**Preconditions:** Anonymous visitor, no localStorage state
**Mapped Tasks:** Task 3, Task 4

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/booking` | Step indicator shows 3 steps. Page has Services tile grid (12 tiles incl. Двигатель, Кузовной ремонт, Электрика, АКПП, Другое) and Vehicle card |
| 2 | Click "Двигатель" + "Диагностика" | Both tiles selected (highlighted) |
| 3 | Pick model "G-Class" | Generation helper text NOT shown yet (year missing) |
| 4 | Type year `2020` | Helper text appears: "Кузов: W463 / W464" |
| 5 | Click "Далее →" | Navigates to `/booking/step-2` (calendar) |

### TS-004: Booking Step 3 — contact + submit + confirmation

**Priority:** Critical
**Preconditions:** Anonymous visitor, completed Step 1 + Step 2 (services + vehicle + slot)
**Mapped Tasks:** Task 5

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Arrive at `/booking/step-3` | Contact form with Name + Phone + Email all required + Notes textarea + Loaner/Wait checkboxes. Summary card showing services + vehicle + datetime with "← Изменить" links. Single primary "Записаться" button at bottom |
| 2 | Fill Name + Phone + Email | "Записаться" enabled |
| 3 | Click "Записаться" | Submit succeeds (~1-2s); confirmation state shows: ✓ icon + "Запись подтверждена!" + "На главную" / "Личный кабинет" links |
| 4 | Click "Изменить" on summary card services row | Navigates back to Step 1 with selections preserved |

### TS-008: Step indicator shows 3 steps
**Priority:** Medium
**Preconditions:** None
**Mapped Tasks:** Task 4

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/booking` | StepIndicator shows 3 dots/labels: "Услуги и авто" (active) / "Дата и время" / "Контакты" |
| 2 | Complete Step 1, advance to step-2 | Step 2 dot active |
| 3 | Advance to step-3 | Step 3 dot active |

## Progress Tracking

- [x] Task 1: Reviews 2-column layout + iframe skeleton
- [x] Task 2: Hero hover-expansion CSS rules
- [x] Task 3: Seed services — rename 3 + add 1 (Другое)
- [x] Task 4: Step 1 component — combined Service + Vehicle + chassis-code helper
- [x] Task 5: Step 3 component — Contact + Summary (email stays required, no auth link)
- [x] Task 6: Wizard route restructure — delete step-4,5; renumber step-2,3; update StepIndicator; delete obsolete components
- [ ] Task 7: Final regression + smoke + commit + push + run prod seed

      **Total Tasks:** 7 | **Completed:** 6 | **Remaining:** 1

## Implementation Tasks

---

### Task 1: Reviews 2-column layout + iframe skeleton

**Objective:** Wrap the Yandex iframe in a Client Component that shows a pulsing skeleton until `onLoad` fires (or 4s timeout). Restructure Reviews section to 2-column on `lg+` with brand panel beside iframe.

**Dependencies:** None
**Mapped Scenarios:** TS-001

**Files:**
- Create: `components/shared/ReviewsIframeWithSkeleton.tsx`
- Modify: `app/(public)/page.tsx` (Reviews section, ~lines 261-303)

**Key Decisions / Notes:**

- New Client Component:
  ```tsx
  "use client";
  import { useState, useEffect, useRef } from "react";
  import { YANDEX_REVIEWS_IFRAME_URL } from "@/lib/yandex";

  export function ReviewsIframeWithSkeleton(): React.ReactElement {
    const [loaded, setLoaded] = useState(false);
    useEffect(() => {
      const t = setTimeout(() => setLoaded(true), 4000);
      return () => clearTimeout(t);
    }, []);
    return (
      <div className="relative" style={{ minHeight: 800 }}>
        {!loaded && (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-[var(--card)] via-[var(--background-secondary)] to-[var(--card)] rounded-lg" />
        )}
        <iframe
          src={YANDEX_REVIEWS_IFRAME_URL}
          loading="lazy"
          frameBorder="0"
          width="760"
          height="800"
          onLoad={() => setLoaded(true)}
          className={`block mx-auto transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
          title="Отзывы клиентов на Яндекс Картах"
        />
      </div>
    );
  }
  ```
- Reviews section in `app/(public)/page.tsx` becomes a `lg:grid lg:grid-cols-[1fr_280px] lg:gap-8` layout. Left grid cell wraps `<ReviewsIframeWithSkeleton />`. Right grid cell is a "card" with the heading "Отзывы клиентов" + 4.9★ badge (now bigger) + "Источник: Яндекс Карты" attribution + "Все отзывы на Яндекс Картах →" CTA promoted to `btn btn-primary`.
- Mobile (`<lg`): the right cell stacks above the iframe. No horizontal scroll on the section itself; the `<ReviewsIframeWithSkeleton />` container can `overflow-x-auto` for mobile iframe scrolling.
- Heading "Отзывы клиентов" + the existing 4.9★ + count line moves into the right brand panel (no longer above the iframe centered).

**Definition of Done:**

- [ ] `ReviewsIframeWithSkeleton.tsx` exists, renders iframe with `width=760`, hides skeleton on `onLoad` OR after 4s
- [ ] `app/(public)/page.tsx` Reviews section uses `lg:grid lg:grid-cols-[1fr_280px]` layout
- [ ] Brand panel includes 4.9★ + count + Все отзывы primary button
- [ ] Mobile (<1024px): brand panel stacks above iframe; iframe horizontal-scrolls in its container
- [ ] No console errors; no CLS on first load (skeleton holds the height)
- [ ] `npx tsc --noEmit` exit 0

**Verify:**
- Manual: navigate to `/` at 1280×800 + 375×667, verify both layouts via Chrome DevTools MCP
- `npx tsc --noEmit`

---

### Task 2: Hero hover-expansion CSS rules

**Objective:** Replace the hero's `grid-cols-1 md:grid-cols-2` with arbitrary `[grid-template-columns:1fr_1fr]` on `md+`, add `:has()` rules in `globals.css` to expand the hovered half. Respects `prefers-reduced-motion`.

**Dependencies:** None
**Mapped Scenarios:** TS-002

**Files:**
- Modify: `app/(public)/page.tsx` (hero grid div)
- Modify: `app/globals.css` (add hero-hover rules)

**Key Decisions / Notes:**

- In `app/(public)/page.tsx`, change the inner grid wrapper:
  ```tsx
  // Before:
  <div className="relative z-10 grid h-full animate-fade-in grid-cols-1 text-white md:grid-cols-2">

  // After:
  <div className="hero-split relative z-10 grid h-full animate-fade-in grid-cols-1 text-white md:[grid-template-columns:1fr_1fr]">
  ```
  Add a `data-half="left"` / `data-half="right"` attribute to each child `<div>` (the half containers).

- In `app/globals.css`, add at the bottom (or in a dedicated section):
  ```css
  @media (min-width: 768px) and (prefers-reduced-motion: no-preference) {
    .hero-split {
      transition: grid-template-columns 600ms cubic-bezier(0.4, 0, 0.2, 1);
    }
    .hero-split:has([data-half="left"]:hover) {
      grid-template-columns: 2fr 1fr;
    }
    .hero-split:has([data-half="right"]:hover) {
      grid-template-columns: 1fr 2fr;
    }
  }
  ```

- Mobile (<`md`): keeps `grid-cols-1` (vertical stack), no transition runs.
- `prefers-reduced-motion: reduce` users: media-query gate prevents both the transition AND the `:has()` expansion rules. Halves stay 50/50.
- The vertical gold divider currently positioned absolutely with `left-1/2` will need to stay centered as columns change. Two options: (a) leave divider absolute centered — it stays in place while columns rebalance (looks odd as columns shift past it); (b) make the divider a `border-r` on the left half — moves with the column boundary. Choose (b) for visual consistency: remove the absolute divider element, add `md:border-r border-accent/40` to the left half.

**Definition of Done:**

- [ ] Hero grid uses `[grid-template-columns:1fr_1fr]` on `md+`
- [ ] Each half has `data-half="left"` or `data-half="right"`
- [ ] `globals.css` has `:has()` rules wrapped in `@media (min-width: 768px) and (prefers-reduced-motion: no-preference)`
- [ ] Hover left → grid becomes 2fr 1fr; hover right → 1fr 2fr; transition 600ms
- [ ] `prefers-reduced-motion: reduce` (DevTools emulation): no transition, no expansion
- [ ] Mobile (<768px): static stack, no hover behavior, no errors
- [ ] Divider visually moves with the column boundary (border-r on left half) instead of static center

**Verify:**
- Manual: TS-002 scenarios via Chrome DevTools MCP at 1280×800
- `npx tsc --noEmit`

---

### Task 3: Seed services — rename + add 4 new

**Objective:** Update `prisma/seed.ts` to rename "Ремонт двигателя" → "Двигатель" (keep slug `engine-repair`) and add 4 new services: Кузовной ремонт, Электрика, АКПП, Другое.

**Dependencies:** None
**Mapped Scenarios:** TS-003

**Files:**
- Modify: `prisma/seed.ts` (services array, ~lines 5-95)

**Key Decisions / Notes:**

- The seed uses `prisma.service.upsert({ where: { slug }, create: {...}, update: {...} })`. Renaming: keep `slug: "engine-repair"`, change `name: "Двигатель"` (was "Ремонт двигателя"). Description can stay or be tweaked.
- Add 4 entries to the services array (slugs lower-kebab):
  - `body-repair` — name "Кузовной ремонт", description "Покраска, рихтовка, восстановление геометрии после ДТП.", priceMin 15000, durationMinutes 1440 (1 day)
  - `electrical` — name "Электрика", description "Диагностика и ремонт электросистем, проводки, ЭБУ.", priceMin 4500, durationMinutes 180
  - `transmission` — name "АКПП", description "Диагностика и ремонт автоматических трансмиссий 7G/9G/AMG SPEEDSHIFT.", priceMin 12000, durationMinutes 360
  - `other` — name "Другое", description "Не уверены, что именно нужно? Приезжайте на диагностику — определим причину.", priceMin null, priceMax null, durationMinutes null
- After local `prisma migrate reset --force`, dev DB has 13 services (9 original - 1 already counted + 4 new = 12; the rename keeps count at 9, so 9 + 4 = 13... actually verify: seed currently has 9, rename keeps slug count at 9, +4 new = 13). Adjust expected count if seed has more or fewer.
- Production: explicit `railway run npx prisma db seed` step covered in Task 8.

**Definition of Done:**

- [ ] `prisma/seed.ts` services array has the rename + 4 new entries
- [ ] `npx prisma migrate reset --force` (with consent) runs and seeds without error
- [ ] `psql geleoteka -c "SELECT slug, name FROM \"Service\" ORDER BY \"createdAt\""` shows new services + renamed "Двигатель"
- [ ] `npx tsc --noEmit` and `npx prisma validate` exit 0

**Verify:**
- Local DB query confirms 12+ services after reset
- `npx tsc --noEmit`

---

### Task 4: Step 1 component — combined Service + Vehicle + chassis-code helper

**Objective:** Create `Step1ServiceVehicle` Client Component that combines the existing `ServiceSelector` + `VehicleInput` into one page. Add chassis-code helper text after model+year are filled. Update `StepIndicator` to 3 steps.

**Dependencies:** Task 3 (services need to exist for the tiles)
**Mapped Scenarios:** TS-003, TS-008

**Files:**
- Create: `components/booking/Step1ServiceVehicle.tsx`
- Modify: `components/booking/StepIndicator.tsx` (5 → 3 steps)
- Modify: `app/(public)/booking/page.tsx` (renders new component)

**Key Decisions / Notes:**

- `Step1ServiceVehicle` props: `services: ServiceItem[]` (passed from Server Component page).
- Layout: two stacked cards inside one container.
  - Card 1 — "Что вы хотите?" — heading + Services grid (current `ServiceSelector` UI: 2-col tile grid, multi-select, checkbox indicator, price + duration).
  - Card 2 — "Какая машина?" — heading + Model dropdown + Year input + VIN (optional) + Mileage (optional). After both Model AND Year are filled, render below year:
    ```tsx
    {data.model && data.year && MODEL_GENERATIONS[data.model] && (
      <p className="text-xs text-foreground-muted mt-1">
        Кузов: {MODEL_GENERATIONS[data.model].join(" / ")}
      </p>
    )}
    ```
- Single "Далее →" button at bottom, enabled when `data.serviceIds.length >= 1 && data.model.trim() && data.year.trim()`. Navigates to `/booking/step-2`.
- `StepIndicator`: replace 5-step array with `["Услуги и авто", "Дата и время", "Контакты"]`. Active step computed from current pathname.
- `app/(public)/booking/page.tsx` (server component): fetch services from DB, render `<Step1ServiceVehicle services={services} />`. Existing service-fetching code can be reused as-is.

**Definition of Done:**

- [ ] `Step1ServiceVehicle.tsx` exists with services grid + vehicle card
- [ ] Chassis-code helper appears when both model + year filled
- [ ] `StepIndicator` shows 3 steps with correct active highlighting on `/booking`, `/booking/step-2`, `/booking/step-3`
- [ ] `app/(public)/booking/page.tsx` renders the new component
- [ ] "Далее →" enables when ≥1 service AND model+year set; navigates to `/booking/step-2`
- [ ] `npx tsc --noEmit` exit 0

**Verify:**
- Manual: TS-003 + TS-008 via Chrome DevTools MCP
- `npx tsc --noEmit`

---

### Task 5: Step 3 component — Contact + Summary + Submit (no auth fork, email required)

**Objective:** Create `Step3ContactConfirm` Client Component that combines `ContactForm` + `BookingConfirmation` summary into a single page with a single "Записаться" button. Email stays required (matches today). On success: existing confirmation state (title + "На главную" / "Личный кабинет" links) — no post-purchase auth card.

**Dependencies:** Task 4 (Step 1 navigates → Step 2 → Step 3)
**Mapped Scenarios:** TS-004, TS-008

**Files:**
- Create: `components/booking/Step3ContactConfirm.tsx`
- Modify: `app/(public)/booking/step-3/page.tsx` (renders new component — NOTE: existing step-3 currently contains Calendar; that move happens in Task 6)

**Key Decisions / Notes:**

- `Step3ContactConfirm` structure:
  - Contact card: Name + Phone + Email (all required, like today) + Notes (textarea) + Loaner/Wait checkboxes
  - Summary card: services chosen (list of names) + vehicle (model + year) + datetime, each with a small "← Изменить" link that navigates back to the relevant step
  - Single "Записаться" primary button, disabled while `submitting`. `onClick` calls `createRepairOrder(data)`. On success: confirmation state (✓ icon + "Запись подтверждена!" + "На главную" link + "Личный кабинет" link) — same UI as today's `BookingConfirmation` lines 30-52.
  - Validation: `canSubmit = data.name.trim() && data.phone.trim() && data.email.trim() && data.serviceIds.length && data.model && data.year && data.dateTime`. (Email IS in this check — descope keeps current required behavior.)
- No "Уже есть аккаунт? Войти →" link (descoped).
- No post-purchase auth card (descoped).
- `createRepairOrder` server action unchanged — no email-guard fix needed since email stays required.

**Definition of Done:**

- [ ] `Step3ContactConfirm.tsx` exists with structure above
- [ ] Submit succeeds with valid form data; confirmation UI shows
- [ ] No auth-fork buttons, no post-purchase password card
- [ ] No "Войти →" link
- [ ] `npx tsc --noEmit` exit 0

**Verify:**
- Manual: TS-004 + TS-008 via Chrome DevTools MCP
- `npx tsc --noEmit`

---

### Task 6: Wizard route restructure — delete step-4,5; renumber step-2,3; update StepIndicator; delete obsolete components

**Objective:** Apply the route renumbering. Delete old `step-4/page.tsx`, `step-5/page.tsx`. Step-2 (was Vehicle) becomes Calendar (was step-3 contents). Step-3 (was Calendar) becomes Contact+Confirm. Delete obsolete components: `ServiceSelector`, `VehicleInput`, `ContactForm`, `BookingConfirmation`.

**Dependencies:** Task 4, Task 5
**Mapped Scenarios:** TS-003, TS-004, TS-008

**Files:**
- Modify: `app/(public)/booking/page.tsx` (Step 1 → renders `<Step1ServiceVehicle />`)
- Modify: `app/(public)/booking/step-2/page.tsx` (was Vehicle, becomes Calendar shell — renders existing `<CalendarSlotPicker />`)
- Modify: `app/(public)/booking/step-3/page.tsx` (was Calendar, becomes Contact+Confirm shell — renders `<Step3ContactConfirm />`)
- Delete: `app/(public)/booking/step-4/page.tsx`
- Delete: `app/(public)/booking/step-5/page.tsx`
- Delete: `components/booking/ServiceSelector.tsx`
- Delete: `components/booking/VehicleInput.tsx`
- Delete: `components/booking/ContactForm.tsx`
- Delete: `components/booking/BookingConfirmation.tsx`

**Key Decisions / Notes:**

- After Tasks 4 + 5, the step pages just render the new components. Step 2 calendar page renders `<CalendarSlotPicker />` (existing component, no change). Step 3 page renders `<Step3ContactConfirm />`.
- `grep -rn "ServiceSelector\|VehicleInput\|ContactForm\|BookingConfirmation" --include="*.tsx" --exclude-dir=node_modules` after deletion should return zero hits.
- Run `npx tsc --noEmit` and `npm run build` to confirm no orphan imports.

**Definition of Done:**

- [ ] All 4 obsolete components deleted
- [ ] step-4/page.tsx and step-5/page.tsx deleted
- [ ] step-2 renders Calendar (`CalendarSlotPicker`)
- [ ] step-3 renders Step3ContactConfirm
- [ ] `grep` for old component names returns zero (excluding generated files)
- [ ] `npx tsc --noEmit` exit 0
- [ ] `npm run build` succeeds; route list shows `/booking`, `/booking/step-2`, `/booking/step-3` and NO `/booking/step-4` or `step-5`

**Verify:**
- `grep -rn "ServiceSelector\|VehicleInput\|ContactForm\|BookingConfirmation" --include="*.tsx" app/ components/`
- `npm run build`

---

### Task 7: Final regression + smoke + commit + push + run prod seed

**Objective:** Full regression suite, walk all TS scenarios in browser, commit, push to `origin/main`, run production seed via `railway run` to apply renames + add "Другое".

**Dependencies:** Tasks 1–6
**Mapped Scenarios:** All

**Files:**
- No file edits (cleanup + verification only)

**Key Decisions / Notes:**

- Regression sequence:
  1. `npx prisma validate`
  2. `npx tsc --noEmit`
  3. `npm run lint`
  4. `rm -rf .next && npm run build`
- Browser smoke walking TS-001..TS-008 via Chrome DevTools MCP at 1280×800 + 375×667.
- Commit message: `feat(public-site): polish v2 — reviews skeleton + hero hover + booking 3-step + service catalog cleanup`. Single commit.
- Push: `git push origin main`. Railway auto-deploys.
- **Production seed**: get `DATABASE_PUBLIC_URL` from Railway dashboard (`Postgres service → Variables`), then run locally: `DATABASE_URL=<public_url> npx prisma db seed`. Idempotent — `upsert` will rename `repair`/`transmission`/`electric` and create `other`.
- Post-deploy verify: `curl -s https://geleoteka-production.up.railway.app/booking | grep -c "Двигатель"` ≥1 (rename took effect) and `grep -c "Другое"` ≥1 (new service added).

**Definition of Done:**

- [ ] All 4 regression commands exit 0
- [ ] Manual browser smoke confirms each TS scenario passes
- [ ] Commit created with the descriptive message above
- [ ] `git push origin main` succeeds
- [ ] Production deploys; `/booking` shows renamed "Двигатель" + new "Другое" tile
- [ ] Production seed run via DATABASE_PUBLIC_URL succeeds; `SELECT COUNT(*) FROM "Service"` increases by 1 (from 9 to 10) and the 3 renames take effect

**Verify:**
- `git log -1 --oneline` shows the new commit
- `curl -s https://geleoteka-production.up.railway.app/booking | grep -c "Двигатель"` returns ≥1
- `curl -s https://geleoteka-production.up.railway.app/booking | grep -c "Другое"` returns ≥1

## Open Questions

- **Login redirect-back via `?return=` query param**: needs verification that `app/actions/login.ts` already honors this. If not, add to Task 5. Will check during implementation; defer the question.

## Deferred Ideas

- Photo upload on booking ("прикрепите фото проблемы") — research suggested but not user-confirmed; defer to a v3 polish PRD
- Service categories / "popular vs specialty" tagging via new `Service.category` field — out of scope; current 12-service flat list is acceptable
- AI-recommended services based on year + km — defer
- Cross-page session persistence for "user clicks 'log in' mid-wizard" — currently login navigates to `/login?return=/booking/step-3` and BookingProvider state survives via localStorage; if return-flow proves brittle in TS-007, revisit
