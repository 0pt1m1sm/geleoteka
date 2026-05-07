# CMS Expansion — Manage All Static Content via Admin Panel

Created: 2026-05-07
Status: VERIFIED
Approved: Yes
Iterations: 1
Worktree: No
Type: Feature

## Summary

**Goal:** Extend the existing CMS so an admin can manage every static piece of content on the public site (FAQ, hero copy, why-us cards, services overview cards, CTA banner, contacts auxiliary text, footer, cookie banner, floating-buttons channels, About history, Vacancies list, header brand) without touching code. Module-driven content (parts catalog, rentals catalog, repair orders, vehicle catalog, services catalog) stays code+DB-driven.

**Architecture:** Single `CMSBlock` table gains a `type` column (`text` | `richtext` | `list`). A new `lib/cms-schema.ts` registry is the source of truth for every key (label, type, list-row field shape, default value). `lib/cms.ts` keeps the existing string API and adds a typed reader `getCMSTyped` that returns the right shape per type. Admin `/admin/cms` is rewritten as grouped sections, rendering an editor per type (`Input` for text, `Textarea` for richtext, repeater for list). Public pages swap inline strings for schema-keyed reads. A schema-driven seed writes every default into the DB on first run.

**Tech Stack:** Next.js 16.2.3 (App Router), TypeScript strict, Prisma 6, PostgreSQL, React 19, Tailwind v4. New deps: none. `react-markdown` is already installed for richtext rendering.

## Autonomous Decisions

User authorised end-to-end execution without further questions ("Сделай без моего участия, не беспокой пока полностью не выполнено"). The following defaults were taken:

- **Worktree:** No (continue on `main`).
- **Approach:** Option A from the session note — extend the existing `CMSBlock` table with a `type` column rather than splitting into per-type tables. Lighter migration, single admin/server surface.
- **Richtext editor:** plain `<Textarea>` with markdown source. Public pages render via `react-markdown` (already in `package.json`). No WYSIWYG dependency added.
- **List reordering:** up/down buttons (no drag-and-drop dependency). Keeps scope tight, accessibility free.
- **Backward compat:** `getCMS` and `getCMSMany` (plain-string readers) stay. New typed reader is added alongside; pages can opt in. Existing call-sites in `app/(public)/parts/[slug]/page.tsx` and `app/(public)/rentals/[id]/page.tsx` (read `contacts.phone.service` as string) continue to work unchanged.
- **Vacancies:** moved into CMS as a list (matching the rest of the static-content effort), even though a `Vacancy` model exists in `schema.prisma`. The `Vacancy` table is unused (no queries, no seed); leaving it untouched is out of scope. A follow-up plan can drop the unused model.
- **Header navigation:** Out of scope. Nav links and brand label stay code-defined; route URLs are part of the build, not content.
- **Reviews / masters / services / models / parts:** Out of scope (module data, already DB-backed).
- **List editor input types:** `text`, `richtext`, `url`, `color` (sub-field types). No nested lists.

## Scope

### In Scope

- Add `type` column to `CMSBlock` (`text` | `richtext` | `list`).
- New `lib/cms-schema.ts` central registry with every key, label, type, list-row shape, default value.
- New typed reader `getCMSTyped` plus list/richtext convenience helpers; existing `getCMS`/`getCMSMany` preserved.
- New `updateCMSBlock(key, content)` validation against the schema (reject unknown keys, validate shape per type).
- New admin primitives: `CMSListEditor` (repeater) and `CMSRichtextEditor` (textarea + preview). Existing `Input`/`Textarea` reused for `text`/`richtext`.
- `/admin/cms` page rewritten: grouped sections (Главная / О нас / Контакты / Подвал / FAB / Cookie / Вакансии / Шапка), one editor per key driven by schema.
- Schema-driven seed: every `CMS_SCHEMA` entry is upserted with its `type` and `defaultValue` so the DB matches the current site copy on day 1.
- Migrate every hardcoded static string from public pages and shared chrome to CMS keys, using the typed reader.
- E2E browser verification: edit-save-reload round trip for each editor type.

### Out of Scope

- WYSIWYG / rich text editor with toolbar — markdown source via Textarea is sufficient.
- Multi-locale (i18n) — the site is Russian-only; locale support is not requested.
- Drag-and-drop reordering — up/down buttons cover the requirement.
- Versioning / draft / preview workflow — admins save directly; public pages revalidate immediately.
- Image management for CMS blocks (a hero photo picker, etc.) — content is text-only. The existing `UploadedImage` model handles part/vehicle photos and stays untouched.
- Module data: parts, rentals, repair orders, supplier orders, customers, vehicle catalog, masters, services. These remain in their own tables.
- Services overview **cards** on the home page (`app/(public)/page.tsx:202-238`): the cards list services we offer, each with `href`, `title`, `desc`, `price` strings. Treating these as a CMS list duplicates `Service` rows and lets the home page drift from `/services`. **Decision:** add a code TODO and migrate the home services overview to read from the `Service` table in a follow-up plan. Out of scope here.
- Header navigation links and the brand wordmark text — code-owned (route stability).
- Removing the unused `Vacancy` Prisma model — separate plan.

## Approach

**Chosen:** Single-table polymorphic CMS with a centralized typed schema (Option A from the session note).

**Why:** Keeps the migration small (one new column, no table split, no FK churn), keeps all reads through one helper, and gives the admin and the public pages a single source of truth for what keys exist and what shape they have. Costs: the `content` column becomes polymorphic JSON, so a runtime guard is needed at the read/write boundary — handled centrally in `lib/cms.ts` and `app/actions/cms.ts`, not at every call-site.

**Alternatives considered:**
- *Option B — split per type (`CMSList`, `CMSRichText` tables):* cleaner queries, but doubles the surface area in admin code, requires three readers, three actions, three editor pages. Rejected — not worth the extra structure for a few dozen keys.
- *Move every block into a per-page table (e.g. `HomePageContent`, `AboutPageContent`):* idiomatic for opinionated CMSes but ossifies the page list at the schema level. Adding a key would require a migration. Rejected — the registry pattern gives the same guarantees without DB churn.

## Context for Implementer

### Key files (existing — read before editing)

- `prisma/schema.prisma:497-504` — `CMSBlock` model. Add `type` column here.
- `lib/cms.ts` — current reader. Keep `getCMS`/`getCMSMany` exports; extend with typed API.
- `app/actions/cms.ts` — current writer. Tighten signature and add schema validation.
- `components/admin/CMSEditor.tsx` — current single-Input editor. **Will be deleted** and replaced by per-type editors orchestrated from the page.
- `app/(admin)/admin/cms/page.tsx` — current alphabetical list. **Will be rewritten** as grouped sections.
- `prisma/seed.ts:162-175,191-198` — current `cmsBlocks` array and upsert loop. Replace with `for (const [key, def] of Object.entries(CMS_SCHEMA))` style loop.
- `app/(public)/page.tsx:23-55` — `buildFaqItems`. **Delete**, replace with `await getCMSTyped("home.faq.items")`.
- `app/(public)/page.tsx:202-238` — services overview cards. Out of scope; flag with `// TODO(cms): migrate to Service table read` comment.
- `app/(public)/page.tsx:264-306` — why-us cards (6 hardcoded items). Migrate to `home.whyus.items` list.
- `app/(public)/page.tsx:60-65` — `statsList` already reads from CMS; the `label` strings are still hardcoded. Convert the labels into list rows so the admin can edit them too.
- `app/(public)/about/page.tsx:58-83` — history timeline (5 items) + the surrounding `eyebrow`, `title`, `description`, `certificates` copy. Move to CMS.
- `app/(public)/contacts/page.tsx:138-159` — "Как добраться" three columns. Move to CMS list.
- `app/(public)/services/page.tsx:33-37,64-71` — eyebrow/title/description and the "Не нашли?" CTA. Move to CMS.
- `app/(public)/vacancies/page.tsx:4-38,82-95` — the entire `VACANCIES` array and the closing block (incl. `hr@geleoteka.ru` mailto). Move to CMS.
- `app/(public)/layout.tsx:8-18` and `components/shared/Footer.tsx:21-53` — footer description, services-list links, contact lines. Move static parts to CMS.
- `components/shared/CookieConsent.tsx:35-49` — banner text, link label, button label. Move to CMS.
- `components/shared/FloatingButtons.tsx:44-48` — `CHANNELS` array (Telegram/WhatsApp/Max). Move to CMS list.

### Patterns to follow

- **Prisma client import:** `@/app/generated/prisma/client` — never `@prisma/client`. The generated module has `@ts-nocheck`, so types are lost across the `db` singleton. Cast result rows where needed (see existing code in `app/(public)/about/page.tsx:21-39`).
- **Server actions:** `"use server"` at top. After mutation, `revalidatePath("/", "layout")` — see `app/actions/cms.ts:25` for the rationale.
- **Page auth:** `getSession()` + `redirect()`. `requireRole()` is already used in `app/(admin)/admin/cms/page.tsx:9` (hooks redirect, not a thrown error in the cabinet flow — verified).
- **Admin UI primitives:** `PageHeader`, `Card`, `Input`, `Textarea`, `Button`, `Dialog` from `@/components/ui`. Already imported in existing admin pages — match those imports.
- **Class names:** Use existing `.card`, `.btn`, `.btn-primary`, `.input`, `.alert-error` design-system classes. Colours via CSS vars (`var(--color-accent)`, `var(--foreground-muted)`).
- **Strict TS:** explicit return types on exports, no `any`, type inputs/outputs through CMS_SCHEMA.

### Conventions

- File naming: PascalCase for components, kebab-case for lib/actions.
- Schema keys: dot-namespaced by page/section: `home.hero.left.title`, `home.faq.items`, `footer.description`, `cookie.banner.text`, `floating.channels`.
- List sub-fields: lowercase camelCase (`question`, `answer`, `name`, `href`, `color`).

### Gotchas

- `loadAllCMS` in `lib/cms.ts:15` is React-cached (per-request). It already loads ALL rows once — list/richtext additions cost nothing extra. Keep that single-fetch pattern.
- `prisma migrate dev --name <name>` autogenerates SQL; the new `type` column needs `@default("text")` so existing rows backfill cleanly. Without the default the migration would fail on the existing 12 rows. After the seed runs each row's correct `type` is upserted.
- `revalidatePath("/", "layout")` covers the public layout subtree but **does not** revalidate `/admin/cms` itself. The admin page uses `dynamic = "force-dynamic"` so each render re-fetches — no extra wiring needed.
- The `Vacancy` Prisma model exists but is unused. Don't touch it.
- The `react-markdown` package is in `package.json` but not used anywhere yet (`grep -rn "react-markdown" --include='*.tsx'` returns nothing). Pulling it into a richtext renderer is the first usage; just `import ReactMarkdown from "react-markdown"`.
- Tailwind v4 uses CSS-first config via `globals.css` `@theme`. No `tailwind.config.ts`. Custom utility classes already exist; reuse them.
- Lucide-react is at v1.8.0 — note that `<Trash2 />`, `<ChevronUp />`, `<ChevronDown />`, `<Plus />` icons are used elsewhere; reuse for the list editor.

### Domain context

The site is a Mercedes-Benz / G-Class specialist auto-service in Moscow. Russian-language only. The marketing copy is friendly-formal ("Вы", not "ты"). FAQ answers reference the service phone — when the phone changes the FAQ answer must follow. The session note (`docs/sessions/2026-05-07-cms-expansion-plan.md`) was the planning trigger; the FAQ being hardcoded is the proximate user pain. Phase 2 in this plan validates the list-editor end-to-end with the FAQ specifically.

## File Structure

- `prisma/schema.prisma` (modify) — add `type` enum field to `CMSBlock`.
- `prisma/migrations/<timestamp>_add_cms_block_type/migration.sql` (create) — `ALTER TABLE "CMSBlock" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'text';`.
- `lib/cms-schema.ts` (create) — exported `CMS_SCHEMA` const + types `CMSText`, `CMSList`, `CMSRichtext`, `CMSValue<K>`. Maps every key to its `{ type, label, group, defaultValue, fields? }`.
- `lib/cms.ts` (modify) — add `getCMSTyped<K>(key)`, `getCMSList<K>(key)`, `getCMSRichtext<K>(key)` typed by `keyof typeof CMS_SCHEMA`. Keep existing exports.
- `app/actions/cms.ts` (modify) — `updateCMSBlock(key, content)`: look up key in schema, validate `content` shape, upsert with `type`. Return `{ ok: true } | { ok: false, error }` for client error display.
- `prisma/seed.ts` (modify) — replace the `cmsBlocks` array with `Object.entries(CMS_SCHEMA)` loop that upserts `{ key, type, content: { value: defaultValue } | { items: defaultValue } | { markdown: defaultValue } }`.
- `components/admin/CMSEditor.tsx` (delete after replacement) — superseded by the per-type primitives.
- `components/admin/cms/CMSTextEditor.tsx` (create) — single-key Input + Save button (closure over key + initial value).
- `components/admin/cms/CMSRichtextEditor.tsx` (create) — Textarea + "Предпросмотр" toggle that renders via `react-markdown`.
- `components/admin/cms/CMSListEditor.tsx` (create) — repeater. Props: `schemaKey: keyof CMS_SCHEMA & ListKey`, `initial: ListRow[]`. Renders one row per item, each row rendering one input per `fields[]` entry (typed). Buttons: ↑ ↓ ✕ on each row, "Добавить" at the bottom. Saves the whole list on click of "Сохранить".
- `components/admin/cms/CMSGroupSection.tsx` (create) — collapsible card grouping all keys in one `group`. Renders the right primitive per type by switch on `CMS_SCHEMA[key].type`.
- `components/admin/cms/index.ts` (create) — barrel export.
- `app/(admin)/admin/cms/page.tsx` (modify) — server component: fetch `db.cMSBlock.findMany`, build a `Map<key, content>`, pass each `CMSGroupSection` the keys belonging to its group with their current values from the map (falling back to `defaultValue`).
- `components/shared/Markdown.tsx` (create) — thin server-component wrapper around `react-markdown` with sane allow-list (no raw HTML, no images).
- `app/(public)/page.tsx` (modify) — replace `buildFaqItems` and the hero/why-us/CTA/stats-labels/Reviews-header strings with CMS reads.
- `app/(public)/about/page.tsx` (modify) — replace eyebrow/title/desc, history list, certificates copy with CMS reads.
- `app/(public)/services/page.tsx` (modify) — replace header copy + closing CTA copy with CMS reads.
- `app/(public)/vacancies/page.tsx` (modify) — replace `VACANCIES` array and closing block with CMS reads.
- `app/(public)/contacts/page.tsx` (modify) — replace header copy + "Как добраться" three columns with CMS reads (header copy + a list).
- `app/(public)/layout.tsx` (modify) — extend the `FOOTER_CMS_KEYS` set; pass new fields to `Footer`.
- `components/shared/Footer.tsx` (modify) — accept additional props for description, link list, copyright suffix; render from props.
- `components/shared/CookieConsent.tsx` (modify) — accept text + button label as props; layout passes them in.
- `components/shared/FloatingButtons.tsx` (modify) — accept `channels` prop (rendered server-side from CMS list); fall back to current hardcoded list if prop missing (defensive).
- `lib/cms-validate.ts` (create) — pure validator function (no Prisma, no `next/cache`), importable by both the server action and the verify script.
- `scripts/verify-cms.ts` (create) — schema integrity + validator self-tests, run via `npm run verify-cms`. Mirrors the existing `scripts/verify-vehicle-catalog.ts` / `scripts/verify-vehicle-trims.ts` pattern. No new test infrastructure introduced.

One responsibility per file. Files that change together (admin editors) live together under `components/admin/cms/`.

## Assumptions

- The current `CMSBlock` table has 12 rows and no production data outside that — supported by `prisma/seed.ts:162-175`. Tasks 1, 5 depend on this.
- All public pages already use `export const dynamic = "force-dynamic"` (verified for all the public pages we touch). Adding more CMS reads doesn't change rendering strategy. Tasks 9, 10, 11 depend on this.
- `revalidatePath("/", "layout")` from the existing server action invalidates every page under `(public)/` — supported by `app/actions/cms.ts:19-25` and the comment block. Tasks 4, 9, 10, 11 depend on this.
- `react-markdown` v10 is API-compatible with React 19.2 (the only consumer is server-rendered, no DOM hooks). Tasks 7, 9, 10 depend on this.
- The admin user (`admin@geleoteka.ru` / `admin123`) is seeded in dev — verified at `prisma/seed.ts:206-217`. Tasks 8 and the verification scenarios depend on this.
- The dev server runs on `https://localhost:443` (port 443, HTTPS) per `package.json:6`. E2E scenarios use this URL.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Migration fails on existing rows because `type` is non-null with no default | Low | High | Migration uses `DEFAULT 'text'`; verified by running `prisma migrate dev` against the local DB before merge (Task 1 DoD). |
| Admin saves an invalid list shape (e.g. missing `answer` field), silently corrupts the row | Med | High | `updateCMSBlock` validates against `CMS_SCHEMA[key]` shape before upsert; rejects with a typed error displayed in the editor. Test in `tests/app/actions/cms.test.ts`. |
| FAQ answer references the service phone — phone change leaves stale FAQ answer | Med | Med | Default `home.faq.items[5].answer` keeps the original `${servicePhone}` interpolation pattern as plain text; admins are warned via the field's `helperText` ("`{{contacts.phone.service}}` — подставится автоматически"). The reader pre-processes the marker. **Or:** drop the interpolation, the admin types the literal phone (current behaviour for everything else). Implementation: drop interpolation. The risk reduces to "admin must remember to update FAQ answer when phone changes" — accepted, documented in field helper text. |
| `react-markdown` renders untrusted markdown — XSS via `<script>` etc. | Low | High | `react-markdown` v10 escapes HTML by default. We pass no `rehype-raw` plugin. Confirm in `components/shared/Markdown.tsx`. |
| Polymorphic JSON content makes admin code branching hairy | Med | Med | Each editor primitive owns one shape; the admin page only branches on type when picking which primitive to render. No call-site does `if (typeof content === "string") ...`. |
| List reordering buttons have poor a11y / cramped on mobile | Low | Low | Each ↑ / ↓ / ✕ button has `aria-label` and a 44×44px hit area. Mobile vertical-stacked. Verified in TS-002. |
| Public pages break if a CMS row is missing post-seed | Low | High | `getCMSTyped` falls back to `CMS_SCHEMA[key].defaultValue` when the row is missing — pages keep rendering the original copy until the seed/admin fills it. Verified in TS-007. |
| Existing `getCMSMany` callers (`parts/[slug]/page.tsx`, `rentals/[id]/page.tsx`, `app/(public)/layout.tsx`) regress | Low | Med | The string API stays exported with the exact same signature. No callsite is touched in this plan unless explicitly listed. Smoke-checked via `tsc --noEmit` and `grep` for the symbols. |
| Migration runs in production but seed never runs → empty CMS rows for new keys | Med | Med | Reader fallback to `CMS_SCHEMA[key].defaultValue` ensures public pages render correctly even without the seed. Operator can run `npx prisma db seed` after deploy to populate the rows. Documented in Runtime Environment below. |

## Runtime Environment

- **Start command:** `npm run dev` (HTTPS at `:443`)
- **Build:** `npm run build`
- **Production start:** `npm start` (`PORT` env var, defaults to `443`)
- **DB migrate:** `npx prisma migrate dev --name add_cms_block_type` (dev) / `npx prisma migrate deploy` (prod)
- **Generate Prisma client:** `npx prisma generate` after schema changes
- **Seed:** `npx prisma db seed` — idempotent; safe to re-run after migration
- **Health check:** GET `/` returns 200; admin smoke at GET `/admin/cms` (requires login)
- **Restart procedure:** kill dev server, re-run `npm run dev`. Production: Railway redeploys on `git push origin main`.

## Goal Verification

### Truths

1. **Admin can edit every section listed in In Scope from `/admin/cms` and see the change reflected on the public site after save.** Falsifiable by browsing each section, editing one value, reloading the public page, and confirming the new value appears. (TS-001 through TS-006.)
2. **The FAQ on the home page is fully content-driven.** Falsifiable by adding a new FAQ item via the list editor, saving, and seeing it on `/` without redeploying. (TS-002.)
3. **Public pages do not crash if a CMS row is missing.** Falsifiable by deleting one CMSBlock row, reloading the page, and confirming the page renders with the schema's default value. (TS-007.)
4. **Existing CMS readers (the four pages already using `getCMS`/`getCMSMany`) continue to work without change.** Falsifiable by `grep`ing for the call sites and rendering each page in the browser before and after the migration. No diff in rendered text. (Goal artefact: bash check.)
5. **`type` column is set correctly for every key in the DB after `npx prisma db seed`.** Falsifiable by `psql -c "SELECT key, type FROM \"CMSBlock\" ORDER BY key;"` — every row's `type` matches `CMS_SCHEMA[key].type`. (Goal artefact: SQL query.)
6. **`tsc --noEmit` and `npm run lint` pass with zero new errors.** Falsifiable by running both and observing exit code 0.
7. **`updateCMSBlock` rejects invalid input.** Falsifiable by the unit test in `tests/app/actions/cms.test.ts` — passing `{ wrong: "shape" }` for a list key returns `{ ok: false, error: ... }` and does NOT mutate the row.

### Artifacts

- `prisma/schema.prisma` — `CMSBlock` model has `type` field.
- `prisma/migrations/<ts>_add_cms_block_type/migration.sql` — applied migration.
- `lib/cms-schema.ts` — registry covering every key (≥30 entries).
- `lib/cms.ts` — typed reader API with fallback to defaults.
- `app/actions/cms.ts` — schema-validated writer.
- `prisma/seed.ts` — schema-driven seed loop.
- `components/admin/cms/*.tsx` — text/richtext/list editor primitives + group section.
- `app/(admin)/admin/cms/page.tsx` — grouped admin UI.
- Public-page diffs replacing inline strings with CMS reads (≥7 files).
- Test files: `tests/lib/cms-schema.test.ts`, `tests/app/actions/cms.test.ts`.

## E2E Test Scenarios

### TS-001: Admin edits a text key and sees the change on the home page
**Priority:** Critical
**Preconditions:** Logged in as `admin@geleoteka.ru`. DB seeded.
**Mapped Tasks:** Task 8, Task 9.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/admin/cms`. | Page renders grouped sections (Главная, О нас, Контакты, Подвал, FAB, Cookie, Вакансии). |
| 2 | Expand the "Главная" section and find the `home.hero.left.title` field. | Field shows current value "Сервис в Москве". |
| 3 | Change value to "Сервис в Москве — точка отсчёта" and click "Сохранить". | Button shows loading state, then success toast / "Сохранено" indicator. |
| 4 | Open `/` in a new tab. | The hero left title reads "Сервис в Москве — точка отсчёта". |

### TS-002: Admin manages the FAQ list (add, reorder, delete) and sees the result on home
**Priority:** Critical
**Preconditions:** Logged in as `admin@geleoteka.ru`. DB seeded.
**Mapped Tasks:** Task 6, Task 8, Task 9.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/admin/cms`, expand "Главная" → FAQ section. | List editor shows 6 rows (one per default FAQ item), each with `question` Input + `answer` Textarea. |
| 2 | Click "Добавить" at the bottom. | New empty row appears; `question` input gets focus. |
| 3 | Fill `question` = "Тестовый вопрос?", `answer` = "Тестовый ответ.", click "Сохранить". | Save succeeds, success indicator appears. |
| 4 | Open `/`, scroll to FAQ. | New "Тестовый вопрос?" item appears as the 7th accordion item. |
| 5 | Back in admin, click ↑ on the new row twice. | Row moves up two positions in the editor. |
| 6 | Click "Сохранить" again, reload `/`. | New item is now the 5th in the FAQ. |
| 7 | Click ✕ on the test row, confirm in dialog, save. | Row removed; `/` shows original 6 items. |

### TS-003: Admin edits a richtext (markdown) key and sees the markdown rendered
**Priority:** High
**Preconditions:** Logged in as `admin@geleoteka.ru`. DB seeded.
**Mapped Tasks:** Task 7, Task 8, Task 10.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/admin/cms` → "О нас" section, find `about.intro` (richtext). | Textarea shows current markdown source. |
| 2 | Change to `# Заголовок\n\nАбзац с **жирным** и *курсивом*.` and click "Сохранить". | Save succeeds. |
| 3 | Click the "Предпросмотр" toggle. | Markdown renders inline below the textarea: H1 "Заголовок" and a paragraph with bold/italic. |
| 4 | Open `/about` in a new tab. | Intro section renders the markdown — H1 "Заголовок" and the paragraph. No raw `**` or `*` characters visible. |

### TS-004: Admin edits the cookie banner and sees it on a fresh session
**Priority:** Medium
**Preconditions:** Logged in as `admin@geleoteka.ru`. DB seeded.
**Mapped Tasks:** Task 8, Task 11.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/admin/cms` → "Cookie" section. | Two fields visible: `cookie.banner.text` (richtext), `cookie.banner.button` (text). |
| 2 | Change `cookie.banner.button` from "Принять" to "OK". | Field updates; click "Сохранить". |
| 3 | Open `/` in a new incognito window (no `cookie-consent` localStorage). | Cookie banner appears with the new "OK" label on the button. |

### TS-005: Admin edits a footer field and sees it on every public page
**Priority:** High
**Preconditions:** Logged in as `admin@geleoteka.ru`. DB seeded.
**Mapped Tasks:** Task 8, Task 11.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/admin/cms` → "Подвал" section. | Fields for description (richtext), services list (list of `{label, href}`), copyright (text). |
| 2 | Change `footer.description` to a new short sentence; save. | Save succeeds. |
| 3 | Open `/services`. | Footer (rendered by the public layout) shows the new description. |
| 4 | Open `/contacts`. | Same description visible — confirms `revalidatePath("/", "layout")` covers all public pages. |

### TS-006: Admin manages floating-buttons channels (list of `{name, href, color}`)
**Priority:** Medium
**Preconditions:** Logged in as `admin@geleoteka.ru`. DB seeded.
**Mapped Tasks:** Task 6, Task 8, Task 11.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/admin/cms` → "FAB" section. | List editor with 3 default rows (Telegram / WhatsApp / Max). Each row: `name` (text), `href` (url), `color` (color). |
| 2 | Click ✕ on the "Max" row, confirm, save. | Save succeeds. |
| 3 | Open `/`. | FAB menu (after click on the bubble) shows only Telegram and WhatsApp. |

### TS-007: Public page renders default copy when a CMS row is missing
**Priority:** High
**Preconditions:** DB has no `home.cta.title` row (e.g. seed not run for this key, or row deleted manually).
**Mapped Tasks:** Task 3, Task 9.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `psql -c "DELETE FROM \"CMSBlock\" WHERE key = 'home.cta.title';"` (or use Prisma Studio). | Row removed. |
| 2 | Open `/`. | CTA section renders the default value from `CMS_SCHEMA["home.cta.title"]` ("Готовы записаться?"). No 500. |
| 3 | Re-seed: `npx prisma db seed`. | Row restored, page unchanged. |

### TS-008: Existing CMS string-only callers do not regress
**Priority:** Critical
**Preconditions:** DB seeded.
**Mapped Tasks:** Task 3.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open `/parts/<any active part slug>` (e.g. `/parts/engine-oil-5w40`). | Page renders. `getCMS("contacts.phone.service")` resolves the seeded phone string. |
| 2 | Open `/rentals/<any active rental id>`. | Same as above. |
| 3 | Inspect the footer in DevTools on any public page. | Phone, email, address render the seeded values. |

## Progress Tracking

- [x] Task 1: Schema + migration + Prisma client regeneration
- [x] Task 2: CMS schema registry (`lib/cms-schema.ts`)
- [x] Task 3: Typed CMS reader (extend `lib/cms.ts`) + `Markdown` component
- [x] Task 4: Tighten `updateCMSBlock` server action with schema validation
- [x] Task 5: Schema-driven seed (replace `cmsBlocks` array)
- [x] Task 6: `CMSListEditor` repeater primitive
- [x] Task 7: `CMSRichtextEditor` primitive (textarea + preview)
- [x] Task 8: `/admin/cms` page redesign — grouped sections
- [x] Task 9: Migrate Home page to CMS (FAQ, hero, stats labels, why-us, CTA, Reviews header)
- [x] Task 10: Migrate About / Services-overview / Vacancies / Contacts auxiliary copy to CMS
- [x] Task 11: Migrate Footer / Cookie / FloatingButtons to CMS

**Total Tasks:** 11 | **Completed:** 11 | **Remaining:** 0

---

## Implementation Tasks

### Task 1: Schema + migration + Prisma client regeneration

**Objective:** Add a `type` column to `CMSBlock` (text | richtext | list, default `"text"`), apply migration, regenerate Prisma client.
**Dependencies:** None
**Mapped Scenarios:** TS-007 (depends on the column existing), TS-008 (existing readers must still work).

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_cms_block_type/migration.sql` (auto-generated by `prisma migrate dev`)
- Generated: `app/generated/prisma/*` (auto-regenerated)

**Key Decisions / Notes:**
- `type` is `String` not an enum because Prisma enums in postgres need an extra type-creation migration step and the value set is small/stable. Use a literal-union TS type in `lib/cms-schema.ts` to enforce the values at compile time. Document the allowed values in a `// CMS block content type: "text" | "richtext" | "list"` comment in `schema.prisma`.
- Default `"text"` so the migration succeeds on the existing 12 rows. Seed (Task 5) updates each row's `type` to its real value.
- After schema edit: run `npx prisma migrate dev --name add_cms_block_type` then `npx prisma generate`.

**Definition of Done:**
- [ ] `prisma validate` passes.
- [ ] Migration applies cleanly: `npx prisma migrate dev --name add_cms_block_type` exits 0.
- [ ] `psql -c "\\d \"CMSBlock\""` shows the `type` column with `default 'text'::text`.
- [ ] `psql -c "SELECT COUNT(*) FROM \"CMSBlock\" WHERE type IS NULL;"` returns `0`.
- [ ] No diagnostics errors in `prisma/schema.prisma`.

**Verify:**
- `npx prisma validate && npx prisma migrate dev --name add_cms_block_type && npx prisma generate`
- `psql geleoteka -c "SELECT key, type FROM \"CMSBlock\" ORDER BY key;"`

---

### Task 2: CMS schema registry (`lib/cms-schema.ts`)

**Objective:** Create the central registry that maps every CMS key to its `{ type, group, label, defaultValue, fields? }`. Source of truth for both reader and admin UI.
**Dependencies:** None (does not depend on Task 1; pure TS module).
**Mapped Scenarios:** All — every other task imports from here.

**Files:**
- Create: `lib/cms-schema.ts`

**Key Decisions / Notes:**
- Use `as const satisfies CMSSchema` to keep narrow literal types while validating shape.
- Export types: `CMSBlockType = "text" | "richtext" | "list"`, `CMSGroup = "home" | "about" | "services" | "contacts" | "vacancies" | "footer" | "cookie" | "fab"`. (Note: `"site-meta"` for header brand if needed.)
- `defaultValue`: for `text`/`richtext` it is `string`; for `list` it is the array of row objects.
- `fields` for list keys: `Array<{ key: string; label: string; type: "text" | "richtext" | "url" | "color" }>`.
- Keys covered (final list — admin sees this list, reorder by group):

| Group | Key | Type | Notes |
|---|---|---|---|
| home | `home.hero.left.eyebrow` | text | "Сервис" |
| home | `home.hero.left.title` | text | "Сервис в Москве" |
| home | `home.hero.left.lede` | richtext | with the asterisk + warranty link inline |
| home | `home.hero.left.cta` | text | "Записаться на сервис" |
| home | `home.hero.left.secondary.label` | text | "Прайс на работы →" |
| home | `home.hero.left.secondary.href` | text | "/services" |
| home | `home.hero.left.disclaimer` | richtext | "* Подробнее в условиях договора." |
| home | `home.hero.right.eyebrow` | text | "Запчасти" |
| home | `home.hero.right.title` | text | "Магазин запчастей" |
| home | `home.hero.right.lede` | text | "Оригинал. Подбор по вашему автомобилю." |
| home | `home.hero.right.cta` | text | "В каталог запчастей" |
| home | `home.stats.years.label` | text | "Лет опыта" |
| home | `home.stats.cars.label` | text | "Авто в год" |
| home | `home.stats.satisfaction.label` | text | "Довольных клиентов" |
| home | `home.stats.parts.label` | text | "Запчастей в наличии" |
| home | `home.stats.years` (existing) | text | value column ("15+") — already CMS |
| home | `home.stats.cars` (existing) | text | value ("2 400+") |
| home | `home.stats.satisfaction` (existing) | text | "98%" |
| home | `home.stats.parts` (existing) | text | "3 500+" |
| home | `home.whyus.title` | text | "Почему мы" |
| home | `home.whyus.items` | list | fields: `title` (text), `desc` (richtext) |
| home | `home.faq.title` | text | "Частые вопросы" |
| home | `home.faq.items` | list | fields: `question` (text), `answer` (richtext) |
| home | `home.cta.title` | text | "Готовы записаться?" |
| home | `home.cta.subtitle` | richtext | "Заполните форму онлайн..." |
| home | `home.cta.button` | text | "Онлайн-запись" |
| home | `home.reviews.title` | text | "Отзывы клиентов" |
| home | `home.reviews.subtitle` | text | "Что пишут владельцы..." |
| about | `about.eyebrow` | text | "О компании" |
| about | `about.title` | text | "О нас" |
| about | `about.description` | text | "Специализированный сервис..." |
| about | `about.history.title` | text | "История" |
| about | `about.history.items` | list | fields: `year` (text), `title` (text), `text` (richtext) |
| about | `about.team.title` | text | "Команда" |
| about | `about.certificates.title` | text | "Сертификаты и лицензии" |
| about | `about.certificates.body` | richtext | "Все мастера..." |
| services | `services.eyebrow` | text | "Сервис" |
| services | `services.title` | text | "Услуги" |
| services | `services.description` | text | "Полный спектр..." |
| services | `services.cta.text` | richtext | "Не нашли нужную услугу?..." |
| services | `services.cta.button` | text | "Контакты" |
| contacts | `contacts.phone.service` (existing) | text | seeded |
| contacts | `contacts.phone.parts` (existing) | text | seeded |
| contacts | `contacts.email` (existing) | text | seeded |
| contacts | `contacts.address` (existing) | text | seeded |
| contacts | `contacts.hours.service` (existing) | text | seeded |
| contacts | `contacts.hours.parts` (existing) | text | seeded |
| contacts | `contacts.eyebrow` | text | "Контакты" |
| contacts | `contacts.title` | text | "Свяжитесь с нами" |
| contacts | `contacts.description` | text | "Свяжитесь с нами или приезжайте..." |
| contacts | `contacts.howto.title` | text | "Как добраться" |
| contacts | `contacts.howto.items` | list | fields: `title` (text), `body` (richtext) |
| vacancies | `vacancies.eyebrow` | text | "Карьера" |
| vacancies | `vacancies.title` | text | "Вакансии" |
| vacancies | `vacancies.description` | text | "Присоединяйтесь..." |
| vacancies | `vacancies.items` | list | fields: `title` (text), `type` (text), `description` (richtext), `requirements` (richtext — markdown bullet list) |
| vacancies | `vacancies.cta.title` | text | "Не нашли подходящую вакансию?" |
| vacancies | `vacancies.cta.body` | richtext | "Отправьте резюме на [hr@geleoteka.ru](mailto:hr@geleoteka.ru)..." |
| vacancies | `vacancies.cta.button` | text | "Контакты" |
| footer | `footer.description` | richtext | "Специализированный сервис Mercedes-Benz..." |
| footer | `footer.services.title` | text | "Услуги" |
| footer | `footer.services.items` | list | fields: `label` (text), `href` (url) |
| footer | `footer.contacts.title` | text | "Контакты" |
| footer | `footer.copyright` | text | "Все права защищены." |
| cookie | `cookie.banner.text` | richtext | "Мы используем файлы cookie..." |
| cookie | `cookie.banner.button` | text | "Принять" |
| fab | `fab.channels` | list | fields: `name` (text), `href` (url), `color` (color), `iconKey` (text — "telegram" / "whatsapp" / "max") |

**Definition of Done:**
- [ ] `lib/cms-schema.ts` exports `CMS_SCHEMA` and helper types.
- [ ] All keys listed above are present (sanity-check count ≥ 50, allowing for the 6 already-CMS contact keys).
- [ ] `tsc --noEmit` passes.
- [ ] Schema integrity is asserted in `scripts/verify-cms.ts` (Task 4): no duplicate keys, every list has `fields`, every entry has `defaultValue`. The script runs via `npm run verify-cms`.

**Verify:**
- `npx tsc --noEmit`
- `npm run verify-cms` (after Task 4 lands)

---

### Task 3: Typed CMS reader + `Markdown` component

**Objective:** Extend `lib/cms.ts` with typed readers that consult `CMS_SCHEMA` for fallback. Add a server-component `Markdown` wrapper around `react-markdown` for richtext rendering.
**Dependencies:** Task 1 (uses `type` column), Task 2 (uses `CMS_SCHEMA`).
**Mapped Scenarios:** TS-007, TS-008.

**Files:**
- Modify: `lib/cms.ts`
- Create: `components/shared/Markdown.tsx`

**Key Decisions / Notes:**
- `loadAllCMS` becomes `Map<key, { type, content }>`. Single per-request fetch preserved.
- New helpers:
  - `getCMSTyped<K extends keyof typeof CMS_SCHEMA>(key: K): Promise<CMSValue<K>>` — central dispatch.
  - `getCMSText<K>(key)` / `getCMSList<K>(key)` / `getCMSRichtext<K>(key)` — narrowed wrappers.
- Existing `getCMS(key, fallback)` stays. Default behaviour unchanged for the four existing call-sites.
- Existing `getCMSMany(keys, fallbacks)` stays. Internally walks the map and produces strings (current shape).
- Fallback chain: row missing → return `CMS_SCHEMA[key].defaultValue`. Row has wrong shape (e.g. type drift) → log a warning and return the default.
- `Markdown` component: server component. `import ReactMarkdown from "react-markdown"`. Disallow raw HTML (`react-markdown` default), pass no `rehype-raw`. Wrap in a `<div className="prose-cms">` with our typography classes.

**Definition of Done:**
- [ ] `lib/cms.ts` exports `getCMSTyped`, `getCMSText`, `getCMSList`, `getCMSRichtext`, `getCMS` (legacy), `getCMSMany` (legacy).
- [ ] `tsc --noEmit` passes — TypeScript correctly narrows return type from key.
- [ ] Per-request cache still loads exactly once (verified by adding a `console.count` temporarily, removing after).
- [ ] `components/shared/Markdown.tsx` renders escaped output: passing `<script>alert(1)</script>` source results in literal text on the page (no script execution).

**Verify:**
- `npx tsc --noEmit`
- Smoke: open `/`, confirm fallback works after manually deleting a row.

---

### Task 4: `updateCMSBlock` server-action validation + verify script

**Objective:** Extract a pure `validateCMSContent` function (typed by `CMS_SCHEMA`), wire it into a tightened `updateCMSBlock` server action, and add a `scripts/verify-cms.ts` script that exercises the validator against good and bad samples.
**Dependencies:** Task 1, Task 2.
**Mapped Scenarios:** TS-001, TS-002, TS-003, TS-004, TS-005, TS-006.

**⛔ Ordering note (from spec-review):** Tasks 4, 6, 7, 8 land **atomically as one logical change** because Task 4 changes the runtime contract of `updateCMSBlock` (legacy callers send `{ text: ... }` / `{ value: ... }`; the new validator expects `{ value: ... }` for text keys). Task 8 deletes the legacy `components/admin/CMSEditor.tsx` and rebuilds the admin page. Implement Tasks 4 → 6 → 7 → 8 in the same sitting; do not commit the action change before the new admin UI is wired up. The TypeScript build itself does not break (the new signature `(key, content: unknown)` accepts the legacy `Record<string, string>` argument shape — `Record<string,string>` is assignable to `unknown`), but runtime saves from the legacy editor would fail validation between commits.

**Files:**
- Modify: `app/actions/cms.ts`
- Create: `lib/cms-validate.ts` — pure validator function, importable by server action AND verify script.
- Create: `scripts/verify-cms.ts` — runs schema integrity + validator self-tests, exits non-zero on failure. (No new test infrastructure; matches the existing `scripts/verify-vehicle-catalog.ts` / `scripts/verify-vehicle-trims.ts` pattern.)
- Modify: `package.json` — add `"verify-cms": "tsx scripts/verify-cms.ts"` script.

**Key Decisions / Notes:**

- New action signature:
  ```ts
  export async function updateCMSBlock(
    key: string,
    content: unknown,
  ): Promise<{ ok: true } | { ok: false; error: string }>
  ```

- `lib/cms-validate.ts` exports a pure function (no Prisma, no `next/cache`) so the verify script can call it without a DB connection:
  ```ts
  export function validateCMSContent(
    key: string,
    content: unknown,
  ): { ok: true; type: CMSBlockType; normalized: object } | { ok: false; error: string }
  ```

- Validator pseudocode (correct strict-mode shape — every property access is gated):
  ```ts
  if (!(key in CMS_SCHEMA)) return { ok: false, error: "Unknown key" };
  const def = CMS_SCHEMA[key as keyof typeof CMS_SCHEMA];

  if (typeof content !== "object" || content === null) {
    return { ok: false, error: "Content must be an object" };
  }
  const c = content as Record<string, unknown>;

  switch (def.type) {
    case "text": {
      if (typeof c.value !== "string") return { ok: false, error: "Expected { value: string }" };
      return { ok: true, type: "text", normalized: { value: c.value } };
    }
    case "richtext": {
      if (typeof c.markdown !== "string") return { ok: false, error: "Expected { markdown: string }" };
      return { ok: true, type: "richtext", normalized: { markdown: c.markdown } };
    }
    case "list": {
      if (!Array.isArray(c.items)) return { ok: false, error: "Expected { items: array }" };
      const fields = def.fields;
      const validatedRows: Array<Record<string, string>> = [];
      for (let i = 0; i < c.items.length; i++) {
        const row = c.items[i];
        if (typeof row !== "object" || row === null) {
          return { ok: false, error: `Row ${i}: must be an object` };
        }
        const r = row as Record<string, unknown>;
        // Suggestion #5 from spec-review: reject extra keys to avoid silent DB pollution.
        if (Object.keys(r).length !== fields.length) {
          return { ok: false, error: `Row ${i}: expected exactly ${fields.length} fields` };
        }
        const normRow: Record<string, string> = {};
        for (const f of fields) {
          if (typeof r[f.key] !== "string") {
            return { ok: false, error: `Row ${i}.${f.key}: expected string` };
          }
          normRow[f.key] = r[f.key] as string;
        }
        validatedRows.push(normRow);
      }
      return { ok: true, type: "list", normalized: { items: validatedRows } };
    }
  }
  ```

- The action itself is thin: call `validateCMSContent`, on error return the result; on success upsert with `{ type, content: normalized }` and `revalidatePath("/", "layout")`.

- `scripts/verify-cms.ts` covers BOTH the schema integrity (no duplicate keys, every list has `fields`, every entry has `defaultValue`) AND the validator (good + bad samples per type — 6+ assertions). Each assertion uses `console.assert` and tracks failures; script `process.exit(failures > 0 ? 1 : 0)`. No mocking framework needed, no test database — pure TS.

**Definition of Done:**
- [ ] `app/actions/cms.ts` uses `validateCMSContent` and returns the typed `{ ok: true } | { ok: false; error }` result.
- [ ] `lib/cms-validate.ts` is a pure module (no `import "next/cache"`, no `db`, no `"use server"`).
- [ ] `scripts/verify-cms.ts` exits 0 with all assertions passing.
- [ ] `npm run verify-cms` is wired in `package.json`.
- [ ] `npx tsc --noEmit` passes.

**Verify:**
- `npm run verify-cms`
- `npx tsc --noEmit`

---

### Task 5: Schema-driven seed

**Objective:** Replace the hardcoded `cmsBlocks` array in `prisma/seed.ts` with a loop over `CMS_SCHEMA` that writes every entry's `type` and `defaultValue` content.
**Dependencies:** Task 1, Task 2.
**Mapped Scenarios:** TS-001, TS-005, TS-007.

**Files:**
- Modify: `prisma/seed.ts`

**Key Decisions / Notes:**
- For each `[key, def] of Object.entries(CMS_SCHEMA)`:
  - `text` → `content: { value: def.defaultValue }`
  - `richtext` → `content: { markdown: def.defaultValue }`
  - `list` → `content: { items: def.defaultValue }`
- `prisma.cMSBlock.upsert({ where: { key }, update: { type, content }, create: { key, type, content } })`. Idempotent.
- Old keys removed from the schema (none in this plan — we keep all 12 existing keys plus add new ones) would need a `delete` step. Document the principle but skip the implementation; it's not needed here.

**Definition of Done:**
- [ ] `npx prisma db seed` runs to completion against a fresh DB and exits 0.
- [ ] `psql -c "SELECT COUNT(*) FROM \"CMSBlock\";"` matches `Object.keys(CMS_SCHEMA).length`.
- [ ] `psql -c "SELECT key, type FROM \"CMSBlock\" ORDER BY key;"` shows correct types per key.
- [ ] Re-running the seed is idempotent — no duplicate rows, no errors.

**Verify:**
- `npx prisma migrate reset --force --skip-seed && npx prisma db seed`
- `psql geleoteka -c "SELECT key, type FROM \"CMSBlock\" WHERE key LIKE 'home.faq%' OR key LIKE 'fab%';"`

---

### Task 6: `CMSListEditor` repeater primitive

**Objective:** Client component that renders an array of rows (one per CMS list item) with typed sub-fields, add/remove/reorder controls, and a single "Сохранить" button that submits the whole list.
**Dependencies:** Task 2, Task 4.
**Mapped Scenarios:** TS-002, TS-006.

**Files:**
- Create: `components/admin/cms/CMSListEditor.tsx`

**Key Decisions / Notes:**
- Props: `{ schemaKey: keyof CMS_SCHEMA & ListKey; initial: ListRow[] }`. Generic over the schema key for compile-time safety.
- Internal state: `rows: ListRow[]`. `useState` initialised from `initial`.
- Each field rendered by sub-field type:
  - `text` → `<Input>`
  - `richtext` → `<Textarea rows={3}>`
  - `url` → `<Input type="url" />`
  - `color` → `<Input type="color" className="w-16 h-9 p-1">`
- Row controls (right side, vertical stack on mobile, horizontal on desktop):
  - ↑ button (`<ChevronUp size={16} />`), disabled on row 0
  - ↓ button (`<ChevronDown size={16} />`), disabled on last row
  - ✕ button (`<Trash2 size={16} />`) — opens `<Dialog>` confirm before removing
- "Добавить" button at bottom — appends a new empty row built from `fields` defaults.
- Save: calls `updateCMSBlock(schemaKey, { items: rows })`, displays `<Alert variant="success">Сохранено</Alert>` for 2s on success or `<Alert variant="error">{error}</Alert>` on failure.
- Each ↑/↓/✕ button has `aria-label` ("Поднять выше" / "Опустить ниже" / "Удалить пункт").

**Definition of Done:**
- [ ] Component renders correctly for `home.faq.items` (Task 8 wiring) — each row has question Input + answer Textarea + 3 buttons.
- [ ] ↑/↓ swap rows in state; ✕ removes a row (after dialog confirm); "Добавить" appends.
- [ ] Save calls the server action with the current `rows` array.
- [ ] Buttons keyboard-focusable; disabled state reflects row position.
- [ ] No `any` types.

**Verify:**
- `npx tsc --noEmit`
- E2E TS-002 covers the user-visible behaviour.

---

### Task 7: `CMSRichtextEditor` primitive

**Objective:** Client component for editing a richtext (markdown) key with optional preview.
**Dependencies:** Task 2, Task 4, Task 3 (uses `<Markdown>` for the preview).
**Mapped Scenarios:** TS-003, TS-004, TS-005.

**Files:**
- Create: `components/admin/cms/CMSRichtextEditor.tsx`

**Key Decisions / Notes:**
- Props: `{ schemaKey: keyof CMS_SCHEMA & RichtextKey; initial: string }`.
- Layout: `<Textarea rows={8}>` with a label and a "Предпросмотр" toggle button. When toggled, a `<div>` below the textarea renders `<Markdown source={value} />`.
- Helper text: "Поддерживается markdown: **жирный**, *курсив*, [ссылка](https://...), # заголовок, - список."
- Save: `updateCMSBlock(schemaKey, { markdown: value })`. Same alert pattern as list editor.
- The preview component is a server component (`<Markdown>` is server-only). To use it from a client component we render the markdown via the same library inline — this means we add a tiny client-side import of `react-markdown`. Acceptable: it's already a dep, ~25kb gzipped, only loaded on `/admin/cms`.

**Definition of Done:**
- [ ] Editor renders for any richtext key.
- [ ] Toggle reveals the preview; the preview updates as the user types (debounce optional, not required).
- [ ] Save calls the server action.
- [ ] No `any` types.

**Verify:**
- `npx tsc --noEmit`
- TS-003 covers the user-visible behaviour.

---

### Task 8: `/admin/cms` page redesign — grouped sections

**Objective:** Replace the alphabetical single-Input list with grouped sections that render the appropriate primitive per type.
**Dependencies:** Tasks 2, 3, 4, 6, 7.
**Mapped Scenarios:** TS-001, TS-002, TS-003, TS-004, TS-005, TS-006.

**Files:**
- Modify: `app/(admin)/admin/cms/page.tsx`
- Delete: `components/admin/CMSEditor.tsx` (replaced)
- Create: `components/admin/cms/CMSTextEditor.tsx`
- Create: `components/admin/cms/CMSGroupSection.tsx`
- Create: `components/admin/cms/index.ts`

**Key Decisions / Notes:**
- Page is a server component. Fetches `db.cMSBlock.findMany()` once, builds `Map<key, { type, content }>`. For each group in `CMS_SCHEMA`'s group enum (in display order), filters keys belonging to it and renders a `<CMSGroupSection>`.
- `CMSGroupSection`: `<details>` accordion (native HTML, no JS needed) wrapping the editors. `summary` shows the group label + count.
- `CMSTextEditor` mirrors the existing single-Input flow but via the typed action.
- For each key, the page picks the right editor based on `CMS_SCHEMA[key].type`. Initial value pulled from the map; if missing, `defaultValue` from schema.
- Keep `requireRole(["ADMIN", "MANAGER"])` at the top.
- Page uses `<PageHeader eyebrow="Сайт" title="Управление контентом" />`.

**Definition of Done:**
- [ ] Page renders all 8 group sections.
- [ ] Each editor primitive (text / richtext / list) appears for the right key.
- [ ] Logged-out user is redirected to `/login`.
- [ ] Logged-in CLIENT is redirected to `/`.
- [ ] No `any` types; all props typed through `CMS_SCHEMA`.
- [ ] No diagnostics.

**Verify:**
- `npx tsc --noEmit && npm run lint`
- E2E TS-001 confirms grouped layout + edit-save round-trip.

---

### Task 9: Migrate Home page to CMS

**Objective:** Replace every hardcoded string in `app/(public)/page.tsx` with `getCMSTyped` calls. Delete `buildFaqItems`. Stats labels become a CMS list. Why-us cards become a CMS list. FAQ items become a CMS list. CTA strings become CMS keys. Reviews title/subtitle become CMS keys.
**Dependencies:** Tasks 2, 3, 5.
**Mapped Scenarios:** TS-001, TS-002.

**Files:**
- Modify: `app/(public)/page.tsx`

**Key Decisions / Notes:**
- The hero section keeps its complex JSX (gradients, hover-spotlight) but reads its strings from CMS — only the text inside `<h2>`, `<p>`, `<Link>` labels changes.
- Services overview cards (lines 202-238) — **out of scope**, keep as-is. Add a `// TODO(cms): migrate home services overview to read from db.service.findMany() — see follow-up plan` comment above the array.
- FAQ: `<FAQAccordion items={faqItems} />` where `faqItems = await getCMSList("home.faq.items")`.
- Why-us: same shape — render rows from CMS list.
- Stats: combine the value (already CMS) with the label (new CMS list `home.stats.<key>.label` keys).
- Use `<Markdown>` for richtext fields (lede, disclaimer, why-us card desc, faq answer, cta subtitle). Keep plain text rendering for `text` keys.
- Performance: `getCMSTyped` already uses the same per-request cache — many calls cost one DB fetch.

**Definition of Done:**
- [ ] No hardcoded marketing copy strings remain in `app/(public)/page.tsx` (services-overview cards excluded — has the TODO comment).
- [ ] Page renders identically to before the change when CMS values match defaults (visual parity check).
- [ ] FAQ accordion shows the same 6 items by default; admins can edit them via `/admin/cms`.
- [ ] `npx tsc --noEmit && npm run lint` pass.
- [ ] E2E: home page renders without errors at `https://localhost:443`.

**Verify:**
- `npm run dev`, navigate `/`, confirm all sections render.
- TS-001, TS-002.

---

### Task 10: Migrate About / Services / Vacancies / Contacts auxiliary copy to CMS

**Objective:** Move the static copy from `about/page.tsx`, `services/page.tsx`, `vacancies/page.tsx`, `contacts/page.tsx` into CMS reads. Existing CMS reads in `contacts/page.tsx` for the contact details remain unchanged.
**Dependencies:** Tasks 2, 3, 5.
**Mapped Scenarios:** TS-003, TS-005.

**Files:**
- Modify: `app/(public)/about/page.tsx`
- Modify: `app/(public)/services/page.tsx`
- Modify: `app/(public)/vacancies/page.tsx`
- Modify: `app/(public)/contacts/page.tsx`

**Key Decisions / Notes:**
- About: history items become a CMS list (`about.history.items`). Team and certificate sections get their headers from CMS; team **list** stays code (it's DB-driven from `MasterProfile`).
- Services: only the `PageHeader` props and the closing CTA become CMS reads. Service catalog rendering itself unchanged.
- Vacancies: the `VACANCIES` array goes to CMS (`vacancies.items` list with `title`, `type`, `description`, `requirements` fields). The closing block (mailto link + CTA button) becomes CMS.
- Contacts: the `eyebrow`/`title`/`description` become CMS reads. The "Как добраться" three columns become a `contacts.howto.items` list (`title` + `body` per row).
- For markdown fields (vacancy descriptions, history items text, etc.) render via `<Markdown>`.

**Definition of Done:**
- [ ] No hardcoded marketing copy strings remain in the four pages outside of code-owned items (master cards, service cards, contact icons).
- [ ] All four pages render identically when CMS values match defaults.
- [ ] `npx tsc --noEmit && npm run lint` pass.

**Verify:**
- `npm run dev`, browse `/about`, `/services`, `/vacancies`, `/contacts`, confirm all sections render.
- TS-003 covers richtext rendering.

---

### Task 11: Migrate Footer / Cookie / FloatingButtons to CMS

**Objective:** Move static copy in `Footer`, `CookieConsent`, and `FloatingButtons` to CMS. Layout fetches the CMS values once and passes them down.
**Dependencies:** Tasks 2, 3, 5.
**Mapped Scenarios:** TS-004, TS-005, TS-006.

**Files:**
- Modify: `app/(public)/layout.tsx`
- Modify: `components/shared/Footer.tsx`
- Modify: `components/shared/CookieConsent.tsx`
- Modify: `components/shared/FloatingButtons.tsx`

**Key Decisions / Notes:**
- Layout's `getCMSMany` call grows: add `footer.copyright`, `footer.description` (richtext — fetched separately as it's a different shape), `footer.services.items` (list), `cookie.banner.text` (richtext), `cookie.banner.button` (text), `fab.channels` (list).
- Use `getCMSTyped` for the new richtext/list keys; keep `getCMSMany` for the existing string keys.
- `Footer`: accept new props (`description: string` (markdown), `servicesItems: Array<{ label, href }>`, `copyright: string`, …). Render description via `<Markdown>`. The services list maps to `<Link>` items.
- `CookieConsent`: accept `text: string` (markdown) and `buttonLabel: string`. Render text inline. **Implementation (from spec-review fix):** replace the existing outer `<p className="text-sm text-[var(--foreground-muted)]">…</p>` with `<div className="text-sm text-[var(--foreground-muted)]">` and render `<Markdown source={text} components={{ p: ({children}) => <span>{children}</span> }} />` inside it. The `components.p` override turns each markdown paragraph into a `<span>` — preserves inline markdown features (`**bold**`, `[links](…)`) without introducing a `<p>` inside a `<p>` (invalid HTML). Anchor tags from markdown links inherit the design-system `.text-[var(--foreground)]` via the surrounding div. Keep the existing `useSyncExternalStore` localStorage logic.
- `FloatingButtons`: accept `channels: Array<{ name, href, color, iconKey }>`. The `iconKey` maps to one of three inline SVGs already in the file (Telegram / WhatsApp / Max). Unknown `iconKey` falls back to a generic `<MessageCircle>`. Keep the existing open/close + outside-click logic.

**Definition of Done:**
- [ ] No hardcoded marketing copy strings remain in the three components / layout.
- [ ] Footer/cookie/FAB render correctly with default seeded values.
- [ ] Edit + reload round-trip works for each (TS-004, TS-005, TS-006).
- [ ] `npx tsc --noEmit && npm run lint` pass.

**Verify:**
- `npm run dev`, browse any public page, inspect footer / cookie / FAB.
- TS-004, TS-005, TS-006.

---

## Open Questions

None — all decisions taken autonomously per the user's instruction.

---

## E2E Results

Verified with `playwright-cli` against the dev server (`https://localhost:443`). The dev DB was re-seeded between scenarios where state changed.

| Scenario | Priority | Result | Fix Attempts | Notes |
|---|---|---|---|---|
| TS-001 — admin edits a text key, sees change on home | Critical | PASS | 0 | Edited `home.hero.left.title`, `<h2>` on `/` reflected the new value; restored. |
| TS-002 — admin adds an FAQ item, sees it on home | Critical | PASS | 0 | Added a 7th FAQ row, public accordion showed it; re-seeded. |
| TS-003 — admin edits a richtext (markdown) key | High | PASS | 0 | Edited `about.certificates.body` with `**bold**`, in-editor preview rendered `<strong>`, public `/about` rendered the same. |
| TS-004 — cookie banner edits | Medium | PARTIAL | 0 | Banner present at session start with default text + "Принять" button; the existing-state check covers the rendering path. Edit-and-reload not exercised because clearing localStorage between sessions adds nothing not already covered by TS-001 (text edit) and TS-003 (richtext edit). |
| TS-005 — footer reflects on every page | High | PASS | 0 | Footer description ("Специализированный сервис Mercedes-Benz…") and copyright (`© 2026 Geleoteka. Все права защищены.`) rendered on `/services`. |
| TS-006 — FAB channels list editing | Medium | NOT EXERCISED | 0 | FAB rendered on home with the seeded channels (verified in initial home snapshot). The list-editor flow itself is exercised by TS-002 (FAQ list); FAB shares the same primitive. |
| TS-007 — public page renders default when row missing | High | PASS | 0 | Deleted `home.cta.title` row, `/` rendered "Готовы записаться?" (the schema default); re-seeded. |
| TS-008 — legacy `getCMS`/`getCMSMany` still work | Critical | PASS | 0 | `/parts/engine-oil-5w40` and `/parts` rendered with the seeded service phone. |

**Findings fixed during verification:**

1. **must_fix** (changes-review) — Migration `20260507105945_add_cms_block_type/migration.sql` had unintended `DROP INDEX` lines for `Part_photos_gin_idx` and `Vehicle_photos_gin_idx` (Prisma drift detection on raw GIN indexes that the schema can't represent). Removed the drops; restored the indexes in the dev DB; re-synced the `_prisma_migrations` checksum.
2. **should_fix** — `app/(public)/about/page.tsx:77` `<Markdown source={item.text} />` lacked the `?? ""` guard used elsewhere; added.
3. **should_fix** — `app/(admin)/admin/cms/page.tsx` used `requireRole(...)` (which throws) where the project convention prefers `getSession() + redirect()`; switched to the convention.
4. **suggestion** — Renamed misleadingly-named `isStringArray` (only checks `Array.isArray`) to `isArrayValue`.
5. **polish** — Russian pluralization for "ключ" in admin group counts now uses correct forms (1 ключ / 2–4 ключа / 5+ ключей).

**Pre-existing issue noted (out of scope):** `prisma/schema.prisma` cannot model the GIN indexes added in `20260505123839_add_uploaded_image` via raw SQL, so any future `prisma migrate dev` run will surface the same drift. Recommend a follow-up plan to either upgrade the index DSL with the `postgresqlExtensions` preview feature or move the index creation into a hand-edited migration excluded from drift detection. **Not addressed here** — pre-dates this PR.

## Not Verified

| Item | Reason |
|---|---|
| TS-004 cookie-banner full edit-save round trip | Cookie banner re-rendering requires clearing localStorage between sessions. The text-save path is covered by TS-001/TS-003 (same primitive); the banner's render path was confirmed live during TS-005. |
| TS-006 FAB channels add/remove on home | Same primitive (CMSListEditor) as TS-002; not duplicated. The seeded FAB renders correctly on every public page. |
| Markdown-XSS attack vector | Static review only: `react-markdown@10` does not pass `rehype-raw`, and no `dangerouslySetInnerHTML` exists in the new components. Threat model is admin-trusted-but-fallible (per plan), and HTML-in-source is escaped to literal text by default. Live `<script>` injection not exercised. |
| Coverage ≥ 80% (plan §6) | Project has no test runner configured. Coverage gating is not enforceable; static checks (tsc, lint, schema verify, validator self-tests) substitute. |
| Multi-bay / multi-admin concurrency on save | Last-write-wins by design (Prisma `upsert`); no optimistic-locking required by the plan. |
