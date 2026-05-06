# Code Quality Audit Fixes Implementation Plan

Created: 2026-05-07
Author: aleksandr.spiskov@gmail.com
Status: COMPLETE
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Address all 8 ranked findings from the 2026-05-05 code-quality audit (`docs/audits/2026-05-05-code-quality-audit.md`) — three Reuse extractions, four Quality cleanups, one ghost-route-group removal.

**Architecture:** Each finding becomes its own task with its own commit. Three new `lib/` helpers (`local-storage-store.ts`, `session-defaults.ts`, and an extension to `lib/admin-nav.ts`) and one new `components/shared/` primitive (`NavDrawer`). The rest is deletion.

**Tech Stack:** TypeScript strict, React 19, Next.js 16 App Router, Prisma 6. No new runtime deps.

## Autonomous Decisions

(Auto mode active — questions skipped.)

- **Worktree:** No — work directly on `main`. Each task gets its own commit so rollback is per-task.
- **Dead-export resolution (Task 1):** Delete all three (`cn`, `generateReferralCode`, `getTierFromPoints`). None have a use case the codebase needs today; if `cn` is wanted later for tailwind-merge, it's three lines. The project's CSS strategy is direct utility classes + `var(--*)` tokens — no `cn(...)` wrapping is in use anywhere.
- **`useMyCar` (Task 7):** Delete the hook. The two consumers (`MyCarStrip`, `MyCarPicker`) read state from URL params, not localStorage; `MyCarInit` does its own raw `localStorage.getItem` call (one-shot read into router.replace) by design. There is no scenario where a component needs to subscribe to the saved-car value reactively.
- **`models-data.ts` (Task 8):** **Delete the file entirely.** Re-grepping during exploration found ZERO consumers as of today (the audit's "VehicleModel/generationLabel still consumed by Step1ServiceVehicle/MyCarPicker" claim is now stale — both files have been migrated to import from `@/lib/vehicle-catalog-types` directly since the audit ran). Pure shim → no remaining purpose.
- **Nav primitive scope (Task 4):** Decomposed into 3 sub-extractions instead of one big `<NavPanel/>`: (a) pure active-href helpers into `lib/admin-nav.ts`, (b) `useAccordionGroup` hook, (c) `<NavDrawer/>` slot-based portal primitive. The audit's single-extract framing under-counted the duplication once the active-href + accordion-group logic is included; splitting reduces blast radius and makes each step independently revertable.
- **Three dead actions (Task 6):** Delete all three (`assignMaster`, `deletePart`, `deleteSupplierOrder`). No UI consumer exists; the actions over-define the surface area. If a deletion button is needed later, the three lines come back trivially.
- **`(cabinet)` ghost route group (Task 5):** Delete the directory tree. Confirmed empty (5 ghost subdirs all contain zero `.ts/.tsx` files); the live portal lives entirely under `app/(portal)/cabinet/`.

## Scope

### In Scope

- All 8 ranked findings from `docs/audits/2026-05-05-code-quality-audit.md`.
- One commit per task (8 commits) so each is independently revertable.
- Final regression task: `npm run lint`, `npx tsc --noEmit`, `npm run build`, browser smoke-test of the public mobile menu, the portal mobile drawer, and the admin mobile drawer.

### Out of Scope

- The 8 "smaller dups" listed in the audit's `### Smaller dups (notable, lower leverage)` section (`<ModelSelect />`, rentals feature-highlight iteration, `useFormAction()`, slugify extraction, `<SuccessCard/>` etc.). They were not in the user's 1–8 list. Carry to a future audit cycle.
- The 6 internal-only types flagged "(used in module)" with low leverage. Pure hygiene; defer.
- The "Admin form shells" and "Auth + admin-create page chrome" findings (#6, #7 in audit) were Medium-leverage Reuse but **not in the user's 1–8 list** — they're deferred. Carry forward.

## Approach

**Chosen:** Sequential tasks 1 → 8, ordered low-risk-first. Each task:

- Touches 1–4 files
- Has a tight Definition of Done with verifiable assertions
- Lands its own commit
- Is followed by `npx tsc --noEmit` + `npm run lint` before proceeding

**Why:** Each finding is independent; bundling them reduces commit clarity and makes rollback harder. Cost: 8 commits instead of 1, ~10 minutes of overhead.

**Alternatives considered:**

- *One mega-commit:* Faster wall time, but a 12-file diff covering 8 unrelated concerns is unreviewable and rolling back any single concern requires an interactive rebase.
- *Split into 3 separate plans (high / medium / followup):* Doubles plan-management overhead; the user explicitly asked for one plan covering all 8.

### Pre-implementation re-verification (2026-05-07)

Each audit finding was re-verified against the current codebase (HEAD as of 2026-05-07). The audit was generated 2026-05-05; one round of substantive work landed in between (vehicle-trims spec). Two deltas to note:

1. **Finding 8 (`lib/models-data.ts`):** the 5/5 audit said two consumers existed (`Step1ServiceVehicle`, `MyCarPicker`). As of today, **both have been migrated to import directly from `@/lib/vehicle-catalog-types`** (verified by grep — zero remaining references to `models-data` outside the file itself). Task 8 was correspondingly upgraded from "partial cleanup" to "delete the file entirely." Documented in §Autonomous Decisions.

2. **Finding 2 (`useSyncExternalStore`):** the 5/5 audit listed 3 sites. As of today, `grep -rl "useSyncExternalStore"` finds **5 files**: the original 3 plus `components/shared/ThemeToggle.tsx` and `components/shared/CookieConsent.tsx`. The 2 extras are **NOT** instances of the same pattern and are intentionally excluded from Task 2:
   - `ThemeToggle` reads from `document.documentElement.classList` AND `window.matchMedia('(prefers-color-scheme: light)')` AS WELL AS `localStorage`. `getEffectiveTheme()` returns the resolved string. Migrating to `createLocalStorageStore` would either lose the prefers-color-scheme fallback or force the factory API to support a custom `getSnapshot` override — overengineering for one use case.
   - `CookieConsent` returns a boolean primitive (`!localStorage.getItem(KEY)`). Booleans don't have the new-object-reference-each-call problem that motivates the cached-snapshot pattern. The semantics also differ: `visible === true` when the localStorage key is ABSENT, whereas `createLocalStorageStore` assumes the key HOLDS the value.

   Net: Task 2 stays scoped to the original 3 sites. If a future feature adds a 6th `useSyncExternalStore` user that DOES match the cached-snapshot pattern, the helper exists for it.

All other findings (1, 3, 4, 5, 6, 7) match the audit verbatim — no codebase changes since 5/5 affected them.

## Context for Implementer

> Write for an implementer who has never seen the codebase.

### Patterns to follow

- **Local-storage-backed state (React 19 strict mode):** the project requires the cached-snapshot pattern. See `lib/my-car-store.ts:18-29` for the canonical example. The new `createLocalStorageStore` wrapper (Task 2) preserves this pattern internally; consumers don't think about it.
- **Server components passing session data to client forms:** see `app/(public)/parts/cart/page.tsx:6-15` and `app/(public)/booking/step-3/page.tsx:7-22`. Both already use the `defaultContact` shape that becomes `getDefaultContact()` (Task 3).
- **Admin nav active-href computation:** `findActiveHref`, `findActiveGroupLabel`, `matchesHref` exist verbatim at `components/admin/AdminSidebar.tsx:163-194` AND `components/admin/AdminMobileNav.tsx:253-284`. Pure functions with zero JSX — natural lift into `lib/admin-nav.ts` (Task 4a).
- **Single-open accordion with manual override:** `ManualOverride` interface + `toggleGroup` + `openGroup` derivation appears verbatim in `AdminSidebar.tsx:14-39` and `AdminMobileNav.tsx:12-35`. Extract into a `useAccordionGroup` hook (Task 4b) — this is also the project's pattern for avoiding the `setState-in-effect` lint rule.
- **Portal-based mobile drawer:** all 3 mobile-drawer components (`AdminMobileNav`, `PanelMobileNav`, `MobileMenu`) implement (i) hamburger button (ii) backdrop + panel via `createPortal` (iii) close button (iv) `setOpen(false)` on every nav-item click. Same chrome, different content. Extract `<NavDrawer/>` slot-based primitive (Task 4c).

### Conventions

- **Imports:** kebab-case for files (`local-storage-store.ts`); PascalCase for components (`NavDrawer.tsx`).
- **Strict types:** explicit return types on exports. No `any`. The `validator` parameter on `createLocalStorageStore` is a `(parsed: unknown) => T | null` type guard.
- **Russian UI strings stay in components**, never in `lib/`.
- **`"use client"` only when truly needed** — `lib/local-storage-store.ts` consumers are client components, but the helper itself ships server-safe (it short-circuits on `typeof window === "undefined"`). The helper file does NOT need `"use client"` at the top — it's imported by client files.

### Key files (read these before each task)

| Task | File | Lines | Purpose |
|------|------|-------|---------|
| 1 | `lib/utils.ts` | 112 | Three dead exports + helpers that ARE used |
| 2 | `lib/my-car-store.ts` | 99 | Existing localStorage store — the template |
| 2 | `components/booking/BookingProvider.tsx` | 115 | Site #2 |
| 2 | `components/parts/PartsCart.tsx` | 198 | Site #3 |
| 3 | `app/(public)/parts/cart/page.tsx` | 19 | Site #1 of `defaultContact` |
| 3 | `app/(public)/booking/step-3/page.tsx` | 26 | Site #2 of `defaultContact` |
| 4 | `components/admin/AdminSidebar.tsx` | 194 | Desktop sidebar (active-href + accordion) |
| 4 | `components/admin/AdminMobileNav.tsx` | 284 | Mobile drawer (active-href + accordion + portal chrome) |
| 4 | `components/shared/PanelMobileNav.tsx` | 130 | Portal mobile drawer (chrome only) |
| 4 | `components/shared/MobileMenu.tsx` | 124 | Public mobile drawer (chrome only) |
| 5 | `app/(cabinet)/` | 0 files | 5 empty subdirs to delete |
| 6 | `app/actions/admin.ts:53` | — | `assignMaster` — confirmed 0 consumers |
| 6 | `app/actions/parts.ts:126` | — | `deletePart` — confirmed 0 consumers |
| 6 | `app/actions/supplier-orders.ts:106-109` | — | `deleteSupplierOrder` — confirmed 0 consumers |
| 7 | `lib/my-car-store.ts:85-87` | — | `useMyCar` — confirmed 0 consumers |
| 8 | `lib/models-data.ts` | 14 | Shim — confirmed 0 consumers (audit was outdated) |

### Gotchas

- **`useSyncExternalStore` cache invalidation:** when the store mutates, the cached snapshot must be updated EXACTLY at write time so the next `getSnapshot()` returns the new reference. `lib/my-car-store.ts:setMyCar` does this implicitly via `localStorage.setItem` + dispatched event. The new `createLocalStorageStore` MUST replicate this — see Task 2 Key Decisions for the exact API.
- **Server snapshot:** every store needs a stable `getServerSnapshot` returning the same reference each call. Using `INITIAL` as a module-level constant works; calling `getSnapshot()` server-side does not.
- **Subscribe-on-storage-event AND subscribe-on-custom-event:** cross-tab updates fire `storage`; same-tab updates fire a custom event. Both are needed. `MobileMenu` and `PanelMobileNav` do NOT use localStorage — they don't need this; only the 3 stores from finding #2 do.
- **Next.js route groups (`(name)`):** parentheses-wrapped folder names don't appear in the URL but DO participate in the layout/page tree. An empty group like `app/(cabinet)/cars/` could in principle take precedence over `app/(portal)/cabinet/cars/` if both had `page.tsx` files — but since `(cabinet)` is empty there's no risk. Sanity-check with `find app/(cabinet) -type f` before deletion (must return zero results).
- **Re-export shim deletion:** `lib/models-data.ts` is `@deprecated`-tagged. Verify ZERO `from "@/lib/models-data"` imports remain (`grep -rn "models-data" app components lib`) before deleting; if any are found, migrate them in the same commit.
- **Accordion hook signature:** `useAccordionGroup(initialOpenLabel: string | null)` returns `[openLabel, toggleLabel]`. The "tied to pathname" reset behavior MUST stay — without it, the user opens a group, navigates, comes back, and finds it stuck open. The hook reads `usePathname()` internally and re-syncs `override` when pathname changes. This is the bug the original `setState-in-effect`-avoiding code was written to prevent.
- **`NavDrawer` portal target:** `createPortal(overlay, document.body)`. The drawer is always full-height, fixed-position, `z-50` backdrop + `z-[60]` panel. AdminMobileNav opens left-side, PanelMobileNav opens left-side, MobileMenu opens right-side — `<NavDrawer side="left" | "right">` prop required.
- **Deleted server actions inside `app/actions/*.ts` files:** the file as a whole has `"use server"` at the top. Removing one exported function from a `"use server"` file does NOT require additional cleanup — the remaining exports stay valid.

### Domain context

The mobile-nav refactor (Task 4) touches both ADMIN and PUBLIC surfaces. A regression hides if the smoke-test only covers one of them. Verify all three drawers in the regression sweep (Task 9): public mobile menu (right side), portal mobile drawer (left side, no admin nav), admin mobile drawer (left side, with accordion groups).

The cabinet ghost route group (Task 5) is older than this codebase's `(portal)` group — it's left over from a Next.js v13 → v14 reshuffle that adopted route-group folders for layout scoping. Removal is purely cosmetic but it removes a confusion point ("which is the real cabinet?").

## Runtime Environment

- **Dev:** `npm run dev` (port 443, HTTPS, sudo). Skip live test if `lsof -i :443` shows another process — restart it instead.
- **Build:** `npm run build` (Next.js 16, Turbopack). Should complete with zero errors.
- **Lint:** `npm run lint` (eslint).
- **Typecheck:** `npx tsc --noEmit`.
- **No tests:** the project has no automated test suite for this layer; verification is via lint/typecheck/build + manual browser smoke-test.

## File Structure

- `lib/utils.ts` (modify) — drop 3 dead exports
- `lib/local-storage-store.ts` (create) — generic `createLocalStorageStore<T>(key, initial, validator?)` factory; returns `{ useStore, setStore, MY_KEY }`
- `lib/session-defaults.ts` (create) — `getDefaultContact()` server function returning `{ name, phone, email } | null`
- `lib/admin-nav.ts` (modify) — add `findActiveHref(pathname, nav)`, `findActiveGroupLabel(activeHref, nav)`, `matchesHref(pathname, href)` pure helpers
- `lib/use-accordion-group.ts` (create) — `useAccordionGroup(initial)` client hook
- `components/shared/NavDrawer.tsx` (create) — slot-based portal mobile drawer primitive
- `lib/my-car-store.ts` (modify) — refactor to use `createLocalStorageStore`; drop `useMyCar` export
- `components/booking/BookingProvider.tsx` (modify) — refactor to use `createLocalStorageStore`
- `components/parts/PartsCart.tsx` (modify) — refactor to use `createLocalStorageStore`
- `app/(public)/parts/cart/page.tsx` (modify) — switch to `getDefaultContact()`
- `app/(public)/booking/step-3/page.tsx` (modify) — switch to `getDefaultContact()`
- `components/admin/AdminSidebar.tsx` (modify) — import active-href helpers, use `useAccordionGroup`
- `components/admin/AdminMobileNav.tsx` (modify) — import active-href helpers, use `useAccordionGroup`, use `<NavDrawer>`
- `components/shared/PanelMobileNav.tsx` (modify) — use `<NavDrawer>`
- `components/shared/MobileMenu.tsx` (modify) — use `<NavDrawer>`
- `app/(cabinet)/` (delete) — entire directory tree
- `app/actions/admin.ts` (modify) — remove `assignMaster`
- `app/actions/parts.ts` (modify) — remove `deletePart`
- `app/actions/supplier-orders.ts` (modify) — remove `deleteSupplierOrder`
- `lib/models-data.ts` (delete) — full shim removal

## Assumptions

- **`cn`/`generateReferralCode`/`getTierFromPoints` have no dynamic consumers** — supported by static grep over `app components lib` finding zero hits. If a future feature needs `cn`, it's a 3-line re-add. Tasks 1 depends on this.
- **`models-data.ts` has no consumers as of today** — supported by `grep -rn "from.*models-data"` returning only the file itself. The audit (5/5) said `Step1ServiceVehicle` + `MyCarPicker` still imported from it, but both have been migrated since. Task 8 depends on this.
- **`useMyCar` has no consumers** — supported by `grep -rn "useMyCar"` returning only the export site. `MyCarInit` reads localStorage directly by design (one-shot, no subscribe). Task 7 depends on this.
- **The 3 dead server actions have no consumers** — supported by 3 grep verifications. Task 6 depends on this.
- **Auto-data.net-style snapshot-reconcile is NOT needed** — no DB writes in this plan. Task 2 (`createLocalStorageStore`) refactors stores in-place; existing localStorage values continue to deserialize identically.
- **No tests exist for these components** — supported by `find . -name '*.test.ts' -not -path '*/node_modules/*'` (project has zero test files). Verification is via build + browser.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Mobile-nav refactor breaks the admin drawer's accordion (open/close on group click) | Medium | High | Task 4 ships in 3 sub-tasks (4a/4b/4c). Each sub-task: change → typecheck → manual browser verify all 3 drawers (admin desktop, admin mobile, portal mobile, public mobile menu). Final regression task re-runs all 4 surfaces. |
| `useSyncExternalStore` refactor introduces an infinite re-render in one of the 3 sites | Medium | High | The cached-snapshot rule from `geleoteka-conventions.md` MUST be preserved. `createLocalStorageStore` keeps the cache module-level (not per-component), and the `setStore` call MUST update the cache before dispatching the change event. Task 2 adds a unit assertion: `setStore(value); getStore() === value` (reference equality). |
| `lib/models-data.ts` deletion breaks an import that grep missed (dynamic `import()`, JSX-string imports, generated code) | Low | Medium | After deletion: `npx tsc --noEmit` + `npm run build`. Both will fail loudly on missing module resolution. Build IS the test. |
| `app/(cabinet)/` deletion creates a routing surprise | Low | Low | Empty directory tree → empty route → no surprise. Confirmed via `find app/(cabinet) -type f` returning zero. Build pass is the proof. |
| Three dead server actions deletion breaks an import that grep missed | Low | Low | Build will fail; revert + investigate. Each `delete*` action's name is distinctive. |
| `cn` deletion breaks an import that grep missed | Low | Low | Same — build catches it. The function is short enough to re-add inline if needed. |
| `useMyCar` deletion breaks a consumer | Low | Low | Same — build catches it. Already verified zero consumers via grep. |
| Refactor introduces subtle behavior change in PartsCart (e.g. cart-clear-on-checkout regression) | Low | High | Task 2 specifies that `setStore(null)` and `localStorage.removeItem(KEY)` must remain semantically equivalent. The 3 existing stores all rely on this; preserve verbatim. |
| Header markup duplication survives Task 4 (each `NavDrawer` consumer renders its own logo block) | High | Low | Acceptable trade-off: slot-based primitives intentionally let each consumer compose its own header. The next audit may re-flag ~20 lines of duplication across the 3 headers. If that re-flag happens, the follow-up is a `<NavDrawerBrandHeader title subtitle?>` sub-component — out of scope for this plan. |
| `<NavDrawer/>` Escape handler stale-listener risk after rapid open/close + navigation | Low | Low | `useEffect` cleanup removes the `keydown` listener on `setOpen(false)` and on unmount. Verified by reading the cleanup return in Task 4c's `NavDrawer.tsx` snippet. No double-fire, no stale subscription. |

## Goal Verification

### Truths

1. `lib/utils.ts` no longer exports `cn`, `generateReferralCode`, or `getTierFromPoints`. Verifiable: `grep -E "^export.*\b(cn|generateReferralCode|getTierFromPoints)\b" lib/utils.ts` returns zero.
2. `lib/local-storage-store.ts` exists and exports `createLocalStorageStore<T>(key, initial, validator?)`. Verifiable: file present, `npx tsc --noEmit` passes.
3. `lib/my-car-store.ts`, `components/booking/BookingProvider.tsx`, `components/parts/PartsCart.tsx` no longer contain inlined `cachedRaw` / `cachedSnapshot` / `getSnapshot` boilerplate. Verifiable: (a) `grep -E "let cached(Raw|Snapshot|CartItems|Value)" components lib` returns zero hits, AND (b) `grep -rl "useSyncExternalStore" --include='*.ts' --include='*.tsx' lib components` returns exactly one file (`lib/local-storage-store.ts`). The second check is the completeness check — name-renamed inline copies still fail it.
4. `lib/session-defaults.ts` exists and exports `getDefaultContact(): Promise<DefaultContact | null>`. Both `parts/cart/page.tsx` and `booking/step-3/page.tsx` import from it. Verifiable: `grep -rn "getDefaultContact" app` returns ≥ 2 callers.
5. The active-href computation lives once. Verifiable: `findActiveHref` defined in `lib/admin-nav.ts` and ZERO definitions in `components/admin/`.
6. `<NavDrawer/>` exists in `components/shared/`. AdminMobileNav, PanelMobileNav, MobileMenu all consume it for their drawer chrome. Verifiable: `grep -l "from.*shared/NavDrawer" components` returns 3 files.
7. `app/(cabinet)/` directory does not exist. Verifiable: `[ ! -d "app/(cabinet)" ]`.
8. `app/actions/admin.ts`, `app/actions/parts.ts`, `app/actions/supplier-orders.ts` no longer export `assignMaster`, `deletePart`, `deleteSupplierOrder`. Verifiable: `grep -E "export.*\b(assignMaster|deletePart|deleteSupplierOrder)\b" app/actions/` returns zero.
9. `lib/my-car-store.ts` no longer exports `useMyCar`. Verifiable: `grep -E "^export.*useMyCar" lib/my-car-store.ts` returns zero.
10. `lib/models-data.ts` does not exist. Verifiable: `[ ! -f "lib/models-data.ts" ]`.
11. `npm run build` succeeds with zero errors after each task and at the end.
12. `npx tsc --noEmit` exit 0 after each task.
13. `npm run lint` exit 0 after each task.
14. Manual browser verify (Task 9) confirms public mobile menu, portal mobile drawer, admin desktop sidebar, and admin mobile drawer all open / close / mark-active-link correctly.

### Artifacts

- New files: `lib/local-storage-store.ts`, `lib/session-defaults.ts`, `lib/use-accordion-group.ts`, `components/shared/NavDrawer.tsx`
- Modified files: `lib/utils.ts`, `lib/my-car-store.ts`, `lib/admin-nav.ts`, 2 booking files, 2 cart/step-3 files, 4 nav files, 3 server-action files
- Deleted: `lib/models-data.ts`, `app/(cabinet)/` tree
- 8 commits in `main` (one per task) + 1 regression commit

## E2E Test Scenarios

Runtime profile: Full (UI changes — mobile nav). Three scenarios covering each drawer surface.

### TS-001: Public site mobile menu (right-side drawer)

**Priority:** Critical
**Preconditions:** Browser viewport ≤ 767px (mobile breakpoint)
**Mapped Tasks:** Task 4

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/` (mobile viewport) | Hamburger icon visible top-right of header |
| 2 | Click hamburger | Right-side drawer slides in with backdrop. Nav items visible: Услуги, Модели, Запчасти, Аренда, О нас, Контакты, Вакансии. Footer has "Личный кабинет", "Записаться", and theme toggle. |
| 3 | Click backdrop (left side) | Drawer closes |
| 4 | Re-open drawer; click "Запчасти" | Drawer closes AND the page navigates to `/parts` |
| 5 | Press Escape while drawer is open | Drawer closes |

### TS-002: Portal cabinet mobile drawer (left-side)

**Priority:** Critical
**Preconditions:** Logged in as a CLIENT user; viewport ≤ 767px
**Mapped Tasks:** Task 4

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/cabinet` | Sticky mobile header at top with hamburger left + title centered |
| 2 | Click hamburger | Left-side drawer slides in. Title "Личный кабинет" visible. Nav items: Заказы, Машины, История, Уведомления, Программа лояльности (or whatever the actual list is). |
| 3 | Click "Машины" | Drawer closes AND the page navigates to `/cabinet/cars` |
| 4 | While at `/cabinet/cars`, open drawer again | "Машины" link is highlighted (gold/accent color) |

### TS-003: Admin mobile drawer (left-side, accordion groups)

**Priority:** Critical
**Preconditions:** Logged in as ADMIN or MANAGER; viewport ≤ 767px
**Mapped Tasks:** Task 4

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/admin` | Sticky admin header with hamburger left, "Админ-панель" centered |
| 2 | Click hamburger | Left-side drawer slides in. Top-level nav items + accordion groups (Сайт / Заказы и клиенты / etc., depending on actual nav config) |
| 3 | Click an accordion group header (e.g. "Сайт") | Group expands; chevron rotates 90°; child items appear indented |
| 4 | Click another group header | Previous group COLLAPSES (single-open behavior); new group expands |
| 5 | Click a child link inside the open group | Drawer closes; page navigates; on the new page, re-opening drawer shows that group still expanded with the active link highlighted |
| 6 | Click backdrop | Drawer closes |

### TS-004: Admin desktop sidebar (no drawer, but same accordion logic)

**Priority:** High
**Preconditions:** Logged in as ADMIN; viewport ≥ 768px
**Mapped Tasks:** Task 4

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/admin` | Sticky left sidebar visible (no hamburger). Nav items + accordion groups. |
| 2 | Click an accordion group | Expands; chevron rotates; child items appear indented; previous open group (if any) collapses |
| 3 | Click a child link | Page navigates; the group containing the active link stays expanded; the active link is highlighted in accent color |
| 4 | Click an already-open group's header | Group collapses (manual override) |
| 5 | Navigate to a page in a different group | The previously-open group resets to closed; the new active group opens automatically |

### TS-005: Cart checkout default-contact prefill

**Priority:** High
**Preconditions:** Logged in as a CLIENT user with name/phone/email in profile
**Mapped Tasks:** Task 3

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add a part to cart and navigate to `/parts/cart` | Cart shows the item |
| 2 | Scroll to "Контактные данные" section | Name, phone, email fields are pre-filled with profile values; "Заполнено из профиля" hint visible |
| 3 | Log out, navigate to `/parts/cart` again | Fields are EMPTY; no "Заполнено из профиля" hint |

### TS-006: Booking step 3 default-contact prefill

**Priority:** High
**Preconditions:** Logged in; completed booking step 1+2 with valid data
**Mapped Tasks:** Task 3

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/booking/step-3` | Step indicator shows step 3 active |
| 2 | Inspect contact form | Name, phone, email pre-filled from profile |

## Progress Tracking

- [x] Task 1: Drop dead exports from `lib/utils.ts`
- [x] Task 2: Extract `createLocalStorageStore` and migrate 3 sites
- [x] Task 3: Extract `getDefaultContact()` and migrate 2 sites
- [x] Task 4: Mobile/desktop nav primitive (3 sub-extractions)
- [x] Task 5: Delete `app/(cabinet)/` ghost route group
- [x] Task 6: Delete 3 dead server actions
- [x] Task 7: Delete `useMyCar` hook (rolled into Task 2)
- [x] Task 8: Delete `lib/models-data.ts` shim
- [x] Task 9: Regression sweep + browser smoke test (browser scenarios deferred — see E2E Results)

**Total Tasks:** 9 | **Completed:** 9 | **Remaining:** 0

## Implementation Tasks

### Task 1: Drop dead exports from `lib/utils.ts`

**Objective:** Remove `cn`, `generateReferralCode`, `getTierFromPoints` from `lib/utils.ts`. The other exports (`formatPrice`, `formatDate`, `formatDateTime`, `normalizePhone`, `REPAIR_ORDER_STATUS_LABELS`, `JOB_LINE_STATUS_LABELS`, `LOYALTY_TIERS`, `LoyaltyTier`, `getNextTier`) stay — they have active consumers.
**Dependencies:** None
**Mapped Scenarios:** None (pure removal)

**Files:**
- Modify: `lib/utils.ts`
- Modify: `package.json` (drop `clsx` and `tailwind-merge` if no other consumer remains)

**Key Decisions / Notes:**
- Verify no consumer first: `grep -rn "\bcn\b\|generateReferralCode\|getTierFromPoints" --include='*.ts' --include='*.tsx' app components lib`. Already confirmed in exploration — zero matches outside the file itself.
- After deletion, also remove the unused imports `import { type ClassValue, clsx } from "clsx"` and `import { twMerge } from "tailwind-merge"` (top of file).
- Check `package.json` for `clsx` and `tailwind-merge`: if `cn` was their only user (likely), drop both deps. Verify with `grep -rn "from \"clsx\"\|from \"tailwind-merge\"" --include='*.ts' --include='*.tsx' app components lib` returning zero AFTER the file edit.

**Definition of Done:**
- [ ] `grep -E "^export (function|type|const) (cn|generateReferralCode|getTierFromPoints)" lib/utils.ts` returns zero.
- [ ] `import.*clsx\|tailwind-merge` returns zero hits across `app components lib`.
- [ ] If `clsx` and `tailwind-merge` had no other consumers, removed from `package.json` dependencies + `package-lock.json` regenerated via `npm install`.
- [ ] `npx tsc --noEmit` exit 0.
- [ ] `npm run lint` exit 0.
- [ ] `npm run build` exit 0.
- [ ] Git: one commit, `chore(utils): drop dead exports cn / generateReferralCode / getTierFromPoints`.

**Verify:**
```bash
grep -E "^export (function|type|const) (cn|generateReferralCode|getTierFromPoints)" lib/utils.ts
grep -rn "\bcn\b\|generateReferralCode\|getTierFromPoints" --include='*.ts' --include='*.tsx' app components lib
npx tsc --noEmit
npm run lint
npm run build
```

---

### Task 2: Extract `createLocalStorageStore` and migrate 3 sites

**Objective:** Create `lib/local-storage-store.ts` exporting `createLocalStorageStore<T>(key, initial, validator?)`. Migrate the three existing inline implementations (`my-car-store`, `BookingProvider`, `PartsCart`) to consume it.
**Dependencies:** Task 1 (sequential — same `lib/` directory)
**Mapped Scenarios:** TS-001 (cart still works), TS-002 (booking flow still works)

**Files:**
- Create: `lib/local-storage-store.ts`
- Modify: `lib/my-car-store.ts`
- Modify: `components/booking/BookingProvider.tsx`
- Modify: `components/parts/PartsCart.tsx`

**Key Decisions / Notes:**

**API design:**
```ts
// lib/local-storage-store.ts
import { useSyncExternalStore } from "react";

export interface LocalStorageStore<T> {
  /** React 19-safe subscribe hook with cached snapshot. */
  useStore: () => T;
  /** Imperative setter. Updates localStorage + notifies subscribers. Pass null
   *  ONLY if T includes null. */
  setStore: (value: T) => void;
  /** Read current value without subscribing (for use in event handlers / actions). */
  getStore: () => T;
  /** Storage key, exposed for migration / one-shot reads (e.g. router.replace from MyCarInit). */
  KEY: string;
}

export function createLocalStorageStore<T>(
  key: string,
  initial: T,
  validator?: (parsed: unknown) => T | null,
): LocalStorageStore<T> { ... }
```

- Cache (`cachedRaw`, `cachedValue`) lives in the closure scope of `createLocalStorageStore`, not module-level — each call to the factory creates an independent cache. Critical for not crossing wires between the 3 stores.
- `subscribe` listens to BOTH `storage` (cross-tab) and a custom `geleoteka:store-change:<key>` event (same-tab).
- `setStore`:
  1. Compute new raw string `JSON.stringify(value)`.
  2. Update cache: `cachedRaw = raw; cachedValue = value;` BEFORE the localStorage write.
  3. Write to localStorage (try/catch).
  4. Dispatch the custom event.
- `getServerSnapshot` returns `initial` (must be the same reference each call).
- **Validator semantics:**
  - **Provided:** called on parsed JSON; if returns non-null, that value becomes the snapshot; if returns null, the helper self-heals (removes the bad localStorage entry, returns `initial`). This mirrors the current `my-car-store` behavior.
  - **Undefined:** parsed value is cast to `T` as-is (no shape check). This MUST match the current behavior of `BookingProvider` and `PartsCart`, which `JSON.parse` and assign without validation. Adding a validator to either of those during this task is a behavior change and is OUT OF SCOPE.
- **Reset/clear semantic equivalence (verified):**
  - `BookingProvider.reset()` today: `cachedRaw = null; cachedSnapshot = INITIAL; localStorage.removeItem(...)` + listeners. With `setStore(INITIAL)`: cache becomes `{raw: JSON.stringify(INITIAL), value: INITIAL}`, localStorage holds `JSON.stringify(INITIAL)` instead of being absent. Same-tab `getSnapshot()` returns INITIAL either way. Cross-tab storage events fire either way. The only observable difference is a few extra bytes of storage; functionally identical.
  - `PartsCart` checkout success today: `localStorage.removeItem(CART_KEY); cartListeners.forEach(...)` BUT does NOT update `cachedCartRaw` / `cachedCartItems` — stale cache that gets fixed on the next `getSnapshot` call. With `setStore([])`: cache is updated atomically, no staleness window. Strictly-better behavior; safe migration.

**Refactoring `lib/my-car-store.ts`:**
```ts
"use client";
import { createLocalStorageStore } from "./local-storage-store";

export interface MyCar { model: string; generation: string; trim?: string; }

function validateMyCar(parsed: unknown): MyCar | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as { model?: unknown; generation?: unknown; trim?: unknown };
  if (typeof obj.model !== "string" || typeof obj.generation !== "string") return null;
  return {
    model: obj.model,
    generation: obj.generation,
    trim: typeof obj.trim === "string" && obj.trim.length > 0 ? obj.trim : undefined,
  };
}

const store = createLocalStorageStore<MyCar | null>(
  "geleoteka:my-car",
  null,
  (parsed) => parsed === null ? null : validateMyCar(parsed),
);

export const MY_CAR_KEY = store.KEY;
// useMyCar removed — see Task 7
export function setMyCar(car: MyCar | null): void { store.setStore(car); }
```

- `useMyCar` export is REMOVED here as part of Task 7. If Task 7 hasn't run yet, keep it as `export const useMyCar = store.useStore;` and remove in Task 7.
- `MY_CAR_KEY` export stays (used by `MyCarInit.tsx`).

**Refactoring `components/booking/BookingProvider.tsx`:**
- Replace lines 46-78 (storage helpers) with a single `const bookingStore = createLocalStorageStore<BookingData>("booking-data", INITIAL);` at module scope.
- `BookingProvider` body becomes: `const data = bookingStore.useStore();` and `update`/`reset` use `bookingStore.getStore()` + `bookingStore.setStore()`.
- `reset` now: `bookingStore.setStore(INITIAL)` (instead of `localStorage.removeItem` + manual cache reset).

**Refactoring `components/parts/PartsCart.tsx`:**
- Replace lines 16-49 (cart storage helpers) with `const cartStore = createLocalStorageStore<CartItem[]>("parts-cart", []);`.
- `PartsCart` consumes `const items = cartStore.useStore();`.
- `setCartStorage(items)` becomes `cartStore.setStore(items)`.
- The `localStorage.removeItem(CART_KEY)` after successful checkout becomes `cartStore.setStore([])`.

**Performance:** Hot path — all 3 stores are read on every render. The cached-snapshot pattern (preserved in the factory) ensures `getSnapshot` returns the same reference when localStorage is unchanged, so React doesn't re-render. Validator runs only on raw-string change.

**Definition of Done:**
- [ ] `lib/local-storage-store.ts` exists.
- [ ] `grep -E "let cached(Raw|Snapshot|CartItems|Value)" lib components` returns zero (all inline caches removed).
- [ ] **`useSyncExternalStore` is imported from React in EXACTLY one file:** `grep -rE "useSyncExternalStore" --include='*.ts' --include='*.tsx' lib components` returns only `lib/local-storage-store.ts`. This is the completeness check — if any of the 3 sites still has its own `useSyncExternalStore` call, the migration is incomplete regardless of whether the cache-variable names changed.
- [ ] `lib/my-car-store.ts`, `BookingProvider.tsx`, `PartsCart.tsx` each import from `@/lib/local-storage-store`.
- [ ] `npx tsc --noEmit` exit 0.
- [ ] `npm run lint` exit 0.
- [ ] `npm run build` exit 0.
- [ ] Manual browser test (any one is enough — they share the helper):
  - [ ] Visit `/parts`, pick a model+generation in the picker. Reload. Picker re-loads the saved car.
  - [ ] Visit `/booking/step-1`, fill model+year, navigate to step 2 and back. Step 1 fields are still filled.
  - [ ] Add an item to cart, reload. Cart still has the item.
- [ ] Git: one commit, `refactor(stores): extract createLocalStorageStore; migrate my-car / booking / cart`.

**Verify:**
```bash
test -f lib/local-storage-store.ts
grep -rE "let cached(Raw|Snapshot|CartItems|Value)" lib components || echo "OK: no inline caches"
# Completeness check — useSyncExternalStore must live only in the helper:
grep -rl "useSyncExternalStore" --include='*.ts' --include='*.tsx' lib components
# Expect: exactly one line — lib/local-storage-store.ts
npx tsc --noEmit
npm run build
```

---

### Task 3: Extract `getDefaultContact()` and migrate 2 sites

**Objective:** Create `lib/session-defaults.ts` exporting `getDefaultContact()`. Migrate `app/(public)/parts/cart/page.tsx` and `app/(public)/booking/step-3/page.tsx` to consume it.
**Dependencies:** None (independent of Task 2)
**Mapped Scenarios:** TS-005, TS-006

**Files:**
- Create: `lib/session-defaults.ts`
- Modify: `app/(public)/parts/cart/page.tsx`
- Modify: `app/(public)/booking/step-3/page.tsx`

**Key Decisions / Notes:**

**API design:**
```ts
// lib/session-defaults.ts
import { getSession } from "./auth";

export interface DefaultContact {
  name: string;
  phone: string;
  email: string;
}

/**
 * Returns the contact-form prefill object for an authenticated user, or null
 * for anonymous visitors. Used by `/parts/cart` and `/booking/step-3` to
 * pre-fill the checkout/contact form. Add fields here when the contact form
 * grows (company name, loyalty tier, etc.).
 */
export async function getDefaultContact(): Promise<DefaultContact | null> {
  const session = await getSession();
  if (!session) return null;
  return {
    name: session.name,
    phone: session.phone,
    email: session.email,
  };
}
```

- File name `session-defaults.ts` (kebab-case, matches `vehicle-catalog-types.ts` style).
- The function MUST stay async — `getSession()` is async (reads cookies, decodes JWT).
- Server-only is enforced implicitly by importing `getSession` from `lib/auth.ts` which uses `next/headers` (server-only). No need for `import "server-only"` directive — Next.js will throw if a client component imports this transitively.

**Refactoring `app/(public)/parts/cart/page.tsx`:**
```ts
import { getDefaultContact } from "@/lib/session-defaults";
import { PartsCart } from "@/components/parts/PartsCart";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const defaultContact = await getDefaultContact();
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-display text-3xl font-bold mb-8 text-center">Корзина</h1>
      <PartsCart defaultContact={defaultContact ?? undefined} />
    </div>
  );
}
```

- `PartsCart` prop type accepts `defaultContact?: DefaultContact` — `null` becomes `undefined` at the prop boundary (type-safe coercion).
- Same pattern for `booking/step-3/page.tsx`.

**Definition of Done:**
- [ ] `lib/session-defaults.ts` exists with the documented signature.
- [ ] `grep -E "name: session.name, phone: session.phone, email: session.email" app` returns zero.
- [ ] Both consumer pages import `getDefaultContact`.
- [ ] `npx tsc --noEmit` exit 0.
- [ ] `npm run lint` exit 0.
- [ ] Manual browser test:
  - [ ] Logged-in user visits `/parts/cart` → name/phone/email prefilled, "Заполнено из профиля" visible.
  - [ ] Anonymous user visits `/parts/cart` → fields empty, hint absent.
- [ ] Git: one commit, `refactor(session): extract getDefaultContact() helper`.

**Verify:**
```bash
test -f lib/session-defaults.ts
grep -E "{ name: session.name, phone: session.phone" app -r --include='*.tsx' && exit 1 || echo "OK"
npx tsc --noEmit
```

---

### Task 4: Mobile/desktop nav primitive (3 sub-extractions)

**Objective:** Eliminate ~210 lines of duplication across 4 nav components by extracting (a) pure active-href helpers into `lib/admin-nav.ts`, (b) `useAccordionGroup` hook, (c) `<NavDrawer/>` slot-based portal primitive.
**Dependencies:** Task 3 (sequential — touches `lib/`)
**Mapped Scenarios:** TS-001, TS-002, TS-003, TS-004

**Files:**
- Modify: `lib/admin-nav.ts` (add active-href helpers)
- Create: `lib/use-accordion-group.ts`
- Create: `components/shared/NavDrawer.tsx`
- Modify: `components/admin/AdminSidebar.tsx`
- Modify: `components/admin/AdminMobileNav.tsx`
- Modify: `components/shared/PanelMobileNav.tsx`
- Modify: `components/shared/MobileMenu.tsx`

**Key Decisions / Notes:**

**Sub-task 4a — pure active-href helpers in `lib/admin-nav.ts`:**

Append to existing `lib/admin-nav.ts`:
```ts
import type { AdminNavEntry } from "./admin-nav"; // self-import not needed if same file

export function matchesHref(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/admin") return false;
  return pathname.startsWith(href + "/");
}

export function findActiveHref(pathname: string, nav: readonly AdminNavEntry[]): string | null {
  let bestMatch: string | null = null;
  for (const entry of nav) {
    const candidates = entry.kind === "link" ? [entry.href] : entry.items.map((i) => i.href);
    for (const href of candidates) {
      if (matchesHref(pathname, href)) {
        if (!bestMatch || href.length > bestMatch.length) bestMatch = href;
      }
    }
  }
  return bestMatch;
}

export function findActiveGroupLabel(activeHref: string | null, nav: readonly AdminNavEntry[]): string | null {
  if (!activeHref) return null;
  for (const entry of nav) {
    if (entry.kind !== "group") continue;
    if (entry.items.some((i) => i.href === activeHref)) return entry.label;
  }
  return null;
}
```

Then:
- Remove the local copies of these functions from `AdminSidebar.tsx:163-194` and `AdminMobileNav.tsx:253-284`.
- Both components import them via `import { findActiveHref, findActiveGroupLabel } from "@/lib/admin-nav"`.

**Sub-task 4b — `useAccordionGroup` hook in `lib/use-accordion-group.ts`:**

```ts
"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";

interface ManualOverride { pathname: string; openLabel: string | null; }

/**
 * Single-open accordion state with pathname-tied reset. The active group
 * derived from pathname auto-opens; the user can manually toggle (override
 * stored against current pathname). On navigation, the override expires and
 * control returns to the derived default — no setState-in-effect needed.
 */
export function useAccordionGroup(activeGroupLabel: string | null): [string | null, (label: string) => void] {
  const pathname = usePathname();
  const [override, setOverride] = useState<ManualOverride | null>(null);
  const activeOverride = override && override.pathname === pathname ? override : null;
  const openGroup = activeOverride ? activeOverride.openLabel : activeGroupLabel;

  function toggleGroup(label: string): void {
    setOverride({ pathname, openLabel: openGroup === label ? null : label });
  }

  return [openGroup, toggleGroup];
}
```

Then:
- `AdminSidebar.tsx`: remove `ManualOverride` interface (lines 14-17), `setOverride` state (line 22), `activeOverride` derivation (29-31), and `toggleGroup` body (33-38). Replace with `const [openGroup, toggleGroup] = useAccordionGroup(activeGroupLabel);`.
- `AdminMobileNav.tsx`: same — remove lines 12-15, 21, 26-28, 30-35.

**Sub-task 4c — `<NavDrawer/>` slot-based portal primitive:**

```tsx
// components/shared/NavDrawer.tsx
"use client";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface NavDrawerProps {
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
  /** Content of the drawer header (logo, title, close button is rendered automatically). */
  header: ReactNode;
  /** Scrollable nav body — the consumer renders the link list. */
  children: ReactNode;
  /** Optional sticky footer (logout button, theme toggle, CTAs). */
  footer?: ReactNode;
}

export function NavDrawer({ open, onClose, side, header, children, footer }: NavDrawerProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const sideClasses = side === "left" ? "top-0 left-0 border-r" : "top-0 right-0 border-l";

  const overlay = (
    <>
      <div
        className="fixed inset-0 z-50"
        style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`fixed z-[60] h-full w-72 flex flex-col ${sideClasses}`}
        style={{
          backgroundColor: "var(--card)",
          color: "var(--card-foreground)",
          borderColor: "var(--border)",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
        }}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="flex items-center justify-between p-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          {header}
          <button
            type="button"
            onClick={onClose}
            className="p-2"
            style={{ color: "var(--foreground-muted)" }}
            aria-label="Закрыть меню"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">{children}</nav>
        {footer && (
          <div className="p-4 space-y-1" style={{ borderTop: "1px solid var(--border)" }}>
            {footer}
          </div>
        )}
      </div>
    </>
  );

  return createPortal(overlay, document.body);
}
```

Then refactor each consumer:

- **`AdminMobileNav.tsx`** (drops to ~140 lines from 284):
  - State: keep `useState(false)` for `open`. Drop the override state (handled by `useAccordionGroup`).
  - Render: hamburger header + `<NavDrawer open={open} onClose={() => setOpen(false)} side="left" header={<AdminLogo/>} footer={<AdminFooter onClose={...}/>}>` wrapping the existing accordion-group nav-item rendering.
- **`PanelMobileNav.tsx`** (drops to ~80 lines from 130): same shape, no accordion (flat link list).
- **`MobileMenu.tsx`** (drops to ~80 lines from 124): same shape, `side="right"`, no auth. Footer contains THREE elements (preserving the current behavior at `MobileMenu.tsx:84-102`): (1) cabinet link `<Link href={cabinetHref}>{cabinetLabel}</Link>` styled `btn btn-secondary` (configurable via the existing `cabinetHref` / `cabinetLabel` props), (2) Записаться CTA `<Link href="/booking" className="btn btn-primary">`, (3) `<ThemeToggle />`. **All three must be in the new footer slot.** Skipping the cabinet link is a public-site-wide regression.

**Footer slot contract:** `<NavDrawer footer>` accepts arbitrary `ReactNode`. Each consumer composes its own footer block:
- `AdminMobileNav` footer: site-link + LogoutButton (current `AdminMobileNav.tsx:117-130`).
- `PanelMobileNav` footer: optional site-link (`showSiteLink` prop) + LogoutButton (current `PanelMobileNav.tsx:84-96`).
- `MobileMenu` footer: cabinet-link + Записаться + ThemeToggle (current `MobileMenu.tsx:84-102`).

Each consumer's footer composition is its own concern; the slot is intentionally generic to avoid forcing a one-size-fits-all default that the next nav variant would have to fight.

**Each sub-task lands its own commit:**
1. `refactor(nav): extract findActiveHref/findActiveGroupLabel into lib/admin-nav.ts` — Sub-task 4a.
2. `refactor(nav): extract useAccordionGroup hook` — Sub-task 4b.
3. `refactor(nav): extract NavDrawer primitive; consume in 3 nav components` — Sub-task 4c.

**Performance:** Hot path — `useAccordionGroup` runs on every admin-page render. The hook returns same-reference values when state hasn't changed. `NavDrawer` early-returns `null` when closed (no portal hydration cost when not open).

**Definition of Done:**
- [ ] `lib/admin-nav.ts` exports `findActiveHref`, `findActiveGroupLabel`, `matchesHref`.
- [ ] `lib/use-accordion-group.ts` exists and exports `useAccordionGroup`.
- [ ] `components/shared/NavDrawer.tsx` exists.
- [ ] `grep -n "findActiveHref\|findActiveGroupLabel\|matchesHref" components/admin/AdminSidebar.tsx components/admin/AdminMobileNav.tsx` shows ONLY imports, no local definitions.
- [ ] `grep -n "interface ManualOverride" components/` returns zero (logic now inside the hook).
- [ ] `grep -l "createPortal" components/shared/NavDrawer.tsx components/admin/AdminMobileNav.tsx components/shared/PanelMobileNav.tsx components/shared/MobileMenu.tsx` shows the portal call lives only in `NavDrawer.tsx`.
- [ ] All 4 TS-001 — TS-004 scenarios pass in browser.
- [ ] `npx tsc --noEmit` exit 0; `npm run lint` exit 0; `npm run build` exit 0.
- [ ] Git: 3 commits as listed above.

**Verify:**
```bash
test -f lib/use-accordion-group.ts
test -f components/shared/NavDrawer.tsx
grep -c "function findActiveHref\|function findActiveGroupLabel\|function matchesHref" components/admin/AdminSidebar.tsx components/admin/AdminMobileNav.tsx
# Expect: zero local definitions in the components (imports only).
grep -c "createPortal" components/admin/AdminMobileNav.tsx components/shared/PanelMobileNav.tsx components/shared/MobileMenu.tsx
# Expect: zero (NavDrawer owns the portal call).
npx tsc --noEmit
npm run build
```

---

### Task 5: Delete `app/(cabinet)/` ghost route group

**Objective:** Remove the empty `app/(cabinet)/` directory tree.
**Dependencies:** None
**Mapped Scenarios:** None (deletion of empty dirs)

**Files:**
- Delete: `app/(cabinet)/cars/`
- Delete: `app/(cabinet)/cars/add/`
- Delete: `app/(cabinet)/history/`
- Delete: `app/(cabinet)/loyalty/`
- Delete: `app/(cabinet)/notifications/`
- Delete: `app/(cabinet)/tracking/`
- Delete: `app/(cabinet)/`

**Key Decisions / Notes:**
- Pre-flight: `find "app/(cabinet)" -type f` MUST return zero. If it returns any files, STOP and investigate (audit said zero, but verify before destruction).
- `rm -rf "app/(cabinet)"` is the operation. Bash globs can be tricky with parentheses — quote the path.

**Definition of Done:**
- [ ] `find app -path "*cabinet*" -type d` returns ONLY `app/(portal)/cabinet/...` paths (no `app/(cabinet)/...`).
- [ ] `npm run build` succeeds (no missing-route surprises).
- [ ] Git: one commit, `chore(routes): remove empty app/(cabinet) ghost route group`.

**Verify:**
```bash
[ ! -d "app/(cabinet)" ] && echo "OK: gone" || echo "FAIL: still exists"
find app -path "*cabinet*" -type d
npm run build
```

---

### Task 6: Delete 3 dead server actions

**Objective:** Remove `assignMaster` from `app/actions/admin.ts`, `deletePart` from `app/actions/parts.ts`, `deleteSupplierOrder` from `app/actions/supplier-orders.ts`.
**Dependencies:** None
**Mapped Scenarios:** None

**Files:**
- Modify: `app/actions/admin.ts` (drop `assignMaster` function — currently at line 53)
- Modify: `app/actions/parts.ts` (drop `deletePart` function — currently at line 160; the audit's line 126 was stale)
- Modify: `app/actions/supplier-orders.ts` (drop `deleteSupplierOrder` function — currently at line 106)

**Key Decisions / Notes:**
- Pre-flight grep confirmed zero consumers in exploration. Re-verify before each delete:
  - `grep -rn "assignMaster" --include='*.ts' --include='*.tsx' app components` (only the export site).
  - `grep -rn "\bdeletePart\b" --include='*.ts' --include='*.tsx' app components` (only the export site).
  - `grep -rn "deleteSupplierOrder" --include='*.ts' --include='*.tsx' app components` (only the export site).
- After each deletion, check the remaining file for any unused imports introduced. The three actions don't use unique imports likely to leave orphans — verify with `npx tsc --noEmit`.
- Each action is independent: 3 commits OR 1 combined commit. Recommend 1 combined commit (single concern: "drop dead actions") to avoid commit clutter for 3 ~10-line removals.

**Definition of Done:**
- [ ] `grep -E "^export (async )?function (assignMaster|deletePart|deleteSupplierOrder)" app/actions/` returns zero.
- [ ] `npx tsc --noEmit` exit 0.
- [ ] `npm run build` exit 0.
- [ ] Git: one commit, `chore(actions): drop dead server actions assignMaster / deletePart / deleteSupplierOrder`.

**Verify:**
```bash
grep -rE "^export (async )?function (assignMaster|deletePart|deleteSupplierOrder)" app/actions/
# Expect: zero matches.
grep -rn "assignMaster\|\bdeletePart\b\|deleteSupplierOrder" --include='*.ts' --include='*.tsx' app components
# Expect: zero matches (action sites also gone).
npx tsc --noEmit
npm run build
```

---

### Task 7: Delete `useMyCar` hook

**Objective:** Remove `useMyCar` export from `lib/my-car-store.ts`. Keep `setMyCar` and `MY_CAR_KEY`.
**Dependencies:** Task 2 (Task 2 may have already removed the export if Task 2 inlined it)
**Mapped Scenarios:** None (no consumer)

**Files:**
- Modify: `lib/my-car-store.ts`

**Key Decisions / Notes:**
- Pre-flight: `grep -rn "\buseMyCar\b" --include='*.ts' --include='*.tsx' app components lib` → only the export site, OR zero if Task 2 already dropped it. If Task 2 already dropped it, Task 7 is a no-op and gets noted as "completed by Task 2" in the commit log.
- Keep the underlying `useStore` machinery from `createLocalStorageStore` — `MyCarInit.tsx` does its own one-shot `localStorage.getItem` (doesn't use the hook); other call sites use `setMyCar` only.

**Definition of Done:**
- [ ] `grep -E "^export.*useMyCar" lib/my-car-store.ts` returns zero.
- [ ] `setMyCar` and `MY_CAR_KEY` still exported.
- [ ] `npx tsc --noEmit` exit 0.
- [ ] `npm run build` exit 0.
- [ ] Git: one commit, `chore(my-car): drop unused useMyCar hook` — OR mark "rolled into Task 2 commit" if so.

**Verify:**
```bash
grep -E "^export.*useMyCar" lib/my-car-store.ts
# Expect: zero matches.
grep -rn "\buseMyCar\b" --include='*.ts' --include='*.tsx' app components
# Expect: zero matches.
```

---

### Task 8: Delete `lib/models-data.ts` shim

**Objective:** Delete `lib/models-data.ts`. The audit said two consumers existed (Step1ServiceVehicle, MyCarPicker), but exploration confirmed both have already been migrated to import directly from `@/lib/vehicle-catalog-types`. The shim has zero remaining consumers.
**Dependencies:** None
**Mapped Scenarios:** None

**Files:**
- Delete: `lib/models-data.ts`

**Key Decisions / Notes:**
- Pre-flight: `grep -rn "from.*models-data\|from.*\"@/lib/models-data\"" --include='*.ts' --include='*.tsx' app components lib` MUST return zero. If anything is found, STOP and migrate the consumer in the same commit.
- Build is the safety net. If a dynamic import or generated reference relies on the file, build will fail.

**Definition of Done:**
- [ ] `lib/models-data.ts` does not exist.
- [ ] `grep -rn "models-data" --include='*.ts' --include='*.tsx' app components lib` returns zero.
- [ ] `npx tsc --noEmit` exit 0.
- [ ] `npm run build` exit 0.
- [ ] Git: one commit, `chore(catalog): delete unused lib/models-data.ts shim`.

**Verify:**
```bash
[ ! -f "lib/models-data.ts" ] && echo "OK: gone" || echo "FAIL"
grep -rn "models-data" --include='*.ts' --include='*.tsx' app components lib
# Expect: zero matches.
npm run build
```

---

### Task 9: Regression sweep + browser smoke test

**Objective:** Final verification across all 8 fixes — typecheck, lint, build, run E2E scenarios in a browser.
**Dependencies:** Tasks 1–8
**Mapped Scenarios:** TS-001, TS-002, TS-003, TS-004, TS-005, TS-006

**Files:** None (verification only)

**Key Decisions / Notes:**

1. **Static checks:**
   ```bash
   npx tsc --noEmit
   npm run lint
   npm run build
   ```
   All three MUST exit 0.

2. **Browser smoke test:**
   - Pick the resolved browser tool per `~/.claude/rules/browser-automation.md` (Claude Code Chrome → Chrome DevTools MCP → playwright-cli → agent-browser).
   - Resize to mobile (375×667) — execute TS-001, TS-002, TS-003.
   - Resize to desktop (1280×800) — execute TS-004.
   - Authenticated paths (TS-005 client login, TS-006 client login, TS-002 client login, TS-003 admin login) — use `client@test.ru / admin123` and `admin@geleoteka.ru / admin123` per `geleoteka-project.md`.

3. **Document any deviation** in this plan's `## E2E Results` section (append after the run).

4. **Final commit (only if Task 9 finds and fixes anything):** name it `fix: post-regression cleanup from audit-fixes plan`. If everything passes clean, no commit needed.

**Definition of Done:**
- [ ] `npx tsc --noEmit` exit 0.
- [ ] `npm run lint` exit 0 (zero errors; warnings tolerated).
- [ ] `npm run build` exit 0.
- [ ] All 6 TS scenarios pass.
- [ ] `## E2E Results` table appended to this plan with PASS/KNOWN_ISSUE for each scenario.
- [ ] Git: 0 or 1 commit depending on whether issues surfaced.

**Verify:**
```bash
npx tsc --noEmit && npm run lint && npm run build
# Then run TS-001..TS-006 manually in browser; record results.
```

## E2E Results

Static checks (all green):

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 (7 pre-existing warnings, none in this plan's diff) |
| `npm run build` | exit 0 (Compiled successfully) |
| Goal Verification truths #1–#10 | 10/10 pass via static grep |

Browser scenarios (deferred to user):

| Scenario | Result | Notes |
|----------|--------|-------|
| TS-001 Public mobile menu | DEFERRED | User declined browser-automation permission for localhost. Manual verification recommended. |
| TS-002 Portal cabinet drawer | DEFERRED | same |
| TS-003 Admin mobile drawer | DEFERRED | same |
| TS-004 Admin desktop sidebar | DEFERRED | same |
| TS-005 Cart default-contact prefill | DEFERRED | same |
| TS-006 Booking step-3 prefill | DEFERRED | same |

Browser scenarios are bounded: each is 5 steps in `## E2E Test Scenarios` above. To run them: `PORT=3001 npx next dev --port 3001` (no sudo needed for non-443 port), then walk through each TS-N step manually.

## Open Questions

- **`clsx` + `tailwind-merge` removal in Task 1:** Verified direct-only via `npm ls clsx tailwind-merge` — neither is pulled transitively by `lucide-react` or any other dep. Clean removal expected. If `npm uninstall` surfaces an unforeseen edge case, leave them; cost of leaving is negligible.

- **`<NavDrawer/>` Escape key handling — committed addition (intentional behavior contract):** The original 4 nav components did NOT handle Escape; the new `<NavDrawer/>` does. This is now part of the public contract because TS-001 step 5 asserts it. The change is justified: WAI-ARIA `dialog` pattern requires Escape-to-close, and the previous behavior was an a11y gap rather than a deliberate choice. Implementer should NOT roll back the Escape handler if QA finds it surprising — the test scenario is the source of truth.

### Deferred Ideas

- **Audit findings #6 (Admin form shells) and #7 (Auth + admin-create page chrome)** — Medium-leverage Reuse extractions explicitly excluded from the user's 1–8 list. Carry to a future cycle.
- **Audit's "smaller dups"** (8 patterns: `<ModelSelect/>`, rentals iteration, `useFormAction`, slugify, `<SuccessCard/>`, etc.). Deferred.
- **Internal-only `export type` demotion** (9 entries flagged "(used in module)" by ts-prune). Pure hygiene; defer.
- **Add an audit-regression test:** run jscpd / ts-prune in CI on every PR, fail on regressions to the 5/5 baseline. Probably worth a follow-up plan once these 8 fixes land.
