# Session memory — Geleoteka Design System Overhaul

**Date:** 2026-05-07
**Branch:** `spec/design-system-overhaul`
**Worktree:** `.worktrees/spec-design-system-overhaul-7d8a2a9/`
**Plan:** `docs/plans/2026-05-07-design-system-overhaul.md`
**PRD:** `docs/prd/2026-05-07-design-system-overhaul.md`
**Audit:** `docs/audits/2026-05-07-a11y-perf-audit.md`
**Status:** PENDING (Approved=Yes, 11 of 12 tasks complete, Task 8b partial)
**Iterations:** 1 (architect review applied before implementation)
**Commits delivered:** 21 on `spec/design-system-overhaul` (vs `main`)

## How to resume

```
cd /Users/alex/claude-dev/Geleoteka/.worktrees/spec-design-system-overhaul-7d8a2a9
/spec docs/plans/2026-05-07-design-system-overhaul.md
```

The dispatcher reads the plan header (PENDING + Approved=Yes + Type=Feature) and routes to `spec-implement`, which scans the `[ ]` checkboxes. Only Task 8b is `[ ]`. Resume with the form-split work documented below.

## Architecture decisions locked in

| Topic | Choice | Why |
|-------|--------|-----|
| Display font | Playfair Display (cyrillic) | Variable, premium serif, has cyrillic subset (Fraunces does NOT). |
| Body font | IBM Plex Sans (cyrillic) | Geometric humanist, has cyrillic subset (DM Sans does NOT). |
| Mono font | JetBrains Mono (cyrillic) | For mono numerics in admin tables. |
| Variants pattern | CSS data-attributes | No CVA dependency. `data-variant="primary"` etc. |
| Dialog primitive | Radix `@radix-ui/react-dialog` | Single dep; focus trap + scroll lock + ARIA. |
| Drawer | Radix Dialog with `data-side="right" \| "left" \| "bottom"` | Bottom variant ready for parts mobile filter sheet. |
| Theme | `html.light` toggle + `/public/theme-init.js` as `<Script strategy="beforeInteractive">` | Eliminates FOUC for OS-light users on first visit (`useLayoutEffect` alone is too late). |
| View Transitions | `experimental.viewTransition: true` (NO trailing s) | Verified field name in `next/dist/server/config-shared.d.ts:687`. |
| Tooltip a11y | `:hover, :focus-visible` activation | WCAG 1.4.13. |
| Variants library | None (CSS @layer components + data-attrs) | Avoid framer-motion / CVA. |

## Built artifacts (foundation)

```
app/styles/tokens.css      129 lines — colors, spacing, radius, shadows, motion, font-family vars
app/styles/base.css         52 lines — reset, html/body, scrollbar, noise overlay
app/styles/components.css  329 lines — .btn*, .card*, .input, .badge*, .alert*, .status-*, .hero-*, tooltip
app/globals.css             63 lines — Tailwind v4 theme bridge + shared keyframes (was 646)
lib/design-tokens.ts                  — TypeScript constants for breakpoints, motion durations, radius

components/ui/                        — 18 primitives:
  Button, Card (+ Header/Title/Description/Content/Footer), Input, Select, Textarea,
  Checkbox, RadioGroup, Badge, Alert, Dialog (Radix wrapper),
  Tabs (+ List/Trigger/Content with arrow-key nav), Skeleton,
  Tooltip (CSS-only :hover+:focus-visible), PageHeader (50+ pages use this),
  MetricCard (dashboard tile + TrendingUp/Down icons),
  DataTable (TS-generic, sticky header, useMemo client-side sort, aria-sort),
  DataList (mobile fallback), StatusSelect (Dialog-confirm flow)

components/shared/                    — chrome:
  Header (variant: public | portal | admin; "use client" — RSC fn-children boundary)
  Footer (next/image logo, CMS-driven contacts)
  Sidebar (unified; nav: AdminNavEntry[], aria-current=page on active)
  Drawer (Radix-based, side variants)
  MobileNav (sticky hamburger + Drawer)
  ThemeInit (mirrors theme-init.js logic on hydration — no class flicker)
  FloatingButtons (Lucide UI icons; brand SVG kept inline since Lucide has no messenger brands)

DELETED (5 obsolete files, ~640 lines):
  components/shared/NavDrawer.tsx
  components/shared/MobileMenu.tsx
  components/shared/PanelMobileNav.tsx
  components/admin/AdminSidebar.tsx
  components/admin/AdminMobileNav.tsx
```

## Migration coverage achieved

- **Public (8 list pages):** `/`, services, models, parts, rentals, about, contacts, vacancies — PageHeader + 4 raw `<img>` → `next/image` + lucide for inline SVG icons in rentals/page.tsx.
- **Auth (3 pages):** login, register, reset-password on Input/Button/Card/Alert primitives.
- **Cabinet (10 pages):** dashboard, cars, cars/add, history, tracking, estimates, orders, rentals, loyalty, notifications. Dashboard uses MetricCard. Loyalty has ARIA progressbar.
- **Admin (12+ list pages):** dashboard (4 MetricCards), customers, repair-orders, parts, orders, suppliers, suppliers/orders, rentals, rentals/bookings, calendar, team, estimates, cms, models. Plus Plus-icon Buttons in CTA actions.
- **Forms migrated:** EstimateBuilder (185 lines, low-risk useActionState — `name=` attrs preserved).
- **Cross-cutting:** View Transitions enabled, prefers-reduced-motion guards on all 8 keyframe animations, aria-current=page on sidebar nav.

## Remaining work (DEFERRED, with continuation hints)

### Task 8b — high-risk admin form splits (PARTIAL, 2 of 3 deferred)

**Why deferred:** SupplierOrderForm + TrimManager call Server Actions DIRECTLY (not through `useActionState`), making them payload-sensitive. Plan Mitigations table flags this as catastrophic if smoke test is skipped.

| File | Lines | Risk | What to do |
|------|-------|------|------------|
| `components/admin/SupplierOrderForm.tsx` | 344 | HIGH (13 useState, direct `createSupplierOrder`) | Browser smoke test: open `/admin/suppliers/orders/new`, fill form, capture FormData via DevTools Network. Split into orchestrator + SupplierPicker + OrderLineItems + OrderTotals. ALL 13 useState in orchestrator. Re-capture; diff payload byte-for-byte. |
| `components/admin/TrimManager.tsx` | 360 | HIGH (direct `createTrim`/`updateTrim`/`deleteTrim` via useTransition) | Same smoke test approach. Split into orchestrator + TrimList + TrimEditor + TrimDeleteConfirm. |

### Mechanical follow-ups (LOW-RISK, can batch in one session)

- **Task 5 leftovers:** split `app/(public)/page.tsx` (340 lines) into 7 section components under `components/public/` (HomeHero, HomeStats, HomeServicesGrid, HomeWhyUs, HomeReviewsSection, HomeFAQSection, HomeCTABanner). PageHeader on `parts/[slug]`, `rentals/[id]`, `services/[slug]`, `models/[slug]`, `parts/cart`. Wire `<Drawer side="bottom">` on `/parts` mobile filters.
- **Task 6 leftovers:** reset-password/confirm migration; AuthShell split-screen (form left + photo right at lg+); booking wizard StepIndicator animated progress (`width: calc((current/3) * 100%)` transition); split Step1ServiceVehicle (236) + Step3ContactConfirm (225) — state stays in orchestrator.
- **Task 7 leftovers:** StatusBoard.tsx — replace status list with horizontal/vertical timeline (CSS-only via `data-current` attr); EstimateReview.tsx — wrap accept/decline in `<Dialog>`.
- **Task 8a leftovers:** AdminCalendar visual refinement (hover preview, focus states); refactor 4 status changers (StatusChanger, OrderStatusChanger, RentalStatusChanger, SupplierOrderStatusChanger) to call `<StatusSelect>` directly. Drop-in.
- **Task 8c leftovers:** ~12 admin detail pages (parts/new, parts/[id], parts/import, rentals/new, rentals/[id], suppliers/new, suppliers/[id], suppliers/orders/new, suppliers/orders/[id], models/new, models/[id], customers/[id], estimates/new) — same PageHeader pattern as list pages.
- **Task 10 leftover:** Lighthouse Mobile audit on `/`, `/parts`, `/cabinet`, `/admin` (run dev server + Chrome DevTools MCP `lighthouse_audit`).

## Conventions to remember (worth re-reading on resume)

- **Server Action contract:** every form `<input name="...">` must be preserved across UI swaps; FormData parses by name. Verify with `git diff --stat app/actions/` after each form refactor — must return 0.
- **Prisma client:** `import { db } from "@/lib/db"` (NOT `@prisma/client`).
- **Theme init:** must NOT remove `prefers-color-scheme` block without `<Script src="/theme-init.js" strategy="beforeInteractive" />` first wired. Wired at `app/layout.tsx`.
- **Image preview exception:** `components/admin/PhotoUploader.tsx:131` keeps raw `<img>` for blob-URL preview. Documented.
- **Light theme is `html.light`** (not `html.dark`); ThemeInit handles 4-way logic (saved=light → light, saved=dark → dark, OS-light → light, fallback → dark).
- **Worktree session env:** `node_modules` is a symlink to main repo's; `app/generated` (Prisma) symlink may need recreating in fresh sessions if missing.

## Verification snapshot at session end

- `npx tsc --noEmit`: 0 errors
- `npm run lint`: 0 errors, 1 pre-existing warning (`/public/theme-init.js` catch param `e` unused)
- `npm run build`: ✓ all 30+ routes prerender; build output confirms `✓ viewTransition`
- `git diff --stat app/actions/`: 0 lines changed across all 21 commits
- `git log --oneline 7d8a2a9..HEAD | wc -l`: 21

## Final merge path (when all tasks complete)

```
~/.pilot/bin/pilot worktree sync design-system-overhaul   # rebase onto main
# Resolve any conflicts
# Then squash-merge into main:
git checkout main
git merge --squash spec/design-system-overhaul
git commit -m "feat: Geleoteka design system overhaul"
~/.pilot/bin/pilot worktree cleanup design-system-overhaul
```
