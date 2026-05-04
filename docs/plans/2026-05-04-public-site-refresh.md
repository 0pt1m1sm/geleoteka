# Public Site Refresh Implementation Plan

Created: 2026-05-04
Author: aleksandr's.spiskov@gmail.com
Status: COMPLETE
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Public-site UX refresh in 4 coordinated changes — split-hero CTAs (service + parts), delete the "Популярные модели" section, replace fake reviews with the official Yandex Maps iframe widget, and turn `/parts` into a vehicle-aware shop with a persistent "Мой автомобиль" header strip + sidebar filters. Driven by `docs/prd/2026-05-04-public-site-refresh.md`.

**Architecture:** Three surgical edits to a single Server Component (`app/(public)/page.tsx`) plus one larger refactor of `app/(public)/parts/page.tsx` from a flat list with a horizontal filter bar into a two-column layout (sidebar filters + grid) wired to a localStorage-backed "my-car" client store. The car selection is encoded in URL search params (`?model=…&generation=…`) so SSR can apply the filter on first paint. localStorage acts only as a memory aid that redirects `/parts` (no params) to the saved car's URL on revisit.

**Tech Stack:** Next.js 16.2.3 (App Router, RSC), React 19, Tailwind v4, Prisma 6 — no new runtime deps. Prisma `Part.compatibleModels: String[]` is the existing fitment store.

## Deployment Authorization (in-session, durable)

User pre-approved deploy to production at the end of `/spec`. After verification: stage all changes (this plan's diff PLUS the still-uncommitted data-model-redesign work which is also on `main` and already VERIFIED), commit, push to `origin/main`. Railway auto-deploys from `main`. **No Code Review Gate prompt at VERIFIED.** The user explicitly accepted that this push will also ship the data-model-redesign changes (they chose "continue on current branch" at /spec start).

## Scope

### In Scope

- **A. Hero redesign** in `app/(public)/page.tsx` — preserve brand pillar (eyebrow + wordmark + subtitle + micro-tagline); below it, render a gold-gradient hairline divider + 50/50 split with two cards (`Сервис` left, `Запчасти` right). Mobile (<768px): cards stack vertically, **service first**.
- **B. Delete** the "Популярные модели" section (current lines ~192-220) and the `MODELS` import on line 2 of the homepage. `lib/models-data.ts` stays (no other source consumers besides homepage; `/models/[slug]` page may still import it — verify and only delete the export if zero remaining consumers).
- **C. Reviews section rebuild** — delete the 3 hardcoded review cards; keep the heading and the 4.9★ static badge; below them embed the official Yandex Maps reviews iframe widget (lazy-loaded); add a centered "Все отзывы на Яндекс Картах →" CTA below the iframe.
- **D. Parts shop refactor** — replace `PartsSearch` (horizontal filter bar) with `PartsFilterSidebar` (left, 240–280 px on desktop; mobile drawer). Add `MyCarPicker` + `MyCarStrip` components and a `useMyCar` hook backed by localStorage with cached snapshot per `geleoteka-conventions.md`. Encode car selection in URL search params (`?model=…&generation=…`) so SSR applies the filter; localStorage redirects bare `/parts` to the saved car's URL on revisit via a `useLayoutEffect`-based init component.
- **E. Compatibility data normalization** — change format of `Part.compatibleModels` from `["G-Class"]` to `["G-Class W463", "G-Class W464"]` style (denormalized model + generation). Update `prisma/seed.ts` and ship a one-shot `scripts/normalize-compatible-models.ts` for the production DB.
- **F. Yandex IDs** — store the Yandex Maps org ID and public-profile URL as constants in a new `lib/yandex.ts`. Values: `YANDEX_ORG_ID = "211932722600"`, `YANDEX_PROFILE_URL = "https://yandex.com/maps/-/CPWFAQ-m"`. Iframe URL constructed as `https://yandex.ru/maps-reviews-widget/211932722600?comments`.

### Out of Scope

- Multi-vehicle "Гараж" (single car only, future PRD)
- VIN decoder
- Brand / Срок поставки / Страна sidebar facets (would need new schema fields)
- Server-side persistence of "my car" for logged-in users
- Schema changes to `Part` (only data normalization)
- `aggregateRating` JSON-LD on `LocalBusiness` (Google ban since 2019)
- A/B testing the new hero
- Yandex iframe styling overrides
- Removal of `/models` and `/models/[slug]` routes (homepage section deletion only)
- New animations beyond the existing design system
- Next.js client navigation transitions

## Approach

**Chosen:** **Server-render-first with URL-encoded car state, localStorage for memory only.**

**Why:** Encoding the car in `?model=X&generation=Y` lets SSR apply `compatibleModels: { has: <key> }` on first paint — no flash of unfiltered catalog. localStorage exists solely to redirect bare `/parts` to the saved car's URL on revisit. Bookmarks, social shares, and search engines all work without JS. Matches the project's "RSC by default, client only when needed" pattern. Cost: a brief `router.replace('/parts?model=…')` on revisit when localStorage has a car but the URL is bare — measured at ~50–150 ms in the existing app.

**Alternatives considered:**

- **Client-side filter with full hydration** — server returns the unfiltered catalog every time, client filters after mount. Rejected: visible flash, breaks SSR/SEO, contradicts the codebase convention of Prisma queries in Server Components.
- **Cookie-based persistence** — server reads cookie, no flash, no client init. Rejected: contradicts `geleoteka-conventions.md` (`useSyncExternalStore` for client state) and forces a Server Action just to set the cookie when the picker submits. Adds a request round-trip the localStorage approach avoids.
- **No URL encoding, localStorage only** — picker writes to localStorage, client component refetches. Rejected: same as alternative #1 but worse — every navigation re-runs the filter logic in JS.

## Context for Implementer

> Write for an implementer who has never seen the codebase.

### Key patterns

- **Prisma client** imports from `@/lib/db` (singleton at `lib/db.ts`). Never import from `@prisma/client` or the generated path directly.
- **Server Components by default** — pages are `async function` Server Components that query Prisma and render. Mark interactive bits `"use client"` and split into `components/<area>/`.
- **Auth in pages**: `getSession()` + `redirect("/login")` if needed. Public pages need no auth.
- **localStorage state**: project rule says use `useSyncExternalStore` with **cached snapshots** keyed off the raw localStorage string (see `geleoteka-conventions.md` → "useSyncExternalStore for localStorage"). Returning a fresh object every getSnapshot causes infinite re-render loops in React 19 strict mode.
- **CSS**: CSS variables only — `var(--color-accent)`, `var(--background)`, etc. No hardcoded hex.
- **Component naming**: PascalCase files (`MyCarPicker.tsx`).
- **Route protection at middleware**: `app/middleware.ts` reads JWT and gates `/admin` paths; `/parts` is public.

### Gotchas

- **`compatibleModels` is consumed from 6 places** — admin form parse/format (`app/actions/parts.ts`, `app/(admin)/admin/parts/[id]/page.tsx`), CSV import (`app/api/parts/import/route.ts`), public detail page (`app/(public)/parts/[slug]/page.tsx`), public list filter (`app/(public)/parts/page.tsx:25`), and seed (`prisma/seed.ts`). When the format changes from `"G-Class"` → `"G-Class W463"`, **all six must be updated together**, otherwise admin edits will silently corrupt the data.
- **Existing `/parts` free-text search** uses `compatibleModels: { has: q }` — that line must be reviewed: with the new format, `q="G-Class"` won't match `"G-Class W463"` via `has`. Switch to `compatibleModels: { hasSome: [...] }` or use `compatibleModels: { has: \`${model} ${generation}\` }` only when both picker fields are set; fall back to `OR` over name/article when free-text only.
- **`MODELS[].generations`** is a comma-separated string (e.g., `"W463, W464"` for G-Class, `"C63, E63, GT, G63, GLE 63"` for AMG). The picker must split on `,` and trim. AMG and EQ are special cases — their "generations" are sub-models, not chassis codes; copy the strings verbatim.
- **`useLayoutEffect` runs client-only** — server-render returns `null` from `MyCarInit`, fine, but importantly, the redirect must check `searchParams` to avoid an infinite loop (`/parts` → `/parts?model=X` → `/parts` → …). Guard: only redirect when `pathname === "/parts"` AND `searchParams` has neither `model` nor `generation`.
- **The `ThemeInit` Client Component** (`components/shared/ThemeInit.tsx`) is the precedent — Client Component using `useLayoutEffect` reading localStorage, no inline `<script>`. The legacy `public/theme-init.js` is unused but still in repo. Match the ThemeInit pattern; do not add a new inline script.
- **The existing horizontal `PartsSearch`** is a free-text search input + a category dropdown + two checkboxes, all on one row. Replacing it with a sidebar means the **search box** still needs to live somewhere — keep it at the top of the catalog area (above the grid), separate from the sidebar. Don't drop the `q` param.
- **Yandex iframe is third-party** — `loading="lazy"` is required to avoid LCP impact; surrounding container needs explicit `min-height` to prevent CLS during lazy load.
- **`.env.example`** already has `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` for a different service (Yandex Maps API key, not reviews). The reviews iframe needs only the org ID — no API key.

### Key files

| File | Purpose | Change |
|------|---------|--------|
| `app/(public)/page.tsx` | Homepage Server Component | Edit: hero split, delete Models section, replace Reviews cards with iframe |
| `app/(public)/parts/page.tsx` | Parts list Server Component | Refactor: add car-aware where clause, render new sidebar + grid layout |
| `app/(public)/parts/[slug]/page.tsx` | Part detail | Read updated `compatibleModels` (display string with generation) |
| `app/(admin)/admin/parts/[id]/page.tsx` | Admin part edit | Display `compatibleModels` joined with `", "` (already does — verify after format change) |
| `app/actions/parts.ts` | Admin parts CRUD | `compatibleModels` parse remains a comma-split — no logic change, just data format |
| `app/api/parts/import/route.ts` | CSV bulk import | Same — comma-split is unchanged; CSV format must use new strings |
| `prisma/seed.ts` | Seed data | Update all `compatibleModels` values to new format |
| `prisma/schema.prisma` | Schema | **No change** — `compatibleModels: String[]` is reused as-is |
| `components/parts/PartsSearch.tsx` | Current horizontal filter | **Delete** after migration to sidebar |
| `components/parts/MyCarPicker.tsx` | New — 2-step picker | Create |
| `components/parts/MyCarStrip.tsx` | New — sticky persistent strip | Create |
| `components/parts/PartsFilterSidebar.tsx` | New — left sidebar with 4 facets | Create |
| `components/shared/MyCarInit.tsx` | New — `useLayoutEffect` redirect on revisit | Create; mount once in layout |
| `lib/my-car-store.ts` | New — `useSyncExternalStore` cached snapshot | Create |
| `lib/yandex.ts` | New — Yandex org ID + profile URL constants | Create |
| `lib/models-data.ts` | Existing model list | No change (consumed for picker) |
| `app/layout.tsx` | Root layout | Add `<MyCarInit />` next to `<ThemeInit />` |
| `scripts/normalize-compatible-models.ts` | New — one-shot data migration | Create; not run automatically — instructions in plan |

### Domain context

- **Mercedes generation codes (W-codes)** are how Russian Mercedes mechanics and customers identify specific platforms. The G-Class W463 (1990–2018) and W464 (2018–present) share badges but almost no parts. Filtering by model alone produces wrong-fit results; filtering by `model + generation` is the industry minimum.
- **Single-bay shop**: `Slot.dateTime @unique` (post data-model-redesign) confirms one repair per timestamp. No multi-master fitment concern in MVP.

## Runtime Environment

- **Dev:** `npm run dev` (port 443, HTTPS via Next experimental cert).
- **DB:** PostgreSQL `geleoteka` on `localhost:5432`.
- **Production:** Railway, auto-deploy from `main`. `preDeployCommand = ["npx prisma migrate deploy"]` runs migrations.
- **Admin credentials:** `admin@geleoteka.ru` / `admin123`. Client: `client@test.ru` / `admin123`.
- **Yandex iframe:** loaded over HTTPS from `yandex.ru`; no auth.

## Assumptions

- Yandex Maps org ID `211932722600` and profile URL `https://yandex.com/maps/-/CPWFAQ-m` provided by user. Iframe will be sourced from `https://yandex.ru/maps-reviews-widget/211932722600?comments` (yandex.ru domain — widget is hosted there regardless of which locale the public profile uses). — Tasks 3 + 8 depend on this.
- `MODELS[].generations` strings are stable enough to power the picker. Verified: `lib/models-data.ts` has them populated for all 8 models. — Task 5 depends on this.
- Existing `Part.compatibleModels` data is the small set seeded in `prisma/seed.ts` (~10 parts) plus whatever was added via admin/CSV. Production volume is low enough that a one-shot script can normalize all of it in one transaction. Verify with `SELECT COUNT(*) FROM "Part"` before running. — Task 4 depends on this.
- The `ThemeInit` `useLayoutEffect` pattern works for `MyCarInit` too. Verified: ThemeInit already does the same shape (read localStorage, mutate DOM). — Task 5 depends on this.
- The existing `/parts` page's horizontal `PartsSearch` component has no consumers outside `app/(public)/parts/page.tsx`. — Task 7 depends on this.
- Yandex Maps reviews iframe is reachable from Russian visitors without geo-blocking concerns. — Task 3 depends on this.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Yandex iframe horizontal-scrolls on mobile and looks broken | High | Medium | Wrap iframe in `overflow-x-auto` container with `min-height: 400px` and a visible "→ свайп для прокрутки" hint shown only when `width(content) > width(viewport)`. Document the trade-off in code comments. |
| Compatibility format migration corrupts admin-edited parts | Low | High | Wrap `scripts/normalize-compatible-models.ts` in a single Prisma transaction; print before/after diff for every changed row; require `--apply` flag (default = dry-run); back up the table via `pg_dump --table=Part > /tmp/part-backup.sql` before running. |
| `MyCarInit` redirect loop if guard logic is wrong | Medium | High | Unit-style assertion in code: only redirect when `pathname === "/parts"` and BOTH `model` and `generation` searchParams are absent. Add an early return with a comment explaining the guard. Test by manually setting localStorage and visiting `/parts?model=G-Class`. |
| Existing `compatibleModels: { has: q }` free-text path returns zero results after format change | High | Medium | Update the free-text branch to `OR` against `name`, `article`, AND `compatibleModels: { hasSome: <split-on-space tokens> }` so a search for `"G-Class"` still hits parts marked `"G-Class W463"`. Keep a regression test in mind for the manual smoke. |
| Yandex changes the iframe URL format or removes the widget | Low | High | Centralize the iframe URL construction in `lib/yandex.ts` so a single edit fixes it. Plan for graceful fallback: if iframe fails to load (detect via `onError` not really available cross-origin — accept the dead-iframe risk; check periodically). |
| Hero split looks unbalanced on viewports between 768px and 1024px (tablet portrait) | Medium | Low | Verify at `min-width: 768px and max-width: 1023px` in browser tools during Phase B; fall back to stacked layout below 900px if the cards visibly cramp. |
| Bundling the data-model-redesign work with this deploy means a revert wipes both | Low | Medium | **Pushed back on Codex's framing:** the redesign was already VERIFIED via its own /spec workflow (Phase A reviewers + Codex + automated checks + admin/booking/portal route smoke). The user explicitly chose "continue on current branch" knowing the redesign was sitting there. Bundling = user choice. The Task 8 smoke walks `/` and `/parts` plus the regression suite covers the homepage + parts surface this PRD touched. If the redesign side somehow regresses despite earlier verification, `git revert HEAD && git push` rolls everything back together — the cost the user accepted. **Note:** `prisma/seed.ts` is touched by both efforts but in different sections (redesign added new models; this PRD updates `compatibleModels` strings on existing parts) — no merge conflict, no semantic conflict. |

## Goal Verification

### Truths

1. Visiting `/` shows the new split-hero with two equal cards, "Сервис" left and "Запчасти" right, mobile stacking service-first.
2. Visiting `/` shows no "Популярные модели" section anywhere.
3. Visiting `/` reaches a Reviews section that contains the official Yandex Maps iframe (no fake review cards) and a "Все отзывы на Яндекс Картах →" CTA pointing to the configured URL.
4. Visiting `/parts` with no localStorage and no search params shows the full catalog plus a prominent picker; selecting "G-Class" + "W464" navigates to `/parts?model=G-Class&generation=W464` and the catalog reduces to parts whose `compatibleModels` contains `"G-Class W464"`.
5. Visiting `/parts` with saved localStorage car redirects to `/parts?model=…&generation=…` before the first user-visible repaint on a normal connection. **Acceptable flash window:** the SSR response always contains the unfiltered catalog; the client `useLayoutEffect` redirect runs before paint in most cases but a 50–150 ms flash on cold-load + slow-device combos is acknowledged as a known trade-off.
6. A part with `compatibleModels: ["G-Class W463", "G-Class W464"]` shows up under both `?model=G-Class&generation=W463` and `?model=G-Class&generation=W464` filters.
7. The sidebar's 4 facets (Category / OEM-Аналог / В наличии / Цена) each apply on the URL and survive page reload.
8. `npm run lint` exits 0; `npx tsc --noEmit` exits 0; `npm run build` succeeds with `/parts`, `/`, and the homepage in the route list.

### Artifacts

- `app/(public)/page.tsx` — new hero markup, deleted Models section, new Reviews iframe wiring
- `app/(public)/parts/page.tsx` — refactored to two-column layout with car-aware where clause
- `components/parts/MyCarPicker.tsx`, `MyCarStrip.tsx`, `PartsFilterSidebar.tsx` — new
- `components/shared/MyCarInit.tsx` — new, mounted in `app/layout.tsx`
- `lib/my-car-store.ts`, `lib/yandex.ts` — new
- `prisma/seed.ts` — updated `compatibleModels` strings
- `scripts/normalize-compatible-models.ts` — new (data migration script, dry-run by default)
- `components/parts/PartsSearch.tsx` — deleted

## E2E Test Scenarios

### TS-001: Split-hero CTAs route correctly
**Priority:** Critical
**Preconditions:** Anonymous visitor, no localStorage state, viewport 1280×800
**Mapped Tasks:** Task 1

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/` | Brand pillar visible above; below, two equal cards side by side: "Сервис" (left) + "Запчасти" (right). Gold hairline divider between them. |
| 2 | Click "Записаться на сервис" on the left card | URL changes to `/booking`; existing 5-step wizard renders. |
| 3 | Navigate back to `/` | Hero re-renders unchanged. |
| 4 | Click "В каталог запчастей" on the right card | URL changes to `/parts`; catalog renders with the picker prominent above. |

### TS-002: Mobile hero stacks service-first
**Priority:** Critical
**Preconditions:** Viewport 375×667 (iPhone SE)
**Mapped Tasks:** Task 1

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/` | Brand pillar shrinks (heading clamp visible); below it, two stacked cards full-width. |
| 2 | Read the order top-to-bottom | "Сервис" card appears first (above), "Запчасти" card second (below). |
| 3 | Click "Записаться на сервис" | Routes to `/booking`. |

### TS-003: Reviews section renders Yandex iframe
**Priority:** High
**Preconditions:** Yandex org ID configured in `lib/yandex.ts`
**Mapped Tasks:** Task 3

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/` and scroll to "Отзывы клиентов" | Heading visible, 4.9★ static badge below it. |
| 2 | Wait for iframe to lazy-load | Yandex Maps reviews widget visible (white background, Yandex visual style); shows real reviews from the configured org. |
| 3 | Click "Все отзывы на Яндекс Картах →" below iframe | Opens the configured Yandex Maps URL in a new tab (`target="_blank"`). |
| 4 | View on viewport 375×667 | Iframe horizontal-scrolls cleanly within its container; no other layout breakage. |

### TS-004: Picker writes to localStorage and URL
**Priority:** Critical
**Preconditions:** Anonymous visitor, no localStorage state
**Mapped Tasks:** Task 5, Task 6, Task 7

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/parts` | Picker prominent above the catalog; full unfiltered catalog visible below. |
| 2 | Select "G-Class" in model dropdown | Generation dropdown enables and shows "W463", "W464" options. |
| 3 | Select "W464" | URL updates to `/parts?model=G-Class&generation=W464`; catalog reduces to G-Class W464 parts only. The sticky strip "Ваш автомобиль: G-Class · W464" replaces the picker at the top of the catalog area. |
| 4 | Open DevTools → Application → localStorage | Key `geleoteka:my-car` exists with value `{"model":"G-Class","generation":"W464"}`. |
| 5 | Click "Сменить" in the strip | Strip collapses; picker re-appears in its place; URL still has the params (until user picks again). |

### TS-005: Returning visit auto-restores filter
**Priority:** Critical
**Preconditions:** localStorage has `geleoteka:my-car` = `{"model":"G-Class","generation":"W464"}`; visitor lands at `/parts` with no search params
**Mapped Tasks:** Task 5, Task 6, Task 7

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/parts` (no params) | URL replaces to `/parts?model=G-Class&generation=W464` before the first user-visible repaint on a normal connection. On a 4G-throttled DevTools profile the unfiltered catalog may briefly appear (50–150 ms) — acceptable per Truth #5. |
| 2 | Reload the page | URL stays at `/parts?model=G-Class&generation=W464`; filtered catalog renders on first paint (SSR applies the filter — no flash). |

### TS-006: Sidebar filters layer on the car filter
**Priority:** High
**Preconditions:** Car selected (e.g., G-Class W464); >5 parts match
**Mapped Tasks:** Task 7

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Только OEM" in sidebar | URL appends `&oem=true`; catalog reduces; chip "Только OEM ✕" appears above grid. |
| 2 | Click "Только OEM ✕" chip | URL drops `oem`; catalog expands. |
| 3 | Type `5000` into the max-price input | URL appends `&maxPrice=5000`; catalog reduces. (Slider drag is intentionally not the verification target — slider drags are unreliable in browser automation; the two-input fallback is the canonical path.) |
| 4 | Click "Сбросить все" | URL drops all sidebar params; car param remains; catalog returns to car-only filter. |

### TS-007: Empty state offers escape
**Priority:** High
**Preconditions:** Car selected for which no parts have any match in a chosen category (e.g., G-Class W463 + Category=Электрика when no electric parts exist)
**Mapped Tasks:** Task 7

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Apply filters that produce zero matches | Empty card renders: "Под ваш автомобиль нет деталей в этой категории" + button "Показать все запчасти" + link "Заказать через сервис". |
| 2 | Click "Показать все запчасти" | URL drops `model`+`generation` params; catalog re-renders with no car filter. Strip remains (still localStorage-backed). |

### TS-008: Mobile drawer for sidebar
**Priority:** Medium
**Preconditions:** Viewport 375×667; visitor on `/parts?model=G-Class&generation=W464`
**Mapped Tasks:** Task 7

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | View `/parts` page | Sidebar is collapsed; a "Фильтры (0)" button is visible above the grid. |
| 2 | Tap "Фильтры (0)" | Full-screen drawer slides in with the 4 facets. |
| 3 | Tap a category, then "Применить" | Drawer closes; URL updates with category param; catalog reduces; button label updates to "Фильтры (1)". |

## Progress Tracking

- [x] Task 1: Split hero with brand pillar + 2 cards (homepage edit)
- [x] Task 2: Delete "Популярные модели" section + dead-import cleanup
- [x] Task 3: Reviews — `lib/yandex.ts` + iframe + 4.9★ badge + CTA, lazy-load, CSP check
- [x] Task 4: Compatibility data normalization + admin write-path validation
- [x] Task 5: `lib/my-car-store.ts` + `MyCarPicker` + `MyCarStrip` (client store + 2 UI components)
- [x] Task 6: `MyCarInit` — redirect on revisit, with `||` guard + `showAll` override + self-heal
- [x] Task 7a: Parts page skeleton + server-side car-aware where clause + `showAll=1` semantics
- [x] Task 7b: `PartsFilterSidebar` + chips + mobile drawer with body-scroll-lock + delete `PartsSearch`
- [x] Task 8: Final regression + smoke (TS-001..TS-008) + commit + push to origin/main

      **Total Tasks:** 9 | **Completed:** 9 | **Remaining:** 0

## Implementation Tasks

---

### Task 1: Split hero with brand pillar + 2 cards

**Objective:** Replace the current single-CTA hero in `app/(public)/page.tsx` with a brand pillar + 50/50 split layout. Mobile stacks service-first.

**Dependencies:** None
**Mapped Scenarios:** TS-001, TS-002

**Files:**
- Modify: `app/(public)/page.tsx` (hero section, lines ~47-118)

**Key Decisions / Notes:**
- Keep the existing background photo (`/images/hero/g-class-4k.jpg`) and overlays untouched — do NOT split the photo, just split the content layer above it.
- The brand pillar block (eyebrow + wordmark + subtitle + micro-tagline) remains centered, but with smaller `mb-` spacing so the cards fit above the fold.
- Insert a hairline divider after the pillar: `<div className="w-32 h-px bg-gradient-to-r from-transparent via-[var(--color-accent)]/40 to-transparent mx-auto mb-8" />`
- Below the divider, render a `grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto`. Two card divs:
  - Left: heading "Сервис Гелендвагена в Москве" (or shorter — "Сервис в Москве"), 1-line subhead, primary button `Записаться на сервис` → `/booking`, secondary text link `Прайс на работы →` → `/services` (the existing services list page renders prices alongside each card).
  - Right: heading "Запчасти для G-Class", 1-line subhead, primary button `В каталог запчастей` → `/parts`, secondary text link `Масла и фильтры →` → `/parts?category=oils` (the most-populated category in seed; replace if a different category becomes more populated). **Decision:** the secondary link is intentionally a soft entry into a specific category, not a duplicate of the primary CTA — pick the category with the highest part count from the seed (currently "oils"). If analytics later show a different dominant category, swap the slug there.
- Both buttons use the existing primary style (`bg-[#d4af37] text-black`), same height (`px-8 py-4 text-lg`), same rounding. Same icon set (or no icons — be consistent).
- Mobile: `grid-cols-1` already stacks them vertically; ensure left card (Сервис) appears first by source order.
- Remove the existing single-CTA group (lines ~92-110) and replace with the new pillar + divider + grid block.
- Keep `min-height: 600px` and `max-h-[90vh]` on the section — verify in browser the cards don't push content too far off-screen on a 1366×768 viewport.

**Definition of Done:**
- [ ] Hero brand pillar renders with eyebrow, wordmark, subtitle, micro-tagline at top
- [ ] Below pillar: gold hairline divider + two cards in `grid-cols-1 md:grid-cols-2`
- [ ] Left card has "Сервис" heading + `Записаться на сервис` primary button → `/booking`
- [ ] Right card has "Запчасти" heading + `В каталог запчастей` primary button → `/parts`
- [ ] On mobile (<768px), cards stack with Сервис first
- [ ] No console errors; no layout shift between SSR and hydration

**Verify:**
- Manual: navigate to `/` in browser at 1280×800 and 375×667 viewports, confirm hero renders correctly and both buttons navigate to expected routes
- `npx tsc --noEmit`

---

### Task 2: Delete "Популярные модели" section + dead-import cleanup

**Objective:** Remove the Models grid section from the homepage and the now-dead `MODELS` import. Verify `lib/models-data.ts` still has consumers; if not, also remove the export.

**Dependencies:** Task 1
**Mapped Scenarios:** None (deletion is verified by absence)

**Files:**
- Modify: `app/(public)/page.tsx` (delete section ~lines 192-220 + import line 2)
- Possibly modify: `lib/models-data.ts` (only if no other consumers found)

**Key Decisions / Notes:**
- After deleting the section, run `grep -rn "MODELS\|models-data" --include="*.tsx" --include="*.ts" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=app/generated` to find remaining consumers.
- `MODELS` is also used by `MyCarPicker` (Task 5) for the model + generation dropdowns — so DO NOT delete `lib/models-data.ts`. Just remove the Models-section import from the homepage.
- `getModelBySlug` may still be consumed by `/models/[slug]` page — verify with grep before declaring it unused.

**Definition of Done:**
- [ ] `app/(public)/page.tsx` no longer renders the Models section
- [ ] `MODELS` import removed from `app/(public)/page.tsx`
- [ ] `lib/models-data.ts` still exists and exports `MODELS` (consumed by MyCarPicker in Task 5)
- [ ] `grep` confirms zero references to the deleted section text ("Популярные модели" appears only in this plan and the PRD)
- [ ] `npx tsc --noEmit` passes

**Verify:**
- `grep -rn "Популярные модели" app/ components/ lib/` returns zero hits
- `npx tsc --noEmit` exit 0

---

### Task 3: Reviews section — Yandex iframe + 4.9★ badge + CTA

**Objective:** Replace the 3 hardcoded fake review cards with the official Yandex Maps reviews iframe widget, lazy-loaded, with the existing 4.9★ heading badge above and a "Все отзывы на Яндекс Картах →" CTA below. Create `lib/yandex.ts` with the real org ID + profile URL.

**Dependencies:** None (lib/yandex.ts is created here, not deferred)
**Mapped Scenarios:** TS-003

**Files:**
- Create: `lib/yandex.ts` (constants — `YANDEX_ORG_ID`, `YANDEX_PROFILE_URL`, `YANDEX_REVIEWS_IFRAME_URL`)
- Modify: `app/(public)/page.tsx` (Reviews section, lines ~266-340)

**Key Decisions / Notes:**
- `lib/yandex.ts` exports:
  ```ts
  export const YANDEX_ORG_ID = "211932722600";
  export const YANDEX_PROFILE_URL = "https://yandex.com/maps/-/CPWFAQ-m";
  export const YANDEX_REVIEWS_IFRAME_URL = `https://yandex.ru/maps-reviews-widget/${YANDEX_ORG_ID}?comments`;
  ```
- Keep the existing heading "Отзывы клиентов" + the 5-star icon row + "4.9 — 230+ отзывов" badge — they stay as static visual brand assertion. Do not add any JSON-LD `aggregateRating`.
- Below the badge, render an `iframe` element:
  - `src={YANDEX_REVIEWS_IFRAME_URL}`
  - `loading="lazy"`, `frameBorder="0"`, `width="560"`, `height="800"` (height varies — keep generous)
  - Wrap in a container with `overflow-x-auto`, `min-height: 800px`, `mx-auto`, `max-width: 100%`
  - Add a comment near the iframe: `{/* Yandex Maps reviews widget. May be blocked by uBlock Origin / privacy extensions; we accept the blank-iframe risk and do NOT add a JS fallback because cross-origin frame-load detection is unreliable. */}`
- Below the iframe: a centered `<a href={YANDEX_PROFILE_URL} target="_blank" rel="noopener" className="...">Все отзывы на Яндекс Картах →</a>` styled like a tertiary link (gold underline on hover).
- The 3 hardcoded review cards (currently lines ~292-330) are deleted.
- Do NOT inject CSS into the iframe; do NOT attempt to wrap it in client-side JS for resizing — accept the styling mismatch.
- **CSP check:** review `next.config.ts` and any custom middleware response headers for an existing `Content-Security-Policy` or `X-Frame-Options` header that could block the embed. As of this plan, `next.config.ts` is minimal and no CSP is set — confirm during implementation. If a CSP exists, add `https://yandex.ru` to `frame-src`.

**Definition of Done:**
- [ ] `lib/yandex.ts` exists with the three real exports (no placeholders)
- [ ] Reviews section heading + 5-star + "4.9 — 230+ отзывов" badge intact
- [ ] No hardcoded review cards remain
- [ ] Yandex iframe renders with `loading="lazy"` and `src=YANDEX_REVIEWS_IFRAME_URL`
- [ ] CTA "Все отзывы на Яндекс Картах →" links to `YANDEX_PROFILE_URL` with `target="_blank" rel="noopener"`
- [ ] Mobile (375px wide): iframe horizontally scrolls cleanly within its container; no page-level horizontal scroll triggered
- [ ] No console errors from the iframe; no layout shift after lazy load (CLS = 0 on this section)
- [ ] Confirmed via DevTools Network → Response Headers on `/` that no CSP `frame-src` or `X-Frame-Options` header blocks the Yandex iframe

**Verify:**
- Manual: navigate to `/`, scroll to Reviews section, confirm iframe loads, confirm CTA opens correct profile in new tab
- DevTools: open Network tab, request `/` directly (top-level page), confirm Response Headers do not contain `Content-Security-Policy` or `X-Frame-Options` that would block `yandex.ru`
- `npx tsc --noEmit`

---

### Task 4: Compatibility data normalization + write-path validation

**Objective:** Migrate `Part.compatibleModels` from model-only strings (`"G-Class"`) to model+generation strings (`"G-Class W463"`, `"G-Class W464"`). Update seed; ship a one-shot dry-run-by-default script for production data. **Also harden the write paths** so that admin form submits and CSV imports cannot reintroduce bare model-name strings after normalization runs.

**Dependencies:** None
**Mapped Scenarios:** TS-004, TS-006

**Files:**
- Modify: `prisma/seed.ts` (every part record — update `compatibleModels` arrays)
- Create: `scripts/normalize-compatible-models.ts`
- Modify: `app/actions/parts.ts` (add validation: reject bare model names on create + update)
- Modify: `app/api/parts/import/route.ts` (auto-expand bare model names during import — auto-magic is acceptable for batch CSV; admin form is interactive and rejects)
- Modify: `components/admin/PartForm.tsx` + `components/admin/PartEditForm.tsx` (helper text shows the new format with examples)

**Key Decisions / Notes:**
- Build a normalization table once in `lib/models-data.ts` (NEW export — derived from existing `MODELS[]`):
  ```ts
  // New export in lib/models-data.ts
  export const MODEL_GENERATIONS: Record<string, string[]> = Object.fromEntries(
    MODELS.map((m) => [m.name, m.generations.split(",").map((g) => g.trim())])
  );
  // Yields { "C-Class": ["W205","W206"], "G-Class": ["W463","W464"], ... }
  ```
- For each `Part`: read `compatibleModels`. For each entry that is a bare model name (matches a key in `MODEL_GENERATIONS`), expand to all generations. For entries already containing a space (already migrated, like `"G-Class W463"`), skip.
- The normalization script defaults to dry-run. `--apply` flag writes inside `db.$transaction`.
- Update seed: every `compatibleModels: ["G-Class"]` becomes `compatibleModels: ["G-Class W463", "G-Class W464"]` (and similar for all 8 models).
- **Admin write-path validation in `app/actions/parts.ts`** (both `createPart` and `updatePart`): after splitting the comma-separated input string, validate each entry. If any entry is a bare model name (matches a `MODEL_GENERATIONS` key but contains no space), return an error to the form: `"Каждая запись в 'Совместимые модели' должна содержать поколение, например 'G-Class W463'. Используйте кнопку 'Авто-расширить' или укажите поколения вручную."` This prevents an admin from accidentally re-introducing model-only strings.
- **CSV import path in `app/api/parts/import/route.ts`**: keep the comma-split parsing, but auto-expand bare model names using `MODEL_GENERATIONS` BEFORE writing. CSV is a batch path with no interactive feedback — silent auto-expansion is the right trade-off (admin sees the result in the parts list and can review).
- **Admin form helpers**: `PartForm.tsx` + `PartEditForm.tsx` already display "Доступные: …" — append a usage example: `"Пример: 'G-Class W463, G-Class W464, GLE V167'"`.

**Definition of Done:**
- [ ] `lib/models-data.ts` exports `MODEL_GENERATIONS` (typed `Record<string, string[]>`)
- [ ] `prisma/seed.ts` parts use new `"<Model> <Generation>"` format throughout
- [ ] `scripts/normalize-compatible-models.ts` exists, dry-run by default, prints per-row diff, `--apply` writes inside a transaction
- [ ] `app/actions/parts.ts` rejects bare model names in `createPart` + `updatePart`
- [ ] `app/api/parts/import/route.ts` auto-expands bare model names from CSV
- [ ] `npx prisma migrate reset --force` (with user consent) succeeds and reseeds without errors
- [ ] All seeded parts have at least one space-delimited entry in `compatibleModels`
- [ ] No schema migration required; `prisma validate` exits 0

**Verify:**
- `npx tsx scripts/normalize-compatible-models.ts` (dry-run) on local DB shows the expected diffs (or zero diffs if seed is already in new format)
- After running: `psql -c "SELECT \"compatibleModels\" FROM \"Part\" LIMIT 5;"` shows new format
- Manual: in admin parts edit, type "G-Class" in compatibleModels field, submit → see error message; type "G-Class W463" → succeeds
- Manual: upload a CSV with `compatibleModels=G-Class` → row imports with expanded `["G-Class W463","G-Class W464"]`

---

### Task 5: `lib/my-car-store.ts` + `MyCarPicker` + `MyCarStrip`

**Objective:** Build the client store and the two UI components for selecting and displaying the user's chosen car. Wire to `MODELS` from `lib/models-data.ts` for the dropdowns.

**Dependencies:** Task 4 (data format) — picker emits the same `"G-Class W463"` format
**Mapped Scenarios:** TS-004, TS-005, TS-007

**Files:**
- Create: `lib/my-car-store.ts` — `useMyCar` hook with `useSyncExternalStore` + cached snapshot
- Create: `components/parts/MyCarPicker.tsx` — Client Component, two dropdowns (model + generation)
- Create: `components/parts/MyCarStrip.tsx` — Client Component, sticky strip with "Сменить"/"✕"

**Key Decisions / Notes:**
- `lib/my-car-store.ts` exports:
  ```ts
  export interface MyCar { model: string; generation: string }
  export const MY_CAR_KEY = "geleoteka:my-car";

  // Cached snapshot pattern from geleoteka-conventions.md — re-parsing on every
  // getSnapshot call would create a new object reference each time and trigger
  // infinite re-render loops in React 19 strict mode.
  let cachedRaw: string | null = null;
  let cachedValue: MyCar | null = null;

  function getSnapshot(): MyCar | null {
    if (typeof window === "undefined") return null;
    let raw: string | null = null;
    try { raw = localStorage.getItem(MY_CAR_KEY); } catch { return null; }
    if (raw === cachedRaw) return cachedValue;
    cachedRaw = raw;
    if (raw === null) { cachedValue = null; return null; }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        typeof parsed !== "object" || parsed === null ||
        typeof (parsed as { model?: unknown }).model !== "string" ||
        typeof (parsed as { generation?: unknown }).generation !== "string"
      ) {
        // Self-heal: bad shape => clear and return null so caller sees "no car saved"
        try { localStorage.removeItem(MY_CAR_KEY); } catch {}
        cachedRaw = null;
        cachedValue = null;
        return null;
      }
      cachedValue = parsed as MyCar;
      return cachedValue;
    } catch {
      try { localStorage.removeItem(MY_CAR_KEY); } catch {}
      cachedRaw = null;
      cachedValue = null;
      return null;
    }
  }

  function getServerSnapshot(): null { return null; }
  function subscribe(cb: () => void): () => void { /* listen to 'storage' + custom event 'geleoteka:my-car-change' */ }
  export function useMyCar(): MyCar | null { return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot); }
  export function setMyCar(car: MyCar | null): void { /* writes localStorage + dispatches custom event */ }
  ```
- Subscribe must listen to BOTH the native `storage` event (other tabs) AND a custom `geleoteka:my-car-change` event dispatched after `setMyCar` (same tab). Without the custom event, same-tab updates won't trigger re-renders.
- `MyCarPicker.tsx`:
  - Props: `onSelect: (car: MyCar) => void` (called by parent — usually triggers a `router.push('/parts?model=…&generation=…')` and `setMyCar`)
  - State: local `model`, `generation` until both are filled
  - Layout: two `<select>` elements styled with the existing `.input` class. Generation dropdown disabled until model is picked. Submit button "Применить" appears when both are set.
  - Source data: `MODELS` from `lib/models-data.ts`. Parse `MODELS[i].generations.split(",").map(s => s.trim())`.
  - Picker emits `{ model: MODELS[i].name, generation: <selected gen> }` so the parent constructs `${model} ${generation}` for the where clause.
- `MyCarStrip.tsx`:
  - Reads `useMyCar()`. If null, renders nothing.
  - If set, renders a sticky bar (top-`16` to clear the site header) with content: "Ваш автомобиль: <model> · <generation> · <button>Сменить</button> · <button>✕</button>"
  - "Сменить" calls a parent `onChange` prop (or a router action) to swap to picker view
  - "✕" calls `setMyCar(null)` and `router.push('/parts')`

**Definition of Done:**
- [ ] `lib/my-car-store.ts` exports `useMyCar`, `setMyCar`, `MyCar`, `MY_CAR_KEY` with the cached-snapshot pattern
- [ ] `MyCarPicker` renders two dropdowns; calling submit invokes `onSelect` with `{model, generation}`
- [ ] `MyCarStrip` renders the saved car when set; "✕" clears it; "Сменить" swaps to picker mode
- [ ] React 19 strict mode: no infinite render loops (verified by mounting and changing storage in DevTools)
- [ ] `npx tsc --noEmit` passes

**Verify:**
- Component-level smoke: open `/parts` (after Task 7) in DevTools, manually call `localStorage.setItem("geleoteka:my-car", JSON.stringify({model: "G-Class", generation: "W464"}))` then dispatch `window.dispatchEvent(new Event("geleoteka:my-car-change"))` — strip should appear instantly
- `npx tsc --noEmit`

---

### Task 6: `MyCarInit` redirect on revisit + URL-encoded car state

**Objective:** Add a Client Component that runs `useLayoutEffect` on `/parts` and, if localStorage has a saved car AND the URL has neither `model` nor `generation`, replaces the URL to include them. Mount globally in `app/layout.tsx` next to `<ThemeInit />`.

**Dependencies:** Task 5
**Mapped Scenarios:** TS-005

**Files:**
- Create: `components/shared/MyCarInit.tsx`
- Modify: `app/layout.tsx` (add `<MyCarInit />` inside `<body>` next to `<ThemeInit />`)

**Key Decisions / Notes:**
- `MyCarInit` is a Client Component using `useLayoutEffect`:
  ```tsx
  "use client";
  import { useLayoutEffect } from "react";
  import { usePathname, useSearchParams, useRouter } from "next/navigation";
  import { MY_CAR_KEY } from "@/lib/my-car-store";

  export function MyCarInit(): null {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const router = useRouter();

    useLayoutEffect(() => {
      if (pathname !== "/parts") return;
      // Either-not-both: any car param in the URL means the page owns the state.
      // Guards both the normal flow and the partial-param edge case (e.g., "Сбросить все"
      // strips generation but keeps model — without this, MyCarInit would loop re-adding generation).
      if (searchParams.get("model") || searchParams.get("generation")) return;
      // Explicit "Показать все запчасти" toggle: the user told us they want the unfiltered
      // view AND we must NOT auto-restore the saved car on this navigation. Without this guard,
      // back-button / popstate / reload all silently re-add the car params and the escape hatch
      // never sticks.
      if (searchParams.get("showAll") === "1") return;
      try {
        const raw = localStorage.getItem(MY_CAR_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as unknown;
        // Self-heal: structurally invalid data (wrong shape, e.g., from a future Гараж rollout)
        // gets removed instead of looping forever in silent no-op territory.
        if (
          typeof parsed !== "object" || parsed === null ||
          typeof (parsed as { model?: unknown }).model !== "string" ||
          typeof (parsed as { generation?: unknown }).generation !== "string"
        ) {
          localStorage.removeItem(MY_CAR_KEY);
          return;
        }
        const car = parsed as { model: string; generation: string };
        const newParams = new URLSearchParams(searchParams.toString());
        newParams.set("model", car.model);
        newParams.set("generation", car.generation);
        router.replace(`/parts?${newParams.toString()}`);
      } catch {
        // JSON.parse failure — also self-heal so we don't keep failing forever.
        try { localStorage.removeItem(MY_CAR_KEY); } catch {}
      }
    }, [pathname, searchParams, router]);

    return null;
  }
  ```
- **Redirect-loop guard (either-not-both):** the `if (searchParams.get("model") || searchParams.get("generation")) return;` early exit prevents infinite redirects AND covers partial-param edge cases.
- **"Показать все" override:** when the user clicks "Показать все запчасти" in the catalog, the URL gets `?showAll=1` (no model/generation params). MyCarInit must NOT re-add the car when `searchParams.get("showAll") === "1"` is present — otherwise the show-all escape hatch loses on the next mount/popstate. The pseudocode below adds a third early exit for this.
- **Pathname guard:** only acts on `/parts`. Mounting it globally is fine — the early return on `pathname !== "/parts"` makes it a no-op everywhere else.
- Add `<MyCarInit />` to `app/layout.tsx` body alongside `<ThemeInit />`.

**Definition of Done:**
- [ ] `MyCarInit` mounted in `app/layout.tsx`
- [ ] Visiting `/parts` with localStorage `geleoteka:my-car = {"model":"G-Class","generation":"W464"}` and no search params replaces URL to `/parts?model=G-Class&generation=W464` within the same tick
- [ ] Visiting `/parts?model=G-Class&generation=W464` does NOT redirect (guard works)
- [ ] Visiting any other path (e.g., `/`, `/services`) is a no-op

**Verify:**
- Manual: in browser DevTools, set localStorage, visit `/parts`, watch URL update
- `npx tsc --noEmit`

---

### Task 7a: Parts page layout skeleton + server-side car-aware where clause

**Objective:** Refactor `app/(public)/parts/page.tsx` from a flat list to a two-column skeleton (sidebar slot + grid). Wire the server-side `where` clause to filter by `model`+`generation` from search params, with `showAll=1` as the explicit escape. Free-text search drops `compatibleModels` matching (denormalized strings can't be substring-searched via Prisma `String[]` operators reliably). The sidebar component itself is built in 7b — Task 7a leaves a placeholder `<aside />` slot.

**Dependencies:** Tasks 4, 5
**Mapped Scenarios:** TS-004, TS-005

**Files:**
- Modify: `app/(public)/parts/page.tsx` (refactor query + layout)

**Key Decisions / Notes:**
- New `searchParams` shape: `q`, `category`, `oem`, `inStock`, `minPrice`, `maxPrice`, `model`, `generation`, **`showAll`**. Read all in the Server Component.
- **Server-side `where` clause logic** (corrected for normalized `compatibleModels` format):
  ```ts
  const where: Record<string, unknown> = { isActive: true };
  if (q) {
    // Free-text search: name + article only. compatibleModels uses denormalized
    // "Model Generation" strings (e.g., "G-Class W463") and Prisma's `has` / `hasSome`
    // require exact array-element matches — they cannot do substring search. The picker
    // is the canonical model/generation entry point; free-text is for SKU/name only.
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { article: { contains: q, mode: "insensitive" } },
    ];
  }
  if (showAll !== "1" && model && generation) {
    where.compatibleModels = { has: `${model} ${generation}` };
  }
  if (categorySlug) { /* lookup category by slug, set categoryId */ }
  if (oemOnly) where.isOEM = true;
  if (inStockOnly) where.quantity = { gt: 0 };
  if (minPrice) where.price = { ...(where.price as object || {}), gte: parseInt(minPrice) };
  if (maxPrice) where.price = { ...(where.price as object || {}), lte: parseInt(maxPrice) };
  ```
- **`showAll=1` semantics:** when the URL has `showAll=1`, the server skips the `compatibleModels` filter even if `model`+`generation` are also present (they shouldn't be — the toggle is supposed to drop them — but defense-in-depth). Empty state still renders if there are zero matches.
- Layout skeleton: `<div className="flex gap-6">` → `<aside className="w-64 hidden lg:block">{/* Task 7b fills this */}</aside>` + `<main className="flex-1">{search input + chips placeholder + grid}</main>`. Mobile: sidebar absent; placeholder "Фильтры" button (Task 7b wires it up).
- Search input (free-text `q`) lives at the top of `<main>`, not in the sidebar (per "Gotchas" note above).
- The picker (`MyCarPicker`) is rendered ABOVE the catalog when no car is selected; the strip (`MyCarStrip`) replaces it once a car is set.
- Empty state: when `parts.length === 0` AND a car filter is active, render the empty card from TS-007 with primary action "Показать все запчасти" (which navigates to `/parts?showAll=1` preserving any other filter params except model/generation).
- **Do not delete `PartsSearch.tsx` yet** — Task 7b deletes it after the sidebar takes over.
- Render the existing horizontal `PartsSearch` for now (don't break the page); Task 7b removes it.

**Definition of Done:**
- [ ] `/parts` renders the new two-column layout skeleton
- [ ] Selecting a car via `MyCarPicker` navigates to `/parts?model=…&generation=…` and the catalog server-filters
- [ ] Visiting `/parts?showAll=1` shows the unfiltered catalog regardless of other car params (skipped at where clause)
- [ ] Free-text search via `q` matches name + article only (no compatibleModels matching attempted)
- [ ] Empty-state card renders when zero matches AND car filter is active; its "Показать все запчасти" link points to `/parts?showAll=1`
- [ ] Existing `PartsSearch` still renders (Task 7b deletes)
- [ ] `npx tsc --noEmit` exit 0
- [ ] `npm run build` succeeds

**Verify:**
- Manual: walk TS-004 + TS-005 in browser; verify the URL state survives reload
- `npx tsc --noEmit`
- `npm run build`

---

### Task 7b: Parts sidebar + chips + mobile drawer + delete `PartsSearch`

**Objective:** Build `PartsFilterSidebar` (4 facets), the active-filter chip strip above the grid, and the mobile filter drawer. Delete the old `PartsSearch` component.

**Dependencies:** Task 7a
**Mapped Scenarios:** TS-006, TS-007, TS-008

**Files:**
- Create: `components/parts/PartsFilterSidebar.tsx` (Client Component — handles facet selection, calls `router.push`)
- Modify: `app/(public)/parts/page.tsx` (replace `PartsSearch` with `PartsFilterSidebar`; render chip strip)
- Delete: `components/parts/PartsSearch.tsx`

**Key Decisions / Notes:**
- `PartsFilterSidebar.tsx` props: `categories`, current values for each facet (category, oem, inStock, minPrice, maxPrice). On change of any facet, call `router.push(\`/parts?${newParams.toString()}\`)`.
- Active-filter chips: render above the grid, each with a `✕` that calls `router.push` with the param removed. "Сбросить все" link clears all sidebar facets but **preserves** `model`+`generation` (the user's car stays selected).
- Mobile drawer: simple controlled-state `<div>` with `fixed inset-0 z-50` + close button + "Применить".
- **Body scroll lock implementation:** apply `document.body.style.overflow = "hidden"` in a `useEffect` when the drawer is `open`; cleanup restores `""` on close AND on unmount. iOS Safari note: if scroll-through is observed during TS-008, also add `document.documentElement.style.overflow = "hidden"`.
  ```tsx
  useEffect(() => {
    if (!open) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [open]);
  ```
- Price filter: render TWO `<input type="number">` for min/max. Optional slider above as visual flourish but not the primary input (per spec-review suggestion: sliders are unreliable to test via browser automation).
- Active-filter count badge on the mobile "Фильтры (N)" button: `N = count of (category, oem, inStock, minPrice, maxPrice) that are non-default`.
- After implementation: `grep -rn "PartsSearch"` returns zero hits (excluding deleted file). Then delete the file.

**Definition of Done:**
- [ ] `PartsFilterSidebar` renders 4 facets (Category, Оригинал/Аналог, В наличии, Цена with two inputs) on desktop ≥1024px
- [ ] On mobile <1024px, sidebar is hidden; "Фильтры (N)" button visible at top of main content; tapping opens drawer
- [ ] Drawer has visible close button + "Применить" + "Сбросить все"
- [ ] When drawer open, page body does NOT scroll (verified at TS-008 step 2)
- [ ] Active-filter chip strip renders above grid; clicking ✕ removes that facet from the URL
- [ ] "Сбросить все" clears facets but preserves model+generation
- [ ] `components/parts/PartsSearch.tsx` deleted; `grep -rn "PartsSearch"` returns zero
- [ ] `npx tsc --noEmit` exit 0
- [ ] `npm run lint` exit 0 (no new errors)
- [ ] `npm run build` succeeds

**Verify:**
- Manual smoke walking TS-006, TS-007, TS-008 in browser at both 1280×800 and 375×667
- `npx tsc --noEmit`
- `npm run build`

---

### Task 8: Final regression + smoke walk + commit + push to origin/main

**Objective:** Run the full regression suite (lint + typecheck + build + Prisma validate), walk all 8 Goal Verification truths and all E2E scenarios in a real browser, then commit and push to `origin/main` per pre-granted user authorization. Railway auto-deploys.

**Dependencies:** Tasks 1, 2, 3, 4, 5, 6, 7a, 7b
**Mapped Scenarios:** TS-001..TS-008 (all)

**Files:**
- No file edits expected (cleanup + verification only)

**Key Decisions / Notes:**
- Regression sequence (run in order):
  1. `npx prisma validate`
  2. `npx tsc --noEmit`
  3. `npm run lint`
  4. `rm -rf .next && npm run build`
- Manual browser smoke covers all 8 truths and all TS-001..TS-008 scenarios. Use Claude Code Chrome (1st-tier per `browser-automation.md`) if available, else playwright-cli, else agent-browser.
- Commit message: `feat(public-site): hero split + parts vehicle filter + Yandex reviews; drop popular models`. Single commit; the prior VERIFIED data-model-redesign work that's already on main (uncommitted) gets bundled into the same commit per user choice — see "Risks and Mitigations" for the deploy-bundle trade-off.
- Push: `git push origin main`. Railway picks up the push and deploys automatically.
- After push, monitor Railway deploy logs (Railway console). If migration fails or runtime errors emerge, revert with `git revert HEAD && git push`. **Note:** revert reverts BOTH this PRD AND the data-model-redesign work bundled into the same commit; that's the cost of bundling. User accepted this.
- Post-deploy smoke: visit `https://geleoteka-production.up.railway.app/` and `https://geleoteka-production.up.railway.app/parts` to confirm changes are live. Yandex iframe should render in production.

**Definition of Done:**
- [ ] All 4 regression commands exit 0
- [ ] Manual browser smoke confirms all 8 truths
- [ ] Manual browser smoke confirms TS-001..TS-008 each pass (or are documented as KNOWN_ISSUE)
- [ ] No console errors on `/` or `/parts` in real browser
- [ ] Commit created with the descriptive message above
- [ ] `git push origin main` succeeds
- [ ] Railway deploy log shows successful build + start (visible in Railway dashboard)
- [ ] `curl -sI https://geleoteka-production.up.railway.app/parts` returns 200
- [ ] Production homepage renders the new hero (visual confirmation)

**Verify:**
- `git log -1 --oneline` shows the new commit
- `git status` clean (no untracked or modified)
- `curl -sI https://geleoteka-production.up.railway.app/` returns 200
- Production `/parts` page loads and the picker is visible

## Open Questions

None — Yandex IDs received from user (`211932722600` + `https://yandex.com/maps/-/CPWFAQ-m`).

## Deferred Ideas

- Multi-vehicle "Гараж" for logged-in users — track via `User.preferredVehicleId` and a join table for additional cars
- VIN decoder ("Не уверены? VIN →" link) — third-party API or the placeholder pattern
- Sidebar facets: Brand, Срок поставки, Страна — require new `Part` schema fields
- A/B test the new hero against the old via a feature flag
- Manual review curation as Plan B if Yandex iframe degrades the brand visibly more than expected
- Yandex Maps location pin embedded near the contact section (separate from reviews)
