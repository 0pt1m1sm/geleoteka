# Remaining Findings Implementation Plan

Created: 2026-05-07
Author: aleksandr.spiskov@gmail.com
Status: PENDING
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Close the remaining backlog from the 2026-05-05 audit (findings #6, #7, the worth-it "smaller dups", and internal-type hygiene) plus operational items (CI hook, validator footgun fix, apex-domain investigation).

**Architecture:** Three new `components/shared/` primitives (`SuccessCard`, `NarrowFormPage`), one new `components/admin/` primitive (`AdminFormShell`), one new `lib/` hook (`useFormAction`), one new `lib/slug.ts` helper, type-safety hardening in `lib/local-storage-store.ts`, plus a CI workflow file.

**Tech Stack:** TypeScript strict, React 19, Next.js 16 App Router, GitHub Actions. No new runtime deps.

## Autonomous Decisions

(Auto mode active — questions skipped.)

- **Worktree:** No — work directly on `main`. Per-task commits.
- **`<ModelSelect/>` extraction (was Task 5 in scope):** **Dropped from plan.** Exploration showed the two consumers have incompatible APIs:
  - `components/portal/AddCarForm.tsx:40` is uncontrolled (`name="model"` for server action) and receives `modelNames: string[]` (flat names).
  - `components/booking/Step1ServiceVehicle.tsx:126` is controlled (`value` + `onChange`) and receives `models: VehicleModel[]` (uses `m.slug` for key).
  An extracted primitive supporting both would need a flexible `controlled | uncontrolled` mode + both data shapes — that's more complexity than the 14 lines of duplication saves. Logged as Deferred Idea.
- **Slugify location:** New `lib/slug.ts` (not `lib/utils.ts`) — `utils.ts` is already a grab-bag; keeping the new helper isolated makes future additions discoverable.
- **`useFormAction` placement:** `lib/use-form-action.ts` (kebab-case, matches `lib/use-accordion-group.ts`).
- **CI hook scope:** GitHub Actions workflow that runs `npx tsc --noEmit`, `npm run lint`, and `npm run verify-vehicle-trims` on every PR. Skip jscpd/ts-prune/madge (whole-codebase tools — too slow for per-PR; leave for scheduled audits). Skip `npm run build` (>2 min on Railway-style cold cache; tsc covers most issues for a per-PR gate).
- **Apex-domain investigation:** investigation only. If Railway domain config is correct (DNS just unreachable from sandbox), document in Operational pending and close. If genuinely misconfigured, surface for the user to fix (no code change in this plan).
- **Validator footgun fix:** convert `validator?: (parsed: unknown) => T | null` → `validator?: (parsed: unknown) => { ok: T } | null`. Migrate the one consumer (`my-car-store`). Document the breaking change in the helper docstring.
- **Internal-type demotion:** hand-verify each of the 9 audit-flagged entries against current grep before demoting. Some have been re-exported indirectly (e.g. `AdminNavGroup` is imported from `lib/admin-nav.ts` by both AdminSidebar AND AdminMobileNav — must stay exported).

## Scope

### In Scope

1. **Audit finding #6** — `<AdminFormShell title action error>{children}</AdminFormShell>` extraction; consume in `PartForm`, `PartEditForm`, `RentalEditForm`, `SupplierEditForm`.
2. **Audit finding #7** — `<NarrowFormPage title description?>{children}</NarrowFormPage>` extraction for the 3 PUBLIC auth pages (`login`, `register`, `reset-password/confirm`). The admin `suppliers/new` page is NOT included here — verified during spec-review that it uses `<div className="max-w-lg">` with no logo/no min-h-screen centering (admin sidebar layout already wraps it). Folded into Task 6 (`<AdminFormShell/>`) instead, since it shares the admin form chrome (error banner + page-level `<h1>`).
3. **Slugify helper** — extract `app/actions/parts.ts:8-22` ↔ `app/api/parts/import/route.ts:5-15` (currently identical) into `lib/slug.ts`.
4. **`<SuccessCard/>` primitive** — extract from `components/booking/Step3ContactConfirm.tsx:67-77` and `components/parts/PartsCart.tsx:91-101`.
5. **`useFormAction` hook** — extract `useTransition` + try/catch error-banner pattern from `components/admin/GenerationManager.tsx:50-120` (used 3× in that file) and `components/admin/ModelEditForm.tsx:30-105`.
6. **`createLocalStorageStore` validator type-safety fix** — change validator signature to `(parsed: unknown) => { ok: T } | null`; migrate `my-car-store.ts`.
7. **9 internal-type demotions** — `AdminNavLink`, `AdminNavEntry`, `JWTPayload`, `SessionUser`, `MyCar`, `YandexReviewsData`, `YANDEX_ORG_ID`, `VehicleModel` (re-export — verify), `BookingData`. Hand-verify each.
8. **CI hook** — `.github/workflows/verify.yml` running `tsc --noEmit` + `lint` + `verify-vehicle-trims` on every PR.
9. **Apex-domain investigation** — `geleoteka.ru` DNS check + Railway dashboard verification. Document in `docs/sessions/` or update Operational pending list.
10. **Regression sweep** — `tsc` + `lint` + `build` + browser smoke-test of NarrowFormPage pages on prod after deploy.

### Out of Scope

- **`<ModelSelect/>` extraction** — incompatible APIs between the two consumers; not worth the abstraction cost. Logged in Deferred Ideas.
- **Rentals page self-similar feature blocks** (`app/(public)/rentals/[id]/page.tsx:185-218,305-349`) — bigger refactor; future spec.
- **`app/actions/rentals.ts` self-duplication** (12 lines internal) — minor, bundle into a future rentals refactor.
- **Russian-market trim cross-check** (`mercedes-benz.ru`) — defer until customer-reported gaps.
- **L-EWB / long-wheelbase variants** — same.
- **`DIESEL_HYBRID` enum** — defer; no UX driver.
- **Yandex Maps API key, max.ru, Telegram, WhatsApp** placeholders — non-dev tasks.
- **Prod DB credential rotation** — non-dev task.
- **AMG hybrid naming pre-research** — handle when adding more hybrids.
- **jscpd / ts-prune / madge in CI** — too slow per-PR. Schedule as a periodic audit (manual today).

## Approach

**Chosen:** Sequential tasks 1 → 10, ordered low-risk → blast-radius. Each task ships its own commit; static gate (tsc + lint) between every task.

**Why:** Same shape as the prior audit-fixes plan (which landed cleanly in 11 commits). Each task is independent, independently revertable. Cost: 10 commits + 1 regression task instead of 1 mega-commit, ~15 min overhead.

**Alternatives considered:**

- *Bundle Tasks 6 + 7 (validator fix + type demotion) into one "type hygiene" commit:* They're unrelated; one is a behavior contract (validator), the other is pure visibility (`export type → type`). Mixing makes the diff harder to read.
- *Mega-commit:* 12-file diff covering 10 unrelated concerns is unreviewable.

## Context for Implementer

### Patterns to follow

- **Slot-based primitives:** `components/shared/NavDrawer.tsx` (recently extracted) is the template — owns chrome, exposes `header` / `children` / `footer` slots. New `<SuccessCard/>`, `<NarrowFormPage/>`, `<AdminFormShell/>` follow the same shape.
- **`useActionState` pattern:** `app/(public)/login/page.tsx:8` is the canonical site. `[state, formAction, isPending] = useActionState(action, null);` — `state.error` shown in error banner, `formAction` passed to `<form action={...}>`.
- **`useTransition` pattern:** `components/admin/GenerationManager.tsx:50-120` — `[pending, startTransition]` + nested async fn that wraps server action call + `router.refresh()`. The hook should encapsulate this AND the try/catch error-state plumbing.
- **CI workflow style:** `.github/workflows/` is currently empty; new file should mirror Next.js conventions (`actions/checkout@v4`, `actions/setup-node@v4` with `cache: npm`).

### Conventions

- **Imports:** kebab-case files (`lib/slug.ts`, `lib/use-form-action.ts`); PascalCase components (`AdminFormShell.tsx`).
- **Strict types:** explicit return types on exports. No `any`.
- **`"use client"`** at the top of any file using hooks or DOM. New hooks (`use-form-action.ts`) need it.
- **Russian UI strings stay in components**; lib stays in English/ASCII.

### Key files (read these before each task)

| Task | File | Lines | Purpose |
|------|------|-------|---------|
| 1 | `app/actions/parts.ts` | 165 | slugify duplicate site #1 |
| 1 | `app/api/parts/import/route.ts` | ~140 | slugify duplicate site #2 |
| 2 | `components/booking/Step3ContactConfirm.tsx` | 89 | SuccessCard duplicate site #1 |
| 2 | `components/parts/PartsCart.tsx` | 168 | SuccessCard duplicate site #2 |
| 3 | `components/admin/GenerationManager.tsx` | 244 | `useTransition` user (3 sites in one file) |
| 3 | `components/admin/ModelEditForm.tsx` | ~120 | `useTransition` user (2 sites) |
| 4 | `lib/local-storage-store.ts` | 132 | validator type to harden |
| 4 | `lib/my-car-store.ts` | 31 | sole consumer to migrate |
| 5 | `app/(public)/login/page.tsx` | 56 | NarrowFormPage consumer #1 |
| 5 | `app/(public)/register/page.tsx` | ~70 | consumer #2 |
| 5 | `app/(public)/reset-password/confirm/page.tsx` | ~60 | consumer #3 |
| 5 | `app/(admin)/admin/suppliers/new/page.tsx` | ~50 | consumer #4 |
| 6 | `components/admin/PartForm.tsx` | ~120 | AdminFormShell consumer #1 |
| 6 | `components/admin/PartEditForm.tsx` | ~140 | consumer #2 |
| 6 | `components/admin/RentalEditForm.tsx` | ~180 | consumer #3 |
| 6 | `components/admin/SupplierEditForm.tsx` | ~80 | consumer #4 |
| 7 | `lib/admin-nav.ts:15,28` | — | `AdminNavLink` / `AdminNavEntry` candidates |
| 7 | `lib/auth.ts:9,14` | — | `JWTPayload` / `SessionUser` candidates |
| 7 | `lib/my-car-store.ts:5` | — | `MyCar` candidate |
| 7 | `lib/yandex-reviews.ts:10` | — | `YandexReviewsData` candidate |
| 7 | `lib/yandex.ts:2` | — | `YANDEX_ORG_ID` candidate |
| 7 | `lib/vehicle-catalog.ts:6` | — | `VehicleModel` re-export — VERIFY before demoting |
| 7 | `components/booking/BookingProvider.tsx:11` | — | `BookingData` candidate |
| 8 | `.github/workflows/` | — | empty today; new `verify.yml` lives here |

### Gotchas

- **`useActionState` initial state shape varies:** `loginAction` uses `null`-or-`{error: string}`; the existing forms each have their own initial-state shape. `<AdminFormShell action={...} error={...}>` MUST accept the error string as a prop the consumer reads from its own `state` — it does NOT own the `useActionState` call. The consumer keeps `useActionState` in its body and passes `state?.error` into the shell's `error` prop. This avoids forcing all consumers onto a single state shape.
- **`useFormAction` hook return shape:** must match the existing call sites' usage. Today: `[pending, startTransition]` + manual try/catch + setError. Proposed: `const { pending, error, runAction, setError } = useFormAction()` where `runAction(async () => { await someAction(...) })` wraps `startTransition` + try/catch + `router.refresh()` automatically. Do NOT auto-call `router.refresh()` — leave that to the consumer (some sites need it, others don't).
- **Validator type-safety migration:** ALL existing validator implementations must update. There is currently ONE: `validateMyCar` in `lib/my-car-store.ts:13-22`. It returns `MyCar | null`. After the change, it must return `{ ok: MyCar } | null`. The wrapper at line 27 (`(parsed) => parsed === null ? null : validateMyCar(parsed)`) also updates — `null` short-circuit becomes... still `null` (legitimate self-heal trigger), or `{ ok: null }` if `T` is `MyCar | null` and we want to preserve the legitimate `null`. Decision: preserve legitimate `null` via `{ ok: null }`. The factory's "validator returned null = self-heal" sentinel is now unambiguous.
- **`VehicleModel` re-export demotion:** `lib/vehicle-catalog.ts:6` re-exports types from `vehicle-catalog-types`. ts-prune flagged `VehicleModel` as `(used in module)` because the re-exporter doesn't see external consumers, but the type IS imported by `Step1ServiceVehicle.tsx:6` and `MyCarPicker.tsx:8`. **Don't demote it.** Verify via `grep -rn "import.*VehicleModel" components` before touching.
- **Internal-only types in `BookingProvider.tsx`:** `BookingData` is exported and used by `Step1ServiceVehicle.tsx` (which imports `useBooking()` and reads `data.model` etc.). It's used externally — **don't demote**. Verify via grep.
- **CI hook port collisions:** GitHub Actions runners don't have port 443 conflicts (no sudo, no Postgres on host). The existing `verify-vehicle-trims` script uses `DATABASE_URL` env var — CI must provide a stub or skip the script. Decision: in CI, skip `verify-vehicle-trims` (the script needs a real DB). Run only `tsc --noEmit` + `lint`. Mention `verify-vehicle-trims` in CI as a manual-run guidance comment.

### Domain context

The audit baseline (2026-05-05) flagged 10 ranked findings + ~8 smaller dups. The 2026-05-07 audit-fixes plan closed 8 (the High-leverage finds + the medium ones the user picked). This plan closes the remaining 2 ranked findings (#6, #7) + 4 worth-it smaller dups + 4 operational items. After this plan, the 2026-05-05 audit is fully retired; the next audit cycle should generate a fresh dated snapshot.

## Runtime Environment

- **Dev:** `npm run dev` (port 443, HTTPS, sudo). For browser smoke without sudo: `PORT=3001 npx next dev --port 3001`.
- **Build:** `npm run build`.
- **Lint:** `npm run lint`.
- **Typecheck:** `npx tsc --noEmit`.
- **CI environment (post-Task 8):** GitHub Actions, Ubuntu runner, Node 22 (matches package.json engines if set; otherwise actions/setup-node@v4 default).
- **No tests:** project has no test suite; verification is via static checks + browser smoke on prod.

## File Structure

- `lib/slug.ts` (create) — `slugify(text: string): string` pure helper. ~12 lines.
- `lib/use-form-action.ts` (create) — `useFormAction()` hook returning `{ pending, error, runAction, setError }`. ~30 lines.
- `components/shared/SuccessCard.tsx` (create) — slot-based success card with checkmark icon. ~40 lines.
- `components/shared/NarrowFormPage.tsx` (create) — auth/admin-create page layout. ~30 lines.
- `components/admin/AdminFormShell.tsx` (create) — admin form scaffold. ~25 lines.
- `.github/workflows/verify.yml` (create) — CI typecheck + lint workflow. ~30 lines.
- `lib/local-storage-store.ts` (modify) — change validator return type to `{ ok: T } | null`.
- `lib/my-car-store.ts` (modify) — migrate validator.
- `lib/admin-nav.ts` (modify) — demote `AdminNavLink` (verify) per Task 7.
- `lib/auth.ts` (modify) — demote `JWTPayload`, `SessionUser` per Task 7.
- `lib/yandex-reviews.ts` (modify) — demote `YandexReviewsData` per Task 7.
- `lib/yandex.ts` (modify) — demote `YANDEX_ORG_ID` per Task 7.
- `app/actions/parts.ts` (modify) — drop local slugify, import from `lib/slug.ts`.
- `app/api/parts/import/route.ts` (modify) — same.
- `components/booking/Step3ContactConfirm.tsx` (modify) — consume `<SuccessCard/>`.
- `components/parts/PartsCart.tsx` (modify) — consume `<SuccessCard/>`.
- `components/admin/GenerationManager.tsx` (modify) — consume `useFormAction`.
- `components/admin/ModelEditForm.tsx` (modify) — same.
- `app/(public)/login/page.tsx` (modify) — consume `<NarrowFormPage/>`.
- `app/(public)/register/page.tsx` (modify) — same.
- `app/(public)/reset-password/confirm/page.tsx` (modify) — same.
- `app/(admin)/admin/suppliers/new/page.tsx` (modify) — same.
- `components/admin/PartForm.tsx` (modify) — consume `<AdminFormShell/>`.
- `components/admin/PartEditForm.tsx` (modify) — same.
- `components/admin/RentalEditForm.tsx` (modify) — same.
- `components/admin/SupplierEditForm.tsx` (modify) — same.

## Assumptions

- **slugify functions are byte-identical at the two duplicate sites** — supported by reading the source: both define `function slugify(text: string): string` with the same Cyrillic transliteration map and same trailing logic. Task 1 depends on this.
- **`useFormAction` hook can express both consumer patterns** — supported by reading the two files: both wrap `startTransition` around an async fn that calls a server action, then either calls `router.refresh()` or sets local error state. The hook leaves `router.refresh()` to the consumer. Task 3 depends on this.
- **`<NarrowFormPage/>` doesn't need to handle the form action** — supported by reading login/register/reset-password pages: each owns its `useActionState`. The shell only owns the wrapper layout. Task 5 depends on this.
- **`<AdminFormShell/>` accepts arbitrary `useActionState` shape via prop** — same. Task 6 depends on this.
- **All 4 admin form components use `useActionState(action, null)`** — verified for `PartForm.tsx:16`, `RentalEditForm.tsx:30`, and `login/page.tsx:8`. Task 5 + 6 depend on this initial-state-is-null convention. The shell does NOT enforce a particular state shape; it accepts `error?: string | null`.
- **`VehicleModel` and `BookingData` are externally consumed** — verified by grep during exploration. Task 7 must NOT demote these.
- **GitHub Actions runner has access to npm registry + Node 22** — supported by GitHub's hosted runner defaults. Task 8 depends.
- **No existing `.github/workflows/` files** — verified empty. Task 8 creates the first workflow.
- **`geleoteka.ru` DNS resolution** — sandbox (`curl` from Bash tool) returned HTTP 000 = ENOTFOUND last verify run. Could be sandbox network restriction (not a real DNS issue). Task 9 verifies via Railway dashboard + an external network if accessible.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `useFormAction` extraction breaks one of the existing call sites (subtle behavior change) | Medium | High | After extraction: tsc + manual click-through of `/admin/models` (GenerationManager.tsx) to add a generation, edit a model, delete a model. Each exercise covers `useTransition` flows in the two consumer files. |
| `<NarrowFormPage/>` migration breaks login flow on prod | Low | High | Browser smoke (Task 10) covers `/login` end-to-end after deploy. Static verification: each page imports the new component, removes its local layout markup verbatim, builds clean. |
| `<AdminFormShell/>` wrapping breaks form submission | Low | High | Same mitigation — each consumer keeps its own `useActionState` and the shell wraps the existing `<form>` markup unchanged. Shell only adds the title row + error banner; the form's `action`, fields, and submit button move to children unchanged. |
| Validator type change breaks `my-car-store` self-heal behavior | Low | Medium | Direct migration; both old and new validators run the same shape check. Smoke: open `/parts`, save a car, reload, confirm picker re-loads. |
| Demoting an internal type that's actually consumed externally breaks build | Low | Low | Build catches it loudly. Hand-verify each via grep BEFORE demoting. |
| CI workflow false-positives (lint warnings flip to errors on Ubuntu) | Low | Low | Workflow runs identical commands to local; if local exits 0, CI does. If a lint rule triggers only on certain platforms, it'd already fail locally. |
| Apex-domain check finds genuine DNS misconfig | Low | Low | Document in Operational pending; user fixes on Railway dashboard. No code change needed. |
| Slugify extraction: existing call sites import order broken | Low | Low | Both call sites use the helper at function scope; extracting to a top-level import is mechanical. tsc catches any miss. |
| jscpd post-refactor still flags the same regions because primitives reuse markup | Medium | Low | Acceptable — slot-based primitives intentionally let consumers compose. Future audit may re-flag header markup; that becomes a `<NavDrawerBrandHeader>`-style sub-extraction at that point, not now. |

## Goal Verification

### Truths

1. `lib/slug.ts` exists and exports `slugify(text: string): string`. `app/actions/parts.ts` and `app/api/parts/import/route.ts` both import it; neither contains a local `function slugify` definition. Verifiable: `grep -E "^function slugify" app/actions/parts.ts app/api/parts/import/route.ts` returns zero.
2. `<SuccessCard/>` exists in `components/shared/`. Both `Step3ContactConfirm.tsx` and `PartsCart.tsx` import it; neither contains the inline `bg-[var(--color-success-bg)]` checkmark markup. Verifiable: `grep -l "SuccessCard" components/booking/Step3ContactConfirm.tsx components/parts/PartsCart.tsx` returns both files.
3. `useFormAction` hook in `lib/use-form-action.ts` is consumed by `GenerationManager.tsx` and `ModelEditForm.tsx`. Verifiable: `grep -l "useFormAction" components/admin/GenerationManager.tsx components/admin/ModelEditForm.tsx` returns both files; each has fewer `startTransition` callsites in its body than before (down from 5 to 0 across the two files).
4. `createLocalStorageStore` validator signature is `(parsed: unknown) => { ok: T } | null`. The wrapper at `lib/my-car-store.ts` returns `{ ok: MyCar | null } | null`: legitimate stored `null` wraps to `{ ok: null }` (preserved as a value), invalid shapes return `null` (self-heal trigger), valid `MyCar` shapes wrap to `{ ok: <validated MyCar> }`. The factory's `if (result == null)` check (note `==`, not `===`) defends against a future buggy validator returning `undefined`. Verifiable: `grep -E "validator: \(parsed: unknown\) =>" lib/local-storage-store.ts` shows the new return type; `grep "{ ok: null }" lib/my-car-store.ts` finds the legitimate-null wrapper.
5. `<NarrowFormPage/>` exists in `components/shared/`. All 4 consumer pages (`login`, `register`, `reset-password/confirm`, `admin/suppliers/new`) import it. Verifiable: `grep -l "NarrowFormPage" app/(public)/login/page.tsx app/(public)/register/page.tsx app/(public)/reset-password/confirm/page.tsx app/(admin)/admin/suppliers/new/page.tsx` returns all 4 files.
6. `<AdminFormShell/>` exists in `components/admin/`. All 4 consumer forms (`PartForm`, `PartEditForm`, `RentalEditForm`, `SupplierEditForm`) import it. Verifiable: `grep -l "AdminFormShell" components/admin/PartForm.tsx components/admin/PartEditForm.tsx components/admin/RentalEditForm.tsx components/admin/SupplierEditForm.tsx` returns all 4 files.
7. ts-prune internal-type entries are demoted per Task 7's per-entry decisions: at minimum `JWTPayload`, `SessionUser`, `YANDEX_ORG_ID` (and `AdminNavLink` if grep-zero) no longer have `^export` prefix. The kept-exported entries (`AdminNavEntry`, `MyCar`, `YandexReviewsData`, `VehicleModel`, `BookingData`) still have `export` because they leak via exported function signatures or have direct external consumers. Verifiable: `grep -E "^export (interface|type|const) (JWTPayload|SessionUser|YANDEX_ORG_ID)" lib/` returns zero; `grep -E "^export (interface|type|const) (AdminNavEntry|VehicleModel|BookingData)\b" lib/ components/` returns three matches.
8. `.github/workflows/verify.yml` exists and runs `npx tsc --noEmit` + `npm run lint` on `pull_request`. Verifiable: file exists and triggers on push to a test branch.
9. Apex-domain status is documented in the plan's `## Open Questions` (or `Operational pending`) — either confirmed-OK with note about sandbox limitation, OR flagged as misconfig with specific Railway action item.
10. `npx tsc --noEmit` exit 0 after every task and at the end.
11. `npm run lint` exit 0 after every task and at the end.
12. `npm run build` exit 0 at the end.
13. Manual browser verify (Task 10) confirms login + register + admin/suppliers/new + admin/parts/new pages render and submit forms correctly post-`<NarrowFormPage/>`/`<AdminFormShell/>` migration.

### Artifacts

- 6 new files: `lib/slug.ts`, `lib/use-form-action.ts`, `components/shared/SuccessCard.tsx`, `components/shared/NarrowFormPage.tsx`, `components/admin/AdminFormShell.tsx`, `.github/workflows/verify.yml`
- ~13 modified files: 4 admin forms, 4 narrow-form pages, 2 admin transition users, 2 success-card consumers, 2 slugify consumers, 1 validator helper, 1 my-car-store, several `lib/` type-demotion files
- 10 commits in `main` (one per task) + 1 regression commit if needed

## E2E Test Scenarios

Runtime profile: **Full** (UI changes — auth pages, admin forms, success cards). 4 scenarios.

### TS-001: Login page after `<NarrowFormPage/>` migration

**Priority:** Critical
**Preconditions:** None (anonymous visitor)
**Mapped Tasks:** Task 5

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `https://geleoteka.ru/login` (or Railway URL) | Page renders with "Geleoteka" logo, "Вход в личный кабинет" heading, "Ещё нет аккаунта?" text + "Зарегистрироваться" link, email + password fields, "Войти" button |
| 2 | Enter `admin@geleoteka.ru` / `admin123`, click Войти | Redirects to `/admin` with admin dashboard visible |
| 3 | Log out; navigate to `/login` again; submit empty form | Form shows error message in error banner above the fields |

### TS-002: Admin part form after `<AdminFormShell/>` migration

**Priority:** Critical
**Preconditions:** Logged in as admin
**Mapped Tasks:** Task 6

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/admin/parts/new` | Form renders with title "Новая запчасть" (or whatever the consumer passes), all fields visible (article, category, name, description, price, etc.) |
| 2 | Fill required fields with valid data, submit | Redirects to `/admin/parts` with the new part visible in the list |
| 3 | Submit form with empty article field | Server-action error banner appears at top of form (`state.error` rendered by `<AdminFormShell/>`) |

### TS-003: Booking success card after `<SuccessCard/>` migration

**Priority:** High
**Preconditions:** Booking step 1+2 complete with valid data; admin@geleoteka.ru logged in
**Mapped Tasks:** Task 2

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/booking/step-3` | Contact form renders |
| 2 | Submit form with valid contact data | Success card replaces the form: green checkmark icon in circle, "Заявка отправлена!" (or current copy) heading, CTA buttons. Layout matches the previous design. |

### TS-004: Admin model edit (`useFormAction` migration)

**Priority:** High
**Preconditions:** Logged in as admin
**Mapped Tasks:** Task 3

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/admin/models` | Models list visible |
| 2 | Click an existing model (e.g., G-Class) → edit page | Edit form renders with current values |
| 3 | Change description, click "Сохранить" | Page refreshes (router.refresh) and shows updated description; no error banner |
| 4 | Click "Добавить поколение" with valid year+code | New generation appears in the list without full reload (transition pending state visible momentarily) |

## Progress Tracking

- [x] Task 1: Slugify helper extraction (`lib/slug.ts`)
- [x] Task 2: `<SuccessCard/>` primitive
- [x] Task 3: `useFormAction` hook
- [x] Task 4: `createLocalStorageStore` validator type-safety fix
- [x] Task 5: `<NarrowFormPage/>` primitive
- [x] Task 6: `<AdminFormShell/>` primitive
- [x] Task 7: ts-prune internal-type demotion (hand-verified — demoted 4, kept 6 exported)
- [x] Task 8: GitHub Actions CI workflow
- [ ] Task 9: Apex-domain DNS investigation
- [ ] Task 10: Regression sweep + browser smoke test (TS-001..TS-004 on prod)

**Total Tasks:** 10 | **Completed:** 0 | **Remaining:** 10

## Implementation Tasks

### Task 1: Slugify helper extraction

**Objective:** Extract the byte-identical `slugify` function from `app/actions/parts.ts:8-22` and `app/api/parts/import/route.ts:5-15` into `lib/slug.ts`. Both call sites import from the new location.
**Dependencies:** None
**Mapped Scenarios:** None (pure refactor; no UI/behavior change)

**Files:**
- Create: `lib/slug.ts`
- Modify: `app/actions/parts.ts`
- Modify: `app/api/parts/import/route.ts`

**Key Decisions / Notes:**
- Read both source sites and confirm byte-identical behavior FIRST. If any subtle difference exists (e.g., one uppercases differently or strips a different char set), reconcile before extracting.
- The new `lib/slug.ts` file:
  ```ts
  /**
   * Convert text to URL-safe slug. Handles Cyrillic transliteration; strips
   * non-alphanumerics; collapses whitespace and dashes.
   */
  export function slugify(text: string): string { ... }
  ```
  Body copied verbatim from one of the two source sites (they're identical).
- Both consumers: drop the local `function slugify` declaration; add `import { slugify } from "@/lib/slug";` at the top.

**Definition of Done:**
- [ ] `lib/slug.ts` exists with `export function slugify`.
- [ ] `grep -E "^function slugify" app/actions/parts.ts app/api/parts/import/route.ts` returns zero matches.
- [ ] Both consumers have `import { slugify } from "@/lib/slug";` at the top.
- [ ] `npx tsc --noEmit` exit 0.
- [ ] `npm run lint` exit 0.
- [ ] `npm run build` exit 0.
- [ ] Git: one commit, `refactor(slug): extract slugify helper into lib/slug.ts`.

**Verify:**
```bash
grep -E "^function slugify" app/actions/parts.ts app/api/parts/import/route.ts && exit 1 || echo OK
grep -l "from \"@/lib/slug\"" app/actions/parts.ts app/api/parts/import/route.ts
npx tsc --noEmit
```

---

### Task 2: `<SuccessCard/>` primitive

**Objective:** Extract the success-state SVG checkmark + card wrapper used after booking submit (`Step3ContactConfirm.tsx:67-77`) and cart submit (`PartsCart.tsx:91-101`). New `<SuccessCard heading message? cta?>` slot in `components/shared/`.
**Dependencies:** None (independent of Task 1)
**Mapped Scenarios:** TS-003

**Files:**
- Create: `components/shared/SuccessCard.tsx`
- Modify: `components/booking/Step3ContactConfirm.tsx`
- Modify: `components/parts/PartsCart.tsx`

**Key Decisions / Notes:**
- API:
  ```tsx
  interface SuccessCardProps {
    heading: string;
    message?: string;      // optional muted text below heading
    children?: ReactNode;  // CTA buttons
  }
  export function SuccessCard({ heading, message, children }: SuccessCardProps): React.ReactElement { ... }
  ```
- Markup template (copy from one of the existing sites — they're structurally identical):
  ```tsx
  <div className="card text-center py-12">
    <div className="w-16 h-16 rounded-full bg-[var(--color-success-bg)] mx-auto mb-6 flex items-center justify-center">
      <svg className="w-8 h-8 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
    <h2 className="text-display text-2xl font-bold mb-2">{heading}</h2>
    {message && <p className="text-[var(--foreground-muted)] mb-6">{message}</p>}
    {children && <div className="flex gap-4 justify-center">{children}</div>}
  </div>
  ```
- `Step3ContactConfirm.tsx`: replace lines 67-77 (or whatever the success block is) with `<SuccessCard heading="Заявка отправлена!" message="...">...</SuccessCard>`.
- `PartsCart.tsx`: same replacement.

**Definition of Done:**
- [ ] `components/shared/SuccessCard.tsx` exists.
- [ ] `grep -l "SuccessCard" components/booking/Step3ContactConfirm.tsx components/parts/PartsCart.tsx` returns both files.
- [ ] Neither consumer file contains the verbatim `bg-[var(--color-success-bg)]` checkmark markup any more (`grep -c "bg-\[var(--color-success-bg)\]" components/booking/Step3ContactConfirm.tsx components/parts/PartsCart.tsx` returns 0 for both).
- [ ] `npx tsc --noEmit` exit 0.
- [ ] `npm run lint` exit 0.
- [ ] `npm run build` exit 0.
- [ ] Git: one commit, `refactor(ui): extract <SuccessCard/> primitive`.

**Verify:**
```bash
test -f components/shared/SuccessCard.tsx
grep -c "bg-\[var(--color-success-bg)\]" components/booking/Step3ContactConfirm.tsx components/parts/PartsCart.tsx
# Expect: 0 in each.
```

---

### Task 3: `useFormAction` hook

**Objective:** Extract the `useTransition` + try/catch + setError pattern from `components/admin/GenerationManager.tsx` (3 use sites in one file) and `components/admin/ModelEditForm.tsx` (2 sites). New `lib/use-form-action.ts`.
**Dependencies:** None (sequenced after Task 2 for review clarity, not functionally dependent)
**Mapped Scenarios:** TS-004

**Files:**
- Create: `lib/use-form-action.ts`
- Modify: `components/admin/GenerationManager.tsx`
- Modify: `components/admin/ModelEditForm.tsx`

**Key Decisions / Notes:**
- API:
  ```tsx
  "use client";
  import { useCallback, useState, useTransition } from "react";

  export interface FormActionState {
    /** True while the action is running. */
    pending: boolean;
    /** Last error message, or null. Cleared at the start of every runAction(). */
    error: string | null;
    /** Manually set/clear the error. Use OUTSIDE runAction for synchronous
     *  validation errors that should bail before the transition starts. */
    setError: (e: string | null) => void;
    /** Run an async fn inside startTransition; catch errors into `error` state.
     *  Clears `error` BEFORE running the fn — do NOT call `setError(...)` then
     *  immediately call `runAction(...)`; the runAction-internal `setError(null)`
     *  will erase the synchronous error. Pattern: validate-and-bail BEFORE
     *  runAction, OR set error inside the runAction body. */
    runAction: (fn: () => Promise<void>) => void;
  }

  export function useFormAction(): FormActionState {
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const runAction = useCallback((fn: () => Promise<void>): void => {
      startTransition(async () => {
        setError(null);
        try {
          await fn();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Ошибка");
        }
      });
    }, []);

    return { pending, error, setError, runAction };
  }
  ```
- **Migration pattern (CRITICAL):** synchronous validation errors MUST be set with `setError("...")` followed by `return` BEFORE calling `runAction(...)`. The hook's `runAction` calls `setError(null)` at the start of the transition; if you call `setError("validation error")` and then `runAction(...)` without returning early, the validation error gets erased. The two existing call sites (GenerationManager.handleAdd, ModelEditForm.submit) already follow this pattern correctly — preserve it during migration.
- `runAction` is memoized with `useCallback` (matches the codebase's React 19 hook hygiene pattern in `BookingProvider.tsx:59`).
- `GenerationManager.tsx` migration:
  - Drop `const [pending, startTransition] = useTransition();` (line 50).
  - Drop `const [error, setError] = useState<string | null>(null);` (line 51).
  - Add `const { pending, error, setError, runAction } = useFormAction();` at top of body.
  - Replace each `startTransition(async () => { try { ... } catch (e) { setError(...) } });` block with `runAction(async () => { ... });`. Three sites in this file.
- `ModelEditForm.tsx`: same migration, two sites.
- Existing `setError` callsites (manual error setting outside try/catch — e.g., validation errors) keep working unchanged because `setError` is still returned.

**Definition of Done:**
- [ ] `lib/use-form-action.ts` exists.
- [ ] `grep -l "useFormAction" components/admin/GenerationManager.tsx components/admin/ModelEditForm.tsx` returns both files.
- [ ] `grep -c "startTransition" components/admin/GenerationManager.tsx components/admin/ModelEditForm.tsx` returns 0 in each.
- [ ] `npx tsc --noEmit` exit 0.
- [ ] `npm run lint` exit 0.
- [ ] `npm run build` exit 0.
- [ ] Manual: open `/admin/models/<id>`, edit a generation row, save → succeeds without console errors.
- [ ] Git: one commit, `refactor(admin): extract useFormAction hook`.

**Verify:**
```bash
test -f lib/use-form-action.ts
grep -c "startTransition" components/admin/GenerationManager.tsx components/admin/ModelEditForm.tsx
# Expect: 0 in each.
npx tsc --noEmit
```

---

### Task 4: `createLocalStorageStore` validator type-safety fix

**Objective:** Change `validator` signature from `(parsed: unknown) => T | null` to `(parsed: unknown) => { ok: T } | null`. The `null` return now unambiguously means "self-heal"; `{ ok: T }` carries the validated value (T may itself include null without ambiguity).
**Dependencies:** None (sequenced after Task 3 for review clarity, not functionally dependent)
**Mapped Scenarios:** None (type-only behavior preservation)

**Files:**
- Modify: `lib/local-storage-store.ts`
- Modify: `lib/my-car-store.ts`

**Key Decisions / Notes:**
- New signature in `lib/local-storage-store.ts`:
  ```ts
  validator?: (parsed: unknown) => { ok: T } | null
  ```
- New behavior in `readFromStorage` (uses `== null` to defend against accidental `undefined` returns from a future buggy validator):
  ```ts
  if (validator) {
    const result = validator(parsed);
    if (result == null) {
      // Self-heal: bad shape OR validator misbehaved → clear and return initial.
      try { localStorage.removeItem(key); } catch {}
      cachedRaw = null;
      cachedValue = initial;
      return cachedValue;
    }
    cachedValue = result.ok;
  } else {
    cachedValue = parsed as T;
  }
  ```
- Update the docstring "Validator gotcha" block to reflect the new contract: validator returns `{ ok: T }` for valid (any T including null); `null` for self-heal.
- `lib/my-car-store.ts` migration:
  ```ts
  function validateMyCar(parsed: unknown): { ok: MyCar } | null {
    if (parsed === null || typeof parsed !== "object") return null;
    const obj = parsed as { model?: unknown; generation?: unknown; trim?: unknown };
    if (typeof obj.model !== "string" || typeof obj.generation !== "string") return null;
    return {
      ok: {
        model: obj.model,
        generation: obj.generation,
        trim: typeof obj.trim === "string" && obj.trim.length > 0 ? obj.trim : undefined,
      },
    };
  }

  const store = createLocalStorageStore<MyCar | null>(
    "geleoteka:my-car",
    null,
    (parsed) => parsed === null ? { ok: null } : validateMyCar(parsed),
  );
  ```
  Key change: legitimate `null` (when user has cleared their car) wraps as `{ ok: null }` instead of unwrapping `null` (which would self-heal incorrectly).

**Definition of Done:**
- [ ] `grep -E "validator: \(parsed: unknown\) => \{ ok: T \} \| null" lib/local-storage-store.ts` matches the new signature.
- [ ] `lib/my-car-store.ts` validator returns `{ ok: MyCar } | null`; the wrapper at the factory call site returns `{ ok: null }` for legitimate null.
- [ ] Manual: visit `/parts`, save a car, reload — picker shows the saved car. Click "Показать все запчасти" to clear, reload — saved-car indicator is gone (legitimate null preserved).
- [ ] `npx tsc --noEmit` exit 0.
- [ ] `npm run lint` exit 0.
- [ ] `npm run build` exit 0.
- [ ] Git: one commit, `refactor(stores): harden validator return type — { ok: T } | null sentinel`.

**Verify:**
```bash
grep "validator?: (parsed: unknown) => { ok: T } | null" lib/local-storage-store.ts
grep "{ ok: null }" lib/my-car-store.ts
npx tsc --noEmit
```

---

### Task 5: `<NarrowFormPage/>` primitive

**Objective:** Extract the narrow card-with-title-and-form layout from the 3 PUBLIC auth pages. New `components/shared/NarrowFormPage.tsx`. The admin `suppliers/new` page is NOT migrated by this task — it uses a different layout (`max-w-lg` inside an admin sidebar) and is handled by Task 6's `<AdminFormShell/>` instead.
**Dependencies:** None (sequenced after Task 4 for review clarity, not functionally dependent)
**Mapped Scenarios:** TS-001

**Files:**
- Create: `components/shared/NarrowFormPage.tsx`
- Modify: `app/(public)/login/page.tsx`
- Modify: `app/(public)/register/page.tsx`
- Modify: `app/(public)/reset-password/confirm/page.tsx`

**Key Decisions / Notes:**
- API:
  ```tsx
  import Link from "next/link";
  import type { ReactNode } from "react";

  interface NarrowFormPageProps {
    /** Page title shown above the form card. */
    title: string;
    /** Optional muted-text caption below the title (e.g., "Already have an account? Log in"). */
    description?: ReactNode;
    /** Form contents — typically a <form> element with fields and submit button. */
    children: ReactNode;
  }

  export function NarrowFormPage({ title, description, children }: NarrowFormPageProps) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link href="/" className="text-display text-2xl font-bold">
              <span className="text-[var(--color-accent)]">Geleoteka</span>
            </Link>
            <h1 className="text-2xl font-bold mt-6 mb-2">{title}</h1>
            {description && <p className="text-[var(--foreground-muted)]">{description}</p>}
          </div>
          {children}
        </div>
      </div>
    );
  }
  ```
- `login/page.tsx` migration:
  - Replace lines 11-23 (the `min-h-screen flex...` wrapper + Geleoteka link + heading + description paragraph) with `<NarrowFormPage title="Вход в личный кабинет" description={<>Ещё нет аккаунта? <Link href="/register">Зарегистрироваться</Link></>}>`.
  - Move the `<form>` (lines 26-52) inside as children.
- `register/page.tsx`, `reset-password/confirm/page.tsx`, `admin/suppliers/new/page.tsx`: same pattern. Each consumer keeps its own `useActionState` and form markup; only the wrapper layout moves.

**Definition of Done:**
- [ ] `components/shared/NarrowFormPage.tsx` exists.
- [ ] `grep -l "NarrowFormPage" app/(public)/login/page.tsx app/(public)/register/page.tsx app/(public)/reset-password/confirm/page.tsx` returns all 3.
- [ ] None of the 3 consumers has the `min-h-screen flex items-center justify-center bg-[var(--background)] px-4` wrapper any more.
- [ ] `npx tsc --noEmit` exit 0.
- [ ] `npm run lint` exit 0.
- [ ] `npm run build` exit 0.
- [ ] Manual: visit `/login`, render check; submit empty form → error banner appears; submit valid creds → redirect works.
- [ ] Git: one commit, `refactor(ui): extract <NarrowFormPage/> primitive (3 public auth pages)`.

**Verify:**
```bash
test -f components/shared/NarrowFormPage.tsx
grep -c "min-h-screen flex items-center" app/(public)/login/page.tsx app/(public)/register/page.tsx app/(public)/reset-password/confirm/page.tsx
# Expect: 0 in each.
```

---

### Task 6: `<AdminFormShell/>` primitive

**Objective:** Extract the `useActionState` error banner pattern from 5 admin form sites. New `components/admin/AdminFormShell.tsx`.
**Dependencies:** None (sequenced after Task 5 for review clarity)
**Mapped Scenarios:** TS-002

**Files:**
- Create: `components/admin/AdminFormShell.tsx`
- Modify: `components/admin/PartForm.tsx`
- Modify: `components/admin/PartEditForm.tsx`
- Modify: `components/admin/RentalEditForm.tsx`
- Modify: `components/admin/SupplierEditForm.tsx`
- Modify: `app/(admin)/admin/suppliers/new/page.tsx` (folded in from Task 5; uses the same admin-form chrome — error banner above `<form>`, no centered layout)

**Key Decisions / Notes:**
- API (NO `title` prop — page-level `<h1>` already exists in each consumer; adding a shell title would render a duplicate heading at different size):
  ```tsx
  import type { ReactNode } from "react";

  interface AdminFormShellProps {
    /** Server-action error from useActionState's state.error. Null = no error shown. */
    error?: string | null;
    /** Form contents — typically <form action={...}>...</form>. */
    children: ReactNode;
  }

  export function AdminFormShell({ error, children }: AdminFormShellProps): React.ReactElement {
    return (
      <>
        {error && (
          <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}
        {children}
      </>
    );
  }
  ```
- The shell does NOT own `useActionState` — each consumer keeps its own. The shell only renders the error banner above the consumer's `<form action={formAction}>...</form>`. Wrapping is `<>...</>` (Fragment) so the consumer's existing layout (e.g., `<form className="card space-y-4">`) is unchanged.
- **Why no title prop:** existing pages already render `<h1 className="text-display text-2xl font-bold mb-6">Добавить запчасть</h1>` (admin/parts/new/page.tsx:23 and similar). Adding a shell `<h2>` would create a duplicate heading at different visual hierarchy. YAGNI for now; if a future consumer needs a shell-owned title, the prop is one line to add.
- `PartForm.tsx` migration: keep `useActionState` at the top; wrap form contents (or the entire `<form>`) in `<AdminFormShell error={state?.error}>`. Drop the inline error-banner JSX block.
- `PartEditForm.tsx`, `RentalEditForm.tsx`, `SupplierEditForm.tsx`: same migration.
- `app/(admin)/admin/suppliers/new/page.tsx`: folded in from Task 5. Drop the inline error banner (lines 15-19); keep the `<div className="max-w-lg">`, `<h1>`, and `<form>` wrapper unchanged. Wrap form contents in `<AdminFormShell error={state?.error}>`.

**Definition of Done:**
- [ ] `components/admin/AdminFormShell.tsx` exists.
- [ ] `grep -l "AdminFormShell" components/admin/PartForm.tsx components/admin/PartEditForm.tsx components/admin/RentalEditForm.tsx components/admin/SupplierEditForm.tsx` returns all 4.
- [ ] None of the 4 consumers contains a verbatim `bg-[var(--color-error-bg)]` block any more.
- [ ] `npx tsc --noEmit` exit 0.
- [ ] `npm run lint` exit 0.
- [ ] `npm run build` exit 0.
- [ ] Manual: visit `/admin/parts/new`, submit empty form → error banner above; submit valid → redirect works.
- [ ] Git: one commit, `refactor(admin): extract <AdminFormShell/> primitive`.

**Verify:**
```bash
test -f components/admin/AdminFormShell.tsx
grep -c "bg-\[var(--color-error-bg)\]" components/admin/PartForm.tsx components/admin/PartEditForm.tsx components/admin/RentalEditForm.tsx components/admin/SupplierEditForm.tsx
# Expect: 0 in each.
```

---

### Task 7: ts-prune internal-type demotion (hand-verified)

**Objective:** Demote `export type Foo = ...` → `type Foo = ...` for internal-only types. Hand-verify each entry from the audit's `### Internal-only types exported as public — Low` section first; some are externally consumed via re-exports (do not demote those).
**Dependencies:** None (sequenced after Task 6 for review clarity, not functionally dependent)
**Mapped Scenarios:** None

**Files (default decisions — confirm each via grep before applying):**
- Modify: `lib/auth.ts` — demote `JWTPayload`, `SessionUser` (both grep-zero-external)
- Modify: `lib/yandex.ts` — demote `YANDEX_ORG_ID`
- Possibly modify: `lib/admin-nav.ts` — demote `AdminNavLink` if grep zero (its sibling `AdminNavEntry` stays exported)
- **Keep exported (DO NOT modify):** `lib/admin-nav.ts:28` `AdminNavEntry`, `lib/my-car-store.ts:5` `MyCar`, `lib/yandex-reviews.ts:10` `YandexReviewsData`, `lib/vehicle-catalog.ts:6` `VehicleModel`, `components/booking/BookingProvider.tsx:11` `BookingData` — all leak via exported function signatures or have direct external consumers.

**Key Decisions / Notes:**

**Hand-verify procedure for each entry:**

```bash
# For each candidate type (e.g. JWTPayload):
grep -rn "import.*\bJWTPayload\b\|JWTPayload\." --include='*.ts' --include='*.tsx' app components lib | grep -v "lib/auth.ts"
# Expect: zero hits → safe to demote
# Any hit → KEEP exported, do NOT demote
```

**Per-entry decisions** (rationales corrected per spec-review verification — most "Keep exported" entries are kept because the type leaks via an exported function/value's inferred signature, NOT because of direct external imports):

| Type | File | Verification command | Decision + rationale |
|------|------|---------------------|----------------------|
| `AdminNavLink` | `lib/admin-nav.ts:15` | `grep -rn "AdminNavLink" --include='*.tsx' --include='*.ts' app components | grep -v 'lib/admin-nav.ts'` | **Demote** if grep returns zero — type is internal helper used only inside `AdminNavEntry` discriminated union. |
| `AdminNavEntry` | `lib/admin-nav.ts:28` | (verify exposure) | **Keep exported** — leaks via exported function signature `findActiveHref(pathname, nav: readonly AdminNavEntry[])` (line 96 of admin-nav.ts). Demoting the type would force `findActiveHref`'s signature to use an inline anonymous type, hurting readability. |
| `JWTPayload` | `lib/auth.ts:9` | `grep -rn "JWTPayload" --include='*.ts' --include='*.tsx' app components lib | grep -v 'lib/auth.ts'` | **Demote** if grep returns zero — only used internally by `createToken()`/`verifyToken()` which infer the type. |
| `SessionUser` | `lib/auth.ts:14` | same | **Demote** if grep returns zero — only used as return type of `getSession()`/`requireAuth()` which infer it. |
| `MyCar` | `lib/my-car-store.ts:5` | `grep -rn "import.*\bMyCar\b" --include='*.ts' --include='*.tsx' app components` | **Keep exported** — leaks via exported function signature `setMyCar(car: MyCar | null)` (line 31). Even if no file currently imports `MyCar` directly, the exported function references it. |
| `YandexReviewsData` | `lib/yandex-reviews.ts:10` | (verify exposure) | **Keep exported** — leaks via exported `fetchYandexReviews(): Promise<YandexReviewsData>` return-type signature. |
| `YANDEX_ORG_ID` | `lib/yandex.ts:2` | `grep -rn "YANDEX_ORG_ID" --include='*.ts' --include='*.tsx' app components` | **Demote** if grep returns zero — only used at line 8 of the same file. |
| `VehicleModel` | `lib/vehicle-catalog.ts:6` | `grep -rn "import.*\bVehicleModel\b" --include='*.ts' --include='*.tsx' app components` | **Keep exported** — multiple direct external consumers (`Step1ServiceVehicle.tsx:6`, `MyCarPicker.tsx:8`). |
| `BookingData` | `components/booking/BookingProvider.tsx:11` | `grep -rn "BookingData" --include='*.ts' --include='*.tsx' app components | grep -v 'BookingProvider.tsx'` | **Keep exported** — leaks via exported `useBooking()` whose return type `BookingContextValue` references `BookingData`. |

**Verification rule:** if grep returns ANY external import of the type, KEEP exported. If zero direct imports BUT the type appears in any other exported function/value's signature in the same file, KEEP exported (transitive leak). Demote only when both conditions are zero.

**Implementation:**
- For each "Demote" decision: change `export type Foo = ...` → `type Foo = ...` (or `export interface Foo {` → `interface Foo {`). Confirm `tsc --noEmit` still passes.
- For each "Keep exported" decision: leave the line unchanged; document in commit message.

**Definition of Done:**
- [ ] Hand-verify ran for every audit-flagged entry; outcomes documented.
- [ ] Each demote produces zero tsc errors.
- [ ] `grep -E "^export (interface|type|const) (JWTPayload|SessionUser|YandexReviewsData|YANDEX_ORG_ID)" lib/` returns zero (assuming all 4 turn out to be safe to demote).
- [ ] Verified-keep types (`AdminNavEntry`, `VehicleModel`, `BookingData`) still have `export` prefix.
- [ ] `npx tsc --noEmit` exit 0.
- [ ] `npm run lint` exit 0.
- [ ] `npm run build` exit 0.
- [ ] Git: one commit, `chore(types): demote internal-only types per audit hygiene cluster`.

**Verify:**
```bash
# After all demotions:
npx tsc --noEmit
# Re-grep each: e.g., the file no longer exports the demoted symbol.
```

---

### Task 8: GitHub Actions CI workflow

**Objective:** Add `.github/workflows/verify.yml` running `tsc --noEmit` + `lint` on every pull request.
**Dependencies:** Task 7
**Mapped Scenarios:** None (CI infra)

**Files:**
- Create: `.github/workflows/verify.yml`

**Key Decisions / Notes:**

```yaml
name: Verify

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install
        run: npm ci

      - name: Generate Prisma client
        run: npx prisma generate

      - name: Type check
        run: npx tsc --noEmit

      - name: Lint
        run: npm run lint
```

- **Why `prisma generate`:** the project's Prisma schema is checked in (`prisma/schema.prisma`) but the generated client is gitignored (`app/generated/prisma/`). Without this step, tsc cannot resolve `import { Foo } from "@/app/generated/prisma/client"`.
- **Why no `npm run build`:** Next.js build is slow (~2 min cold) and tsc + lint catch most issues. Defer for cost savings; manual `npm run build` before merge if needed.
- **Why no `verify-vehicle-trims`:** the script needs a real `DATABASE_URL`. Out of scope for per-PR CI. Manual run before deploy is the existing workflow.
- **No secrets/env vars needed** for tsc + lint.
- **`.github/` parent directory does not currently exist** — implementer must `mkdir -p .github/workflows/` before creating verify.yml. The Write tool's automatic-parent-creation behavior should handle this, but verify with `ls .github/workflows/` after.
- **CI gap (acknowledged):** the user's stated intent was "CI hook for catalog/audit regressions." This workflow covers TS/lint only; `verify-vehicle-trims` is deferred because it requires a real DATABASE_URL. A future scheduled (cron) workflow against a staging DB would close this gap. Logged in Deferred Ideas.

**Definition of Done:**
- [ ] `.github/workflows/verify.yml` exists with the content above.
- [ ] Push a no-op commit to a test branch (or wait for the next real PR) to confirm the workflow runs and reports green.
- [ ] Workflow visible in `https://github.com/0pt1m1sm/geleoteka/actions`.
- [ ] Git: one commit, `ci: add GitHub Actions verify workflow (tsc + lint)`.

**Verify:**
```bash
test -f .github/workflows/verify.yml
# Manual: push to a test branch, watch the Actions tab.
```

---

### Task 9: Apex-domain DNS investigation

**Objective:** Determine why `https://geleoteka.ru/` was unreachable from sandbox during the prior verify. Document the current state. If genuine misconfig, surface action item for user.
**Dependencies:** None (independent investigation)
**Mapped Scenarios:** None

**Files:**
- Modify: `docs/sessions/2026-05-07.md` (or a new session note) — document findings

**Key Decisions / Notes:**

**Investigation steps:**

1. Check Railway custom-domain config:
   ```bash
   railway domain 2>&1
   # Should list both geleoteka-production.up.railway.app AND geleoteka.ru.
   ```

2. Check DNS resolution from a non-sandbox path. The `Bash` tool's curl runs in a restricted network — try a different approach. Options:
   - `dig geleoteka.ru +short` — works if `dig` is installed and DNS is unrestricted.
   - `host geleoteka.ru` — same.
   - Ask the user to `curl -I https://geleoteka.ru/` from their local terminal and report the result.

3. Common DNS failure modes:
   - **Apex CNAME** — Railway requires CNAME for subdomains but the apex (root domain) needs A or ALIAS records. If the user has a CNAME on `geleoteka.ru` instead of A records pointing to Railway's edge, the domain will fail to resolve.
   - **Pending verification** — Railway shows "verifying" status until SSL cert provisions; during that window, the domain returns no useful response.
   - **DNS not yet propagated** — recent change still in TTL window.

**Output:**
- If everything is fine: document in plan's `## Open Questions` (or a fresh session note) — "Apex domain `geleoteka.ru` resolves correctly from external networks; sandbox curl returns ENOTFOUND because the Bash tool's network has limited DNS."
- If genuine misconfig: surface specific Railway action — "User: in Railway dashboard → Settings → Domains, change the `geleoteka.ru` record from CNAME to A pointing to Railway's edge IP (per Railway docs)."

**Definition of Done — explicit close criterion (must satisfy at least one):**
- [ ] (a) `docs/sessions/2026-05-07.md` or this plan's `## Open Questions` section contains a one-paragraph status with timestamp documenting the apex-domain state.
- [ ] (b) A specific Railway action item is logged in the Operational pending list (e.g., "User: change CNAME → A record on geleoteka.ru per Railway docs").
- [ ] (c) **Escalation fallback:** if DNS tools unavailable in sandbox AND the user hasn't responded to the verify request within the spec session, close as `unresolved — escalated to user` so this task does not block plan VERIFIED. Document the escalation note in `## Open Questions`.
- [ ] Git: one commit if any doc file was created/modified, `docs(ops): apex domain geleoteka.ru DNS state`. If outcome (c) and no doc edit, the close note inside this plan's Open Questions counts as the closure artifact.

**Verify:**
```bash
dig geleoteka.ru +short 2>/dev/null || host geleoteka.ru 2>/dev/null || echo "DNS tools unavailable in sandbox; ask user to verify"
railway domain 2>&1 | head -5
```

---

### Task 10: Regression sweep + browser smoke test

**Objective:** Final tsc + lint + build + browser smoke. Cover TS-001…TS-004 against prod after deploy.
**Dependencies:** Tasks 1–9
**Mapped Scenarios:** TS-001, TS-002, TS-003, TS-004

**Files:** None (verification only)

**Key Decisions / Notes:**

1. **Static checks:**
   ```bash
   npx tsc --noEmit
   npm run lint
   npm run build
   ```
   All three MUST exit 0.

2. **Push commits:**
   ```bash
   git push origin main
   ```
   Wait for Railway auto-deploy to complete.

3. **Verify deploy succeeded:**
   ```bash
   railway status --json 2>&1 | python3 -c "..."
   # Wait for status=SUCCESS and commit hash matches HEAD.
   ```

4. **Browser smoke test:** Use `playwright-cli` (the previous spec showed Chrome MCP is denied for prod URLs).
   ```bash
   playwright-cli -s=verify-2026-05-07 goto https://geleoteka-production.up.railway.app/login
   # Walk through TS-001 (login), TS-002 (admin parts new), TS-003 (booking step 3 success), TS-004 (admin model edit).
   ```

5. **Document results** in plan's `## E2E Results` section (append after the run): PASS/FAIL/KNOWN_ISSUE per scenario.

6. **Final commit (only if Task 10 finds and fixes anything):** `fix: post-regression cleanup`. If everything green, no commit.

**Definition of Done:**
- [ ] `npx tsc --noEmit` exit 0.
- [ ] `npm run lint` exit 0.
- [ ] `npm run build` exit 0.
- [ ] All commits pushed; Railway deploy SUCCESS.
- [ ] Browser smoke covers TS-001..TS-004; results in plan's `## E2E Results` table.
- [ ] Critical scenarios (TS-001, TS-002) PASS. High-priority (TS-003, TS-004) PASS or KNOWN_ISSUE with documentation.
- [ ] Git: 0 or 1 commit depending on whether issues surfaced.

**Verify:**
```bash
npx tsc --noEmit && npm run lint && npm run build
git push origin main
# Then: playwright-cli smoke against prod, record results in plan.
```

## Open Questions

- **CI workflow Node version:** plan assumes Node 22. If the project's `package.json` has an explicit `engines.node` field, follow it; otherwise 22 is the current LTS at time of writing.

- **Apex domain `geleoteka.ru` — DNS misconfig confirmed (2026-05-07):** Investigation result:
  - `railway domain` lists both `https://geleoteka.ru` AND `https://geleoteka-production.up.railway.app` as configured.
  - `host geleoteka.ru` → `Host geleoteka.ru not found: 2(SERVFAIL)`.
  - `dig geleoteka.ru +short` → empty output.
  - `curl https://geleoteka.ru/` → HTTP 000 (DNS resolution failure).
  - `curl https://geleoteka-production.up.railway.app/` → HTTP 200 (Railway endpoint working fine).
  - This is **not** a sandbox limitation — both `dig` and `host` are installed and functional; the DNS resolver returns SERVFAIL for geleoteka.ru specifically.

  **Likely root cause** (one of):
  1. Domain registrar's nameserver records (NS) point to a nameserver that doesn't have a published zone for geleoteka.ru.
  2. Railway's edge DNS provider hasn't published the apex record (Railway uses CNAME at root via flattening, but if the registrar doesn't support ALIAS/ANAME, the apex stays broken).
  3. The apex domain has not been verified in Railway yet — Railway's domain page may show "Pending verification" or "Awaiting DNS".

  **User action required:**
  - Open Railway dashboard → service "Geleoteka" → Settings → Domains → click `geleoteka.ru`. Check whether the status is "Pending verification" or shows specific DNS instructions (e.g., "add a CNAME `geleoteka.ru` → `<railway-edge>` at your registrar").
  - If Railway requires ALIAS/ANAME at the apex and the registrar doesn't support it (e.g., GoDaddy doesn't), either: (a) switch to a registrar that does (Cloudflare, Route 53), (b) point only `www.geleoteka.ru` and 301-redirect from apex, or (c) use Railway's flattening-CNAME if available.
  - Verify with `host geleoteka.ru` from a fresh terminal after changes propagate (TTL up to 1 hour).

  Tracked in this plan's Operational pending and the next session's notes. Closing this task as **escalated to user** — no code change required.

### Deferred Ideas

- **`<ModelSelect/>` primitive** — model `<select>` duplication between `Step1ServiceVehicle.tsx` and `AddCarForm.tsx`. The two consumers have incompatible APIs (controlled vs uncontrolled, `VehicleModel[]` vs `string[]` data shape). Extracting requires either two variants or a flexible API; complexity outweighs the 14-line duplication savings. Revisit if a third call site appears.
- **Rentals page self-similar feature blocks** (`app/(public)/rentals/[id]/page.tsx:185-218,305-349`) — 5 internal jscpd hits where the page renders 4 near-identical "feature highlight" sections. Self-similar markup that should iterate over a data array. Bigger refactor; future spec.
- **`app/actions/rentals.ts` self-duplication** (12 lines internal across two action functions) — minor; bundle into a future rentals refactor.
- **Cabinet vs admin orders pages** (`app/(admin)/admin/orders/page.tsx:46-56` ↔ `app/(portal)/cabinet/orders/page.tsx:32-42`, 11 lines) — the audit listed it as Medium leverage; defer until a third orders-list page or substantive UX change.
- **jscpd / ts-prune / madge in CI** — too slow for per-PR. Schedule as a periodic audit (manual today; could be a weekly cron Action later).
- **CI extension — catalog regression coverage:** the user's stated intent for Task 8 was "CI hook for catalog/audit regressions." This plan's workflow covers TS/lint only; `verify-vehicle-trims` requires a real `DATABASE_URL` and is deferred. Two future paths: (a) scheduled (cron) workflow against a staging DB; (b) test-mode for `verify-vehicle-trims` that uses a fixture JSON instead of Prisma. Worth a future spec.
- **CI extension — `npm run build` in CI:** Next.js cold build is ~2 min; tsc + lint catch most issues. Add later if a build-only regression slips through.
