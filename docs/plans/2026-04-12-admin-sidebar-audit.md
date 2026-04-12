# Admin Sidebar Audit and Grouping Implementation Plan

Created: 2026-04-12
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Regroup the flat 12-item admin sidebar into 3 collapsible single-open groups (Операции / Управление / Поставки) with Dashboard standalone, and promote two hidden pages (`/admin/rentals/bookings`, `/admin/suppliers/orders`) from "inline button only" to first-class sidebar sub-items so admins can reach them in one click.

**Architecture:** Extract nav data into `lib/admin-nav.ts` as a typed discriminated union (`link | group`). Desktop sidebar and mobile drawer each become small client components (`AdminSidebar`, `AdminMobileNav`) that consume the shared data. Accordion state is a single `openGroup: string | null` derived from current pathname at mount and toggled on header click.

**Tech Stack:** Next.js 16 App Router server layout rendering a client sidebar child, React 19 `useState` + `usePathname`, Tailwind CSS v4 with existing CSS variables, no new dependencies.

## Scope

### In Scope

- Inventory all 27 `page.tsx` files under `app/(admin)/admin/` against the current sidebar (done during planning — results in the Audit section below)
- Create `lib/admin-nav.ts` — shared, typed nav data
- Create `components/admin/AdminSidebar.tsx` — desktop sidebar client component with single-open accordion
- Create `components/admin/AdminMobileNav.tsx` — mobile drawer client component with the same accordion behavior (admin-only; portal keeps using `PanelMobileNav` unchanged)
- Update `app/(admin)/layout.tsx` to render the new components and drop its local `navItems` const
- Promote `/admin/suppliers/orders` and `/admin/rentals/bookings` to sidebar sub-items
- Add active-link highlighting (desktop sidebar currently has none; mobile already highlights)
- Preserve existing footer ("Сайт", Logout) and header (brand + "Админ-панель" tagline) chrome
- Runtime browser verification on local dev in both desktop + mobile viewports

### Out of Scope

- `/admin/parts/import` stays reachable only via the button on `/admin/parts` (infrequent admin task, user already said the sidebar should stay tight — adding it would bloat Управление)
- Detail routes (`[id]`, `new`) stay reachable via their parent list pages (standard pattern, not a bug)
- Portal sidebar (`app/(portal)/layout.tsx`) stays flat and unchanged — this plan is admin-only
- Role-based filtering (e.g., hiding `Founders` from MANAGER role) — all nav items remain visible to both ADMIN and MANAGER, matching current behavior
- Persisting accordion state across reloads — user explicitly chose single-open (not multi-open-with-persistence); state is derived from pathname each mount
- Visual redesign beyond the grouping structure (icons, colors, typography) — the visual style of each sidebar row stays the same

## Approach

**Chosen:** Extract nav to typed data, render through two new client components (one desktop, one mobile), leave existing `PanelMobileNav` untouched for the portal.

**Why:** Lets admin nav evolve independently from portal nav without a polymorphic shared component. Data-driven structure makes future additions (more groups, more items) a one-file change. Single-open accordion maps cleanly to one `useState<string | null>` and one `usePathname()` call — no reducer, no context, no localStorage.

**Alternatives considered:**

- **Make `PanelMobileNav` polymorphic (accept flat OR grouped entries).** Rejected: forces every caller to carry both shapes in its type, complicates portal code that has no need for groups, and the savings are ~60 lines of JSX that mostly isn't shared anyway (the header/footer chrome differs between admin and portal by tagline text).
- **Keep sidebar in `layout.tsx` as a server component and render groups with `<details>`/`<summary>` HTML elements.** Rejected: `<details>` single-open requires the `name` attribute (not yet in all target browsers for Tailwind v4 — Turbopack would inline it fine but it's inconsistent), and active-link highlighting needs `usePathname()` which is client-only. Going client-side for the whole sidebar is simpler than trying to mix server rendering with per-link active state via params.
- **Split the sidebar into three completely separate `<ul>` sections with no collapse.** Rejected: user explicitly picked "single-open accordion" — visual headers without collapse would be a different choice (the "Always expanded" option from the question batch).

## Context for Implementer

> Write for an implementer who has never seen the codebase.

### Patterns to follow

- **Client components in admin:** `components/admin/SupplierOrderForm.tsx`, `components/admin/StatusChanger.tsx` — all start with `"use client"` directive, use hooks, imported from server-rendered pages.
- **Mobile drawer pattern:** `components/shared/PanelMobileNav.tsx:21-130` — uses `createPortal(overlay, document.body)` to escape stacking contexts, uses inline styles with CSS variables for theme-safe backgrounds, hamburger button in sticky `<header>`. Copy this shape for `AdminMobileNav`.
- **Active-link matching:** `components/shared/PanelMobileNav.tsx:66` — `pathname === item.href || (item.href !== basePath && pathname.startsWith(item.href))`. The `basePath !== href` guard prevents `/admin` from matching as active for every child route.
- **Typed data files:** `lib/utils.ts` (example of small shared module that pages import directly — no barrel file).

### Conventions

- **Prisma client import path:** `@/app/generated/prisma/client` (custom output, NOT `@prisma/client`). Not relevant to this task (no DB touched) but flagged because it's a project-wide gotcha.
- **Auth in admin pages:** `getSession()` + `if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) redirect("/login")`. NOT `requireRole(...)` which throws. Layout stays server-side and renders children regardless — auth is per-page.
- **Emojis:** Do not add them. The codebase uses text labels (`← Поставщики`) not icon fonts.
- **CSS:** Always use CSS variables (`var(--card)`, `var(--foreground-muted)`, `var(--color-accent)`, `var(--border)`) — never hardcoded hex. The existing sidebar uses these; preserve them exactly.
- **Filenames:** Components PascalCase (`AdminSidebar.tsx`), lib kebab-case (`admin-nav.ts`).

### Key files

- `app/(admin)/layout.tsx` — the file being refactored (~64 lines today)
- `components/shared/PanelMobileNav.tsx` — the pattern to clone for mobile
- `components/shared/LogoutButton.tsx` — keep referencing; it handles its own client state
- `lib/auth.ts` — not touched, but `getSession()` available if future per-role nav filtering is added

### Gotchas

- **`PanelMobileNav` is ALSO used by `app/(portal)/layout.tsx`.** Do not modify it — create a new `AdminMobileNav` instead. Changes to `PanelMobileNav` would drag in portal regressions.
- **Footer actions must be preserved.** The current admin layout has `Сайт` link and `LogoutButton` at the bottom of the sidebar AND in the mobile drawer footer. Both new components must keep these.
- **The desktop sidebar currently has NO active-link highlighting.** The mobile drawer DOES highlight active via `pathname === item.href`. When we add client-side highlighting to desktop, use the same matching rule so the two surfaces stay consistent.
- **`/admin/parts/import` and `/admin/rentals/bookings` are currently reachable only via inline buttons on their parent list pages (`/admin/parts:21` and `/admin/rentals:21`).** This plan promotes `/admin/rentals/bookings` to a top-level sub-item under Операции (as "Бронирования"), and leaves `/admin/parts/import` as-is (inline-only). Do not remove the inline buttons on either parent page — they remain valid secondary affordances.

### Domain context

**What each admin page is for (so grouping decisions are defensible):**

| Route | Russian label | What it is |
|---|---|---|
| `/admin` | Дашборд | Today's appointments, active repairs, revenue stats — staff home |
| `/admin/appointments` | Записи | Service appointment list with status changer + delete |
| `/admin/calendar` | Календарь | Same appointments, calendar grid view |
| `/admin/estimates` | Сметы | Repair estimates sent to customers |
| `/admin/customers` | Клиенты | User/customer list |
| `/admin/orders` | Заказы клиентов | Customer parts orders (`PartOrder` table — buying parts via shop) |
| `/admin/rentals/bookings` | Бронирования | Customer rental car bookings (`RentalBooking` table) |
| `/admin/parts` | Запчасти | Parts catalog (what the shop sells) |
| `/admin/rentals` | Аренда | Fleet catalog (what we rent) |
| `/admin/cms` | Контент | CMS blocks for public site |
| `/admin/founders` | Учредители | Business co-founders + their contribution balances |
| `/admin/team` | Команда | Staff / masters profiles |
| `/admin/suppliers` | Поставщики | Parts suppliers (where we buy from) |
| `/admin/suppliers/orders` | Заказы поставщикам | Supplier orders (`SupplierOrder` — what we've ordered, with founder cost split) |

**Grouping rationale:**
- **Операции** = every customer-initiated workflow the business processes. Записи (service), Сметы (repair quote), Заказы клиентов (parts purchase), Бронирования (rental) are all "the customer asked us for something, now it's our problem." Клиенты and Календарь belong here too because they're viewed alongside those workflows.
- **Управление** = everything we own/maintain that isn't a customer request. Shop catalogs (Запчасти, Аренда), public content (Контент), business structure (Учредители, Команда).
- **Поставки** = procurement side. Who we buy from, what we've ordered. Kept separate from customer-facing orders because the direction of money is opposite.

**Approval notes on supplier placement:** User's initial clarification rounds described two groups (Операции + "one group for managing content, founders, team, online-shop and rentals") without mentioning suppliers. After spec-review flagged this gap, user was asked explicitly and selected "Own group Поставки (Recommended)" over alternatives ("under Управление" or "split across groups"). Confirmed decision — do not relitigate during implementation.

## Runtime Environment

- **Dev:** `npm run dev` (port 443, HTTPS, self-signed cert)
- **Browser verification:** Chrome DevTools MCP (admin session already established earlier this session; if not, log in as `admin@geleoteka.ru` / `admin123`)
- **Production:** Railway auto-deploy on push to `main`. `preDeployCommand = ["npx prisma migrate deploy"]` in `railway.toml` handles migrations — no schema changes in this plan, so migrations are a no-op.

## Audit Findings

Done during planning. Cross-reference of every `page.tsx` under `app/(admin)/admin/` vs the current sidebar:

| Route | Current sidebar | After this plan |
|---|---|---|
| `/admin` | ✅ Дашборд | ✅ Standalone (top) |
| `/admin/appointments` | ✅ Записи | ✅ Операции > Записи |
| `/admin/calendar` | ✅ Календарь | ✅ Операции > Календарь |
| `/admin/estimates` | ✅ Сметы | ✅ Операции > Сметы |
| `/admin/estimates/new` | via button | via button (unchanged) |
| `/admin/customers` | ✅ Клиенты | ✅ Операции > Клиенты |
| `/admin/customers/[id]` | via row click | via row click (unchanged) |
| `/admin/orders` | ✅ Заказы | ✅ Операции > **Заказы клиентов** (relabeled — was ambiguous vs supplier orders) |
| `/admin/rentals/bookings` | ❌ **button-only on /admin/rentals** | ✅ **Операции > Бронирования (NEW sidebar link)** |
| `/admin/parts` | ✅ Запчасти | ✅ Управление > Запчасти |
| `/admin/parts/new` | via button | via button (unchanged) |
| `/admin/parts/[id]` | via row click | via row click (unchanged) |
| `/admin/parts/import` | button-only on /admin/parts | button-only (unchanged, intentionally out of scope) |
| `/admin/rentals` | ✅ Аренда | ✅ Управление > Аренда |
| `/admin/rentals/new` | via button | via button (unchanged) |
| `/admin/rentals/[id]` | via row click | via row click (unchanged) |
| `/admin/cms` | ✅ Контент | ✅ Управление > Контент |
| `/admin/founders` | ✅ Учредители | ✅ Управление > Учредители |
| `/admin/founders/new` | via button | via button (unchanged) |
| `/admin/founders/[id]` | via row click | via row click (unchanged) |
| `/admin/team` | ✅ Команда | ✅ Управление > Команда |
| `/admin/suppliers` | ✅ Поставки (→ /admin/suppliers) | ✅ Поставки > Поставщики |
| `/admin/suppliers/new` | via button | via button (unchanged) |
| `/admin/suppliers/[id]` | via row click | via row click (unchanged) |
| `/admin/suppliers/orders` | button-only on /admin/suppliers | ✅ **Поставки > Заказы поставщикам (NEW sidebar link)** |
| `/admin/suppliers/orders/[id]` | via row click | via row click (unchanged) |
| `/admin/suppliers/orders/new` | via button | via button (unchanged) |

**Two sidebar additions:** `Бронирования` (rental bookings) under Операции, `Заказы поставщикам` under Поставки. Both were previously reachable only via an inline button on another page — users had to drill into a parent list to find them, which several times this session the user pointed out as a discoverability problem.

**Inline buttons remain:** The inline "+ Новый заказ" / "Бронирования" / "Все заказы" / "Импорт" buttons on `/admin/rentals`, `/admin/suppliers`, and `/admin/parts` are NOT removed by this plan. They stay as secondary affordances alongside the new sidebar entries. The plan does not touch any of those parent pages — only `app/(admin)/layout.tsx` and the two new component files under `components/admin/`.

**Label changes:**
- `Заказы` → **`Заказы клиентов`** (disambiguates from supplier orders which live in a different group)
- `Поставки` (the old flat item that pointed at `/admin/suppliers`) splits into two sub-items: `Поставщики` + `Заказы поставщикам` under a group also called `Поставки`

**Final structure:**

```
Дашборд  [standalone]

▼ Операции
    Записи
    Календарь
    Сметы
    Клиенты
    Заказы клиентов
    Бронирования

▼ Управление
    Запчасти
    Аренда
    Контент
    Учредители
    Команда

▼ Поставки
    Поставщики
    Заказы поставщикам
```

14 navigable items (up from 12) under 3 collapsible groups, max one open at a time. Navigating to a link inside a group opens that group automatically (derived from `usePathname()`).

## Assumptions

- **The admin session cookie is httpOnly** — supported by `lib/auth.ts:39-45` (`httpOnly: true` in `setSessionCookie`). Tasks 2+3 depend on this because client-side nav components cannot read session data directly; the layout stays server-side for auth checks and the sidebar receives no session prop.
- **`usePathname()` from `next/navigation` is stable in Next.js 16** — supported by `components/shared/PanelMobileNav.tsx:6` which already uses it. Task 2 depends on this.
- **Admin and MANAGER see identical navigation** — matches current behavior in `app/(admin)/layout.tsx` where `navItems` has no role filter and every admin page checks role in its own body. Task 4 depends on this (no role prop needed on the sidebar components).
- **No URL-state for accordion** — Single-open behavior is derived from pathname + one `useState`. Not persisted to localStorage or URL. This matches user's explicit choice of "Single-open accordion" without persistence.
- **Portal `PanelMobileNav` stays flat** — supported by `app/(portal)/layout.tsx:50` where it's called with a flat `navItems` array. Not in scope for this plan.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| User clicks a group header expecting it to navigate (like the old flat items) | Medium | Low | Group headers render as `<button>` with an explicit chevron icon (`▼` / `▶`) so they visually differ from links. Sub-items stay as `<a>` with normal link styling. |
| Single-open accordion closes the user's current group when they click another group header, losing context | Low | Low | This IS the user's explicit choice. Mitigation is just labeling: the group containing the active page is auto-opened on any navigation, so returning to your work is one click. |
| `PanelMobileNav` regression in portal due to shared file edits | Low | High | Plan does not modify `PanelMobileNav` at all. Portal continues to import it from `components/shared/`. Task 4 verifies portal still compiles. |
| Active-link highlight conflicts with the group header's "open" visual state | Medium | Low | Use distinct visual treatments: active link = accent color text + background tint; open group header = chevron rotated + subtle background. No overlap. |
| Accordion state resets on every navigation, feeling laggy | Medium | Medium | State is not reset — it's derived from pathname + a `useState` initialized at mount. Navigations within the same group do not trigger re-mounts in Next.js App Router (layout.tsx persists). Verified behavior: open Управление → navigate to /admin/parts → group stays open because pathname still matches Управление. |
| Long sub-item lists cause the sidebar to exceed viewport height | Low | Low | Операции has 6 sub-items; with Управление (5) and Поставки (2) collapsed, total visible = ~9 rows including headers, well under 600px. Footer stays pinned via `flex-1` on the nav. |
| Layout persistence keeps accordion state alive across navigations (design property, not bug) | N/A (design) | Medium if removed accidentally | Next.js 16 App Router persists `app/(admin)/layout.tsx` across route changes, so `AdminSidebar`'s `useState` survives navigation — including the manual-close sentinel. This is intentional: `useEffect([pathname])` explicitly resets `manualOpen` to `null` on every pathname change to restore derived-from-pathname behavior. Do NOT remove or rename this effect; TS-001 steps 6-10 regression-test the exact case where removal would break. |

## Goal Verification

### Truths

1. **Every admin page is reachable from the sidebar in at most 2 clicks.** Previously, `/admin/rentals/bookings` and `/admin/suppliers/orders` took 2+ clicks via inline buttons; after this plan they are 2 clicks (expand group + click sub-item). Top-level links (Дашборд) are 1 click.
2. **Sidebar grouping is data-driven** — adding a new admin page requires editing exactly one file (`lib/admin-nav.ts`) and no component code.
3. **The group containing the currently-viewed page is always expanded when the page loads.** TS-002 verifies this.
4. **Single-open accordion enforced** — clicking one group header closes whichever group was previously open. TS-001 verifies this.
5. **Active link is visually distinguished** from inactive links in both desktop and mobile surfaces. TS-003 verifies this.
6. **Mobile drawer uses the same structure** as desktop sidebar (same groups, same accordion behavior). TS-004 verifies this.
7. **Portal sidebar is unaffected** — the flat portal nav (`/cabinet`, `/cabinet/cars`, etc.) renders identically before and after this plan. TS-005 verifies this.

### Artifacts

- `lib/admin-nav.ts` — typed `adminNav` export (discriminated union of `link` and `group`)
- `components/admin/AdminSidebar.tsx` — client component, desktop sidebar
- `components/admin/AdminMobileNav.tsx` — client component, mobile drawer
- `app/(admin)/layout.tsx` — slimmed down to shell that renders the two above
- `app/(portal)/layout.tsx` — **unmodified**, continues to use `PanelMobileNav`
- `components/shared/PanelMobileNav.tsx` — **unmodified**

## E2E Test Scenarios

### TS-001: Single-open accordion toggles correctly
**Priority:** Critical
**Preconditions:** Admin logged in at `admin@geleoteka.ru`, desktop viewport (≥ 768px width)
**Mapped Tasks:** Task 2, Task 4

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin` | Sidebar visible. Дашборд shown as standalone. All 3 groups visible with headers Операции / Управление / Поставки. No group is expanded (no active path inside a group). |
| 2 | Click group header "Операции" | Операции expands, shows 6 sub-items (Записи, Календарь, Сметы, Клиенты, Заказы клиентов, Бронирования). Управление and Поставки remain collapsed. |
| 3 | Click group header "Управление" | Управление expands, shows 5 sub-items. Операции collapses automatically (single-open enforced). |
| 4 | Click group header "Управление" again | Управление collapses. No group is now expanded. |
| 5 | Inside Управление, click "Запчасти" sub-item (requires re-expanding Управление via step 3 equivalent first) | Navigation to `/admin/parts` succeeds. Управление stays expanded with Запчасти highlighted as active. |
| 6 | Click group header "Управление" to manually collapse it | Управление collapses while still on `/admin/parts`. Sidebar shows no expanded group. Запчасти link still renders somewhere (either as active-but-hidden inside the collapsed group — the collapsed group header may have an "active" dot/indicator, or no visual until you re-expand). This is the sentinel state (`manualOpen === "__CLOSED__"`). |
| 7 | Click standalone "Дашборд" link | Navigation to `/admin` succeeds. Sidebar shows no expanded group (still in sentinel state). pathname changed → `useEffect([pathname])` fires → sentinel cleared. |
| 8 | Click group header "Операции" | Операции expands normally — no stuck state from the previous sentinel. |
| 9 | Click "Записи" sub-item inside Операции | Navigation to `/admin/appointments` succeeds. Операции stays expanded, Записи highlighted active. |
| 10 | While on `/admin/appointments` with Операции open, click "Запчасти" link — wait, Запчасти is inside Управление which is collapsed. Instead: click the "Управление" group header | Управление expands, Операции collapses (single-open). **Critical check:** because the sentinel was cleared by the earlier `useEffect`, Управление opens normally and is NOT stuck closed from the step-6 manual close. This is the exact "sentinel-stuck regression" the test is guarding against. |
| 11 | Scroll to bottom of sidebar | Desktop sidebar footer shows "Сайт" link and "Выйти" (LogoutButton) — both preserved from the old layout. |
| 12 | Click "Сайт" footer link | Navigation to `/` succeeds, public marketing homepage renders. |

### TS-002: Group auto-opens when navigating to a page inside it
**Priority:** Critical
**Preconditions:** Admin logged in, desktop viewport
**Mapped Tasks:** Task 2, Task 4

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate directly to `/admin/parts` (via URL bar) | Sidebar renders with the Управление group already expanded. Запчасти sub-item is highlighted as active. |
| 2 | Click the "Записи" sub-item (inside Операции group which is currently collapsed) | Navigation to `/admin/appointments` succeeds. Sidebar re-renders with Операции group expanded, Управление collapsed, Записи highlighted as active. |
| 3 | Click "Бронирования" sub-item inside the now-open Операции group | Navigation to `/admin/rentals/bookings` succeeds. Операции group stays open. Бронирования highlighted as active. |

### TS-003: Promoted sub-items are reachable in one click from sidebar
**Priority:** Critical
**Preconditions:** Admin logged in, desktop viewport, Операции group and Поставки group both expanded (may require two clicks each if single-open is strict — use sequential clicks to verify each)
**Mapped Tasks:** Task 1, Task 4

| Step | Action | Expected Result |
|---|---|---|
| 1 | Expand Операции group, click "Бронирования" | Lands on `/admin/rentals/bookings` — NOT on `/admin/rentals` first. No intermediate page. |
| 2 | Expand Поставки group, click "Заказы поставщикам" | Lands on `/admin/suppliers/orders` directly. |
| 3 | Expand Поставки group, click "Поставщики" | Lands on `/admin/suppliers` directly. |

### TS-004: Mobile drawer renders same grouping
**Priority:** High
**Preconditions:** Admin logged in, viewport resized to 375px width (or use Chrome DevTools device emulation)
**Mapped Tasks:** Task 3, Task 4

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin` on mobile viewport | Desktop sidebar is hidden. Mobile header with hamburger button is visible at top. |
| 2 | Click hamburger button | Drawer slides in from left. Shows Дашборд + 3 groups (Операции, Управление, Поставки) same as desktop. Single-open accordion active. |
| 3 | Click "Управление" header, then click "Запчасти" sub-item | Drawer closes. Navigation to `/admin/parts` succeeds. |
| 4 | Re-open drawer | Управление group is auto-expanded (current path inside it). Запчасти highlighted active. |
| 5 | Click footer "Выйти" (Logout) | Logout action fires, redirects to `/login`. |

### TS-005: Portal sidebar is unaffected (regression check for PanelMobileNav shared file)
**Priority:** High
**Preconditions:** Any client account logged in (use `client@test.ru` / `admin123`)
**Mapped Tasks:** Task 4 (negative check)

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to `/cabinet` on desktop viewport (≥ 768px) | Portal desktop sidebar renders as a FLAT list (not grouped). Items: Главная, Мои авто, История, Статус, Сметы, Запчасти, Аренда, Лояльность, Уведомления. |
| 2 | Check browser console | Zero errors. No import-from-admin-component warnings. |
| 3 | Resize browser to 375px width | Desktop sidebar hidden. Mobile header with hamburger appears (via unchanged `PanelMobileNav`). |
| 4 | Click hamburger button | Portal drawer slides in with the SAME flat nav items (Главная, Мои авто, ...). No grouping, no accordion. This is the true regression test that `PanelMobileNav` was not modified. |
| 5 | Check browser console | Zero errors, zero warnings. |

### TS-006: Keyboard accessibility for desktop sidebar
**Priority:** High
**Preconditions:** Admin logged in, desktop viewport, focus cleared (click into main content area)
**Mapped Tasks:** Task 2

| Step | Action | Expected Result |
|---|---|---|
| 1 | Press Tab repeatedly until focus enters the sidebar | Focus reaches the Geleoteka brand link first, then Дашборд, then each group header button in order (Операции → Управление → Поставки), then footer Сайт link, then Logout button. Visible focus ring on every element. |
| 2 | Press Shift+Tab on "Управление" header | Focus moves back to "Операции" header (or if Операции is expanded, through its sub-items in reverse order). |
| 3 | Press Enter on "Операции" header | Операции expands. Focus stays on the header button. |
| 4 | Inspect DOM via `evaluate_script` | Each group header `<button>` has `aria-expanded="true"` (for the open group) or `aria-expanded="false"` (for closed groups), and `aria-controls` pointing to the sub-item container `id`. |
| 5 | Press Tab from the now-open Операции header | Focus moves into the expanded sub-items (Записи, Календарь, ...). |
| 6 | Press Space on "Операции" header while focused | Header toggles (expands/collapses). Space key behaves like Enter. |

## Progress Tracking

- [x] Task 1: Shared nav data (`lib/admin-nav.ts`)
- [x] Task 2: Desktop sidebar client component (`components/admin/AdminSidebar.tsx`)
- [x] Task 3: Mobile drawer client component (`components/admin/AdminMobileNav.tsx`)
- [x] Task 4: Wire new components into `app/(admin)/layout.tsx`
- [x] Task 5: Runtime browser verification (desktop + mobile + portal smoke)
      **Total Tasks:** 5 | **Completed:** 5 | **Remaining:** 0

## Implementation Tasks

---

### Task 1: Shared admin nav data

**Objective:** Create a typed, shared module that defines the 3-group sidebar structure as data so both desktop and mobile components import the same source of truth.
**Dependencies:** None
**Mapped Scenarios:** TS-003

**Files:**
- Create: `lib/admin-nav.ts`

**Key Decisions / Notes:**
- Export a discriminated union type `AdminNavEntry = { kind: "link"; href: string; label: string } | { kind: "group"; label: string; items: { href: string; label: string }[] }`
- Export the concrete `adminNav: AdminNavEntry[]` const with Dashboard as a link and the 3 groups as `group` entries in the exact order shown in the Audit Findings section.
- No hooks, no imports from React or Next.js — pure data module.
- File is small (~40 lines); place directly in `lib/` next to `utils.ts`.

**Definition of Done:**
- [ ] `lib/admin-nav.ts` exists with both the type and the const
- [ ] `bunx tsc --noEmit` passes with zero errors
- [ ] Importing `adminNav` from `@/lib/admin-nav` returns an array with 4 top-level entries: 1 link + 3 groups
- [ ] The groups contain exactly: Операции (6 items), Управление (5 items), Поставки (2 items)
- [ ] `/admin/orders` label is literally the string `Заказы клиентов` (with space — disambiguates from supplier orders). This is a user-visible string change from the previous label `Заказы`; no deep-link or docs reference the old label.

**Verify:**
- `bunx tsc --noEmit` (zero output on success)
- Manual inspection: `Read` the file and confirm every entry from the Audit Findings table is present

---

### Task 2: Desktop sidebar with single-open accordion

**Objective:** Build `AdminSidebar` client component that replicates the existing desktop sidebar's visual chrome (brand, tagline, footer actions) but renders the grouped accordion structure with active-link highlighting.
**Dependencies:** Task 1
**Mapped Scenarios:** TS-001, TS-002, TS-003

**Files:**
- Create: `components/admin/AdminSidebar.tsx`

**Key Decisions / Notes:**
- First line: `"use client"`. Imports: `usePathname` from `next/navigation`, `useState` from `react`, `Link` from `next/link`, `LogoutButton` from `@/components/shared/LogoutButton`, `adminNav` from `@/lib/admin-nav`.
- State: `const [manualOpen, setManualOpen] = useState<string | null>(null)`. The "currently open" group is computed as `manualOpen ?? activeGroupLabel` where `activeGroupLabel` is derived from `usePathname()` on every render.
- `activeGroupLabel`: iterate `adminNav`, find the `group` whose `items` contain any `href` matching `pathname === href || (href !== "/admin" && pathname.startsWith(href))`. Return its label or `null`.
- `toggleGroup(label)`: if `openGroup === label`, call `setManualOpen("__CLOSED__")` (sentinel); else call `setManualOpen(label)`. Reading: `const openGroup = manualOpen === "__CLOSED__" ? null : (manualOpen ?? activeGroupLabel)`.
- **Reset sentinel on pathname change (design contract — do not remove):** use `useEffect(() => { setManualOpen(null); }, [pathname])`. This effect is the ONLY mechanism that clears the sentinel after a manual toggle. Intentional design properties:
  - `AdminSidebar` is mounted inside `app/(admin)/layout.tsx`, which persists across navigations under Next.js 16 App Router — `useState` is NOT reset on route change. Without this effect, a user who manually closes Управление stays with it closed forever, even after navigating to a page in a different group.
  - React bails out when `setManualOpen(null)` is called and current state is already `null`, so the effect is a no-op for the common case and does not cause wasted renders there. When state IS a group label or the sentinel, the effect schedules one extra render after the navigation paint — acceptable (off the critical path).
  - Clicking a `<Link>` to the CURRENT pathname does NOT fire the effect (pathname dep unchanged), so clicking the currently-active link will NOT re-open a manually-closed group. This is the desired behavior.
  - Do NOT replace this effect with `useMemo` or derive state without it — memo does not handle the case where the user manually closed a group and then navigated to a different group (memo sees the new pathname but still reads the stale manualOpen).
- Active link match: same formula as `PanelMobileNav.tsx:66`. Active link gets `bg-[var(--card-hover)]` background + `text-[var(--color-accent)]`.
- Group header: render as `<button type="button">` with chevron SVG (rotates 0° closed, 90° open via `transform`), label on left. NO background highlight on the header (only a subtle border-bottom when open). Click calls `toggleGroup(group.label)`. **Accessibility:** the button MUST have `aria-expanded={openGroup === group.label}`, `aria-controls` pointing to the sub-item container `<div id={...}>`, and receive visible keyboard focus ring (default button focus is fine; do not strip it). Space and Enter both toggle the button natively — no custom keydown handlers needed.
- Sub-item container: wrap the conditionally-rendered sub-items in a `<div id="admin-group-{label}">` with a stable id that matches the header's `aria-controls`. Use URL-safe ids derived from the label (e.g. `admin-group-operations`, `admin-group-management`, `admin-group-procurement`).
- Standalone links (`kind: "link"`): render with same indent as sub-items but at top level, use `Link` from `next/link`.
- Sub-items: render inside a `<div>` that's conditionally rendered when `openGroup === group.label`. Use `pl-5` (20px indent) to distinguish from headers.
- Preserve footer: the same `<Сайт>` link + `<LogoutButton>` block from current `layout.tsx:46-54`. No groups in the footer.
- Overall markup structure: `<aside class="w-64 border-r border-[var(--border)] bg-[var(--card)] hidden md:flex flex-col">` — same classes as current, preserve `hidden md:flex`.

**Definition of Done:**
- [ ] `components/admin/AdminSidebar.tsx` exists as a client component
- [ ] Component renders Дашборд as a top-level link
- [ ] Component renders 3 group headers with chevron icons
- [ ] Group header buttons have `aria-expanded` matching current open state AND `aria-controls` pointing to the sub-item container id
- [ ] Clicking a group header expands it and collapses any previously-open group (single-open behavior)
- [ ] Navigating directly to a page inside a group auto-opens that group (derived from `usePathname`)
- [ ] Active link has distinct styling (accent color + background tint) visible on the currently-viewed page
- [ ] Footer preserves `Сайт` link + `LogoutButton`
- [ ] `bunx tsc --noEmit` passes with zero errors

**Verify:**
- `bunx tsc --noEmit`
- Task 5 (runtime browser verification) covers TS-001, TS-002, TS-003

---

### Task 3: Mobile drawer with grouped accordion

**Objective:** Build `AdminMobileNav` client component that renders the same grouped accordion as `AdminSidebar` but in the mobile drawer overlay pattern (hamburger → slide-in panel).
**Dependencies:** Task 1
**Mapped Scenarios:** TS-004

**Files:**
- Create: `components/admin/AdminMobileNav.tsx`

**Key Decisions / Notes:**
- Clone the overall overlay/backdrop/portal-to-document.body pattern from `components/shared/PanelMobileNav.tsx:21-130`. Do NOT import from `PanelMobileNav` — copy the pattern because the internal nav rendering differs.
- First line: `"use client"`. Imports: same as Task 2 plus `useState`, `createPortal`, and keep the inline-style `var(--card)` background pattern from `PanelMobileNav:33-40`.
- Props: zero. The component reads `adminNav` from `@/lib/admin-nav` directly. Title is hardcoded as "Админ-панель" (matches current `PanelMobileNav title="Админ-панель"` call from `app/(admin)/layout.tsx:59`).
- State: `const [open, setOpen] = useState(false)` for the drawer itself; `const [manualOpen, setManualOpen] = useState<string | null>(null)` for accordion (same approach as Task 2).
- Header: hamburger button (same SVG as `PanelMobileNav:117-119`), brand "Geleoteka" text, "Админ-панель" tagline.
- Close drawer on any sub-item click: `onClick={() => setOpen(false)}` on every `Link`.
- Group headers inside the drawer behave identically to Task 2: `<button>` toggles `manualOpen`.
- Footer: same as `PanelMobileNav:84-96` — optional `← На сайт` link + `LogoutButton`.
- Visual: single-open accordion, active link highlighted with accent color + background tint, chevron icon on headers.
- The component is the `md:hidden` surface only. Desktop sidebar from Task 2 stays `hidden md:flex`. No overlap.

**Definition of Done:**
- [ ] `components/admin/AdminMobileNav.tsx` exists as a client component
- [ ] Hamburger button triggers drawer open/close
- [ ] Drawer renders same 3 groups + Дашборд as desktop sidebar
- [ ] Single-open accordion works identically to desktop
- [ ] Clicking a sub-item navigates AND closes the drawer
- [ ] Active link highlighted
- [ ] Footer has `← На сайт` + `LogoutButton`
- [ ] `bunx tsc --noEmit` passes
- [ ] `components/shared/PanelMobileNav.tsx` is UNMODIFIED (`git diff` shows no changes)

**Verify:**
- `bunx tsc --noEmit`
- `git diff components/shared/PanelMobileNav.tsx` — should be empty
- Task 5 (runtime verification) covers TS-004

---

### Task 4: Wire new components into admin layout

**Objective:** Replace the inline `<aside>` markup and `<PanelMobileNav>` call in `app/(admin)/layout.tsx` with `<AdminSidebar />` and `<AdminMobileNav />`. Remove the local `navItems` const.
**Dependencies:** Task 2, Task 3
**Mapped Scenarios:** TS-001, TS-002, TS-003, TS-004, TS-005

**Files:**
- Modify: `app/(admin)/layout.tsx`

**Key Decisions / Notes:**
- Delete the `navItems` const entirely (lines 5-18 today).
- Delete the `<aside>` block (lines 28-55 today).
- Replace with `<AdminSidebar />` import + render.
- Delete the `<PanelMobileNav ... />` line (line 59).
- Replace with `<AdminMobileNav />` import + render.
- Remove the unused imports of `Link`, `LogoutButton`, `PanelMobileNav` since they're no longer referenced from this file.
- The layout remains a server component (no `"use client"` directive) — the new client components are rendered as children and handle their own state.
- Preserve the outer `<div className="flex min-h-screen bg-[var(--background)]">` wrapper and the `<main className="flex-1 p-4 md:p-6">{children}</main>` structure.

**Definition of Done:**
- [ ] `app/(admin)/layout.tsx` is reduced to ~20 lines
- [ ] No `navItems` const anywhere in the file
- [ ] `<AdminSidebar />` and `<AdminMobileNav />` are the only nav-related JSX
- [ ] `app/(portal)/layout.tsx` is UNMODIFIED (`git diff` shows no changes)
- [ ] `components/shared/PanelMobileNav.tsx` is UNMODIFIED
- [ ] `bunx tsc --noEmit` passes
- [ ] `npm run build` completes successfully

**Verify:**
- `bunx tsc --noEmit`
- `npm run build 2>&1 | tail -5`
- `git diff app/(portal)/layout.tsx components/shared/PanelMobileNav.tsx` — empty

---

### Task 5: Runtime browser verification

**Objective:** Execute all 5 E2E scenarios in a real Chrome browser against the local dev server. Zero console errors. Prove every promotion (Бронирования, Заказы поставщикам) is one-click reachable.
**Dependencies:** Task 4
**Mapped Scenarios:** TS-001, TS-002, TS-003, TS-004, TS-005

**Files:**
- None (verification only)

**Key Decisions / Notes:**
- Use Chrome DevTools MCP (already resolved earlier this session). Admin session cookie should still be active; if not, log in at `/login` with `admin@geleoteka.ru` / `admin123`.
- For TS-005 (portal smoke), either log out and log in as `client@test.ru` / `admin123`, or open an isolated context via `new_page(isolatedContext: "portal-check")` and log in there.
- For TS-004 (mobile), use `resize_page(width: 375, height: 812)` to switch to mobile viewport.
- Verify DOM state programmatically with `evaluate_script` where possible (more reliable than snapshot parsing).
- Check console after each navigation: `list_console_messages(types: ["error", "warn"])`. Any error or warning is a regression.
- Memory rule: this is the runtime verification step — do NOT claim complete until every scenario has been walked through in a real browser.

**Definition of Done:**
- [ ] TS-001 executed end-to-end (12 steps), all expected results match — especially steps 6-10 that regression-test the sentinel-stuck-closed case
- [ ] TS-002 executed end-to-end, all expected results match
- [ ] TS-003 executed end-to-end, all expected results match
- [ ] TS-004 executed end-to-end on 375px viewport, all expected results match
- [ ] TS-005 executed on portal route (both desktop AND mobile 375px) — portal flat nav is unaffected
- [ ] TS-006 executed — keyboard focus order, aria-expanded/aria-controls attrs, Enter+Space toggle
- [ ] Zero console errors or warnings across all scenarios
- [ ] `/admin/rentals/bookings` reached in one click from sidebar (two clicks: expand group + click link)
- [ ] `/admin/suppliers/orders` reached in one click from sidebar
- [ ] Mechanical diff check: `git diff --stat "app/(portal)/layout.tsx" "components/shared/PanelMobileNav.tsx"` returns empty (no changes to forbidden files)

**Verify:**
- Chrome DevTools MCP scripted walkthrough of all 6 scenarios
- `list_console_messages(types: ["error", "warn"])` returns empty after each navigation
- `git diff --stat "app/(portal)/layout.tsx" "components/shared/PanelMobileNav.tsx"` — empty output
- `evaluate_script(() => document.querySelectorAll('[aria-expanded]').length)` returns 3 (one per group header)

---

## Open Questions

None — all design decisions resolved in Batch 2 Q&A.

## E2E Results

| Scenario | Priority | Result | Fix Attempts | Notes |
|----------|----------|--------|--------------|-------|
| TS-001   | Critical | PASS   | 1            | Step 10 sentinel-stuck regression verified after refactor. Initial implementation used `useEffect([pathname]) + setState` which lint flagged (`react-hooks/set-state-in-effect`). Refactored to pathname-keyed override state: `override = { pathname, openLabel }` — the override only applies when `override.pathname === pathname`, so navigation naturally invalidates it without any effect. Re-tested all 10 state transitions, all green. |
| TS-002   | Critical | PASS   | 0            | Direct URL nav auto-opens the correct group. Clicking cross-group sub-item transitions cleanly. |
| TS-003   | Critical | PASS   | 0            | Both promoted sub-items reachable in one click: `/admin/rentals/bookings` via Операции > Бронирования, `/admin/suppliers/orders` via Поставки > Заказы поставщикам. `findActiveHref` longest-match correctly distinguishes `/admin/suppliers` from `/admin/suppliers/orders`. |
| TS-004   | High     | PASS   | 0            | Mobile drawer at 500×812 viewport (browser min-width clamp from 375). Hamburger opens drawer, groups render, single-open accordion works, sub-item click navigates AND closes drawer, footer `← На сайт` + Logout present. |
| TS-005   | High     | PASS   | 0            | Portal sidebar (`/cabinet`) verified in isolated context with `client@test.ru` session. Desktop: flat 9-item list, zero `aria-expanded` buttons. Mobile drawer: same flat list, zero admin-group ids present. `PanelMobileNav` completely unaffected — `git diff --stat` empty. |
| TS-006   | High     | PASS   | 0            | 3 `aria-expanded` headers, all `aria-controls` resolve to real DOM ids (`admin-group-operations`/`management`/`procurement`), 12 focusable elements in tab order with `tabIndex: 0`, native `<button>` elements support Enter+Space toggle natively. |

## Review Fixes Applied

Changes-review run 2026-04-13 returned `approve_with_changes` with 0 must_fix, 2 should_fix, 4 suggestions. Applied:

- **SF1 — Tagline color consistency:** `AdminMobileNav.tsx` drawer tagline "Админ-панель" changed from `var(--foreground-muted)` to `var(--color-gold)` to match `AdminSidebar`.
- **SF2 — Double-gate on sub-item container:** Both components removed the redundant `{isOpen && (...)}` wrapper; sub-items are now always rendered into the container and the `hidden={!isOpen}` attribute alone controls visibility. Avoids DOM remount on open/close and keeps the aria-controls target stable.
- **S4 — Redundant SSR guard:** `AdminMobileNav` portal call simplified from `typeof document !== "undefined" ? createPortal(overlay, document.body) : null` to `overlay && createPortal(overlay, document.body)`. The `overlay` short-circuit already prevents server-side evaluation.

Skipped:
- **S1 (extract shared hook):** Plan explicitly chose duplication for independence. Out of scope.
- **S2 (stale closure in functional setState updater):** Not applicable — the refactor eliminated the functional updater form entirely.
- **S3 (footer py-2 touch target):** Reviewer noted this is inherited from `PanelMobileNav` and out of scope for this spec.

## Lint Fix: `setState` in effect anti-pattern

The original implementation used `useEffect(() => setManualOpen(null), [pathname])` to reset the manual override on navigation. ESLint rule `react-hooks/set-state-in-effect` (React 19 / Next.js 16 enforcement of the "You Might Not Need an Effect" guidance) flagged this as a hard error in both `AdminSidebar.tsx` and `AdminMobileNav.tsx`.

**Fix:** Replaced the sentinel + effect pattern with a pathname-keyed override:

```ts
interface ManualOverride {
  pathname: string;
  openLabel: string | null; // null = explicitly closed
}

const [override, setOverride] = useState<ManualOverride | null>(null);
const activeOverride = override && override.pathname === pathname ? override : null;
const openGroup = activeOverride ? activeOverride.openLabel : activeGroupLabel;

function toggleGroup(label: string): void {
  setOverride({
    pathname,
    openLabel: openGroup === label ? null : label,
  });
}
```

This is the React-idiomatic "reset state via a stored key" pattern. The override is only honored while the pathname matches; after navigation the stored pathname differs and the override is effectively ignored — no effect needed, and `openLabel: null` cleanly represents "user explicitly closed" without a sentinel string. TS-001 steps 6-10 re-verified in the browser after the refactor and all still pass.
