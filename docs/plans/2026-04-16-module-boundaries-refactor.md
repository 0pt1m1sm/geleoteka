# Module Boundaries Refactor Implementation Plan

Created: 2026-04-16
Author: aleksandr's.spiskov@gmail.com
Status: SUPERSEDED
Approved: No
Iterations: 0
Worktree: No
Type: Feature

> **2026-04-16: Plan superseded mid-planning.** During Q&A the user pivoted from "refactor existing schema into modules" to "design a proper professional data model first, then align UI." This refactor plan was built on the assumption that existing models (Appointment, PartOrder, SupplierOrder, Founder, User, Master) are correctly shaped and only need re-organizing. That assumption is now invalid — the schema itself is being redesigned.
>
> **What's preserved from this work:**
> - Feature Inventory of every existing file → still useful as the "as-is" snapshot for the new plan to consume
> - Sidebar Mapping → reusable as one option for the final UI alignment
> - ESLint boundaries config sketch → still applies to whatever modules emerge from the data-model PRD
> - Decisions A (pages stay under app/**), C (eslint-plugin-boundaries) → still valid implementation choices
>
> **What's invalidated:**
> - Decisions B (suppliers in service) and the entire CRM module reorganization — moot until the schema is redesigned
> - Decision F (ModuleConfig schema) — premature; depends on what modules emerge
> - All 7-8 task definitions
>
> **Next:** Author a Data Model PRD via `/prd` that designs the schema for a professional multi-module platform (CRM as spine, with rentals/parts/service/finance attaching cleanly). After that PRD is approved, write a new refactor plan that aligns code to the new schema in one coordinated motion.

## Summary

**Goal:** Reorganize the codebase so rentals, service, and parts each live in their own `modules/<name>/` directory tree with mechanically-enforced isolation via `eslint-plugin-boundaries`. Add a DB-backed module enable/disable system with admin UI controls. Restructure the admin sidebar so groups mirror modules (one group per module). All decisions locked in PRD `docs/prd/2026-04-13-module-boundaries-refactor.md` plus two scope expansions added during planning (Q&A 2026-04-16): module toggles + sidebar restructure.

**Architecture:** New top-level `modules/<rentals|service|parts>/` directories own all module-specific server actions and components. Pages stay under `app/**` as thin shells (Decision A). Cross-module imports become a CI failure via `eslint-plugin-boundaries`. Platform-level admin chrome moves to `components/platform/`. Shared libs stay at `lib/` root, with `lib/shared/models.ts` as the new home for the cross-module car-models catalog (Decision D). New `ModuleConfig` Prisma model holds one row per module with `isEnabled` flag; middleware gates URL access for disabled modules; nav data filters out disabled groups; admin settings page at `/admin/settings/modules` provides toggles. Sidebar regroups to one-group-per-module: Дашборд / Сервис / Запчасти / Аренда / Платформа.

**Tech Stack:** Next.js 16 App Router (with middleware for route gating), TypeScript strict, ESLint 9, `eslint-plugin-boundaries` 5.x (new dev dep), Prisma 6 (one new model + migration). No runtime dependencies added beyond the lint plugin.

**⚠️ Scope expansion vs original PRD:** The PRD explicitly excluded "runtime feature flags" and didn't address sidebar restructuring. Both were added during planning Q&A on 2026-04-16. This plan documents the expanded scope; the original PRD remains the architectural anchor for the boundary part.

**⚠️ Regression of prior work:** The sidebar restructure undoes the workflow grouping shipped in `docs/plans/2026-04-12-admin-sidebar-audit.md` (live in production). Specifically: items move between groups (Заказы клиентов: Операции → Запчасти; Бронирования: Операции → Аренда; Учредители + Контент + Команда regroup). This is intentional per user decision — the platform-pivot story takes priority over workflow ergonomics. Documented in TS-002.

## Scope

### In Scope

**Architecture (original PRD scope — Tasks 1-5):**
- New top-level directory structure: `modules/rentals/`, `modules/service/`, `modules/parts/`, `components/platform/`, `lib/shared/`
- Move all module-owned components from `components/admin/`, `components/booking/`, `components/parts/`, `components/portal/`, `components/rentals/` into the appropriate `modules/<name>/` subtree
- Move all module-owned server actions from `app/actions/*.ts` into `modules/<name>/actions/`. Page imports update to the new paths.
- Move `lib/models-data.ts` to `lib/shared/models.ts` (per Decision D — used by both Service and Parts)
- Move `components/admin/AdminSidebar.tsx`, `components/admin/AdminMobileNav.tsx`, `components/admin/AdminCalendar.tsx`, `components/admin/CMSEditor.tsx` to `components/platform/`
- Install `eslint-plugin-boundaries`, configure element types and dependency matrix that forbids cross-module imports
- Update `AGENTS.md` and `.claude/rules/geleoteka-project.md` with a "Module boundaries" section so future Claude sessions know where new files go
- Verify via runtime browser smoke test: all sidebar entries work, no 500s, no console errors, public + portal + admin routes all render identically
- Mechanical "intentional violation" test: temporarily add a cross-module import, confirm `npm run lint` fails with a clear boundary error, remove it

**Scope expansion 1 — sidebar restructure (Task 5b, integrated with Task 5):**
- Update `lib/admin-nav.ts` to use one-group-per-module structure: Дашборд (standalone) / **Сервис** / **Запчасти** / **Аренда** / **Платформа**
- Move items between groups per the new mapping (see Sidebar Mapping table below)
- Keep the existing single-open accordion behavior (don't re-do the AdminSidebar/AdminMobileNav components — they're driven by `adminNav` data, so a data change is enough)

**Scope expansion 2 — module enable/disable (Tasks 6-7):**
- New Prisma model `ModuleConfig` (one row per module: rentals, service, parts) with `isEnabled` flag, seeded with all enabled by default
- Server-side route gate in `app/middleware.ts` (or extend the existing one): for disabled modules, return 404 on any URL prefix the module owns
- Server-side nav filter in `lib/admin-nav.ts`: hide whole groups for disabled modules; admin sidebar receives filtered nav data via getModuleConfig() in the layout
- Public surface: hide module cards/links from homepage, hide nav links from public header, hide cabinet sub-pages from portal nav for disabled modules
- New admin settings page at `/admin/settings/modules` with toggles for each module + warnings ("Disabling rentals will hide /rentals and /admin/rentals; existing data is preserved")
- New server action `app/actions/module-config.ts` (or `modules/platform/actions/...` — Decision G below) for the toggle mutations
- Migration: `npx prisma migrate dev --name add_module_config`

### Out of Scope

- Any new feature from the rental competitive analysis (that's Phase 2+, separate PRDs)
- Monorepo / npm workspaces — using lint-rule enforcement instead
- Prisma schema splitting — schema stays single file
- Renaming files unless required by the move (preserve history with `git mv`)
- Any URL change for ENABLED modules — all 59 existing URLs continue to work
- Splitting `app/actions/admin.ts` (which mixes appointments + estimates — both belong to SERVICE module, so the file just moves to `modules/service/actions/admin.ts`; can be split later if it grows)
- Activating `app/(cabinet)/` empty route group (looks like leftover scaffolding)
- Activating `app/(public)/blog/` and `app/(admin)/admin/blog/` empty directories (Prisma has `BlogPost` but no UI)
- Moving `components/ui/` (currently empty)
- Test framework introduction — project has no test runner today; verification is `tsc + lint + build + Chrome DevTools MCP runtime smoke`
- **Per-tenant configuration** — `ModuleConfig` is a single row per module for the whole deployment. Multi-tenant SaaS-style per-customer config is out of scope (single-tenant deployment today).
- **Granular permissions** — module toggles are platform-wide for ADMIN/MANAGER. No "MANAGER can toggle but ADMIN must approve" workflow.
- **Cascading effects of disabling a module** beyond hiding routes/UI — disabled modules' DB tables stay, server actions stay callable via direct API hits (the route gate is the boundary, not a deeper data layer gate). Documented as a known limitation.
- **Soft-delete or archival of disabled module data** — disabling rentals keeps `RentalCar` + `RentalBooking` rows untouched; re-enabling restores full functionality. No data lifecycle management.
- **Module dependencies** — rentals/parts/service are independently togglable. No "you can't disable Service if procurement has open supplier orders" logic. Each module disables atomically.

## Approach

**Chosen:** Sequential per-module migration (Tasks 1-4), then ESLint activation + sidebar restructure + docs (Task 5), then DB-backed module toggles in two stages (Tasks 6-7). Seven tasks total, each producing an independently-buildable commit.

**Why:** Bisectable — if Module B's move breaks something Module A's tests catch, `git revert` cleanly. Module-toggle work is genuinely separable from the boundary refactor (toggle UI doesn't depend on lint rules being active, only on the nav data + middleware), but it depends on the module structure being in place — so it lands after Tasks 1-4. Cost: more commits than a single atomic PR, slightly slower to ship.

**Alternatives considered:**
- **Single atomic commit** — rejected: harder to revert, harder to bisect, longer review.
- **Per-layer slicing** (move all components, then all actions, then all pages) — rejected: each commit touches every module, so a failure isn't isolated to one module.
- **Defer module toggles to a follow-up PRD** — initially recommended in Q&A; user chose to include in this plan. Adds Tasks 6-7, ~2-3 day extra work.

## Sidebar Mapping (current → new)

The PRD'd sidebar (live in production from `2026-04-12-admin-sidebar-audit.md`) groups by workflow. The new sidebar groups by module, mirroring the codebase boundary. Mapping:

| Current group | Current item | New group | New item | Why |
|---|---|---|---|---|
| Дашборд | Дашборд | Дашборд (standalone) | Дашборд | Unchanged |
| Операции | Записи | Сервис | Записи | Service appointments |
| Операции | Календарь | Сервис | Календарь | Service appointment calendar |
| Операции | Сметы | Сервис | Сметы | Service estimates |
| Операции | Клиенты | Сервис | Клиенты | Service customers (CRM) |
| Операции | Заказы клиентов | **Запчасти** | Заказы клиентов | Customer parts orders — PARTS module |
| Операции | Бронирования | **Аренда** | Бронирования | Rental bookings — RENTALS module |
| Управление | Запчасти | Запчасти | Каталог | Parts catalog — relabel to clarify (catalog vs orders) |
| Управление | Аренда | Аренда | Автопарк | Fleet — relabel to clarify (fleet vs bookings) |
| Управление | Контент | **Платформа** | Контент | CMS belongs to platform |
| Управление | Учредители | Сервис | Учредители | Procurement = service-side concern (Decision B in PRD) |
| Управление | Команда | **Платформа** | Команда | Team/masters — could go to Сервис, but team management is platform admin (multi-module) |
| Поставки | Поставщики | Сервис | Поставщики | Procurement |
| Поставки | Заказы поставщикам | Сервис | Заказы поставщикам | Procurement |
| (new) | — | **Платформа** | Настройки модулей | New: `/admin/settings/modules` toggle UI |

Final structure:

```
Дашборд  (standalone)

▼ Сервис
    Записи
    Календарь
    Сметы
    Клиенты
    Поставщики
    Заказы поставщикам
    Учредители

▼ Запчасти
    Каталог
    Заказы клиентов

▼ Аренда
    Автопарк
    Бронирования

▼ Платформа
    Контент
    Команда
    Настройки модулей
```

Sub-item counts: Сервис 7, Запчасти 2, Аренда 2, Платформа 3 — total 14 + 1 standalone = 15 items (was 14). Net +1 from the new module-config page.

**Note on the Команда decision:** "Team" (masters) could plausibly belong to SERVICE (only service module references master records — appointments + estimates assign masters). But it's more semantically platform-level: it's about who works at the workshop, not the workflow they perform. Plus, if SERVICE is disabled (hypothetically — unlikely use case but supported), the team page should still work for the remaining modules. Decision: PLATFORM. Implementer can challenge this if it conflicts with the Prisma `Master` model's actual ownership.

## Context for Implementer

> Write for an implementer who has never seen the codebase.

### Architectural pattern this refactor establishes

After this plan, the rule for "where does new code go" becomes:

| If the file is... | It goes in... |
|---|---|
| A page (`page.tsx`) under one of the rental/service/parts URL trees | Stays at `app/(public|portal|admin)/<route>/page.tsx`. Imports module code from `modules/<name>/`. |
| A page-specific component used only inside that page | `modules/<name>/<surface>/components/<Name>.tsx` where surface ∈ {public, portal, admin} |
| A server action that mutates data for a module | `modules/<name>/actions/<name>.ts` |
| A type/helper used by multiple files in one module | `modules/<name>/lib/<name>.ts` |
| A component used by 2+ modules | `components/shared/<Name>.tsx` (already exists for ImageGallery, MobileMenu, etc.) |
| A library helper used by 2+ modules | `lib/shared/<name>.ts` (new) or stay at `lib/` root for platform infra (auth, db) |
| Admin chrome (sidebar, top nav, themes, CMS editor) | `components/platform/<Name>.tsx` (new directory) |
| The Prisma client | `lib/db.ts` (unchanged — single-source-of-truth for DB access) |

### Patterns to follow

- **Server component + client component split** — admin pages are server components calling `getSession()`; interactive sub-components in `modules/<name>/admin/components/` use `"use client"`. Pattern preserved.
- **Server actions** — `"use server"` directive on every actions file (existing). Each module's actions file imports `db` from `@/lib/db` and `requireRole`/`getSession` from `@/lib/auth`.
- **Active-link matching** in nav — the PRD'd pattern from `components/platform/AdminSidebar.tsx` uses longest-href match. This refactor doesn't touch it, but is the canonical example of "platform-owned reads from all modules' nav data."

### Conventions

- **Prisma client import path:** ALWAYS `@/lib/db`. NEVER `@prisma/client` or `@/app/generated/prisma/client` — only `lib/db.ts` is allowed to import the generated client.
- **Auth in admin pages:** `getSession()` + `if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) redirect("/login")`. NOT `requireRole(...)` (which throws and breaks the page render path).
- **CSS:** CSS variables only (`var(--card)`, `var(--foreground-muted)`, `var(--color-accent)`, `var(--border)`). No hardcoded hex.
- **Filenames:** PascalCase for components (`RentalEditForm.tsx`), kebab-case for libs/actions (`admin-nav.ts`, `supplier-orders.ts`).
- **Emojis:** Do not add. The codebase uses text labels (`← Поставщики`).
- **`git mv` for every move:** Never delete + re-create. History matters for blame.

### Key files

- `app/(admin)/layout.tsx` — Currently 17 lines. Imports `AdminSidebar` + `AdminMobileNav`. Will need import-path update after they move to `components/platform/`.
- `app/actions/admin.ts` — Mixes appointments + estimates server actions, both SERVICE. Moves to `modules/service/actions/admin.ts` AS-IS.
- `lib/admin-nav.ts` — Platform-owned nav data. References every module's URLs. Stays in `lib/` (or moves to `lib/platform/admin-nav.ts` — implementer's call).
- `lib/models-data.ts` — Used by Service AND Parts. Decision D: moves to `lib/shared/models.ts`.
- `eslint.config.mjs` (or wherever ESLint config lives — implementer to verify) — Where new boundary rules land.

### Gotchas

- **`app/(cabinet)/` is an EMPTY route group** with subdir shells (`cars/`, `history/`, `loyalty/`, `notifications/`, `tracking/`) but zero `page.tsx` files. The portal lives at `app/(portal)/cabinet/`. Don't get confused. Out of scope for this plan.
- **`app/(public)/blog/` and `app/(admin)/admin/blog/` are EMPTY** — Prisma has `BlogPost` model but no UI. Skip.
- **`components/ui/` is EMPTY** — placeholder directory. Skip.
- **`StatusChanger.tsx`** is for service appointments (not rentals). `RentalStatusChanger.tsx` is for rentals. Don't conflate by name.
- **`OrderStatusChanger.tsx`** is for customer parts orders (PartOrder), `SupplierOrderStatusChanger.tsx` is for supplier orders. Three "OrderStatus" things in the codebase — keep them straight by destination module: customer parts orders → PARTS module, supplier orders → SERVICE/procurement.
- **No tests exist.** Project has no test runner configured. Verification = `bunx tsc --noEmit` + `npm run lint` + `npm run build` + Chrome DevTools MCP runtime smoke.
- **`git mv` followed by `tsc --noEmit`** is the implementer's tightest feedback loop — TypeScript catches every broken import path immediately.
- **Existing ESLint warnings** (8 of them, all pre-existing in `components/shared/ImageGallery.tsx` and `public/theme-init.js`) are NOT this refactor's problem. Don't fix them.

### Domain context

- **Service module** = the workshop (appointments, calendar, masters/team, estimates, customer car records, customers, procurement = suppliers + supplier orders + founder cost tracking). The "service" module is large because the workshop is the original product line.
- **Parts module** = the parts catalog + customer-facing parts shop + customer parts orders (PartOrder).
- **Rentals module** = the fleet (RentalCar) + customer rental bookings (RentalBooking).
- **Procurement** lives inside the SERVICE module (Decision B in the PRD): suppliers, supplier orders (SupplierOrder + SupplierOrderItem), founder cost contributions (FounderContribution). Rationale: procurement = "buying parts to fix cars," which is a Service-side concern. Could split to a `modules/finance/` later.

## Runtime Environment

- **Dev:** `npm run dev` (port 443, HTTPS, self-signed cert)
- **Browser verification:** Chrome DevTools MCP. Admin session cookie should still be active from previous session work; if not, log in as `admin@geleoteka.ru` / `admin123`.
- **Production:** Railway auto-deploy on push to main. `preDeployCommand = ["npx prisma migrate deploy"]` in `railway.toml`. **No DB changes in this plan**, so deploy is no-op for migrations.

## Feature Inventory

Per the migration/refactoring rule — every file involved is mapped to a task. **No row may be "Not mapped."**

### Module Classification

Pages (kept at `app/**`, only their imports change):

| Page file | Module | Task |
|---|---|---|
| `app/(public)/rentals/page.tsx` | RENTALS | Task 2 |
| `app/(public)/rentals/[id]/page.tsx` | RENTALS | Task 2 |
| `app/(portal)/cabinet/rentals/page.tsx` | RENTALS | Task 2 |
| `app/(admin)/admin/rentals/page.tsx` | RENTALS | Task 2 |
| `app/(admin)/admin/rentals/new/page.tsx` | RENTALS | Task 2 |
| `app/(admin)/admin/rentals/[id]/page.tsx` | RENTALS | Task 2 |
| `app/(admin)/admin/rentals/bookings/page.tsx` | RENTALS | Task 2 |
| `app/(public)/parts/page.tsx` | PARTS | Task 3 |
| `app/(public)/parts/[slug]/page.tsx` | PARTS | Task 3 |
| `app/(public)/parts/cart/page.tsx` | PARTS | Task 3 |
| `app/(portal)/cabinet/orders/page.tsx` | PARTS | Task 3 |
| `app/(admin)/admin/parts/page.tsx` | PARTS | Task 3 |
| `app/(admin)/admin/parts/new/page.tsx` | PARTS | Task 3 |
| `app/(admin)/admin/parts/[id]/page.tsx` | PARTS | Task 3 |
| `app/(admin)/admin/parts/import/page.tsx` | PARTS | Task 3 |
| `app/(admin)/admin/orders/page.tsx` | PARTS (customer parts orders) | Task 3 |
| `app/api/parts/import/route.ts` | PARTS | Task 3 |
| `app/(public)/booking/page.tsx` | SERVICE | Task 4 |
| `app/(public)/booking/layout.tsx` | SERVICE | Task 4 |
| `app/(public)/booking/step-2/page.tsx` | SERVICE | Task 4 |
| `app/(public)/booking/step-3/page.tsx` | SERVICE | Task 4 |
| `app/(public)/booking/step-4/page.tsx` | SERVICE | Task 4 |
| `app/(public)/booking/step-5/page.tsx` | SERVICE | Task 4 |
| `app/(public)/services/page.tsx` | SERVICE | Task 4 |
| `app/(public)/services/[slug]/page.tsx` | SERVICE | Task 4 |
| `app/(public)/models/page.tsx` | SERVICE | Task 4 |
| `app/(public)/models/[slug]/page.tsx` | SERVICE | Task 4 |
| `app/(portal)/cabinet/page.tsx` | SERVICE | Task 4 |
| `app/(portal)/cabinet/cars/page.tsx` | SERVICE | Task 4 |
| `app/(portal)/cabinet/cars/add/page.tsx` | SERVICE | Task 4 |
| `app/(portal)/cabinet/estimates/page.tsx` | SERVICE | Task 4 |
| `app/(portal)/cabinet/history/page.tsx` | SERVICE | Task 4 |
| `app/(portal)/cabinet/loyalty/page.tsx` | SERVICE | Task 4 |
| `app/(portal)/cabinet/notifications/page.tsx` | SERVICE | Task 4 |
| `app/(portal)/cabinet/tracking/page.tsx` | SERVICE | Task 4 |
| `app/(admin)/admin/appointments/page.tsx` | SERVICE | Task 4 |
| `app/(admin)/admin/calendar/page.tsx` | SERVICE | Task 4 |
| `app/(admin)/admin/customers/page.tsx` | SERVICE | Task 4 |
| `app/(admin)/admin/customers/[id]/page.tsx` | SERVICE | Task 4 |
| `app/(admin)/admin/estimates/page.tsx` | SERVICE | Task 4 |
| `app/(admin)/admin/estimates/new/page.tsx` | SERVICE | Task 4 |
| `app/(admin)/admin/team/page.tsx` | SERVICE | Task 4 |
| `app/(admin)/admin/founders/page.tsx` | SERVICE/procurement | Task 4 |
| `app/(admin)/admin/founders/new/page.tsx` | SERVICE/procurement | Task 4 |
| `app/(admin)/admin/founders/[id]/page.tsx` | SERVICE/procurement | Task 4 |
| `app/(admin)/admin/suppliers/page.tsx` | SERVICE/procurement | Task 4 |
| `app/(admin)/admin/suppliers/new/page.tsx` | SERVICE/procurement | Task 4 |
| `app/(admin)/admin/suppliers/[id]/page.tsx` | SERVICE/procurement | Task 4 |
| `app/(admin)/admin/suppliers/orders/page.tsx` | SERVICE/procurement | Task 4 |
| `app/(admin)/admin/suppliers/orders/new/page.tsx` | SERVICE/procurement | Task 4 |
| `app/(admin)/admin/suppliers/orders/[id]/page.tsx` | SERVICE/procurement | Task 4 |
| `app/api/appointments/[id]/status/route.ts` | SERVICE | Task 4 |
| `app/api/slots/route.ts` | SERVICE | Task 4 |
| `app/(admin)/admin/page.tsx` | PLATFORM (admin dashboard, queries multiple modules) | Task 1 |
| `app/(admin)/admin/cms/page.tsx` | PLATFORM | Task 1 |
| `app/(admin)/layout.tsx` | PLATFORM | Task 1 |
| `app/(public)/page.tsx` | PLATFORM (homepage, mixes hero + service preview + reviews) | stays |
| `app/(public)/about/page.tsx` | PLATFORM | stays |
| `app/(public)/contacts/page.tsx` | PLATFORM | stays |
| `app/(public)/vacancies/page.tsx` | PLATFORM | stays |
| `app/(public)/login/page.tsx` | SHARED (auth) | stays |
| `app/(public)/register/page.tsx` | SHARED (auth) | stays |
| `app/(public)/reset-password/page.tsx` | SHARED (auth) | stays |
| `app/(public)/reset-password/confirm/page.tsx` | SHARED (auth) | stays |
| `app/(public)/layout.tsx` | PLATFORM | stays |
| `app/(portal)/layout.tsx` | PLATFORM | stays |
| `app/layout.tsx`, `app/middleware.ts`, `app/providers.tsx`, `app/globals.css`, `app/favicon.ico` | PLATFORM | stays |

Components (move to module subtree):

| Component | Module | Destination | Task |
|---|---|---|---|
| `components/rentals/RentalBookingForm.tsx` | RENTALS public | `modules/rentals/public/components/RentalBookingForm.tsx` | Task 2 |
| `components/admin/RentalEditForm.tsx` | RENTALS admin | `modules/rentals/admin/components/RentalEditForm.tsx` | Task 2 |
| `components/admin/RentalStatusChanger.tsx` | RENTALS admin | `modules/rentals/admin/components/RentalStatusChanger.tsx` | Task 2 |
| `components/parts/AddToCartButton.tsx` | PARTS public | `modules/parts/public/components/AddToCartButton.tsx` | Task 3 |
| `components/parts/PartsCart.tsx` | PARTS public | `modules/parts/public/components/PartsCart.tsx` | Task 3 |
| `components/parts/PartsSearch.tsx` | PARTS public | `modules/parts/public/components/PartsSearch.tsx` | Task 3 |
| `components/admin/PartEditForm.tsx` | PARTS admin | `modules/parts/admin/components/PartEditForm.tsx` | Task 3 |
| `components/admin/PartForm.tsx` | PARTS admin | `modules/parts/admin/components/PartForm.tsx` | Task 3 |
| `components/admin/OrderStatusChanger.tsx` | PARTS admin (customer parts orders) | `modules/parts/admin/components/OrderStatusChanger.tsx` | Task 3 |
| `components/booking/BookingProvider.tsx` | SERVICE public | `modules/service/public/components/BookingProvider.tsx` | Task 4 |
| `components/booking/StepIndicator.tsx` | SERVICE public | `modules/service/public/components/StepIndicator.tsx` | Task 4 |
| `components/booking/ServiceSelector.tsx` | SERVICE public | `modules/service/public/components/ServiceSelector.tsx` | Task 4 |
| `components/booking/VehicleInput.tsx` | SERVICE public | `modules/service/public/components/VehicleInput.tsx` | Task 4 |
| `components/booking/CalendarSlotPicker.tsx` | SERVICE public | `modules/service/public/components/CalendarSlotPicker.tsx` | Task 4 |
| `components/booking/ContactForm.tsx` | SERVICE public | `modules/service/public/components/ContactForm.tsx` | Task 4 |
| `components/booking/BookingConfirmation.tsx` | SERVICE public | `modules/service/public/components/BookingConfirmation.tsx` | Task 4 |
| `components/portal/StatusBoard.tsx` | SERVICE portal | `modules/service/portal/components/StatusBoard.tsx` | Task 4 |
| `components/portal/EstimateReview.tsx` | SERVICE portal | `modules/service/portal/components/EstimateReview.tsx` | Task 4 |
| `components/admin/EstimateBuilder.tsx` | SERVICE admin | `modules/service/admin/components/EstimateBuilder.tsx` | Task 4 |
| `components/admin/StatusChanger.tsx` | SERVICE admin (appointment status) | `modules/service/admin/components/StatusChanger.tsx` | Task 4 |
| `components/admin/DeleteAppointmentButton.tsx` | SERVICE admin | `modules/service/admin/components/DeleteAppointmentButton.tsx` | Task 4 |
| `components/admin/SupplierEditForm.tsx` | SERVICE/procurement admin | `modules/service/admin/components/procurement/SupplierEditForm.tsx` | Task 4 |
| `components/admin/SupplierOrderForm.tsx` | SERVICE/procurement admin | `modules/service/admin/components/procurement/SupplierOrderForm.tsx` | Task 4 |
| `components/admin/SupplierOrderStatusChanger.tsx` | SERVICE/procurement admin | `modules/service/admin/components/procurement/SupplierOrderStatusChanger.tsx` | Task 4 |
| `components/admin/ContributionPaidToggle.tsx` | SERVICE/procurement admin | `modules/service/admin/components/procurement/ContributionPaidToggle.tsx` | Task 4 |
| `components/admin/FounderEditForm.tsx` | SERVICE/procurement admin | `modules/service/admin/components/procurement/FounderEditForm.tsx` | Task 4 |
| `components/admin/AdminSidebar.tsx` | PLATFORM | `components/platform/AdminSidebar.tsx` | Task 1 |
| `components/admin/AdminMobileNav.tsx` | PLATFORM | `components/platform/AdminMobileNav.tsx` | Task 1 |
| `components/admin/AdminCalendar.tsx` | PLATFORM (used by service/calendar but visually a generic admin widget — could be SERVICE; staying PLATFORM to keep it neutral and avoid forcing a service→platform read) | `components/platform/AdminCalendar.tsx` | Task 1 |
| `components/admin/CMSEditor.tsx` | PLATFORM | `components/platform/CMSEditor.tsx` | Task 1 |
| `components/shared/*` (CookieConsent, FAQAccordion, FloatingButtons, ImageGallery, LogoutButton, MobileMenu, PanelMobileNav, ThemeInit, ThemeToggle) | SHARED | UNCHANGED | n/a |
| `components/ui/` (empty) | SHARED | UNCHANGED | n/a |

Server actions (move to module subtree):

| Action file | Module | Destination | Task |
|---|---|---|---|
| `app/actions/rentals.ts` | RENTALS | `modules/rentals/actions/rentals.ts` | Task 2 |
| `app/actions/parts.ts` | PARTS | `modules/parts/actions/parts.ts` | Task 3 |
| `app/actions/part-orders.ts` | PARTS (customer-side) | `modules/parts/actions/part-orders.ts` | Task 3 |
| `app/actions/part-order-admin.ts` | PARTS (admin-side) | `modules/parts/actions/part-order-admin.ts` | Task 3 |
| `app/actions/booking.ts` | SERVICE | `modules/service/actions/booking.ts` | Task 4 |
| `app/actions/cars.ts` | SERVICE (customer car records) | `modules/service/actions/cars.ts` | Task 4 |
| `app/actions/estimates.ts` | SERVICE | `modules/service/actions/estimates.ts` | Task 4 |
| `app/actions/admin.ts` | SERVICE (mixes appointments + estimates — both SERVICE) | `modules/service/actions/admin.ts` | Task 4 |
| `app/actions/suppliers.ts` | SERVICE/procurement | `modules/service/actions/suppliers.ts` | Task 4 |
| `app/actions/supplier-orders.ts` | SERVICE/procurement | `modules/service/actions/supplier-orders.ts` | Task 4 |
| `app/actions/founders.ts` | SERVICE/procurement | `modules/service/actions/founders.ts` | Task 4 |
| `app/actions/cms.ts` | PLATFORM | `app/actions/cms.ts` UNCHANGED (or `lib/platform/actions/cms.ts` — implementer choice) | Task 1 |
| `app/actions/login.ts` | SHARED (auth) | UNCHANGED | n/a |
| `app/actions/logout.ts` | SHARED (auth) | UNCHANGED | n/a |
| `app/actions/register.ts` | SHARED (auth) | UNCHANGED | n/a |
| `app/actions/request-password-reset.ts` | SHARED (auth) | UNCHANGED | n/a |
| `app/actions/confirm-reset-password.ts` | SHARED (auth) | UNCHANGED | n/a |

Lib files:

| Lib file | Module | Destination | Task |
|---|---|---|---|
| `lib/auth.ts` | SHARED | UNCHANGED | n/a |
| `lib/db.ts` | SHARED | UNCHANGED | n/a |
| `lib/utils.ts` | SHARED | UNCHANGED | n/a |
| `lib/sms.ts` | SHARED | UNCHANGED | n/a |
| `lib/splus.ts` | SHARED | UNCHANGED | n/a |
| `lib/admin-nav.ts` | PLATFORM (references all modules' URLs) | UNCHANGED at `lib/admin-nav.ts` | Task 1 |
| `lib/models-data.ts` | SHARED REFERENCE DATA (Decision D — used by Service AND Parts) | `lib/shared/models.ts` | Task 1 |

**Inventory complete. No row marked "Not mapped." Every file has a task or an explicit "UNCHANGED."**

## Assumptions

- **The PRD's Decisions A, B, C are honored as-is.** Pages stay under `app/**`, suppliers+founders inside SERVICE/procurement, ESLint via `eslint-plugin-boundaries`. Tasks 1-5 depend on this.
- **No current cross-module import violations exist.** Verified during exploration: every `from "@/components/(rentals|parts|booking|portal)/..."` import is page→component (top-down) within the same module. No `RentalEditForm` reaches into `PartEditForm` etc. Tasks 2/3/4 each just MOVE files — no refactoring needed beyond import-path updates. Supports zero-risk task boundaries.
- **`lib/models-data.ts` is the only shared module-level data.** Verified by grep — no other lib file is module-specific while being imported by 2+ modules. Decision D affects this one file.
- **`AdminSidebar` and `AdminMobileNav` are PLATFORM components** (already-shipped from `2026-04-12-admin-sidebar-audit.md`), they consume `adminNav` from `lib/admin-nav.ts`. Both move to `components/platform/`. Task 1.
- **`components/admin/AdminCalendar.tsx`** is admin chrome but currently used only by the SERVICE module's calendar page. Classified as PLATFORM to avoid the service→platform leak that would happen if it stayed in `components/admin/` while service imports it. The boundary rule will allow service→platform imports.
- **ESLint config file format** — Geleoteka uses ESLint 9 flat config (`eslint.config.mjs` per package.json's `lint` script). `eslint-plugin-boundaries` 5.x supports flat config. Task 5.
- **No test files exist anywhere in the repo** — confirmed via package.json (no test runner scripts). Verification = `tsc + lint + build + Chrome DevTools MCP runtime smoke`. No test task in this plan.
- **`app/middleware.ts` runtime is Node by default in Next.js App Router** — Prisma queries should work directly. Task 7 must verify this assumption with `grep "runtime" app/middleware.ts` before writing the gating code. If it's Edge-only, the fallback documented in Task 7 notes applies.
- **MANAGER role exists in the `User.role` enum** and is distinct from ADMIN — verified by scanning `lib/auth.ts` and existing admin pages that use `session.role !== "ADMIN" && session.role !== "MANAGER"` guards. Task 7's settings page uses `requireRole(["ADMIN"])` which excludes MANAGER. Verified in TS-011.
- **The `Master` model is referenced only by the SERVICE module's appointments and estimates** — but the `/admin/team` page is platform-level admin chrome (configures who works at the workshop, not workflow state). Decision documented in the Sidebar Mapping table's footnote.
- **Public homepage's service-categories grid is the ONLY surface that hard-depends on a module's content** — other public pages (`/about`, `/contacts`, `/vacancies`) are static and platform-level. Task 7's homepage filter only needs to handle the service-categories section, the parts CTA, and the rentals CTA. Other sections are unaffected by toggles.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Import path update misses a file → broken build | Medium | High | After each `git mv` batch, run `bunx tsc --noEmit` immediately. TS errors point at every broken import. Fix in a loop until clean before proceeding to the next module. |
| `git mv` not used → blame history broken | Medium (forgetting) | Medium | Implementer must use `git mv` exclusively, never delete + create. Each task's verify step includes `git log --follow` on one moved file to confirm history preserved. |
| ESLint plugin config wrong → false negatives (rule doesn't catch real violations) | Medium | High | Task 5 includes an "intentional violation" test: temporarily add `import x from "@/modules/parts/..."` inside a rentals file, run `npm run lint`, confirm it FAILS with a clear boundary error, remove the import, confirm lint passes. Without this test, the rule could be silently misconfigured. |
| Page → module path becomes long and ugly (`@/modules/rentals/admin/components/RentalEditForm`) | High | Low | Acceptable cost — the verbosity makes the boundary visible at every import site. Mitigation: TypeScript path alias `@modules/*` → `modules/*` (drops the `/` prefix nuisance) optionally. Not required for correctness. |
| Refactor breaks production deploy mid-way | Low | High | Sequential commits: each commit (Task 2/3/4) builds independently. Push to main happens AFTER all 5 tasks complete and runtime verified. Railway only sees one push. |
| `lib/admin-nav.ts` references all modules' URLs as strings — refactor doesn't break the strings, but a future module rename WOULD | N/A (design) | Medium future | Acceptable. URL strings are runtime contracts not compile-time imports — any tool that catches stale URL strings (Next.js link checking) would catch them regardless of where `admin-nav.ts` lives. |
| ESLint rule too aggressive — blocks legitimate platform→module imports needed by `AdminSidebar` (which references nav data from all modules) | Medium | Medium | Allow-list direction: `platform/**` allowed to import from `modules/**` (read-only nav references). `modules/X/**` cannot import from `modules/Y/**` (Y ≠ X). `modules/**` allowed to import from `shared/**` and `platform/**`. Documented in Task 5. |
| Pages stay at `app/**` but their imports change — Next.js cache could serve stale routes | Low | Low | Dev server usually catches this; if persistent, `rm -rf .next` clears. Verify after Task 4 that all 59 routes still build via `npm run build`. |
| A move uncovers dead code (component imported nowhere) | Low | Low | Note the dead code in plan implementation report; do NOT delete during refactor (out of scope). Follow up with a separate cleanup PRD if needed. |
| Implementer accidentally adds new feature work during the refactor | Medium | High | Plan repeatedly emphasizes "zero user-visible behavior change" for Tasks 1-5. Tasks 6-7 INTRODUCE the module-toggle feature — that is in scope. Distinction: Tasks 1-5 = pure code organization. Tasks 6-7 = new feature (module enable/disable). |
| Middleware can't access Prisma (Edge runtime) → route gating breaks | Medium | High | Verify in Task 7 BEFORE writing the gating code: `grep -r "runtime" app/middleware.ts`. If Edge: fall back to gating in layouts (slower per-request but works) or pass module config via cookies set by a server-rendered root component. Documented as Decision-time fallback in Task 7 notes. |
| `/admin/settings/modules` accidentally lets MANAGER toggle (auth check forgotten) | Low | High | TS-011 explicitly verifies MANAGER cannot toggle. Implementer must call `requireRole(["ADMIN"])` at the page entry AND inside the server action. Belt + suspenders. |
| Disabling SERVICE module breaks the homepage (which depends on service-categories grid) | Medium | Medium | Homepage explicitly conditionally renders the service-categories section based on `disabledModules.has("service")`. TS-009 step 8 verifies the homepage still renders without 500 when the section is hidden. |
| Sidebar restructure regresses workflow ergonomics that the user explicitly asked for 4 days ago | High (already happened) | Low | Documented + accepted in user Q&A 2026-04-16. The trade-off was explicit: workflow grouping vs module-aligned grouping. User chose module-aligned. No mitigation — this IS the intended state. |
| Sidebar restructure breaks links/bookmarks that previously expected groups in a specific order | Low | Low | Group order is visual only — actual URLs unchanged. Bookmarks to `/admin/rentals` still work; user just finds it under "Аренда" instead of "Управление". |
| Module config change requires a server restart (cache not invalidated) | Medium | Medium | `getModuleConfig()` uses React `cache()` which is per-request. Each new request gets fresh data. No restart needed. Verified in TS-009 by reload after toggle. |
| Toggle UI doesn't reflect DB state (stale render) | Low | Medium | Settings page is a server component, fetches state on every render. No stale state possible. |
| API routes (e.g. `/api/parts/import`) not gated by middleware → backdoor access | Medium | Medium | Add API routes to `MODULE_ROUTES` mapping in middleware. TS-009 covers `/admin/parts` URL, but implementer must also test `curl /api/parts/import` returns 404 when parts disabled. |

## Goal Verification

### Truths

1. **Every file in the Feature Inventory has a single, declared destination.** No "where does this go?" decisions remain at implementation time. Verified by reading the inventory tables above.
2. **`bunx tsc --noEmit` passes with zero errors after every task** — proves all import paths are intact at every checkpoint, not just at the end.
3. **`npm run lint` passes with zero new errors** at the end. The 8 pre-existing warnings (ImageGallery `<img>`, theme-init.js unused var) are unchanged.
4. **`npm run build` produces the expected route list** — `60` routes total (59 pre-refactor + 1 new for `/admin/settings/modules`). Pre-task-7 count = 59.
5. **`eslint-plugin-boundaries` rule catches an intentional cross-module import** — Task 5 walks through this test explicitly, must FAIL on the offending line, must PASS once the import is removed. TS-006 verifies.
6. **Every existing URL still renders identically while all modules enabled** — public homepage, `/rentals`, `/rentals/[id]`, `/parts`, `/parts/[slug]`, `/parts/cart`, `/services`, `/services/[slug]`, `/booking` (and steps 2-5), `/admin`, every admin sub-page, every cabinet page. Spot check covers the new 4-group sidebar + the public surface. TS-001/002/003/004/005 verify.
7. **`AGENTS.md` documents the module boundaries** so future Claude sessions know where new files go. TS-007 verifies (no UI; just file content check).
8. **Sidebar matches module structure** — the new layout has 4 groups (Сервис / Запчасти / Аренда / Платформа) matching the codebase 1:1. TS-002 verifies.
9. **Modules can be toggled and the toggle persists across reloads** — `ModuleConfig` table holds the state; admin UI changes it; pages re-render with the new state. TS-009 verifies.
10. **Disabled modules return 404 on their URLs and disappear from all navs** — admin sidebar, public header, portal sidebar all filter; URLs return 404. TS-009 verifies.
11. **Disabling a module preserves data; re-enabling restores full access without loss.** TS-010 verifies.
12. **MANAGER role cannot toggle modules; only ADMIN can.** TS-011 verifies.

### Artifacts

- `modules/rentals/{actions,public/components,admin/components}/` — RENTALS module tree
- `modules/parts/{actions,public/components,admin/components}/` — PARTS module tree
- `modules/service/{actions,public/components,portal/components,admin/components/procurement}/` — SERVICE module tree
- `modules/platform/actions/module-config.ts` — module-toggle server action (Decision G)
- `components/platform/{AdminSidebar,AdminMobileNav,AdminCalendar,CMSEditor}.tsx`
- `lib/shared/models.ts` — moved from `lib/models-data.ts`
- `lib/module-config.ts` — `getModuleConfig()` helper with React `cache()`
- `prisma/schema.prisma` — adds `ModuleConfig` model
- `prisma/migrations/<timestamp>_add_module_config/migration.sql`
- `prisma/seed.ts` — extended to upsert 3 ModuleConfig rows
- `app/middleware.ts` — extended with module-route gating
- `app/(admin)/admin/settings/page.tsx` — settings landing
- `app/(admin)/admin/settings/modules/page.tsx` — toggle UI (ADMIN-only)
- `lib/admin-nav.ts` — restructured to one-group-per-module + accepts disabledModules filter
- `eslint.config.mjs` — extended with `eslint-plugin-boundaries` rules
- `package.json` — adds `eslint-plugin-boundaries` to devDependencies
- `AGENTS.md` — new "Module boundaries" section
- `.claude/rules/geleoteka-project.md` — new "Module boundaries" reference

## E2E Test Scenarios

### TS-001: Public surface unchanged after refactor
**Priority:** Critical
**Preconditions:** Dev server running on https://localhost:443, no admin session needed
**Mapped Tasks:** Task 2, Task 3, Task 4

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to `https://localhost/` | Homepage renders. Hero, services, models, reviews, FAQ, CTA visible. Zero console errors. |
| 2 | Navigate to `/rentals` | Lists all 3 G-Class cars with photos, specs, daily rate. |
| 3 | Click any car card | `/rentals/[id]` detail page renders with image gallery, specs, booking form. |
| 4 | Navigate to `/parts` | Parts catalog renders with PartsSearch + grid. |
| 5 | Click any part card | `/parts/[slug]` detail page renders with AddToCartButton. |
| 6 | Navigate to `/services` | Service categories list renders. |
| 7 | Navigate to `/booking` | Booking wizard step 1 renders with ServiceSelector + StepIndicator. |
| 8 | Click Continue | Step 2 (`/booking/step-2`) renders with VehicleInput. |
| 9 | Check console after each step | Zero errors, zero warnings. |

### TS-002: Admin surface uses NEW module-aligned sidebar
**Priority:** Critical
**Preconditions:** Admin logged in as `admin@geleoteka.ru`, all modules enabled (default state)
**Mapped Tasks:** Task 1, Task 2, Task 3, Task 4, Task 5

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin` | Dashboard renders with stats. Sidebar shows Дашборд (standalone) + **4** collapsible groups: **Сервис, Запчасти, Аренда, Платформа** (NEW STRUCTURE — replaces the previous Операции/Управление/Поставки grouping). |
| 2 | Expand **Сервис**, verify sub-items | Shows: Записи, Календарь, Сметы, Клиенты, Поставщики, Заказы поставщикам, Учредители (7 items). |
| 3 | Click Записи | `/admin/appointments` renders. |
| 4 | Click Календарь | `/admin/calendar` renders with `AdminCalendar` widget (now from `components/platform/`). |
| 5 | Click Поставщики | `/admin/suppliers` renders. |
| 6 | Click Учредители | `/admin/founders` renders with the 4 seeded founders. |
| 7 | Expand **Запчасти**, verify sub-items | Shows: Каталог, Заказы клиентов (2 items). |
| 8 | Click Каталог | `/admin/parts` renders. |
| 9 | Click any part row | `/admin/parts/[id]` renders with PartEditForm. Save flow works. |
| 10 | Click Заказы клиентов | `/admin/orders` renders with customer parts orders + OrderStatusChanger. |
| 11 | Expand **Аренда**, verify sub-items | Shows: Автопарк, Бронирования (2 items). |
| 12 | Click Автопарк | `/admin/rentals` renders. |
| 13 | Click Бронирования | `/admin/rentals/bookings` renders with RentalStatusChanger UI. |
| 14 | Expand **Платформа**, verify sub-items | Shows: Контент, Команда, Настройки модулей (3 items — last is NEW from Task 7). |
| 15 | Click Настройки модулей | `/admin/settings/modules` renders with 3 toggles. |
| 16 | Navigate to `/admin/suppliers/orders/[any-id]` | Order detail with all 4 founder ContributionPaidToggle rows + SupplierOrderStatusChanger. |
| 17 | Check console after each navigation | Zero errors, zero warnings. |
| 18 | Click any group header twice | Single-open accordion still works (behavior preserved from prior plan). |

### TS-003: Portal surface unchanged after refactor
**Priority:** High
**Preconditions:** Client logged in as `client@test.ru` in an isolated browser context
**Mapped Tasks:** Task 4

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to `/cabinet` | Portal home renders with quick stats. Portal sidebar is FLAT (9 items: Главная, Мои авто, История, Статус, Сметы, Запчасти, Аренда, Лояльность, Уведомления). |
| 2 | Click Статус | `/cabinet/tracking` renders with StatusBoard component. |
| 3 | Click Сметы | `/cabinet/estimates` renders with EstimateReview list. |
| 4 | Click Аренда | `/cabinet/rentals` renders (currently a stub — that's expected, no behavior change). |

### TS-004: Mobile drawer unchanged after refactor
**Priority:** High
**Preconditions:** Admin session, viewport resized to 375×812
**Mapped Tasks:** Task 1

| Step | Action | Expected Result |
|---|---|---|
| 1 | At admin/parts on 375px viewport, hit hamburger | Mobile drawer opens with same 3 collapsible groups + Дашборд. |
| 2 | Tap Управление header | Group expands. Single-open accordion still works. |
| 3 | Tap Запчасти sub-item | Drawer closes, navigates to /admin/parts. |

### TS-005: Build artifact integrity
**Priority:** Critical
**Preconditions:** All 5 tasks complete, no dev server running
**Mapped Tasks:** Task 5

| Step | Action | Expected Result |
|---|---|---|
| 1 | Run `npm run build` from clean state | Exit 0, build completes. |
| 2 | Compare route list to baseline | 59 routes printed in build output, matching pre-refactor count exactly. |
| 3 | Run `bunx tsc --noEmit` | Zero errors. |
| 4 | Run `npm run lint` | Zero errors. Pre-existing 8 warnings unchanged. |

### TS-006: ESLint boundary rule catches violations (intentional violation test)
**Priority:** Critical
**Preconditions:** Task 5 complete, all rules active
**Mapped Tasks:** Task 5

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open `modules/rentals/admin/components/RentalEditForm.tsx`, add temporary line `import { createPart } from "@/modules/parts/actions/parts";` at the top | File now contains an intentional cross-module import. |
| 2 | Run `npm run lint` | Lint FAILS with `eslint-plugin-boundaries` reporting "boundaries/no-private" or "boundaries/element-types" violation on the offending line, message naming both rentals and parts. |
| 3 | Remove the temporary line | File is back to original state. |
| 4 | Run `npm run lint` again | Lint PASSES. Same baseline as before the test. |

### TS-007: AGENTS.md documents the module boundaries
**Priority:** High
**Preconditions:** Task 5 complete
**Mapped Tasks:** Task 5

| Step | Action | Expected Result |
|---|---|---|
| 1 | `cat AGENTS.md` (or Read it) | Contains a "Module boundaries" section with: target directory structure, the lookup table for "where does new code go," and a pointer to `eslint.config.mjs` for the enforcement rule. |
| 2 | `cat .claude/rules/geleoteka-project.md` | Contains a parallel "Module boundaries" section so future Claude sessions in this project apply the rule. |

### TS-008: ModuleConfig defaults to all enabled after migration
**Priority:** Critical
**Preconditions:** Task 6 complete, fresh `npx prisma migrate dev && npx prisma db seed` run
**Mapped Tasks:** Task 6

| Step | Action | Expected Result |
|---|---|---|
| 1 | Query DB: `SELECT id, "isEnabled" FROM "ModuleConfig" ORDER BY id` | Returns exactly 3 rows: `parts/true`, `rentals/true`, `service/true`. |
| 2 | Re-run `npx prisma db seed` | Idempotent — still 3 rows, no duplicates, no errors. |
| 3 | Navigate to all module URLs (`/rentals`, `/parts`, `/services`, `/admin/rentals`, `/admin/parts`, `/admin/appointments`) | All return 200 (or 307 for admin auth) — default-enabled state means everything works exactly as before this plan. |

### TS-009: Admin can disable a module via the settings page
**Priority:** Critical
**Preconditions:** Admin logged in, all modules enabled (default state), Tasks 6+7 complete
**Mapped Tasks:** Task 7

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/settings/modules` | Page renders with 3 module rows (Сервис, Запчасти, Аренда), each with an "Enabled" toggle, plus a warning text explaining the effect. |
| 2 | Click the "Аренда" toggle to disable | Toggle visually flips to disabled state. Server action fires. |
| 3 | Reload the page (`F5`) | Аренда toggle still shows disabled state — toggle persisted to DB. |
| 4 | Open browser dev tools → Network tab | The settings page renders without errors. |
| 5 | Look at admin sidebar | "Аренда" group is GONE from the sidebar (it had Автопарк + Бронирования; now neither appears). Дашборд / Сервис / Запчасти / Платформа remain. |
| 6 | Navigate to `/admin/rentals` directly via URL bar | Returns 404 (Next.js default not-found page or custom). |
| 7 | Navigate to `/rentals` (public) directly | Returns 404. |
| 8 | Navigate to public homepage `/` | The "Аренда" link is gone from the header nav. The "Аренда G-Class" CTA section (if any) is also hidden. |
| 9 | Re-toggle Аренда back to enabled | Toggle persists. Sidebar shows Аренда group again. /rentals returns 200 again. **No data lost** — RentalCar rows are still in DB (verified by visiting /admin/rentals/[id] for any car). |

### TS-010: Disabling a module preserves data
**Priority:** Critical
**Preconditions:** Test runs immediately after TS-009 (so we have known-disabled→re-enabled state)
**Mapped Tasks:** Task 7

| Step | Action | Expected Result |
|---|---|---|
| 1 | Disable Аренда via /admin/settings/modules | URL returns 404, nav hides Аренда. |
| 2 | Query DB directly: `SELECT COUNT(*) FROM "RentalCar"` and `SELECT COUNT(*) FROM "RentalBooking"` | Same counts as before disabling — data preserved. |
| 3 | Re-enable Аренда | Visual + URL access restored. |
| 4 | Navigate to `/admin/rentals` | Lists exactly the same 3 cars as before, each with its full edit history. |

### TS-011: MANAGER cannot toggle modules
**Priority:** High
**Preconditions:** A user with role=MANAGER exists (or upgrade `admin@geleoteka.ru` to MANAGER for one test); module toggles must enforce ADMIN-only
**Mapped Tasks:** Task 7

| Step | Action | Expected Result |
|---|---|---|
| 1 | Log in as a MANAGER user | Login succeeds. |
| 2 | Navigate to `/admin/settings/modules` | Page redirects to `/admin` (or /login, or 403 — implementer decides; the requirement is access is denied). |
| 3 | Try the server action directly via fetch (or via console)) | Server action rejects with auth error — does NOT mutate DB. (Implementer ensures the action calls `requireRole(["ADMIN"])` on entry.) |

## Progress Tracking

- [ ] Task 1: Scaffold + platform extraction (`modules/`, `components/platform/`, `lib/shared/`, move AdminSidebar/AdminMobileNav/AdminCalendar/CMSEditor + lib/models-data → lib/shared/models)
- [ ] Task 2: Move RENTALS module (4 components, 1 actions file, 7 page imports)
- [ ] Task 3: Move PARTS module (6 components, 3 actions files, 9 page imports + 1 API route)
- [ ] Task 4: Move SERVICE module (16 components incl. procurement, 8 actions files, 24+ page imports + 2 API routes)
- [ ] Task 5: Install eslint-plugin-boundaries + activate rules + restructure sidebar to one-group-per-module + intentional-violation test + AGENTS.md update
- [ ] Task 6: Add `ModuleConfig` Prisma model + migration + seed (all enabled by default) + server-side `getModuleConfig()` helper
- [ ] Task 7: Wire module toggles into runtime — middleware route gate + nav data filter + admin settings page at `/admin/settings/modules` + public surface filter
      **Total Tasks:** 7 | **Completed:** 0 | **Remaining:** 7

## Implementation Tasks

---

### Task 1: Scaffold + platform extraction

**Objective:** Create the new `modules/{rentals,parts,service}/` directory tree, the `components/platform/` directory, and the `lib/shared/` directory. Move the 4 platform-level admin components (AdminSidebar, AdminMobileNav, AdminCalendar, CMSEditor) into `components/platform/`. Move `lib/models-data.ts` to `lib/shared/models.ts`. Update consumers' import paths. This task creates the empty module tree but does NOT activate the ESLint rules yet (those come in Task 5 — until then, all imports work as before).

**Dependencies:** None
**Mapped Scenarios:** TS-001 (homepage uses `lib/models-data` via `MODELS`), TS-002 (admin nav uses AdminSidebar/AdminMobileNav), TS-005

**Files:**
- Create directories: `modules/rentals/{actions,public/components,admin/components,portal/components,lib}/`, `modules/parts/{actions,public/components,admin/components,portal/components,lib}/`, `modules/service/{actions,public/components,admin/components,admin/components/procurement,portal/components,lib}/`, `components/platform/`, `lib/shared/`
- Create placeholder `.gitkeep` files in each empty leaf so empty directories survive the commit
- Move (`git mv`): `components/admin/AdminSidebar.tsx` → `components/platform/AdminSidebar.tsx`
- Move (`git mv`): `components/admin/AdminMobileNav.tsx` → `components/platform/AdminMobileNav.tsx`
- Move (`git mv`): `components/admin/AdminCalendar.tsx` → `components/platform/AdminCalendar.tsx`
- Move (`git mv`): `components/admin/CMSEditor.tsx` → `components/platform/CMSEditor.tsx`
- Move (`git mv`): `lib/models-data.ts` → `lib/shared/models.ts`
- Modify (import path update): `app/(admin)/layout.tsx` (AdminSidebar, AdminMobileNav)
- Modify: `app/(admin)/admin/calendar/page.tsx` (AdminCalendar)
- Modify: `app/(admin)/admin/cms/page.tsx` (CMSEditor)
- Modify: `app/(public)/page.tsx` (MODELS)
- Modify: `app/(public)/models/page.tsx` (MODELS)
- Modify: `app/(public)/models/[slug]/page.tsx` (MODELS, getModelBySlug)
- Modify: `app/(portal)/cabinet/cars/add/page.tsx` (MODELS)
- Modify: `components/booking/VehicleInput.tsx` (MODELS) — note: this file still lives at the old path; will be moved in Task 4
- Modify: `components/admin/PartForm.tsx` (MODELS) — same; moved in Task 3
- Modify: `components/admin/PartEditForm.tsx` (MODELS) — same; moved in Task 3

**Key Decisions / Notes:**
- Use `git mv` for every physical move. Verify with `git log --follow components/platform/AdminSidebar.tsx` after the commit shows pre-2026-04-12 history.
- Empty leaf directories under `modules/` need `.gitkeep` to survive the commit (Git ignores empty dirs).
- After all paths are updated, run `bunx tsc --noEmit` and fix any remaining import errors.
- DO NOT enable ESLint boundary rules yet — that's Task 5. Premature activation here would block Tasks 2-4 from compiling.
- DO NOT add a TS path alias like `@modules/*` yet — adds complexity, optional. If wanted, add at end of Task 5.
- `MODELS` import update path: `from "@/lib/models-data"` → `from "@/lib/shared/models"`. Single search-and-replace across 7 files.

**Definition of Done:**
- [ ] Directory tree exists: `ls modules/rentals/actions/ modules/parts/admin/components/ modules/service/admin/components/procurement/ components/platform/ lib/shared/` all return without error
- [ ] `git ls-files components/platform/` lists exactly: AdminCalendar.tsx, AdminMobileNav.tsx, AdminSidebar.tsx, CMSEditor.tsx
- [ ] `git ls-files lib/shared/` lists exactly: models.ts (no .gitkeep — file exists)
- [ ] `git log --follow components/platform/AdminSidebar.tsx` shows commits from 2026-04-12 (admin-sidebar-audit)
- [ ] `git log --follow lib/shared/models.ts` shows commits from earlier seed dates (proves history preserved across the move)
- [ ] `bunx tsc --noEmit` passes with zero errors
- [ ] `npm run build` succeeds
- [ ] Runtime smoke (Chrome DevTools MCP): `/admin` renders sidebar correctly, `/admin/calendar` renders, `/admin/cms` renders, public homepage renders. Zero console errors.

**Verify:**
- `bunx tsc --noEmit`
- `npm run build 2>&1 | tail -5`
- `git log --follow components/platform/AdminSidebar.tsx | head -5`
- Browser smoke per DoD

---

### Task 2: Move RENTALS module

**Objective:** Move all rental-owned components and the rentals server action into `modules/rentals/`. Update every page that imports them.

**Dependencies:** Task 1
**Mapped Scenarios:** TS-001 (rental list + detail page), TS-002 (admin rental edit + bookings), TS-005

**Files:**
- Move (`git mv`): `components/rentals/RentalBookingForm.tsx` → `modules/rentals/public/components/RentalBookingForm.tsx`
- Move: `components/admin/RentalEditForm.tsx` → `modules/rentals/admin/components/RentalEditForm.tsx`
- Move: `components/admin/RentalStatusChanger.tsx` → `modules/rentals/admin/components/RentalStatusChanger.tsx`
- Move: `app/actions/rentals.ts` → `modules/rentals/actions/rentals.ts`
- Modify (path update): `app/(public)/rentals/[id]/page.tsx` (RentalBookingForm)
- Modify: `app/(admin)/admin/rentals/[id]/page.tsx` (RentalEditForm)
- Modify: `app/(admin)/admin/rentals/new/page.tsx` (createRentalCar from rentals.ts)
- Modify: `app/(admin)/admin/rentals/bookings/page.tsx` (RentalStatusChanger)
- Modify (path update inside the moved files): each component that imports `from "@/app/actions/rentals"` updates to `from "@/modules/rentals/actions/rentals"`
- Modify: `components/rentals/` parent directory ends up empty after the move — leave it empty (Git ignores it). Or remove with `rmdir components/rentals`. Implementer's call.

**Key Decisions / Notes:**
- Both `RentalEditForm` and `RentalStatusChanger` import from `@/app/actions/rentals`. After Task 2 they import from `@/modules/rentals/actions/rentals`.
- `RentalBookingForm` imports `createRentalBooking` from `@/app/actions/rentals` — same path update.
- Smoke test after move: navigate to `/rentals/[any-id]`, see booking form. `/admin/rentals/[any-id]`, see edit form. `/admin/rentals/bookings`, see status changer.
- After all moves, `components/rentals/` should be empty. After all of Tasks 2/3/4, `components/admin/` should also be empty (everything either moved to a module or to `components/platform/`).

**Definition of Done:**
- [ ] `git ls-files modules/rentals/` lists: actions/rentals.ts, admin/components/RentalEditForm.tsx, admin/components/RentalStatusChanger.tsx, public/components/RentalBookingForm.tsx
- [ ] `git ls-files components/rentals/` returns nothing (or only .gitkeep if implementer chose to keep dir)
- [ ] `git ls-files components/admin/Rental*` returns nothing
- [ ] `git ls-files app/actions/rentals.ts` returns nothing
- [ ] `bunx tsc --noEmit` passes with zero errors
- [ ] `npm run build` succeeds
- [ ] Runtime smoke (Chrome DevTools MCP): `/rentals` lists 3 cars, `/rentals/[id]` shows detail with booking form, `/admin/rentals/[id]` shows edit form, `/admin/rentals/bookings` shows bookings list with status changer. Zero console errors.

**Verify:**
- `bunx tsc --noEmit`
- `npm run build 2>&1 | tail -5`
- `git log --follow modules/rentals/admin/components/RentalEditForm.tsx | head -5` (history preserved)
- Browser smoke per DoD

---

### Task 3: Move PARTS module

**Objective:** Move all parts-owned components and parts-related server actions + the parts CSV import API route into `modules/parts/`. Update every consumer page.

**Dependencies:** Task 1
**Mapped Scenarios:** TS-001 (public parts catalog + cart), TS-002 (admin parts CRUD + customer orders), TS-005

**Files:**
- Move: `components/parts/AddToCartButton.tsx` → `modules/parts/public/components/AddToCartButton.tsx`
- Move: `components/parts/PartsCart.tsx` → `modules/parts/public/components/PartsCart.tsx`
- Move: `components/parts/PartsSearch.tsx` → `modules/parts/public/components/PartsSearch.tsx`
- Move: `components/admin/PartEditForm.tsx` → `modules/parts/admin/components/PartEditForm.tsx`
- Move: `components/admin/PartForm.tsx` → `modules/parts/admin/components/PartForm.tsx`
- Move: `components/admin/OrderStatusChanger.tsx` → `modules/parts/admin/components/OrderStatusChanger.tsx`
- Move: `app/actions/parts.ts` → `modules/parts/actions/parts.ts`
- Move: `app/actions/part-orders.ts` → `modules/parts/actions/part-orders.ts`
- Move: `app/actions/part-order-admin.ts` → `modules/parts/actions/part-order-admin.ts`
- API route stays at `app/api/parts/import/route.ts` (Next.js requires it under `app/api`). The route's internal logic may import from `modules/parts/lib/` if any helpers grow there. For now, the route file UNCHANGED in location; only fix import paths if it imports from `@/app/actions/parts` (it currently imports `db` from `@/lib/db` — unaffected).
- Modify import paths: `app/(public)/parts/page.tsx` (PartsSearch), `app/(public)/parts/[slug]/page.tsx` (AddToCartButton), `app/(public)/parts/cart/page.tsx` (PartsCart), `app/(admin)/admin/parts/[id]/page.tsx` (PartEditForm), `app/(admin)/admin/parts/new/page.tsx` (PartForm + createPart action), `app/(admin)/admin/orders/page.tsx` (OrderStatusChanger), and inside the moved components themselves (PartsCart imports createPartOrder from part-orders, etc.)

**Key Decisions / Notes:**
- `OrderStatusChanger` is for CUSTOMER PartOrder status changes (not supplier orders). Stays in PARTS module. Don't confuse with `SupplierOrderStatusChanger` which goes to SERVICE/procurement.
- `app/(admin)/admin/orders/page.tsx` is for PartOrder (customer parts orders) — PARTS module. The label "Заказы клиентов" in the sidebar is the disambiguator.
- `PartForm` and `PartEditForm` import `MODELS` from `@/lib/shared/models` (after Task 1's move).
- After Task 3 completes, `components/parts/` should be empty.

**Definition of Done:**
- [ ] `git ls-files modules/parts/` lists: actions/parts.ts, actions/part-orders.ts, actions/part-order-admin.ts, admin/components/{OrderStatusChanger.tsx, PartEditForm.tsx, PartForm.tsx}, public/components/{AddToCartButton.tsx, PartsCart.tsx, PartsSearch.tsx}
- [ ] `git ls-files components/parts/` returns nothing
- [ ] `git ls-files components/admin/{Part*,OrderStatus*}` returns nothing
- [ ] `git ls-files app/actions/{parts,part-orders,part-order-admin}.ts` returns nothing
- [ ] `bunx tsc --noEmit` passes with zero errors
- [ ] `npm run build` succeeds
- [ ] Runtime smoke (Chrome DevTools MCP): `/parts` lists parts with search, `/parts/[slug]` shows detail with AddToCartButton, `/parts/cart` shows cart, `/admin/parts/[id]` shows edit form, `/admin/parts/new` shows new form, `/admin/orders` shows customer parts orders with status changer. Zero console errors.

**Verify:**
- `bunx tsc --noEmit`
- `npm run build 2>&1 | tail -5`
- Browser smoke per DoD

---

### Task 4: Move SERVICE module (incl. procurement submodule)

**Objective:** Move all service-owned components (booking wizard, portal, admin appointments/estimates/calendar/team/customers) and procurement-owned components (suppliers, supplier orders, founders) into `modules/service/`. Move corresponding server actions. Update all consumer pages.

**Dependencies:** Task 1
**Mapped Scenarios:** TS-001 (public booking wizard, services), TS-002 (admin appointments + estimates + procurement), TS-003 (portal cabinet), TS-005

**Files:**
- Move (booking wizard, public): all 7 `components/booking/*.tsx` → `modules/service/public/components/`
- Move (portal): all 2 `components/portal/*.tsx` → `modules/service/portal/components/`
- Move (admin, service core): `components/admin/EstimateBuilder.tsx`, `StatusChanger.tsx`, `DeleteAppointmentButton.tsx` → `modules/service/admin/components/`
- Move (admin, procurement): `SupplierEditForm.tsx`, `SupplierOrderForm.tsx`, `SupplierOrderStatusChanger.tsx`, `ContributionPaidToggle.tsx`, `FounderEditForm.tsx` → `modules/service/admin/components/procurement/`
- Move (actions, service core): `app/actions/booking.ts`, `cars.ts`, `estimates.ts`, `admin.ts` → `modules/service/actions/`
- Move (actions, procurement): `app/actions/suppliers.ts`, `supplier-orders.ts`, `founders.ts` → `modules/service/actions/`
- API routes stay at `app/api/{appointments,slots}/route.ts` — they only import from `@/lib/auth` and `@/lib/db`, which are platform/shared.
- Modify import paths in every page that imports any of the above (long list — see Feature Inventory's pages table; ~24 pages affected for service)
- Modify import paths inside the moved components themselves (e.g. `EstimateBuilder` imports `createEstimate` from `@/app/actions/admin` → now `@/modules/service/actions/admin`)

**Key Decisions / Notes:**
- `app/actions/admin.ts` mixes appointment + estimate actions. Both belong to SERVICE. Move file AS-IS to `modules/service/actions/admin.ts`. Optionally split into separate files at the implementer's discretion ONLY if the move is otherwise blocked (it shouldn't be).
- `app/actions/cars.ts` is for customer car records (the cars they bring in for service), NOT rentals. SERVICE module.
- The booking wizard (`components/booking/*`) is the customer-facing 5-step appointment scheduler. SERVICE module, public surface. After move: `modules/service/public/components/{BookingProvider, StepIndicator, ServiceSelector, VehicleInput, CalendarSlotPicker, ContactForm, BookingConfirmation}.tsx`.
- The portal components (`StatusBoard` for tracking, `EstimateReview` for estimate approval) are SERVICE concerns shown in the customer cabinet. SERVICE module, portal surface.
- After Task 4, `components/booking/`, `components/portal/`, and most of `components/admin/` should be empty. Only the 4 platform components moved in Task 1 remain in `components/platform/`.

**Definition of Done:**
- [ ] `git ls-files modules/service/public/components/` lists 7 booking wizard files
- [ ] `git ls-files modules/service/portal/components/` lists 2 portal files
- [ ] `git ls-files modules/service/admin/components/` lists 3 service admin files (EstimateBuilder, StatusChanger, DeleteAppointmentButton)
- [ ] `git ls-files modules/service/admin/components/procurement/` lists 5 procurement files
- [ ] `git ls-files modules/service/actions/` lists 7 service action files (booking, cars, estimates, admin, suppliers, supplier-orders, founders)
- [ ] `git ls-files components/booking/ components/portal/` returns nothing
- [ ] `git ls-files components/admin/` returns nothing (every file moved out, sidebar+mobile-nav+calendar+cms-editor went to platform/)
- [ ] `git ls-files app/actions/{booking,cars,estimates,admin,suppliers,supplier-orders,founders}.ts` returns nothing
- [ ] `bunx tsc --noEmit` passes with zero errors
- [ ] `npm run build` succeeds, route count = 59
- [ ] Runtime smoke (Chrome DevTools MCP): public homepage, `/services`, `/booking` (5 steps), `/cabinet`, `/cabinet/tracking`, `/cabinet/estimates`, `/admin/appointments`, `/admin/calendar`, `/admin/estimates`, `/admin/customers`, `/admin/team`, `/admin/founders`, `/admin/suppliers`, `/admin/suppliers/orders` all render. Zero console errors.

**Verify:**
- `bunx tsc --noEmit`
- `npm run build 2>&1 | tail -10` (verify route count line shows 59)
- Browser smoke per DoD

---

### Task 5: Install eslint-plugin-boundaries + activate rules + docs

**Objective:** Install `eslint-plugin-boundaries`, configure element types and the dependency matrix, prove the rule catches an intentional cross-module import via TS-006, update `AGENTS.md` and `.claude/rules/geleoteka-project.md` with a Module boundaries section.

**Dependencies:** Task 2, Task 3, Task 4
**Mapped Scenarios:** TS-005, TS-006, TS-007

**Files:**
- Modify: `package.json` (add `eslint-plugin-boundaries` to devDependencies)
- Modify: `eslint.config.mjs` (or wherever ESLint config lives — implementer to verify exact filename) — add the plugin, define element types (rentals, parts, service, platform, shared, app, api), configure the dependency matrix
- Modify: `AGENTS.md` (add Module boundaries section)
- Modify: `.claude/rules/geleoteka-project.md` (add Module boundaries section pointing at the rule)

**Key Decisions / Notes:**

The dependency matrix to encode:

| Source element | Allowed to import from |
|---|---|
| `modules/rentals/**` | `modules/rentals/**` (self), `lib/**` (shared infra, including `lib/shared/`), `components/shared/**`, `components/platform/**` (read-only — actually no, platform is admin chrome and modules shouldn't import it; restrict to just shared) — let me reconsider |
| `modules/parts/**` | self, `lib/**`, `components/shared/**` |
| `modules/service/**` | self, `lib/**`, `components/shared/**` |
| `components/platform/**` | `lib/**`, `components/shared/**`, `modules/**` (allowed — sidebar/nav references all modules' URLs as strings via `lib/admin-nav.ts`, but in practice platform components import zero module code today; allow defensively) |
| `app/(public|portal|admin)/**` (page files) | self-page-tree, `lib/**`, `components/shared/**`, `components/platform/**`, `modules/**` (any module — pages are the orchestration layer that wires modules to URLs) |
| `app/actions/**` (auth-only actions remain here) | `lib/**` |
| `app/api/**` | `lib/**`, `modules/**` (API routes can call into module code) |
| `lib/**` | `lib/**` only (no upward imports) |
| `components/shared/**` | `lib/**`, `components/shared/**` only (no upward imports) |

Crucially: **module → other module** is FORBIDDEN. **module → platform** is FORBIDDEN (platform is admin chrome, modules shouldn't depend on it). **page → any** is allowed (pages are wiring).

ESLint config sketch (the implementer fills in the exact syntax for `eslint-plugin-boundaries` 5.x flat config):

```js
import boundaries from "eslint-plugin-boundaries";

export default [
  // ... existing config ...
  {
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "module-rentals", pattern: "modules/rentals/**/*" },
        { type: "module-parts", pattern: "modules/parts/**/*" },
        { type: "module-service", pattern: "modules/service/**/*" },
        { type: "platform", pattern: "components/platform/**/*" },
        { type: "shared-components", pattern: "components/shared/**/*" },
        { type: "shared-lib", pattern: "lib/**/*" },
        { type: "page", pattern: "app/**/page.tsx" },
        { type: "layout", pattern: "app/**/layout.tsx" },
        { type: "api", pattern: "app/api/**/*" },
        { type: "auth-action", pattern: "app/actions/{login,logout,register,request-password-reset,confirm-reset-password}.ts" },
      ],
    },
    rules: {
      "boundaries/element-types": ["error", {
        default: "disallow",
        rules: [
          { from: "module-rentals", allow: ["module-rentals", "shared-lib", "shared-components"] },
          { from: "module-parts", allow: ["module-parts", "shared-lib", "shared-components"] },
          { from: "module-service", allow: ["module-service", "shared-lib", "shared-components"] },
          { from: "platform", allow: ["shared-lib", "shared-components"] },
          { from: "shared-components", allow: ["shared-lib", "shared-components"] },
          { from: "shared-lib", allow: ["shared-lib"] },
          { from: ["page", "layout"], allow: ["module-rentals", "module-parts", "module-service", "platform", "shared-lib", "shared-components", "auth-action"] },
          { from: "api", allow: ["module-rentals", "module-parts", "module-service", "shared-lib"] },
          { from: "auth-action", allow: ["shared-lib"] },
        ],
      }],
    },
  },
];
```

After config:
1. Run `npm run lint` — must pass with zero NEW errors. Pre-existing 8 warnings unchanged.
2. **TS-006 intentional violation test:** add `import { createPart } from "@/modules/parts/actions/parts";` to `modules/rentals/admin/components/RentalEditForm.tsx`. Run `npm run lint`. Must FAIL with a `boundaries/element-types` error pointing at the line. Remove the line. Run lint again. Must PASS.

`AGENTS.md` section to add:

```markdown
## Module boundaries

Code is organized into three product modules — **rentals**, **service**, **parts** — plus shared platform code. Each module lives in its own subtree under `modules/<name>/`. Cross-module imports are forbidden by `eslint-plugin-boundaries` and will fail `npm run lint`.

### Where new code goes

- A new module-specific component → `modules/<rentals|service|parts>/<public|admin|portal>/components/<Name>.tsx`
- A new module-specific server action → `modules/<name>/actions/<name>.ts`
- A new component used by 2+ modules → `components/shared/`
- A new lib used by 2+ modules → `lib/shared/`
- New admin chrome (sidebar, nav, theme) → `components/platform/`
- New page → stays under `app/**`, imports from `modules/<name>/`

### Allowed imports

| From | Allowed to import |
|---|---|
| `modules/<X>/**` | self only, `lib/**`, `components/shared/**` |
| `app/**/page.tsx` | any module, `lib/**`, `components/shared/**`, `components/platform/**` |
| `components/platform/**` | `lib/**`, `components/shared/**` |

Full dependency matrix in `eslint.config.mjs`.
```

`.claude/rules/geleoteka-project.md` gets a parallel pointer.

**Definition of Done:**
- [ ] `package.json` lists `eslint-plugin-boundaries` in devDependencies
- [ ] `eslint.config.mjs` (or equivalent) imports and configures the plugin with the dependency matrix above
- [ ] `npm run lint` returns zero errors (pre-existing 8 warnings unchanged)
- [ ] TS-006 intentional violation test passes (lint fails on the temp import, passes after removal)
- [ ] `AGENTS.md` has a "Module boundaries" section matching the structure above
- [ ] `.claude/rules/geleoteka-project.md` has a parallel section
- [ ] `npm run build` succeeds

**Verify:**
- `npm run lint`
- TS-006 procedure (intentional violation, lint fails, remove, lint passes)
- `cat AGENTS.md | grep -A 5 "Module boundaries"`
- `npm run build 2>&1 | tail -5`

**Sidebar restructure subtask (5b — folded into this task because it's a single-file edit to `lib/admin-nav.ts`):**

- Modify: `lib/admin-nav.ts` to use the new structure from the Sidebar Mapping table.
- Update: `app/(admin)/layout.tsx` and `components/platform/AdminSidebar.tsx` if any group label is hardcoded — but they should consume `adminNav` data, so a data-only change is enough.
- Verify in browser: navigate `/admin`, see the new 4-group structure (Сервис / Запчасти / Аренда / Платформа), single-open accordion still works, every sub-item navigates correctly.
- Note: this is a regression of the workflow grouping shipped on 2026-04-12. Documented in TS-002.

---

### Task 6: ModuleConfig Prisma model + helper

**Objective:** Add a single-row-per-module `ModuleConfig` table, migrate, seed all modules as enabled. Add a server-side `getModuleConfig()` helper that returns the current config (cached per-request). No UI changes yet — Task 7 wires it into routes/nav.

**Dependencies:** Task 5
**Mapped Scenarios:** TS-008 (config defaults), TS-009 (toggle persistence)

**Files:**
- Modify: `prisma/schema.prisma` (add `ModuleConfig` model)
- Create: `prisma/migrations/<timestamp>_add_module_config/migration.sql` (auto-generated)
- Modify: `prisma/seed.ts` (insert/upsert one row per module — `rentals`, `service`, `parts` — all `isEnabled = true`)
- Create: `lib/module-config.ts` — exports `getModuleConfig(): Promise<ModuleConfig[]>` (returns array of {id, isEnabled}). Per-request memoization via React `cache()` from `react/server` so multiple consumers in the same request hit the DB once.
- Create: `modules/platform/actions/module-config.ts` (Decision G: lives in `modules/platform/actions/` since it's a platform-level mutation, not in `app/actions/`) — exports `setModuleEnabled(moduleId: string, enabled: boolean)` server action.

**Decision F:** ModuleConfig schema:
```prisma
model ModuleConfig {
  id        String   @id  // "rentals" | "service" | "parts"
  isEnabled Boolean  @default(true)
  updatedAt DateTime @updatedAt
}
```
Single primary key on a string id (no auto-id) so the row IS the module identifier. No `name`/`label` columns — those are static UI strings, not config.

**Decision G:** Module-config server action lives at `modules/platform/actions/module-config.ts`, not `app/actions/`. This requires adding a `modules/platform/` subtree (mirror of `modules/<X>/` but for platform-level admin code). The ESLint rule allows page→`modules/platform/` imports (platform is on the page allow-list). Alternative: `app/actions/module-config.ts` (kept at the existing flat actions directory). Implementer's call — both work, but `modules/platform/` is more consistent with the new structure.

**Key Decisions / Notes:**
- `getModuleConfig()` uses React `cache()` so multiple call sites (layout, middleware, nav filter) in one request fetch from DB once. Critical for performance — middleware runs on EVERY request.
- Seed uses `upsert` so re-running seed doesn't error on existing rows.
- Default seed: all 3 modules enabled. Disabled state must be explicitly set.
- This task does NOT touch routes or UI — those wire in Task 7. Task 6's only verifiable behavior change is "seeding produces 3 ModuleConfig rows in the DB."

**Definition of Done:**
- [ ] `prisma/schema.prisma` contains `ModuleConfig` model with id (string PK), isEnabled (boolean default true), updatedAt
- [ ] `npx prisma migrate dev --name add_module_config` succeeds, generates migration SQL
- [ ] `npx prisma db seed` populates exactly 3 rows: `{id: "rentals", isEnabled: true}`, `{id: "service", isEnabled: true}`, `{id: "parts", isEnabled: true}`. Idempotent on re-run.
- [ ] `lib/module-config.ts` exports `getModuleConfig()` returning the seeded rows. Verified by a one-off Bash check or inline TypeScript playground.
- [ ] `modules/platform/actions/module-config.ts` exports `setModuleEnabled(moduleId, enabled)` with admin-only auth check (ADMIN role only — MANAGER cannot toggle)
- [ ] `bunx tsc --noEmit` passes, `npm run build` succeeds, `npm run lint` passes
- [ ] Direct DB query confirms toggle persists: invoking `setModuleEnabled("rentals", false)` flips the row in the DB. (Tested via the Task 7 admin UI, but the helper itself is testable via a manual one-shot bash + tsx invocation — implementer optional.)

**Verify:**
- `npx prisma migrate dev --name add_module_config && npx prisma db seed`
- `psql postgresql://alex@localhost:5432/geleoteka -c 'SELECT * FROM "ModuleConfig"'` → 3 rows
- `bunx tsc --noEmit`

---

### Task 7: Wire module toggles into runtime (middleware + nav filter + admin settings page + public surface)

**Objective:** Make the `ModuleConfig.isEnabled` flag actually gate access. Disabled modules return 404 on their URLs, vanish from admin/portal/public navs and homepage, and appear with a toggle on the new admin settings page.

**Dependencies:** Task 6
**Mapped Scenarios:** TS-008, TS-009, TS-010, TS-011

**Files:**
- Modify: `app/middleware.ts` — extend with module-route gating. For each request URL, check if the URL prefix matches a module's owned routes (defined as a const `MODULE_ROUTES = { rentals: ["/rentals", "/admin/rentals", "/cabinet/rentals"], parts: ["/parts", "/admin/parts", "/admin/orders", "/cabinet/orders"], service: ["/booking", "/services", "/admin/appointments", "/admin/calendar", "/admin/estimates", "/admin/customers", "/admin/founders", "/admin/suppliers", "/cabinet/estimates", "/cabinet/cars", "/cabinet/history", "/cabinet/tracking"] }`). If the URL matches a disabled module, return `NextResponse.rewrite(new URL("/404", req.url))` or `NextResponse.next()` with a 404 status. Use a per-request `getModuleConfig()` call.
- Modify: `lib/admin-nav.ts` — accept a `disabledModules: Set<string>` parameter (or expose a `filterAdminNav(disabledModules)` function), filter out groups for disabled modules. The PLATFORM group always stays.
- Modify: `app/(admin)/layout.tsx` — fetch module config, filter the nav data, pass filtered data to AdminSidebar/AdminMobileNav.
- Modify: `components/platform/AdminSidebar.tsx` and `AdminMobileNav.tsx` — accept `nav: AdminNavEntry[]` as a prop instead of importing `adminNav` directly (so the layout's filter takes effect). Falls back to imported `adminNav` if no prop passed (keeps backward compat for other callers — there are none, but defensive).
- Modify: `app/(public)/layout.tsx` — fetch module config, filter the nav links (Услуги/Запчасти/Аренда in the header), conditionally render based on `disabledModules`.
- Modify: `app/(public)/page.tsx` — homepage: hide service categories grid section if service disabled, hide parts CTA if parts disabled, hide rentals CTA if rentals disabled.
- Modify: `app/(portal)/layout.tsx` — fetch module config, filter `navItems` to hide cabinet sub-pages for disabled modules.
- Create: `app/(admin)/admin/settings/page.tsx` — landing page that redirects to `/admin/settings/modules` (or shows a settings menu).
- Create: `app/(admin)/admin/settings/modules/page.tsx` — admin-only (`requireRole(["ADMIN"])` — MANAGER cannot access). Lists all 3 modules with current state (enabled/disabled), toggle button per row, calls `setModuleEnabled` server action. Includes warning text: "Disabling a module hides it from navigation and returns 404 on its URLs. Existing data is preserved."
- Modify: `lib/admin-nav.ts` — add the new "Настройки модулей" entry under the Платформа group pointing to `/admin/settings/modules`.

**Key Decisions / Notes:**
- **Middleware caveat:** Next.js middleware runs in Edge runtime (no full Node APIs). Prisma client requires Node — middleware cannot directly call `getModuleConfig()` if Prisma is Edge-incompatible in your setup. Verify this with `grep "runtime" app/middleware.ts` first. **Fallback if middleware can't query DB:** read module config from a JSON file at build time (`next.config.ts` exposes a static config map), OR use Next.js cookies/headers to pass config from a server-rendered root layout. **Preferred approach:** check current `app/middleware.ts` runtime; if it's Node (default for App Router auth-session middleware), proceed as planned. If Edge-only, fall back to gating in the page layouts (slower but works).
- **404 behavior:** disabled module URLs return Next.js's default 404 page, NOT redirect to home. Cleaner — bookmarks to disabled features signal "not available here" rather than silently sending users to homepage.
- **Existing data preservation:** disabling rentals does NOT delete RentalCar/RentalBooking rows. Re-enabling restores full access. The settings page must explicitly state this.
- **Server actions for disabled modules:** the route gate covers HTTP requests, but server actions are invoked via POST to the page's URL. If the page returns 404 for a disabled module, the server action it would have called is unreachable. ✓ Acceptable.
- **API routes:** `app/api/parts/import` and `app/api/appointments/[id]/status` and `app/api/slots` should also be gated. Add `/api/parts/*` to PARTS routes and `/api/appointments/*` + `/api/slots` to SERVICE routes in `MODULE_ROUTES`.
- **Admin settings access:** the toggle UI is gated to ADMIN only (not MANAGER) — disabling a module is a high-impact action. Soft check on the action itself; hard check on the page.
- **Default state:** all modules enabled. The "disable a module" UX is for future tenants who don't want a particular module. Today's Geleoteka deployment will leave everything enabled.

**Definition of Done:**
- [ ] `app/middleware.ts` (or extension) checks module config and returns 404 for disabled modules' URLs
- [ ] `lib/admin-nav.ts` exports `filterAdminNav(disabledModules)` or accepts the param
- [ ] `app/(admin)/layout.tsx` fetches module config and passes filtered nav to AdminSidebar/AdminMobileNav
- [ ] `app/(public)/layout.tsx` filters public header nav for disabled modules
- [ ] `app/(public)/page.tsx` filters homepage sections for disabled modules
- [ ] `app/(portal)/layout.tsx` filters portal nav for disabled modules
- [ ] `app/(admin)/admin/settings/modules/page.tsx` renders 3 module rows with toggles, ADMIN-only
- [ ] Toggle persists across page reload (DB update verified)
- [ ] Disabled module's URL returns 404 (verified via curl + browser)
- [ ] Disabled module's nav items are gone from admin sidebar, public header, portal sidebar
- [ ] Re-enabling restores all access without data loss
- [ ] `bunx tsc --noEmit`, `npm run lint`, `npm run build` all pass
- [ ] Runtime smoke (Chrome DevTools MCP): scenarios TS-008 through TS-011 all pass

**Verify:**
- TS-008 through TS-011 procedures
- `curl https://localhost/rentals -o /dev/null -w "%{http_code}\n"` returns 404 after disabling rentals (note self-signed cert needs `-k`)
- `bunx tsc --noEmit && npm run lint && npm run build`

---

## Open Questions

None — Decisions A, B, C, D, E, F, G all resolved.
