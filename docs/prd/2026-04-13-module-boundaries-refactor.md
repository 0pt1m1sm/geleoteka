# Module Boundaries Refactor — Rentals, Service, Parts

Created: 2026-04-13
Author: aleksandr's.spiskov@gmail.com
Category: Infrastructure
Status: Final
Research: Standard

## Problem Statement

Geleoteka currently bundles three conceptually distinct product lines — **Service** (appointments, estimates, calendar, masters), **Parts Shop** (catalog, cart, customer orders), and **Rentals** (fleet, bookings) — into a single flat application with no enforced boundaries between them. Components, server actions, and routes from all three modules intermix in shared directories (`components/admin/`, `app/actions/`, `app/(admin)/admin/`), cross-module imports are possible with zero friction, and there is no mechanical check preventing Rental code from depending on Service code or vice versa.

Two problems flow from this:

1. **Professional-grade module development is blocked.** The stated goal is to evolve each module into a "professional" offering a real customer-facing rental/service/parts operator could use (see `docs/research/2026-04-13-rental-competitive-analysis.md` for the rental roadmap). Features will stack up fast — calendar views, contract PDFs, payment integrations, damage management. Without a clean boundary, every new feature increases entanglement and makes the next refactor more expensive.
2. **Future optionality to license this as a platform is at risk.** The user's stated ambition is to keep the door open to selling a boilerplate / SaaS version of the platform to other specialist workshops (G-Class specialists, Porsche specialists, etc.), where each customer might want rental ON/OFF or parts ON/OFF independently. Retrofitting module isolation into a sprawled codebase later will be an order of magnitude more expensive than enforcing it now while the modules are still small.

This PRD is **architecture only — no new features.** Every user-facing feature stays exactly where it is. The observable output is: (a) code lives in predictable per-module directories, (b) a lint rule fails CI when any module imports from another module, (c) future `/spec` work has a clear home for every new file.

## Core User Flows

The primary "user" of this refactor is **a future implementer** (human or Claude) working on any feature in any module. The flows below describe how that implementer's workflow changes.

### Flow 1: Implementer adds a new rental feature

1. Implementer opens `/spec` with a rental-module task
2. `/spec` exploration finds the rental module rooted at known paths
3. Implementer creates new files inside the rental module's directories only
4. If they accidentally import from `components/service/**` or `lib/service/**`, ESLint fails locally and in CI with a clear "cross-module import forbidden" error pointing at the offending line
5. The commit is blocked until the import is either removed or moved to the shared allow-list

### Flow 2: Operator-facing impact

1. An admin logs into `/admin` as usual
2. Sidebar, URLs, behavior, and UI are **identical** to before the refactor — this is a pure code organization change
3. No user-visible behavior changes anywhere

### Flow 3: Future platform pivot (optional, not committed)

1. Hypothetical future decision: ship Geleoteka as a boilerplate to another workshop
2. Because the modules are cleanly isolated, the "disable rentals" operation is well-defined — remove one directory tree + one nav entry + one Prisma section
3. No "but rentals imports from service" surprises during that operation

## Scope

### In Scope

1. **Define the target directory structure** for each module (rentals, service, parts) and for shared/platform code. Documented in the PRD and copied into `AGENTS.md` as a reference for future work.
2. **Classify every existing file** into one of: `rentals`, `service`, `parts`, `shared` (used by 2+ modules, e.g. auth, db, utils), or `platform` (admin chrome, sidebar, public layout, marketing pages).
3. **Physically move files** to the new structure using `git mv` so history is preserved. Update all import paths across the repo.
4. **Add ESLint `no-restricted-imports` (or `eslint-plugin-boundaries`)** config that:
   - Forbids `rentals/**` from importing `service/**` and `parts/**`
   - Forbids `service/**` from importing `rentals/**` and `parts/**`
   - Forbids `parts/**` from importing `rentals/**` and `service/**`
   - Allows all modules to import from `shared/**` and `platform/**`
   - Allows `platform/**` (admin layout, nav) to import from all modules *for wiring only* (the sidebar needs to reference every module's routes)
5. **Update `AGENTS.md` and `.claude/rules/geleoteka-project.md`** with a new "Module boundaries" section so future Claude sessions understand where to put new files.
6. **Verify via `npm run lint` and `npm run build`** that the refactor compiles and no cross-module imports exist.
7. **Runtime smoke test** in Chrome DevTools MCP: log in as admin, click through every sidebar entry (Dashboard, Записи, Запчасти, Аренда, all groups), confirm zero regressions.

### Explicitly Out of Scope

- **Any new feature from the rental competitive analysis** — this PRD is architecture only. Rental feature work (calendar, contracts, payments, etc.) is Phase 2+ and will be separate PRDs.
- **Monorepo / npm workspaces restructure** — considered and rejected. Would require Next.js config changes and a separate `package.json` per module. Overkill for preserving optionality; the lint-rule approach is enough.
- **Runtime feature flags** (toggling modules on/off per deployment) — considered and rejected. Adds surface area without a concrete use case today. Can be added later on top of the clean boundary.
- **Prisma schema splitting** — Prisma 6 supports multi-file schema but the current single-file schema is still manageable. May add a per-module comment sections for readability, but no physical split.
- **Database migrations** — none. This PRD doesn't touch the schema.
- **Renaming existing files** unless required by the move. Where possible, use `git mv oldpath newpath` to preserve git history.
- **Changes to public URLs** — every existing URL stays. Only source-file locations change.
- **Changes to the React component tree at runtime** — no props, no contexts, no behavior changes.
- **Test suite creation** — the project has no test runner configured; adding one is its own effort. Verification is via `tsc --noEmit`, `next build`, lint, and Chrome DevTools MCP runtime checks.
- **`components/admin/AdminSidebar.tsx` and `AdminMobileNav.tsx`** — these are platform-level (they need to know about every module's nav data) and stay in `components/admin/` or move to `components/platform/`. Not module-owned.

## Technical Context

### Current reality (as-is)

**Directories that currently house module code with no boundary:**

```
app/(public)/                  # Public marketing + renter/customer-facing pages
├── rentals/                   # rental pages              → RENTALS module
├── parts/                     # parts shop pages          → PARTS module
├── services/                  # service info pages        → SERVICE module
├── models/                    # model info pages          → SERVICE module (cars we service)
├── booking/                   # service booking wizard    → SERVICE module
├── about/, contacts/, blog/   # marketing                 → PLATFORM
├── login/, register/, reset-password/  # auth             → SHARED
├── layout.tsx, page.tsx       # public chrome             → PLATFORM

app/(portal)/cabinet/          # Customer self-service portal
├── rentals/                   # my rentals (stub today)   → RENTALS module
├── orders/                    # my part orders            → PARTS module
├── estimates/, history/, cars/, tracking/  # service      → SERVICE module
├── loyalty/, notifications/   # shared                    → SHARED
├── layout.tsx, page.tsx       # portal chrome             → PLATFORM

app/(admin)/admin/             # Admin panel
├── rentals/                   # fleet + bookings          → RENTALS module
├── parts/, orders/            # parts catalog + customer orders → PARTS module
├── appointments/, calendar/, estimates/, customers/      → SERVICE module
├── suppliers/, founders/      # procurement + ownership   → SERVICE module (or new: FINANCE module?)
├── cms/, team/                # platform admin            → PLATFORM
├── page.tsx, layout.tsx       # admin chrome              → PLATFORM

app/actions/                   # Server actions — currently a flat pile
├── rentals.ts                 → RENTALS
├── parts.ts, part-orders.ts, part-order-admin.ts → PARTS
├── booking.ts, cars.ts, estimates.ts, admin.ts  → SERVICE
├── suppliers.ts, supplier-orders.ts, founders.ts → SERVICE (procurement)
├── cms.ts                     → PLATFORM
├── login.ts, logout.ts, register.ts, request-password-reset.ts, confirm-reset-password.ts → SHARED (auth)

components/                    # Components — partially grouped
├── rentals/                   # 1 file — RentalBookingForm.tsx
├── parts/                     # 3 files — AddToCartButton, PartsCart, PartsSearch
├── booking/                   # 7 files, all service booking wizard
├── portal/                    # portal-only shared components
├── shared/                    # cross-cutting UI primitives (ImageGallery, ThemeToggle, etc.)
├── ui/                        # design system primitives
├── admin/                     # 17 FILES FROM EVERY MODULE MIXED TOGETHER — BIGGEST MESS:
│   ├── AdminSidebar, AdminMobileNav, AdminCalendar              → PLATFORM
│   ├── RentalEditForm, RentalStatusChanger                      → RENTALS
│   ├── PartEditForm, PartForm, OrderStatusChanger               → PARTS
│   ├── EstimateBuilder, StatusChanger, DeleteAppointmentButton → SERVICE
│   ├── SupplierEditForm, SupplierOrderForm, SupplierOrderStatusChanger, ContributionPaidToggle, FounderEditForm → SERVICE (procurement)
│   ├── CMSEditor                                                 → PLATFORM

lib/                           # Utilities
├── auth.ts, db.ts             → SHARED (platform infra)
├── utils.ts, sms.ts, splus.ts → SHARED
├── admin-nav.ts               → PLATFORM
├── models-data.ts             → SERVICE (G-Class model catalog data)
```

**Key observation:** `components/admin/` is the biggest target. It's 17 files mixing every module; any admin feature can unknowingly pull a component from another module. The fix is to mirror the module structure inside it.

### Proposed target structure (to-be)

```
modules/                                   # NEW top-level directory
├── rentals/
│   ├── actions/                           # server actions (bind to existing @/app/actions)
│   ├── admin/
│   │   ├── components/                    # RentalEditForm, RentalStatusChanger, (future) RentalCalendar
│   │   └── pages/                         # [admin page files moved here OR kept under app/(admin)/admin/rentals/ — see Decision A]
│   ├── public/
│   │   ├── components/                    # RentalBookingForm
│   │   └── pages/                         # [public rental pages — same decision]
│   └── schema/                            # optional: prisma-snippet, types
├── service/
│   ├── actions/
│   ├── admin/
│   │   └── components/                    # EstimateBuilder, StatusChanger, DeleteAppointmentButton, AdminCalendar, (procurement) Supplier*, Founder*
│   ├── public/
│   │   └── components/                    # Booking wizard (ContactForm, VehicleInput, ServiceSelector, CalendarSlotPicker, StepIndicator, BookingConfirmation, BookingProvider)
│   └── portal/
│       └── components/                    # (future: my service history, my estimates)
└── parts/
    ├── actions/
    ├── admin/
    │   └── components/                    # PartEditForm, PartForm, OrderStatusChanger
    ├── public/
    │   └── components/                    # AddToCartButton, PartsCart, PartsSearch
    └── portal/
        └── components/                    # (future: my orders)

components/                                # Kept, scope narrowed
├── platform/                              # NEW: admin chrome + platform-wide UI
│   ├── AdminSidebar.tsx
│   ├── AdminMobileNav.tsx
│   └── CMSEditor.tsx
├── shared/                                # Cross-cutting primitives (unchanged)
├── ui/                                    # Design system (unchanged)
└── (admin|rentals|parts|booking — removed, contents distributed)

lib/                                       # Kept, scope narrowed
├── auth.ts, db.ts, utils.ts, sms.ts, splus.ts  # shared infrastructure
├── admin-nav.ts                                # platform nav data (imports all modules — allowed)
├── modules/                                    # NEW: module-specific helpers
│   ├── rentals/
│   ├── service/                                # models-data.ts goes here
│   └── parts/
```

### Decision A: Where do page.tsx files live?

**The critical design question.** Next.js App Router requires pages to live under `app/**`. Two patterns:

**Option A1 — Keep `app/**` as-is, modules only own components/actions/lib**. Pages stay at `app/(public)/rentals/`, `app/(admin)/admin/rentals/`, etc. Modules own everything OUTSIDE `app/` — their components, their server actions, their type helpers. The page files at `app/**` are thin shells that import from `modules/<name>/`. Lint rule enforces: pages in `app/(public)/rentals/**` can only import from `modules/rentals/**` or shared. Pros: No Next.js routing fight, no tricky re-exports. Cons: module code is split between two places (`modules/rentals/` and `app/(public)/rentals/`).

**Option A2 — Move pages too**. Create `modules/rentals/pages/public/page.tsx` and re-export from `app/(public)/rentals/page.tsx`. Pros: module is one directory. Cons: every page needs a 2-line re-export shim, and Next.js metadata/params inference gets fiddly.

**Recommendation: A1.** Simpler, no Next.js fight, and the thin-shell page files become very small (`export { default } from "@/modules/rentals/public/RentalsListPage"`). The boundary is still enforced by lint: page files at `app/**` can only import their own module's sources.

### Decision B: Is `suppliers` + `founders` a separate module, part of service, or platform?

Suppliers and founders are **financial/operational** — they don't relate to rentals or parts sales directly. They're how the workshop tracks what it spends (suppliers) and who owns what cost (founders). The cleanest home is:

- **Option B1:** part of SERVICE module (because the service side is where procurement happens — buying parts from suppliers to fix cars). Simple, no new module. Cost: service module becomes "service + procurement," slightly overloaded.
- **Option B2:** new FINANCE module. Cleanest semantically but creates a 4th module for what today is ~5 files.
- **Option B3:** PLATFORM (shared admin tool). Defensible because founders are about ownership, not any specific module. Cost: future "sell as platform" story gets weird — a tenant using only Rentals doesn't need founders.

**Recommendation: B1** for now. Keep it inside service module as a "procurement submodule" (maybe `modules/service/procurement/`). Can be promoted to a standalone `modules/finance/` later if it grows.

### Decision C: ESLint tool — `no-restricted-imports` vs `eslint-plugin-boundaries`

- **`no-restricted-imports`** ships with ESLint core. Configured via patterns. Enough for "forbid X from importing Y" rules. Cost: pattern-based, slightly verbose config.
- **`eslint-plugin-boundaries`** is purpose-built for module isolation with element types, allow-lists, cross-module dependency matrix. More expressive. Cost: one extra devDep, slightly more config upfront.

**Recommendation: `eslint-plugin-boundaries`.** Purpose-built tool for this exact problem. Its element-type + dependency-matrix config reads exactly like the boundary spec, and the error messages are cleaner. The extra dependency is trivial.

### Constraints

- Next.js 16 App Router — pages must live at `app/**` (Decision A applies)
- TypeScript strict mode — any import path changes break the build until fixed
- Self-signed cert dev on port 443 — runtime smoke test will use existing dev server
- Railway auto-deploy on push to main — refactor must be single-atomic merge to avoid half-refactored intermediate deploys
- No DB changes — Prisma schema is single file, stays that way

## Key Decisions

| Decision | Choice | Why |
|---|---|---|
| Module boundaries enforced via | `eslint-plugin-boundaries` + directory convention | Mechanically checkable, fails CI, cleaner config than `no-restricted-imports`. |
| Scope of refactor | All 3 modules (rentals + service + parts) in one PRD | "Line in the sand" — cleaner than sequencing rentals-first then revisiting. User explicitly chose this. |
| Pages stay under `app/**`? | Yes — only components/actions/lib move to `modules/` | Avoids Next.js routing fight. Page files become thin shells importing from their module. |
| Suppliers + Founders belong to | SERVICE module (as procurement submodule) | Simplest. Service → procurement is natural. Can split to FINANCE module later if it grows. |
| New top-level directory name | `modules/` | Standard convention. Parallel to `components/`, `lib/`, `app/`. |
| Platform-level admin components (sidebar, nav) live at | `components/platform/` | Sidebar + mobile nav need to reference every module's routes — they ARE platform, not module-owned. |
| Git-preservation mechanism | `git mv` for every moved file | Preserves blame/history. Critical for future debugging. |
| Prisma schema | Unchanged (single file) | Out of scope. May add per-module section comments but no physical split. |
| Test framework addition | Skipped | Project has no test runner today. Not introducing one in this PRD. Verification = tsc + lint + build + runtime smoke. |
| Runtime feature flags | Skipped | Out of scope. Lint-level enforcement is enough for optionality today. |
| Multi-language (i18n) | Skipped | Separate concern, separate future PRD if needed. |
| Runtime behavior changes | Zero | Every URL, every UI, every behavior stays identical. Pure code organization. |

## Research Findings

This PRD was informed by the rental module competitive analysis (`docs/research/2026-04-13-rental-competitive-analysis.md`), which catalogued RentSyst's 40+ features as the benchmark for a "professional rental module." The analysis concluded that a ~12-feature roadmap is realistic for Geleoteka's rental module, spanning 3-4 future phases. That roadmap is the **motivation** for this architecture refactor — without clean module boundaries, those features will entangle across the codebase and make each future PRD more expensive than the last.

### Why architecture first, before any feature work

Three reasons surfaced from the clarifying Q&A:

1. **Feature velocity over time.** Each new rental feature (calendar, contracts, payments) touches 3-5 files. Without boundaries, those files land in `components/admin/` next to parts and service code, and the inter-module dependency graph grows silently. After 12 features, the boundary retrofit is 12× harder.
2. **Optionality to license the platform later.** The user's stated ambition is to keep open the option of selling a boilerplate to other specialist workshops, where tenants might want only Rentals, only Service, or some combination. Retrofitting module toggling into a tangled codebase is impractical; building on a clean boundary is straightforward.
3. **Future LLM coding sessions.** Claude (or any implementer) working on a rental feature should have a mechanical guardrail that prevents accidental cross-module imports. A documented convention alone decays; a lint rule does not.

## Success Criteria

Observable outcomes that prove the refactor is done:

1. **`npm run lint` passes cleanly** with the new boundaries rules active, reporting zero cross-module imports.
2. **`bunx tsc --noEmit` passes** with zero errors after all import paths are updated.
3. **`npm run build` succeeds**, producing the same route list as before (14 public/admin/portal routes accounted for).
4. **Runtime smoke test** (Chrome DevTools MCP): admin login → click every sidebar entry (Dashboard + 3 groups × all sub-items) → zero 500 errors → zero console errors. Public `/`, `/rentals`, `/parts`, `/services` all render identically.
5. **`git log --follow`** on any moved file shows pre-refactor history, proving `git mv` preserved blame.
6. **Manual regression:** the admin sidebar from the previous spec (`docs/plans/2026-04-12-admin-sidebar-audit.md`) still groups and collapses identically.
7. **`AGENTS.md` contains** a new "Module boundaries" section documenting where new code should live.
8. **Intentional violation test:** temporarily add a line `import { ... } from "@/modules/parts/..."` inside a rentals file → `npm run lint` must fail with a clear "cross-module import forbidden" error → remove the line → lint passes again.

## Handoff Notes for /spec

When this PRD is handed off to `/spec`, the plan will likely contain these tasks (high-level, `/spec` will finalize):

1. **Inventory pass** — walk every file in the current structure, classify into one of `rentals | service | parts | shared | platform`, produce a concrete "from → to" move list. This is the bulk of the upfront work. Must be exhaustive.
2. **Install `eslint-plugin-boundaries`** + write the config with element-types and dependency matrix.
3. **Physically move files** using `git mv`, grouped by module. Commit per module for bisectability.
4. **Update all import paths** across the repo (search for `@/components/admin/RentalEditForm` etc.). Start with `tsc --noEmit` to find broken imports, fix in a loop.
5. **Add `components/platform/`** and move `AdminSidebar`, `AdminMobileNav`, `CMSEditor` into it.
6. **Verify lint rule catches violations** — add a temporary cross-module import, prove lint fails, remove it.
7. **Update `AGENTS.md`** and `.claude/rules/geleoteka-project.md` with the module boundaries section.
8. **Full runtime smoke test** with Chrome DevTools MCP — admin + public + portal routes, zero regressions.
9. **Commit and push** — `/spec`'s existing runtime verification discipline applies.

**Not a task, but a mindset for the implementer:** **zero user-visible behavior change.** Every URL, every button, every render, every admin flow works identically before and after. The diff is pure code organization. If the implementer finds themselves "fixing" something along the way (e.g. a UI bug), they should STOP and capture it in a follow-up PRD or TODO, not sneak it into this refactor.

## Open Questions

None as of writing. Decisions A, B, C resolved above. `/spec` can proceed.
