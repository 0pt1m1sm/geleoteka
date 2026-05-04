# Public Site Refresh — Hero, Models, Reviews, Parts Shop UX

Created: 2026-05-04
Author: aleksandr's.spiskov@gmail.com
Category: UX
Status: Final
Research: Deep (3 of 4 parallel research agents completed: yandex-reviews, parts-ux, split-hero; vehicle-fit agent timed out — overlap with parts-ux research covered the gap)

## Problem Statement

Geleoteka's public homepage signals "we are a service shop" — the hero pushes a single CTA "Записаться на сервис", and the reviews section shows three obviously fake testimonials. But Geleoteka has **two equally important customer flows**: workshop service AND online parts purchases. Visitors who arrive intending to buy a part see a hero that talks past them. Visitors looking for reviews see content that erodes trust rather than building it. Rentals is a tertiary side business and currently lives correctly in the secondary nav; this stays.

Separately, the **parts shop landing page (`/parts`)** lists the entire catalog flat, with a horizontal filter bar. Russian Mercedes parts buyers think in W-codes and want to immediately scope the catalog to *their* car — without that scope, the page is a wall of articles that don't fit. Industry research (Baymard, Russian-market study of Exist/Emex/Autodoc) names "will it fit my car?" as the #1 cause of cart abandonment in auto-parts e-commerce.

**Why now:** the data-model redesign just shipped (`Part.compatibleModels: String[]` is in place), and the homepage is the highest-leverage marketing asset — fixing both before customer acquisition picks up costs ~10× less than after.

## Core User Flows

### Flow 1: Visitor arrives wanting service
1. Lands on `/` → sees "Geleoteka" brand pillar + "G-Class Specialist" eyebrow + tagline (preserved from current hero)
2. Below the brand block, the hero splits into two cards on the same dark photo background
3. **Left card** — "Сервис" — headline ("Сервис Гелендвагена в Москве"), 1-line subhead, primary CTA "Записаться на сервис", secondary text link "Прайс на работы →" (links to `/services`)
4. Visitor clicks "Записаться на сервис" → existing 5-step booking wizard at `/booking`

### Flow 2: Visitor arrives wanting parts
1. Lands on `/` → same hero
2. **Right card** — "Запчасти" — headline ("Запчасти для G-Class"), 1-line subhead, primary CTA "В каталог запчастей", secondary text link "Популярные категории →" (links to `/parts?category=oils` or similar)
3. Visitor clicks "В каталог запчастей" → `/parts`
4. **First-visit experience on `/parts`:** catalog is visible immediately. Above the catalog, a prominent (but not modal-blocking) header strip prompts "Выберите свой автомобиль, чтобы увидеть только подходящие запчасти" with two dropdowns — Model + Generation
5. Visitor selects "G-Class" → "W463 (1990–2018)" → catalog filters to compatible parts only; the prompt collapses into a sticky "Ваш автомобиль: G-Class · W463 · Сменить · ✕" header strip that survives navigation
6. Visitor uses the sidebar filters (Category, OEM/Аналог, В наличии, Цена) to narrow further
7. On returning visits, the strip auto-shows "G-Class · W463" — no re-picking — and the catalog is pre-filtered

### Flow 3: Visitor arrives wanting trust signals (reviews)
1. Scrolls down past hero, stats, services overview
2. Reaches "Отзывы клиентов" section — sees a 4.9★ aggregate badge ("на основе 230+ отзывов на Яндекс Картах"), then the **official Yandex Maps reviews iframe widget** (rendering 2–3 latest real reviews with the live Yandex visual style)
3. Below the iframe, a "Все отзывы на Яндекс Картах →" CTA links to the Geleoteka public Yandex Maps profile in a new tab

### Flow 4: Visitor on mobile
1. Hero brand pillar shrinks (heading clamp); split below collapses to two stacked full-width cards — **service first** (mobile data shows higher booking urgency than parts research on phones)
2. Each card retains full headline + CTA + secondary link
3. On `/parts`, the vehicle-picker prompt is a full-width card above the catalog; once a car is selected, the persistent strip becomes a full-width sticky bar at the top of the catalog area
4. Sidebar filters collapse into a "Фильтры" drawer accessed via a button at the top of the catalog

## Scope

### In Scope

**A. Hero redesign (`app/(public)/page.tsx`):**
- Preserve the existing brand pillar: "G-Class Specialist" eyebrow, "Geleoteka" wordmark, "Специализированный сервис Mercedes-Benz G-Class" subtitle, micro-tagline "Онлайн-запись · Отслеживание статуса · Личный кабинет"
- Below the pillar, render a horizontal hairline divider (gold gradient) + 50/50 split with two equal cards
- Cards share the same dark photo background (the existing `g-class-4k.jpg`); each has its own headline, 1-line subhead, primary gold-on-black button, and secondary white-text link
- Mobile (<768px): brand pillar shrinks via `clamp()`; cards stack vertically, **service first**, full-width, equal heights
- Photo is color-graded once (no separate photos per side) for cohesion

**B. Delete "Популярные модели" section** (currently `app/(public)/page.tsx:192-220` — the `MODELS` grid linking to `/models/[slug]`)
- Remove the section markup and the `MODELS` import on line 2
- **Preserve `/models` and `/models/[slug]` routes** — they may still be linked from elsewhere (services, blog) and provide SEO value
- Remove the now-unused `lib/models-data.ts` `MODELS` export only if no other consumers exist (check with grep before deleting)

**C. Reviews section (`app/(public)/page.tsx:266-340-ish`):**
- Delete the 3 hardcoded fake review cards
- Above the iframe: keep the heading "Отзывы клиентов" + the 5-star + "4.9 — 230+ отзывов" badge (the badge stays as static brand assertion, not a JSON-LD claim)
- Embed the **official Yandex Maps reviews iframe widget** generated from the Geleoteka public listing
- Below the iframe: a centered link "Все отзывы на Яндекс Картах →" to the public Yandex Maps profile (target="_blank" rel="noopener")
- **Lazy-load the iframe** with `loading="lazy"` to avoid hurting LCP on first paint
- Wrap the iframe in a max-width container that horizontal-scrolls cleanly on mobile (the official widget has fixed width and is not responsive — accept this trade-off)

**D. Parts shop vehicle-aware filtering (`app/(public)/parts/page.tsx` + new files):**
- New component `components/parts/MyCarPicker.tsx` — 2-step picker (Model + Generation dropdowns)
- New component `components/parts/MyCarStrip.tsx` — sticky persistent header strip showing the selected car with "Сменить" and "✕" actions
- New module `lib/my-car-store.ts` — `useSyncExternalStore` with **cached snapshot** (per `geleoteka-conventions.md`) backed by localStorage, key `geleoteka:my-car`
- New component `components/parts/PartsFilterSidebar.tsx` — left sidebar (240–280px) replacing the current horizontal `PartsSearch` filter bar
- Sidebar facets: Category (single-select), Оригинал/Аналог (binary toggle), В наличии (default-on), Цена (slider, two-input fallback). Active filters render as removable chips above the grid; live result count; "Сбросить все" link
- Mobile: sidebar collapses to a "Фильтры" drawer (full-screen modal) triggered by a button
- Hard-filter behavior: when `myCar` is set, server-side `where` clause adds `compatibleModels: { has: <model-key> }` (and refines by generation if the data supports it)
- "Показать все запчасти" toggle in the sidebar lets the user escape the hard filter (clears `compatibleModels` from the where clause for that page-load)
- Empty state when filtering yields zero matches: clear message ("Под ваш автомобиль нет деталей в этой категории") + CTA "Показать все запчасти" + CTA "Заказать через сервис"

**E. Compatibility data alignment (data task within Task D):**
- The picker emits a model-key + generation-key (e.g., `model: "G-Class"`, `generation: "W463"`)
- Existing `Part.compatibleModels: String[]` values must be normalized to match the picker's keys (audit `prisma/seed.ts` part records and any production data)
- If existing values are inconsistent (e.g., "G 500" vs "Mercedes G500" vs "G-Class"), normalize the seed and produce a one-shot script to update production data via `npx tsx scripts/normalize-compatible-models.ts` (creates the script as part of this PRD's implementation)

### Explicitly Out of Scope

- **Multi-vehicle "Гараж"** — single car in localStorage only. Multi-car for logged-in users is a follow-up PRD when there's evidence customers have 2+ G-Classes
- **VIN decoder / "Не уверены? VIN →" link** — defer until at least one customer asks for it
- **Brand / Срок поставки / Страна sidebar facets** — would require new `Part.brand`, `Part.deliveryDays`, `Part.country` fields and seeded data; out of MVP
- **Server-side persistence of "my car"** — even for logged-in clients, only localStorage in this PRD. Sync to `User.preferredVehicleId` is a follow-up
- **Schema changes** — reuse `Part.compatibleModels: String[]` as-is; if the data needs cleanup, ship as a normalization script not a schema migration
- **Yandex `aggregateRating` JSON-LD on `LocalBusiness`** — Google has banned self-serving aggregateRating since 2019 and may flag it as spam. The visible 4.9★ badge is fine; the SEO markup is not. Optional: add a basic `LocalBusiness` JSON-LD (address, hours, phone, url) WITHOUT aggregateRating — also out of THIS PRD's scope unless trivial
- **A/B testing the new hero against the old** — no infrastructure for this in the project; ship the new hero, monitor analytics if any exist
- **Admin curation UI for reviews** — moot, since the iframe widget is live by construction
- **Live Yandex API integration** — no public API exists; iframe is the only sustainable live option
- **Removing `/models` and `/models/[slug]` routes** — section deletion only; routes stay
- **Mobile picker becoming a modal on first visit** — research showed Russian users read forced modals as popup spam; keep the picker inline and dismissible
- **Animations / transitions** beyond what already exists in the project's design system
- **Yandex iframe styling overrides** — the widget's white theme on a dark page is an accepted trade-off; do NOT attempt to inject CSS into the iframe (would break on Yandex updates)

## Technical Context

- **Relevant architecture:**
  - Hero, models grid, reviews are all in a single Server Component file: `app/(public)/page.tsx` (currently 371 lines, well within the 800-line guideline post-refactor)
  - The current parts page (`app/(public)/parts/page.tsx`, 126 lines) uses Prisma `findMany` with a server-side `where` clause built from `searchParams`. Vehicle-fit filtering extends this same pattern — no new data layer needed
  - `PartsSearch` (`components/parts/PartsSearch.tsx`) is the current horizontal filter component; the new `PartsFilterSidebar.tsx` replaces it. Delete `PartsSearch.tsx` once nothing imports it
  - State persistence: project convention is `useSyncExternalStore` with cached snapshots (see `geleoteka-conventions.md` — "useSyncExternalStore for localStorage" section). The theme toggle (`components/shared/ThemeToggle.tsx` + `public/theme-init.js`) is the existing precedent
  - Hydration concern: server renders unfiltered catalog, client reads localStorage in an effect, then re-fetches with the car filter applied. To avoid hydration flash, use the same approach as the theme init script — a small inline script in `app/layout.tsx` that reads localStorage and sets a class/data-attribute before hydration, OR accept a brief flash on first render if the inline script approach is too brittle. **Decision deferred to `/spec`** — both approaches are viable

- **Constraints:**
  - The Yandex iframe widget has a fixed width (300–760 px depending on the org's config) and is **not** responsive. On mobile this means a horizontal scroll inside the iframe container. Acceptable per user decision
  - The iframe is third-party content — set `loading="lazy"` and ensure the surrounding card has `min-height` to prevent CLS
  - `Part.compatibleModels: String[]` is denormalized; queries use Prisma's `has` operator — performance is fine for the current scale (<10k parts) but flag it for review if the catalog grows past ~50k rows
  - Russian-market UX research strongly counsels against modal-blocking the parts page on first visit. The picker MUST be inline and dismissible

- **Existing code:**
  - `app/(public)/page.tsx` — homepage (hero + sections to modify)
  - `app/(public)/parts/page.tsx` — parts list page (vehicle filter target)
  - `components/parts/PartsSearch.tsx` — current horizontal filter (to be replaced)
  - `lib/models-data.ts` — `MODELS` export consumed by current "Популярные модели" section (to be removed if unused after section deletion)
  - `lib/utils.ts` — `formatPrice`, `cn` etc. (reuse for the sidebar)
  - `prisma/schema.prisma` — `Part.compatibleModels: String[]` (no changes required)
  - `prisma/seed.ts` — seed `Part` records with `compatibleModels` populated; will need normalization audit
  - `components/shared/ThemeToggle.tsx` + `public/theme-init.js` — precedent for the localStorage + inline-init pattern
  - `components/shared/MobileMenu.tsx:12` — confirms `/rentals` lives in nav only (correct as-is)

## Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| PRD scope | Single PRD covering all 4 items | User confirmed — public-site UX refresh ships as one chunk; reduces context-switching cost during /spec implementation |
| Hero pattern | Two-card 50/50 split below preserved brand pillar | Research (DoWhatWorks 25k A/B tests, NN/g): dual CTAs win when the audiences are different and the verbs commit to specific actions; brand pillar preserved for cohesion |
| Hero photo strategy | One shared photo, color-graded once | Avoids "two different brands" feel; matches research recommendation |
| Mobile hero collapse | Stack vertically, service first | Research shows mobile booking urgency > parts browsing urgency; tabs/carousel both lose ~40% of second-option engagement |
| Parts CTA verb | "В каталог запчастей" | User chose browse-first framing over "Подобрать" (advisory) and "Купить" (aggressive) |
| Yandex reviews mechanism | Official iframe widget | User chose live-and-fresh over manual curation; trade-off is mobile horizontal-scroll + brand-style mismatch, both accepted |
| Yandex SEO markup | NO `aggregateRating` JSON-LD | Google has banned self-serving aggregateRating on `LocalBusiness` since 2019 — adding it would risk SERP penalty without benefit |
| Vehicle picker shape | 2-step: Model + Generation | User decision; covers ~90% of compatibility cases without picker friction; 3-step + VIN can be added later if requested |
| Compatibility behavior | Hard filter (hide non-matching) by default | User decision; matches Exist.ru and Russian-market norm; "Показать все запчасти" toggle as escape hatch |
| Sidebar facet count | MVP 4 (Category / OEM-Аналог / В наличии / Цена) | User chose minimal facets matching existing schema fields — no migration; full RU-market 7-facet set deferred to follow-up PRD |
| Garage scope | Single-car localStorage only | User decision; multi-car "Гараж" deferred until evidence of 2+ car owners |
| Persistence | localStorage via `useSyncExternalStore` (cached snapshot) | Project convention per `geleoteka-conventions.md`; theme toggle is the precedent |
| `/models` routes | Section removed, routes preserved | Routes have SEO value and may be linked from blog/services; only the homepage section is dropped |
| Compatibility data | Normalization script, no schema change | `Part.compatibleModels: String[]` is sufficient; existing values may need string-key alignment with picker output, ship as a one-shot script |
| Rentals positioning | Stays in nav only | User confirmed rentals = side business; current MobileMenu placement is correct |
| Alternative architecture rejected | Single-promise hero + below-fold "I want to..." selector | Research surfaced this as an option; user chose split-hero. Recorded for future reference |

## Research Findings

Saved to `/tmp/prd-research-{yandex-reviews,parts-ux,split-hero}.md` (temp files, regenerable). Key takeaways embedded inline above; the per-source bibliographies are in those files. Vehicle-fit research agent timed out — gap closed by parts-ux research.
