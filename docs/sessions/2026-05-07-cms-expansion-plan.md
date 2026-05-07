# Session memory — CMS expansion (planned, not started)

**Date:** 2026-05-07
**Status:** PLANNED — not yet implemented. User wants to come back to this.
**Triggered by:** "А где админ может отредактировать «частые вопросы»??" → discovered FAQ is hardcoded in `app/(public)/page.tsx:23-55`.

## Why

The current CMS is anaemic: only ~12 plain-text keys (hero title/subtitle, 4 stats numbers + labels, contact phones/email/address/hours), edited via `components/admin/CMSEditor.tsx` at `/admin/cms`. Everything else on the public site is **hardcoded in JSX** — including the FAQ, the hero ledes, the why-us section, the CTA banner, the about/services/vacancies copy. The user wants admins to manage **all static content** (modules like parts/rentals/orders stay code-driven).

## Inventory of static content to move under CMS

| Section | Content | Type | Currently lives in |
|---|---|---|---|
| Главная — Hero | eyebrow×2, title×2, lede×2, secondary link, asterisk disclaimer | text | `app/(public)/page.tsx` JSX |
| Главная — Stats | 4 numbers + 4 labels | list | `app/(public)/page.tsx:60-65` (`statsList`) — partially CMS already |
| Главная — Why us | header + N cards (title/desc) | list | `app/(public)/page.tsx` JSX |
| Главная — FAQ | N question/answer pairs | list | `app/(public)/page.tsx:23-55` (`buildFaqItems`) — **hardcoded** |
| Главная — CTA banner | title, subtitle, button label | text | `app/(public)/page.tsx` JSX |
| Главная — Services overview | header + per-service cards (title, blurb) | list | `app/(public)/page.tsx` JSX (cards from DB; copy hardcoded) |
| О нас | sections, mission, history | richtext | `app/(public)/about/page.tsx` JSX |
| Услуги (обзор) | header + intro copy | text | `app/(public)/services/page.tsx` JSX |
| Контакты | phones, email, address, hours | text | partly CMS already |
| Вакансии | header + intro + contact line | richtext | `app/(public)/vacancies/page.tsx` JSX |
| Footer | address, copyright, doc links | text | partly CMS already |
| Cookie consent | banner text + button label | text | `components/shared/CookieConsent.tsx` JSX |
| FloatingButtons | per-channel labels | text | `components/shared/FloatingButtons.tsx` constants |

**Excluded (modules, not CMS):** parts catalog, rentals catalog, repair orders, supplier orders, vehicle catalog, customers, calendar, estimates — these stay code+DB-driven.

## Proposed architecture

1. **Schema enhancement.** Two viable shapes for `CMSBlock`:
   - **Option A — keep current shape, type-tag content:** `CMSBlock { key: string; content: Json }` plus a new `type: "text" | "list" | "richtext"` column. `content` schema validated per-type at the read/write boundary (Zod or hand-written guards). Lightweight, no major migration.
   - **Option B — split per type:** keep `CMSBlock` for plain text, add separate tables `CMSList { key, items: Json[] }` and `CMSRichText { key, body: string }`. Cleaner queries but doubles the surface area.
   - **Recommend A** — single table, content payload typed per `type`, simpler admin/server code.

2. **Centralised key registry: `lib/cms-schema.ts`.** Source of truth for every key:
   ```ts
   export const CMS_SCHEMA = {
     "home.faq.items": {
       type: "list",
       label: "Главная — FAQ",
       fields: [
         { key: "question", label: "Вопрос", type: "text" },
         { key: "answer", label: "Ответ", type: "richtext" },
       ],
       defaultValue: [/* current hardcoded items */],
     },
     "home.hero.left.title": { type: "text", label: "Hero (слева) — заголовок", defaultValue: "Сервис в Москве" },
     // ...
   } satisfies CMSSchema;
   ```
   Drives both the admin UI generator and the server reader. Adding a key = one entry in the schema.

3. **Server helper.** Replace ad-hoc `getCMSMany(keys, fallbacks)` with a typed `getCMS<K extends keyof CMS_SCHEMA>(key: K)` that returns the strongly-typed value (text → string, list → typed array, richtext → string). Falls back to `defaultValue` from the schema if the row is missing — pages keep working before the admin ever clicks save.

4. **Admin `/admin/cms` redesign.** Sections grouped by page (Главная / О нас / Контакты / Подвал / FAQ / Cookie / FAB). Editor controls per type:
   - `text` — `<Input>`
   - `richtext` — `<Textarea>` or a minimal markdown editor
   - `list` — repeater: rows of typed sub-fields, add/remove/reorder (drag handle), uses existing `Dialog` for delete-confirm and existing primitives.

5. **Migration + seed.** Prisma migration adds `type` column. Seed script (run once) writes every `CMS_SCHEMA` entry with its `defaultValue` into `CMSBlock` so the DB matches the current site copy on day 1.

6. **Page rewrite.** Each public page swaps inline strings for `getCMS("…")` calls. JSX shape stays the same — only content sources change. `force-dynamic` already on these pages.

## Phasing (when this gets picked up)

1. **Foundation** — schema column + `lib/cms-schema.ts` skeleton + `getCMS` reader + Prisma migration + seed of existing keys.
2. **FAQ first** — most concrete user pain (the trigger for this whole effort). Add `home.faq.items` to schema, build the **list editor** primitive in admin, swap `buildFaqItems` for `getCMS("home.faq.items")`. This validates the list-type loop end-to-end before scaling.
3. **Hero + Stats + CTA** — text + list keys, low-risk JSX swap.
4. **About / Services / Vacancies** — richtext keys, needs the richtext editor primitive.
5. **Footer / Cookie / FloatingButtons** — final mop-up.

## Why /spec, not quick mode

10+ files, schema migration, new admin editor types, content default seeding, end-to-end rewrite of public pages. Quick mode would let architecture drift: list editor invented mid-task, defaults inconsistent, missing keys discovered after merge. `/spec` produces an inventory + design + phased plan that survives compaction.

## How to resume

```
cd /Users/alex/claude-dev/Geleoteka
/spec расширить CMS чтобы админ мог управлять всем статическим контентом сайта (без модулей). См. docs/sessions/2026-05-07-cms-expansion-plan.md для inventory и архитектуры.
```

The dispatcher will see no existing plan file → ask worktree question → invoke `spec-plan` which can read this note as input for PRD/inventory.

## Recent session work (context for resumer)

| Commit | What |
|---|---|
| `fcc6cb6` | Design-system overhaul squash — 109 files, 18 UI primitives, shared chrome, View Transitions, lucide migration. VERIFIED. |
| `d3e8b53` | Plan `Status: VERIFIED`. |
| `b14909c` | Mobile Header layout fix (no nested header) + universal `:active` button feedback (`.btn-icon` utility, `:active scale` on `.btn`). |
| `374af13` | `/parts` pagination (`PAGE_SIZE=24`, count + skip/take, `Pagination` primitive) + loading skeletons (`/parts`, `/parts/[slug]`, `/admin`, `/cabinet`). Dropped stray `.claude/scheduled_tasks.lock`. |
| `8aa39b9` | Hero CTA alignment first-pass (absolute-bottom secondary content, lede min-h). |
| `246e0d1` | Hero h2 min-h-24 + items-end (24px CTA offset fixed mechanically — but visually felt "jumpy" per user). |
| `2b38b21` | **Replaced "Запчасти Mercedes-Benz" → "Магазин запчастей"**. Both hero h2 are now single-line, comparable length, perfectly symmetric — `min-h-24` hack reverted, no padding tricks needed. |
| `be4ee04` | Header overflow fix — `whitespace-nowrap` on all nav links, brand wordmark hidden below `lg:`, gap-4→6 responsive, cabinetLabel `"Админ-панель"` → `"Админ"` (was wrapping). |

All on `main`, all pushed to `origin`, Railway redeployed. Production at `geleoteka-production.up.railway.app` browser-verified at 1366×1024 and 390×844 — clean.

## Conventions to remember when picking this up

- Prisma client imports: `@/app/generated/prisma/client` (NOT `@prisma/client`).
- DB singleton: `import { db } from "@/lib/db"`.
- Auth on pages: `getSession() + redirect()`, NEVER `requireRole()` (throws).
- Server Actions live in `app/actions/*.ts`; Out of Scope for `/spec design-system-overhaul` (verified 0 diff). Same rule will apply here — CMS read/write actions are NEW, but existing actions stay untouched.
- Admin pages already use `<PageHeader>` + UI primitives (Card / Input / Textarea / Button / Dialog / Alert). `/admin/cms` redesign should follow that pattern.
- The list editor primitive does not yet exist in `components/ui/`. Building it is part of Phase 2 above.
- Push-to-deploy flow: `unset GITHUB_TOKEN GITHUB_PERSONAL_ACCESS_TOKEN && git push origin main` (env-var PAT is invalid; gh credential helper at `/opt/homebrew/bin/gh auth git-credential` is wired globally).
