# Estimate Editor + Revision UX + Payment-Scaffolding Cleanup Implementation Plan

Created: 2026-05-11
Author: aleksandr.spiskov@gmail.com
Status: VERIFIED
Approved: Yes
Iterations: 1
Worktree: No
Type: Feature

## Summary

**Goal:** Two product features plus a coordinated cleanup of the payment-gateway scaffolding the codebase no longer plans to use — (1) a DRAFT-gated `EstimateLineEditor` on `/admin/crm/estimates/[id]`, (2) revision-workflow UX (banner + lineage breadcrumb on admin / cabinet / public-token surfaces), (3) removal of the `payments` CMS group + `payments.gateway_url_template` key + QR + payment block from the estimate PDF page 2 + deletion of the YooKassa stub plan, (4) two one-line lint/script cleanups (`scripts/verify-cms.ts` image validator + `public/theme-init.js` `_e`).

**Architecture:** Three task blocks, all small enough to land in one PR:

- **Block A (CRM editor):** mirror the existing `recompute-deal-totals` + `DealLineEditor` pair on the estimate side. New `lib/crm/internal/recompute-estimate-totals.ts`, three server actions in a new `app/actions/crm/estimate-lines.ts` (`addEstimateLine` / `updateEstimateLine` / `deleteEstimateLine`) with a server-side DRAFT-only gate, and a `components/crm/EstimateLineEditor.tsx` client component. Wire into the estimate detail page so the editor renders only when `stage === "DRAFT"`. Edits mutate `EstimateLine` rows + Estimate totals only; the parent `Deal` and its `DealLine`s are untouched (snapshot contract preserved). Also bumps the "← К сделке" link styling so the "Open Deal" affordance is visible at every stage.
- **Block B (revision UX):** banner at the top of the revision page ("Это пересмотр сметы №X от Y") + reverse banner on the superseded parent ("Пересмотрена смета №Z"); admin page, customer cabinet, and the public claim-token page all get it. Compact lineage breadcrumb when the chain has > 2 nodes.
- **Block C (cleanup):** strip the future-payment scaffolding that was introduced for an integration that's no longer planned — remove the `payments` CMS group + its lone key, the `paymentsGatewayUrlTemplate` field on the requisites loader, the `resolvePaymentUrl` helper + `QRCode.toDataURL` call in the PDF route, the QR + "Оплатить онлайн" subtitle on PDF page 2 (page 2 keeps warranty/payment-terms/requisites/manager/footer, just no scan affordance), rename the page-2 heading to "Условия и гарантия", delete the YooKassa stub plan. Two unrelated one-liners ride along: extend `scripts/verify-cms.ts` to handle the `image` content type so `home.hero.image` no longer fails the defaults round-trip; rename `catch (e)` → `catch (_e)` in `public/theme-init.js`.

**Tech Stack:** Next.js 16 App Router (route handlers, `runtime = "nodejs"`), Prisma 6 ORM (Postgres) — **no schema change**, React 19.2 + Tailwind v4.

## Scope

### In Scope

**Block A — Estimate editor**

- `lib/crm/internal/signed-line-total.ts` — extract `signedLineTotal(type, qty, unitPrice)` from `app/actions/crm/deals.ts:23-33` (currently a private helper inside that `"use server"` file) so both deal- and estimate-side action modules import a single source. Server-action files are limited in what they can export, so the helper lives in a regular module.
- `lib/crm/internal/recompute-estimate-totals.ts` — sums `EstimateLine.total` by `type` (LABOR / PART / RENTAL_DAY / DISCOUNT / FEE), writes `Estimate.subtotalLabor / subtotalParts / subtotalRental / discount / total`. Structurally identical to `recompute-deal-totals.ts`. Does NOT touch the parent `Deal`.
- `app/actions/crm/deals.ts` — replace the local copy of `signedLineTotal` with `import { signedLineTotal } from "@/lib/crm/internal/signed-line-total";`.
- `app/actions/crm/estimate-lines.ts` — new server-action module. Three exported async functions:
  - `addEstimateLine(_prev, formData) → { error: string | null; success?: true }` — required fields: `estimateId`, `description`; optional `type`, `qty`, `unitPrice`, `partId`.
  - `updateEstimateLine(_prev, formData) → { error: string | null; success?: true }` — required `estimateLineId`, rest like add.
  - `deleteEstimateLine(estimateLineId)` — one-arg async, returns `void` (matches the `deleteDealLine` shape at `app/actions/crm/deals.ts:164`).
  - Server-side DRAFT gate (`assertDraft(estimateId)`) enforced in every action BEFORE any mutation. For update/delete the parent `estimateId` is derived from the line row via `db.estimateLine.findUnique({ where: { id }, select: { estimateId: true } })` — never trusted from the client.
- `components/crm/EstimateLineEditor.tsx` — near-copy of `components/crm/DealLineEditor.tsx`. Differences: hidden form input `estimateId` (not `dealId`); imports the new estimate-line actions; empty-state line reads "В смете ещё нет позиций." (instead of "Сделка пуста."); JSDoc updated.
- `app/(admin)/admin/crm/estimates/[id]/page.tsx`:
  - `const isDraft = estimate.stage === "DRAFT";`
  - Replace the current static `<table>` of estimate lines with `<EstimateLineEditor estimateId={estimate.id} initialLines={estimate.estimateLines} editable={true} />` when `isDraft`; keep the existing read-only table for every other stage.
  - Bump the "← К сделке" link's class from `text-[var(--foreground-muted)] hover:text-[var(--foreground)]` to the same accent style as the "Скачать PDF ↗" link — so "Open Deal" is visible at parity with PDF download at every stage.

**Block B — Revision UX**

- `lib/crm/estimate-chain.ts` — `getEstimateChain(estimateId)` walks the lineage. Up via `parentEstimateId`, down via `Estimate.revisions[]`. Hard cap 6 hops with a visited-id set guard against cycles. Returns `{ parent, activeRevision, chain }` where `activeRevision` is the newest non-SUPERSEDED descendant (or null), `chain` is the lineage in oldest→newest order capped at 6, current included.
- `components/crm/EstimateRevisionBanner.tsx` — small banner component with two modes:
  - `mode="revision"` → text "Это пересмотр сметы №{parent.number} от {date}. Открыть исходную →" with right-aligned link.
  - `mode="superseded"` → text "Эта смета пересмотрена. Открыть актуальную (№{active.number}) →".
  - Returns `null` when called with no target (callers can pass parent/activeRevision unguarded).
- `components/crm/EstimateLineageBreadcrumb.tsx` — horizontal chain UI shown only when `chain.length > 2`. Current node bold, others as Links via an injected `hrefBuilder(id)`. Wraps on narrow viewports.
- `app/(admin)/admin/crm/estimates/[id]/page.tsx` — render the banner + breadcrumb above the existing `PageHeader`. `hrefBuilder(id) = \`/admin/crm/estimates/${id}\``.
- `app/(portal)/cabinet/estimates/[id]/page.tsx` — render the banner + breadcrumb above the existing `<CustomerEstimateView>`. `hrefBuilder(id) = \`/cabinet/estimates/${id}\``.
- `app/(public)/estimate/[token]/page.tsx` — render the banner + breadcrumb at the existing token-flow surface. `hrefBuilder(id) = \`/estimate/${token}\`` — the same claim token grants access to every estimate on the deal (verified at the existing `app/(public)/estimate/[token]/page.tsx` query). Use the current estimate's full chain; navigating to a sibling estimate stays on the token route, server-side authz unchanged.

**Block C — Payment-scaffolding cleanup + unrelated one-liners**

- `lib/cms-schema.ts`:
  - Drop `"payments"` from the `CMSGroup` union (lines 16–27).
  - Drop the `payments: "Платёжный шлюз"` entry from `GROUP_LABELS`.
  - Drop the `payments`-group note + entry from `GROUP_ORDER` (the comment about it being intentionally excluded at lines 83–84 also goes).
  - Delete the `"payments.gateway_url_template"` key definition (line ~839) and any surrounding YooKassa-anticipating comments (line ~847).
- `lib/load-requisites.ts`:
  - Remove `"payments.gateway_url_template"` from the keys array passed to `getCMSMany` (line 44).
  - Remove `paymentsGatewayUrlTemplate` from the `Requisites` interface AND from the returned object (line 71).
- `scripts/verify-cms.ts`:
  - Drop the `HIDDEN_FROM_CMS_GRID` set entry for `"payments.gateway_url_template"` (lines 65–67). Once the key itself is gone, the hidden-from-CMS-grid concept has no remaining members — leave the set empty (or remove the set + its companion expectedDisplayCount filtering branch if no other key needs hiding; verify nothing else relies on the set).
  - (Unrelated one-liner, also in this file) **Fix the `image` type defaults round-trip:**
    - Lines 55–58 currently restrict types to `text|richtext|list` — widen to include `image`.
    - Lines 158–163 currently fall through to `else payload = { items: def.defaultValue };` for any non-text/non-richtext type, which produces `{ items: "/images/hero/g-class-4k.jpg" }` for an image key and fails the validator. Add an explicit `else if (def.type === "image") payload = { url: def.defaultValue };` branch.
- `lib/estimate-pdf-document.tsx`:
  - Remove `qrDataUrl` and `qrCaption` from the `EstimatePdfExtras` interface (line 96; the JSDoc above probably also references QR/payment — strip the references).
  - Delete the page-2 hero-left QR block (the `<View style={styles.page2HeroLeft}>` wrapper with the `<Image src={extras.qrDataUrl}>` and caption).
  - Delete the conditional `extras?.qrDataUrl ?` subtitle on page 2 (the one that switches between "Отсканируйте QR…" and a payment-less subtitle).
  - Rename the page-2 heading from "Условия и онлайн-оплата" to **"Условия и гарантия"** so the title matches the content that remains (warranty + payment terms + requisites + manager + footer note).
  - Page-2 layout collapses from a two-column hero (QR left, terms right) into a single-column flow: heading → subtitle ("Подробные условия и реквизиты для оплаты по сделке.") → terms blocks (Условия оплаты / Гарантия на работы / Гарантия на запчасти) → requisites grid → manager line → footer note. The existing styles `page2TermsBlock`, `page2TermsHeader`, `page2TermsBody` stay; the now-unused `page2HeroRow`, `page2HeroLeft`, `page2HeroRight`, `page2QrImage`, `page2QrCaption` styles are removed.
  - The `payment block` comment in the JSDoc/component header (line 122) is updated to drop the "payment block" mention.
- `app/api/estimates/[id]/pdf/route.ts`:
  - Delete the `resolvePaymentUrl` helper (line ~73 onward).
  - Delete the `paymentUrl` resolution + `QRCode.toDataURL(...)` call (lines ~165–185).
  - Drop the `qrDataUrl` and `qrCaption` fields from the `extras` object passed to the document.
  - If `QRCode` is imported only for this code path, drop the `qrcode` import too. **Leave the `qrcode` npm dependency installed** — uninstalling is a separate concern with its own review cost; document this as a follow-up note. (Per scope decision: "code and related deps cleanup" — the runtime call is removed; the package can be uninstalled in a tiny follow-up PR if/when no other path needs it. A grep across `app/` `lib/` `components/` confirms whether the import is the only call site.)
- `public/theme-init.js` — rename `catch (e)` → `catch (_e)` (line 13). Body unchanged.
- `docs/plans/2026-05-11-yookassa-integration.md` — delete this stub plan file. It's stale: the integration is no longer planned.

### Out of Scope

- **Any new online-payment feature.** No `Integration` Prisma model. No `Payment` model. No /api/payments routes. No admin settings page. No cabinet payment chip or "Оплатить онлайн" button. No webhook. No 54-FZ receipts.
- **Uninstalling the `qrcode` npm dependency.** The runtime call is removed; the package remains in `package.json` and `node_modules` for the duration of this PR. Tracking note (not a task): a future cleanup can `npm uninstall qrcode @types/qrcode` once a final grep confirms no other call site.
- **`DealLine`-side parallel mutation.** EstimateLineEditor must not write to `DealLine`.
- **Recompute of `Deal` totals from Estimate edits.** Estimate is a snapshot — Deal stays untouched. Same constraint as today.
- **Generalising `DealLineEditor`** into a shared component. `EstimateLineEditor` is a near-copy; the two will diverge as estimate-side rules evolve.
- **Renaming the on-disk plan file** to reflect the new scope. The file already exists, is registered, and renaming during planning would orphan the registration. The title in the header carries the new wording.
- **PDF authentication / claim-token paths** — unchanged.
- **Admin sidebar entries** for any payment surface — none added (none existed; nothing to remove).
- **Migration of existing CMS rows** stored under `payments.gateway_url_template`. Removing the key from `CMS_SCHEMA` makes `getCMSText("payments.gateway_url_template")` no longer compile-callable. Any orphan `CMSBlock` row in the DB with that key becomes inert — Prisma still has the row, but no code reads it. **No data migration shipped here** (the project has not yet seeded that key in any environment per the seed-history check below; leaving orphan rows for the next data-cleanup pass is acceptable). See Assumptions.
- **PDF layout micro-polish** beyond the QR removal — page 2 collapses to a single-column flow with the existing terms blocks; no other visual rework.

## Approach

**Chosen:** Three small task blocks delivered in one PR. Block A mirrors the deal-side pattern (lowest novelty), Block B is purely additive UI + a small server helper, Block C is removal-only edits across already-touched files. The cleanup is done in one pass instead of stretched across PRs so the next reader sees a consistent state — no "payment scaffolding partly removed" intermediate.

**Why:** The original draft of this plan added a full YooKassa integration. User direction reversed: there is no plan for online payments right now, and the in-repo scaffolding that anticipated it (CMS `payments` group, PDF QR, the stub plan file) is now dead weight. Removing it in the same PR that ships the estimate editor and revision UX keeps the diff coherent and prevents future readers from rediscovering the dead code and trying to make it work. The cost is a slightly larger diff than two separate PRs — accepted because each of the three blocks is small and the cleanup edits are mechanical.

**Alternatives considered:**

- **Two separate PRs (features vs cleanup).** Rejected — features touch the same estimate detail page and PDF page-2 area that the cleanup also touches; coordinating two PRs creates merge conflicts and a half-cleaned state on disk for the duration.
- **Leave the `payments` CMS scaffolding in place "in case we want it later".** Rejected — dead code that anticipates a non-decided feature gets stale, accumulates wrong assumptions, and confuses future readers. If/when online payments are re-planned, recreating one CMS key is a five-line edit.
- **Keep the PDF QR pointing at a no-op URL.** Rejected — a QR that doesn't lead anywhere is worse than no QR. Customers scanning it would land on a broken or stale page.
- **Generalise `DealLineEditor` into a shared component.** Rejected during the earlier Q&A — the two will diverge.

## Context for Implementer

- **Prisma client output:** `app/generated/prisma/client` with `@ts-nocheck`. Results lose type inference through the `db` singleton — use explicit type assertions per `geleoteka-conventions.md` (the prevailing pattern is visible at `app/actions/crm/estimates.ts:30`). Don't try to "fix" the `as` casts.
- **DB singleton:** `lib/db.ts` exports `db`. Always `import { db } from "@/lib/db";`.
- **Auth helpers:** `requireRole(["ADMIN", "MANAGER"])` in server actions (throws → unhandled-rejection on failure, which is acceptable for an action body). In page components use `getSession()` + `redirect("/login")` per `geleoteka-conventions.md`.
- **Server Actions:** under `app/actions/`, kebab-case files, `"use server"` at top. `useActionState`-compatible actions take `(_prevState, formData)` and return `{ error: string | null; ...extras }`. Server-action files CANNOT freely export non-action symbols — Next.js complains if a `"use server"` file exports anything other than async functions. The current `app/actions/crm/deals.ts` already side-steps by keeping `signedLineTotal` private; Block A extracts it into a regular utility module instead of widening the action file's exports.
- **`DealLineEditor` pattern** at `components/crm/DealLineEditor.tsx` — the EstimateLineEditor is a near-mechanical copy. The only behavioural differences:
  1. Hidden form input `estimateId` instead of `dealId`.
  2. Imports `addEstimateLine` / `updateEstimateLine` / `deleteEstimateLine`.
  3. Empty-state text reads "В смете ещё нет позиций." (sentence chosen to read naturally for both managers and admins).
- **`signedLineTotal` semantics** (the extracted helper):
  - DISCOUNT lines store **negative** `unitPrice` and `total`. The recompute helper SUMs raw `total` values, so DISCOUNT contributes a negative number. Same pattern works on the estimate side without changes. Verified by `app/actions/crm/deals.ts:23-33` and confirmed by `recompute-deal-totals.ts:19-50`.
- **`EstimateLine.partId`** can be null (free-text lines). The editor doesn't need a part picker — the existing DealLineEditor doesn't surface one either; manager types a description.
- **CSS classes:** `.btn`, `.btn-primary`, `.btn-secondary`, `.card`, `.input`, `.badge`, `.alert-error`, `.alert-success`. Theme tokens via `var(--color-accent)`, `var(--background)`, `var(--foreground-muted)`, `var(--card)`, `var(--border)`. Never hardcode hex.
- **Branding:** "Geleoteka" — gold #d4af37 on black. Never "AMG Service".
- **Theme:** light triggered by `html.light` class; init at `/public/theme-init.js` (whose `_e` cleanup is in Block C).
- **CMS schema removal — call-site audit before deletion:**
  - `getCMSText<K extends CMSTextKey>(key: K)` is typed against `CMS_SCHEMA`, so removing the `payments.gateway_url_template` key from the schema makes any direct call fail to compile. **Confirm via `grep -rn "payments\.gateway_url_template" app components lib scripts`** that the only references are the four touchpoints listed in Block C scope (cms-schema, load-requisites, verify-cms, and the PDF route's downstream `extras` chain via load-requisites). If grep returns anything else, surface it before deleting.
  - `keysByGroup`, `allKeysInDisplayOrder`, and the admin CMS UI iterate `GROUP_ORDER` and `CMS_SCHEMA` dynamically — once `payments` is gone from the union and `GROUP_ORDER`, the admin grid simply no longer renders that section.
- **PDF document file is `lib/estimate-pdf-document.tsx`** — a server component (no `"use client"`, no React state). After Block C, page 2 keeps: brand strip, "К смете № X" reference line, the new "Условия и гарантия" heading, the new subtitle, the three terms blocks (Условия оплаты / Гарантия на работы / Гарантия на запчасти), full requisites grid, manager line, footer note. NO QR, NO QR caption.
- **PDF route handler is `app/api/estimates/[id]/pdf/route.ts`** — `runtime = "nodejs"`. After Block C, the handler no longer:
  - Calls `QRCode.toDataURL`.
  - Calls `resolvePaymentUrl` (helper itself goes away).
  - Includes `qrDataUrl` / `qrCaption` in the `extras` passed to `renderToBuffer`.
  - The handler keeps its existing auth (3-tier — admin/owner/claim-token), Prisma query, requisites load, and PDF rendering.
- **`scripts/verify-cms.ts` image-type fix** — current code paths:
  - Line 55–58 hard-codes `text|richtext|list` as the only acceptable types.
  - Line 158–163 falls through to `{ items: def.defaultValue }` for anything not text/richtext, which produces an invalid payload for image keys (the validator expects `{ url: string }` per `lib/cms-validate.ts:78-83`).
  - The bug currently makes `npm run verify-cms` exit 1 for the existing `home.hero.image` key. After the fix, the script exits 0 on the current schema.
- **Discoverability:** `~/.claude/rules/development-practices.md` recommends `codegraph_search` + `Grep` together for completeness when removing a symbol. For the payment-scaffolding removal, the grep step is the safety net — symbol removal in TypeScript is normally compile-checked, but CMS keys are addressed by string literals via `getCMSText`/`getCMSMany`, so the grep is non-negotiable.

## Runtime Environment

- **Start:** `npm run dev` (port 443, HTTPS — see `.claude/rules/geleoteka-project.md`).
- **Pages affected:** `/admin/crm/estimates/[id]`, `/cabinet/estimates/[id]`, `/estimate/[token]`.
- **APIs affected:** `GET /api/estimates/[id]/pdf` (PDF content changes — QR gone; layout collapses to single-column on page 2).
- **Deploy:** Railway auto-deploy from `main` (`github.com/0pt1m1sm/geleoteka`).

## Assumptions

- **`recompute-deal-totals.ts` shape works structurally for estimates** — same per-type bucket sums into Estimate.subtotal* + total. Supported by `prisma/schema.prisma:1142-1147` (same Int fields on Estimate). Tasks 1, 2 depend on this.
- **`signedLineTotal` semantics carry over verbatim** — DISCOUNT lines store negative `unitPrice` and `total`. Supported by `app/actions/crm/deals.ts:23-33`. Tasks 1, 2 depend on this.
- **`Estimate.parent` walk is fast at 6 hops** — chains are typically 1–3 in practice; the cap is defensive. Supported by the `parentEstimateId` field (indexed implicitly through Estimate's PK). Task 3 depends on this.
- **No existing seeded `CMSBlock` row stores content under `payments.gateway_url_template`** in dev / staging / production. Supported by: (a) the key's default value is empty string; (b) the comment at `lib/cms-schema.ts:84` notes the key was supposed to be managed via a dedicated `/admin/site/settings` page that was never built; (c) `prisma/seed.ts` does not reference this key (verify via `grep -n "payments.gateway_url_template" prisma/`). Task 4 depends on this. If a row exists somewhere, removing the schema key simply makes that row inert — no error, no migration needed.
- **`qrcode` npm dependency is removable in a follow-up PR** — the runtime grep confirms the PDF route is the only call site. Block C leaves the package installed and the import removed; the uninstall is a one-line follow-up that does not need its own /spec. Task 5 depends on this.
- **The claim-token route at `/estimate/[token]` resolves all estimates on the deal**, not just one — so the lineage breadcrumb can navigate sibling revisions via the same token. Supported by `app/(public)/estimate/[token]/page.tsx`'s existing query shape (loads the Deal and ALL its `estimates[]`). Task 3 depends on this.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| DRAFT-only gate on estimate-line actions is bypassed by a crafted request that sends an `estimateLineId` of a SENT estimate's line. | Medium | High (silent corruption of a sent, frozen estimate) | Each mutation action derives the parent `estimateId` from the line row server-side (`db.estimateLine.findUnique({ where: { id }, select: { estimateId: true } })`) and calls `assertDraft` before any write. The client-supplied `estimateId` on add (the only path that has one) is also gated. **Verification:** TS-002. |
| `signedLineTotal` extraction breaks existing deal-side imports. | Low | Medium (deal-line edits stop working) | One-import refactor; the helper body moves verbatim. Smoke-test the deal-side path post-extraction. **Verification:** TS-001 step 1 (deal-side recompute regression check). |
| Removing the `payments` CMS group breaks the admin `/admin/cms` page or any other CMS reader. | Low | Medium | The admin grid iterates `GROUP_ORDER` dynamically; once `payments` is gone, the section simply disappears. Pre-flight grep for `payments.gateway_url_template` and `\"payments\"` confirms no other reader. **Verification:** TS-005 (admin `/admin/cms` renders without the section; `npm run verify-cms` exits 0). |
| `getCMSText("payments.gateway_url_template")` is called somewhere we don't expect, and the key removal turns it into a compile error. | Low | Low (caught by `npx tsc --noEmit` before merge) | TypeScript catches every call site for typed CMS keys. **Verification:** `npx tsc --noEmit` in TS-005. |
| Page-2 layout after QR removal looks empty / misbalanced. | Medium | Low (cosmetic) | Page 2 collapses to a single-column flow with the three terms blocks stacked, then requisites grid, then manager + footer. Visual harness via TS-004 confirms the new layout reads cleanly. If it looks sparse, the heading + subtitle absorb the empty space — no extra design work needed. |
| Long warranty / payment-terms text pushes the page-2 content onto a 3rd page. | Low | Low (text still readable, just longer) | Already acceptable today; react-pdf auto-wraps. No mitigation needed beyond the visual check. |
| `lib/crm/estimate-chain.ts` recursive walk loops on a malformed parent pointer (cycle). | Low | Medium (page hangs) | Hard 6-hop cap with a visited-id set; bail and return what's collected on cycle. **Verification:** brief unit-test-of-thought in the changes-review pass; this is a 30-line pure function — reviewer audit is acceptable. |
| Revision banner inflates a long chain into a wall of text. | Low | Low (visual noise) | Banner renders only ONE parent link (or ONE active-revision link); the breadcrumb renders only when chain length > 2 and caps at 6 nodes with "… (N hidden)" if exceeded. **Verification:** TS-003 step 5. |

## Goal Verification

### Truths

1. On `/admin/crm/estimates/[id]` for a DRAFT estimate, the manager can add a line, edit a line, and delete a line. Each operation updates `EstimateLine` rows AND recomputes `Estimate.subtotalLabor/Parts/Rental/discount/total`. The parent `Deal.dealLines` are byte-identical before and after.
2. On `/admin/crm/estimates/[id]` for any non-DRAFT stage (SENT, APPROVED, DECLINED, EXPIRED, SUPERSEDED), the editor does NOT render. The read-only line table renders instead. Calling `updateEstimateLine` server action against a line of a SENT estimate returns `{ error: "Эту смету уже нельзя редактировать" }` and does NOT mutate.
3. The "← К сделке" link on the estimate header is visible at every stage and navigates to `/admin/crm/deals/<dealId>`. Its styling matches the "Скачать PDF ↗" accent.
4. After `reviseEstimate` is invoked, the revision page (`/admin/crm/estimates/<newId>` AND `/cabinet/estimates/<newId>` AND `/estimate/<token>` when `?id=newId`) shows a banner "Это пересмотр сметы №X от …" linking to the parent. The parent page shows a reverse banner "Эта смета пересмотрена. Открыть актуальную (№Y) →".
5. For an estimate with a chain of 3+ revisions, the lineage breadcrumb appears under the banner.
6. `npm run verify-cms` exits 0 — both because (a) `home.hero.image` defaults now round-trip via the validator, and (b) the `HIDDEN_FROM_CMS_GRID` exception is no longer needed (the `payments` key it referenced is gone).
7. `npm run lint` shows no warning for `public/theme-init.js`.
8. The admin CMS page at `/admin/cms` no longer shows a "Платёжный шлюз" section.
9. The estimate PDF at `GET /api/estimates/<id>/pdf` renders without a QR code on page 2. Page 2's heading reads "Условия и гарантия" and the body contains warranty + payment terms + requisites + manager line + footer note.
10. `grep -rn "payments\\.gateway_url_template" app components lib scripts` returns no matches.
11. `grep -rn "qrDataUrl\\|qrCaption\\|resolvePaymentUrl" app components lib` returns no matches in production code (the `qrcode` package may still be in `package.json`; that's the documented out-of-scope follow-up).
12. `docs/plans/2026-05-11-yookassa-integration.md` does not exist.
13. `npx tsc --noEmit` exits 0. `npm run lint` exits 0 with no NEW warnings.

### Artifacts

- `lib/crm/internal/signed-line-total.ts` (new) — extracted utility.
- `lib/crm/internal/recompute-estimate-totals.ts` (new) — Estimate-side totals recomputation.
- `app/actions/crm/estimate-lines.ts` (new) — three server actions with DRAFT gate.
- `app/actions/crm/deals.ts` (modified) — import the extracted helper.
- `components/crm/EstimateLineEditor.tsx` (new) — DRAFT-only line editor.
- `app/(admin)/admin/crm/estimates/[id]/page.tsx` (modified) — conditional editor render + revision banners + "Open Deal" link polish.
- `lib/crm/estimate-chain.ts` (new) — chain walker.
- `components/crm/EstimateRevisionBanner.tsx` (new) — parent/superseded banners.
- `components/crm/EstimateLineageBreadcrumb.tsx` (new) — chain trail.
- `app/(portal)/cabinet/estimates/[id]/page.tsx` (modified) — revision banner + breadcrumb above the customer view.
- `app/(public)/estimate/[token]/page.tsx` (modified) — revision banner + breadcrumb in the token surface.
- `lib/cms-schema.ts` (modified) — drop `payments` group + key + comment.
- `lib/load-requisites.ts` (modified) — drop `paymentsGatewayUrlTemplate` field + key fetch.
- `scripts/verify-cms.ts` (modified) — drop hidden-from-grid set entry; fix image-type round-trip.
- `lib/estimate-pdf-document.tsx` (modified) — drop QR block + caption + unused styles; rename page-2 heading.
- `app/api/estimates/[id]/pdf/route.ts` (modified) — drop `resolvePaymentUrl`, QR generation, related extras fields, qrcode import.
- `public/theme-init.js` (modified) — `_e` rename.
- `docs/plans/2026-05-11-yookassa-integration.md` (deleted) — stub plan no longer needed.

## E2E Test Scenarios

### TS-001: Admin edits a DRAFT estimate; Deal stays untouched

**Priority:** Critical
**Preconditions:**
- Admin session (`admin@geleoteka.ru` / `admin123`).
- Existing DRAFT estimate with ≥ 2 lines (use seeded data or create via the deal page's "Сформировать смету" action).
- Note the parent Deal's `dealLines[]` snapshot before the test.

**Mapped Tasks:** Task 1, Task 2, Task 3

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | At `/admin/crm/deals/<dealId>`, edit one DealLine (any field), save | Existing deal-side recompute still works — totals update on the deal page. Proves the `signedLineTotal` extraction didn't break the deal flow. |
| 2 | Navigate to `/admin/crm/estimates/<draftId>` | EstimateLineEditor renders. Existing lines appear as editable rows. "Добавить строку" button visible. |
| 3 | Click "Добавить строку", fill (Тип=LABOR, Описание="Замена тормозных колодок", Кол-во=2, Цена=1500), Submit | New EstimateLine appears in the list. Estimate.total in the totals card increases by `2 × 1500 = 3000 ₽`. |
| 4 | Edit an existing line (change qty from 1 → 3) and Save | Row updates inline. Estimate.subtotal* recomputes. |
| 5 | Click delete (trash icon), confirm | Row disappears. Totals recompute. |
| 6 | Open the parent Deal at `/admin/crm/deals/<dealId>` | `DealLine[]` is byte-identical to the pre-test snapshot. `Deal.total` unchanged. |

### TS-002: SENT (and later) estimate is read-only; bypass attempts rejected

**Priority:** Critical
**Preconditions:** Admin session. A SENT estimate with ≥ 1 line.

**Mapped Tasks:** Task 1, Task 2, Task 3

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/admin/crm/estimates/<sentId>` | EstimateLineEditor does NOT render. Read-only table renders. No "Добавить строку" button. |
| 2 | In DevTools console, simulate `updateEstimateLine` with a real `estimateLineId` of this estimate | Server action returns `{ error: "Эту смету уже нельзя редактировать" }`. Reloading the page shows the line unchanged. |
| 3 | Repeat for APPROVED, DECLINED, EXPIRED, SUPERSEDED estimates | Same: no editor, no mutation accepted. |

### TS-003: Revision banner on revision page and superseded parent (3 surfaces)

**Priority:** High
**Preconditions:** A SENT estimate (the to-be-superseded one) belonging to a customer with valid cabinet credentials AND a non-null `Deal.claimToken`. Trigger `reviseEstimate` via `EstimateActions` "Пересмотреть" — creates a child DRAFT and marks the parent SUPERSEDED.

**Mapped Tasks:** Task 3

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open `/admin/crm/estimates/<childId>` as admin | Top of page shows banner: "Это пересмотр сметы №<parent.number> от <date>. Открыть исходную →". Link works. |
| 2 | Open `/admin/crm/estimates/<parentId>` as admin | Top of page shows banner: "Эта смета пересмотрена. Открыть актуальную (№<child.number>) →". Link works. |
| 3 | Open `/cabinet/estimates/<childId>` as the customer | Customer-side revision banner with the same content appears. |
| 4 | Open `/estimate/<claimToken>` (public token route — pass the token), navigate to the revision via the in-page links | Public-token revision banner appears; navigating through the link stays on the token route. |
| 5 | For an estimate with chain length > 2, navigate to any of them | Lineage breadcrumb appears under the banner: rev 1 → rev 2 → **current** → … |

### TS-004: PDF page 2 renders without QR; heading updated

**Priority:** High
**Preconditions:** Admin session. CMS row for `requisites.parts_warranty` non-empty (existing key from the earlier PDF refactor).

**Mapped Tasks:** Task 4

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open `GET /api/estimates/<id>/pdf` (or use the PDF download link on the estimate detail page) | PDF downloads. PDF has 2 A4 pages. |
| 2 | Inspect page 2 visually | Heading reads "Условия и гарантия" (NOT "Условия и онлайн-оплата"). No QR code anywhere. No "Отсканируйте для оплаты онлайн" caption. Body contains: Условия оплаты, Гарантия на работы, Гарантия на запчасти, full requisites grid, manager line, footer note. |
| 3 | `grep -rn "qrDataUrl\\|qrCaption\\|resolvePaymentUrl" app components lib` | No matches. |

### TS-005: CMS cleanup + verify-cms + theme-init clean

**Priority:** High
**Preconditions:** Clean checkout on the working branch with all edits applied.

**Mapped Tasks:** Task 4, Task 5

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `npx tsc --noEmit` | Exits 0. (Compile-checks all CMS key string literals against the new schema.) |
| 2 | `npm run verify-cms` | Exits 0. Output ends with "Summary: ALL PASSED". No `✗ home.hero.image: ...` row. |
| 3 | `npm run lint` | Exits 0. No warning citing `public/theme-init.js` line 13. |
| 4 | Open `/admin/cms` as admin | The "Платёжный шлюз" section is absent. Other groups (Главная, О нас, Услуги, Контакты, Вакансии, Подвал, Cookie, FAB, Реквизиты) render normally. |
| 5 | `grep -rn "payments\\.gateway_url_template" app components lib scripts` | No matches. |
| 6 | Open the site, toggle theme using the header toggle | Theme switches. No console error referencing `theme-init.js`. |
| 7 | `ls docs/plans/2026-05-11-yookassa-integration.md` | File not found (deleted). |

## Progress Tracking

- [x] Task 1: `recomputeEstimateTotals` + `signedLineTotal` extraction
- [x] Task 2: `estimate-lines.ts` server actions (add/update/delete with DRAFT gate)
- [x] Task 3: `EstimateLineEditor` component + wire into estimate detail page + revision UX (banner + breadcrumb on admin/cabinet/public-token) + "Open Deal" link polish
- [x] Task 4: Payment-scaffolding removal — CMS group/key, load-requisites refs, PDF QR + heading rename, route.ts cleanup, qrcode import removal, stub plan deletion (plus pre-flight grep surfaced `/admin/site/settings` route — also removed)
- [x] Task 5: One-liner cleanups — `verify-cms.ts` image-type fix + `theme-init.js` `_e`

**Total Tasks:** 5 | **Completed:** 5 | **Remaining:** 0

## Implementation Tasks

### Task 1: `recomputeEstimateTotals` + `signedLineTotal` extraction

**Objective:** Provide the totals-recompute helper for the estimate side and extract `signedLineTotal` so deal and estimate actions share one source.

**Dependencies:** None
**Mapped Scenarios:** TS-001

**Files:**

- Create: `lib/crm/internal/signed-line-total.ts`
- Create: `lib/crm/internal/recompute-estimate-totals.ts`
- Modify: `app/actions/crm/deals.ts`

**Trivial:** No — new utility module + behaviour change on the deal-side import path.

**Key Decisions / Notes:**

- `signed-line-total.ts` is a pure utility. Copy `signedLineTotal` verbatim from `app/actions/crm/deals.ts:23-33`. Export it. In `app/actions/crm/deals.ts`, replace the local function with `import { signedLineTotal } from "@/lib/crm/internal/signed-line-total";`. Body unchanged.
- `recompute-estimate-totals.ts` mirrors `recompute-deal-totals.ts` 1:1 except:
  - Reads `db.estimateLine.findMany({ where: { estimateId }, ... })`.
  - Writes `db.estimate.update({ where: { id: estimateId }, data: { subtotalLabor, subtotalParts, subtotalRental, discount, total } })`.
  - Does NOT compute or write `tax` (matches deal-side behaviour).
- Type assertion pattern from `recompute-deal-totals.ts:18-22` carries over verbatim: declare `interface EstimateLineRow { type: string; total: number; }` and cast the `findMany` result.

**Definition of Done:**

- [ ] `lib/crm/internal/signed-line-total.ts` exports `signedLineTotal(type, qty, unitPrice)` with original semantics.
- [ ] `app/actions/crm/deals.ts` imports from the new file; local copy removed.
- [ ] `lib/crm/internal/recompute-estimate-totals.ts` exports `recomputeEstimateTotals(estimateId)`.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] Manually edit a deal line at `/admin/crm/deals/<draftId>` — totals still update (regression check on the extraction).

**Verify:**

- `npx tsc --noEmit`
- Manual deal-line edit smoke test.

---

### Task 2: `estimate-lines.ts` server actions with DRAFT gate

**Objective:** Implement `addEstimateLine`, `updateEstimateLine`, `deleteEstimateLine` server actions. Each enforces `Estimate.stage === "DRAFT"` server-side BEFORE any mutation.

**Dependencies:** Task 1
**Mapped Scenarios:** TS-001, TS-002

**Files:**

- Create: `app/actions/crm/estimate-lines.ts`

**Trivial:** No — new server-action module with security-relevant gating.

**Key Decisions / Notes:**

- `"use server"` at top. Three exported async functions matching the deal-side shapes (see `app/actions/crm/deals.ts:82-174`):
  - `addEstimateLine(_prev, formData) → { error, success? }` — required form fields: `estimateId`, `description`; optional `type` (default LABOR), `qty`, `unitPrice`, `partId`.
  - `updateEstimateLine(_prev, formData) → { error, success? }` — required `estimateLineId`, rest like add.
  - `deleteEstimateLine(estimateLineId)` — one-arg async, returns `void` (matches `deleteDealLine` at `deals.ts:164`).
- **DRAFT gate pattern (critical — apply to ALL three actions):**

  ```ts
  async function assertDraft(estimateId: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const est = (await db.estimate.findUnique({
      where: { id: estimateId },
      select: { stage: true },
    })) as { stage: string } | null;
    if (!est) return { ok: false, error: "Смета не найдена" };
    if (est.stage !== "DRAFT") {
      return { ok: false, error: "Эту смету уже нельзя редактировать" };
    }
    return { ok: true };
  }
  ```

  For `update`/`delete`, the parent `estimateId` is derived server-side from the line row (`db.estimateLine.findUnique({ where: { id: estimateLineId }, select: { estimateId: true } })`) before calling `assertDraft`. **Never trust a client-supplied `estimateId` on the update/delete paths.**
- After a successful mutation: call `recomputeEstimateTotals(estimateId)` then `revalidatePath(\`/admin/crm/estimates/${estimateId}\`)`.
- Auth: `await requireRole(["ADMIN", "MANAGER"])` at the top of each action.
- For `addEstimateLine`, `sortOrder` is computed from the last EstimateLine on this estimate — same pattern as `addDealLine` at `deals.ts:101-106`.
- Use `signedLineTotal` from Task 1 to compute `unitPrice` + `total`.

**Definition of Done:**

- [ ] All three actions exported with the documented signatures.
- [ ] DRAFT gate present in every action; update/delete derive `estimateId` from the line row, not from the client.
- [ ] On gate failure, the action returns `{ error: "Эту смету уже нельзя редактировать" }` (or "Смета не найдена" / "Строка не найдена") and does NOT write.
- [ ] On success, totals are recomputed and the page is revalidated.
- [ ] `npx tsc --noEmit` exits 0.

**Verify:**

- `npx tsc --noEmit`
- TS-002 step 2 in browser DevTools.

---

### Task 3: `EstimateLineEditor` component + estimate detail page wiring + revision UX

**Objective:** Build the editor client component (copy of `DealLineEditor`), wire it into the admin estimate page (editable only when DRAFT), polish the "← К сделке" link, and ship the revision banner + lineage breadcrumb on all three viewer surfaces (admin / cabinet / public-token).

**Dependencies:** Task 2
**Mapped Scenarios:** TS-001, TS-002, TS-003

**Files:**

- Create: `components/crm/EstimateLineEditor.tsx`
- Create: `lib/crm/estimate-chain.ts`
- Create: `components/crm/EstimateRevisionBanner.tsx`
- Create: `components/crm/EstimateLineageBreadcrumb.tsx`
- Modify: `app/(admin)/admin/crm/estimates/[id]/page.tsx`
- Modify: `app/(portal)/cabinet/estimates/[id]/page.tsx`
- Modify: `app/(public)/estimate/[token]/page.tsx`

**Trivial:** No — primary feature work.

**Key Decisions / Notes:**

- **EstimateLineEditor:** copy `components/crm/DealLineEditor.tsx` verbatim. Mechanical renames: `dealId` → `estimateId` (props, hidden form input, references); imports switch from `addDealLine`/`updateDealLine`/`deleteDealLine` to the new estimate-line actions; empty-state text becomes "В смете ещё нет позиций."; JSDoc on the exported component updated. No other behavioural changes — same `LINE_TYPES`, `DEAL_LINE_TYPE_LABELS` import, `signedLineTotal` math, RowFields layout.
- **Estimate detail page wiring** (`app/(admin)/admin/crm/estimates/[id]/page.tsx`):
  - `const isDraft = estimate.stage === "DRAFT";`
  - Replace the static `<table>` of estimate lines (currently at lines ~161-189) with: `{isDraft ? <EstimateLineEditor estimateId={estimate.id} initialLines={estimate.estimateLines} editable={true} /> : <ReadOnlyEstimateLinesTable lines={estimate.estimateLines} />}`. The read-only branch keeps the existing JSX inline (or extracts to a local component — implementer's choice).
  - Above the `PageHeader`: render `<EstimateRevisionBanner ... />` (revision mode if `parent`, superseded mode if SUPERSEDED + `activeRevision`) and `<EstimateLineageBreadcrumb chain={chain} currentId={estimate.id} hrefBuilder={(id) => \`/admin/crm/estimates/${id}\`} />` (when chain.length > 2).
  - Promote "← К сделке" styling: replace `className="text-[var(--foreground-muted)] hover:text-[var(--foreground)]"` with the same `text-[var(--color-accent)] hover:underline` pattern used by "Скачать PDF ↗".
- **Cabinet estimate page wiring** (`app/(portal)/cabinet/estimates/[id]/page.tsx`):
  - Load chain via `getEstimateChain(estimate.id)`.
  - Render `<EstimateRevisionBanner ... />` and `<EstimateLineageBreadcrumb ...>` above the existing `<CustomerEstimateView>`.
  - `hrefBuilder = (id) => \`/cabinet/estimates/${id}\``.
- **Public-token page wiring** (`app/(public)/estimate/[token]/page.tsx`):
  - The existing token page loads the Deal and all its estimates; identify which estimate is "current" for this page (the existing code already picks one — verify before edit).
  - Render banner + breadcrumb above the rendered `<CustomerEstimateView>` for the current estimate.
  - `hrefBuilder = (id) => \`/estimate/${token}?id=${id}\`` if the token page accepts an `id` query to switch estimates; otherwise the breadcrumb links point at `/estimate/${token}` only when the chain's estimate IS the one rendered by the token page (which loads all estimates anyway). **Inspect the token page before edit** to determine which form fits — if the page renders a single estimate at a time controlled by a query param, use the param; if it renders all estimates as a list, the breadcrumb can scroll-anchor instead. The implementer chooses based on the page's actual shape and documents the choice in a one-line inline comment.
- **`getEstimateChain(estimateId)`** at `lib/crm/estimate-chain.ts`:

  ```ts
  export interface EstimateChainNode { id: string; number: string | null; stage: string; createdAt: Date; }
  export interface ChainResult {
    parent: EstimateChainNode | null;
    activeRevision: EstimateChainNode | null;
    chain: EstimateChainNode[];
  }
  export async function getEstimateChain(estimateId: string): Promise<ChainResult> { /* walk up + down, cap 6, visited set */ }
  ```

  Implementation: load the current estimate. Walk up via `parentEstimateId` while not visited and depth < 6. Walk down via `db.estimate.findMany({ where: { parentEstimateId: <current> } })` recursively under the same caps. `activeRevision` = newest non-SUPERSEDED node in the down-chain (or null). `chain` = ordered oldest→newest list capped at 6, current included.
- **`EstimateRevisionBanner.tsx`** — simple component:

  ```tsx
  interface Props {
    mode: "revision" | "superseded";
    target: { id: string; number: string | null; createdAt: Date };
    href: string;
  }
  ```

  Banner: subtle accent border-left, info icon (Lucide `Info` or similar already used in the codebase), bilingual-style Russian text, right-aligned link. Returns `null` if a caller passes no target (callers may do `<EstimateRevisionBanner mode="revision" target={parent} href={...} />` unguarded — if `parent` is null, the banner short-circuits).
- **`EstimateLineageBreadcrumb.tsx`**:

  ```tsx
  interface Props {
    chain: Array<{ id: string; number: string | null; stage: string }>;
    currentId: string;
    hrefBuilder: (id: string) => string;
  }
  ```

  Renders a horizontal flex row with `→` separators. The current node renders as bold text (no link). Other nodes render as `<Link>`. Wraps on narrow viewports. Caps display at 6 nodes with a "… (N hidden)" segment if exceeded.

**Definition of Done:**

- [ ] `EstimateLineEditor.tsx` exists with the documented signature.
- [ ] Admin estimate page renders the editor only when `stage === "DRAFT"`; renders the read-only table otherwise.
- [ ] Editor's "Добавить строку" → server action → revalidation cycle works end-to-end (TS-001).
- [ ] "← К сделке" link styling matches "Скачать PDF ↗" accent.
- [ ] `getEstimateChain` returns the documented shape for a 3-deep chain, a no-parent estimate, and a cyclical input (gracefully returns capped chain).
- [ ] Banner renders on admin, cabinet, and public-token pages.
- [ ] Breadcrumb renders when chain length > 2, hidden otherwise.
- [ ] Banner text matches TS-003 wording.
- [ ] `npx tsc --noEmit` exits 0; `npm run lint` exits 0.

**Verify:**

- `npx tsc --noEmit && npm run lint`
- TS-001, TS-002, TS-003 in browser (Claude Code Chrome or playwright-cli with session isolation per `~/.claude/rules/browser-automation.md`).

---

### Task 4: Payment-scaffolding removal

**Objective:** Remove the future-payment scaffolding that is no longer needed — CMS `payments` group + key, load-requisites field, PDF QR + heading rename, route.ts QR generation, qrcode import, and the YooKassa stub plan.

**Dependencies:** None
**Mapped Scenarios:** TS-004, TS-005

**Files:**

- Modify: `lib/cms-schema.ts`
- Modify: `lib/load-requisites.ts`
- Modify: `scripts/verify-cms.ts`
- Modify: `lib/estimate-pdf-document.tsx`
- Modify: `app/api/estimates/[id]/pdf/route.ts`
- Delete: `docs/plans/2026-05-11-yookassa-integration.md`

**Trivial:** No — multi-file removal across CMS, PDF, and admin surfaces with a hard requirement that nothing in production code still references the removed key.

**Key Decisions / Notes:**

- **Pre-flight grep — MANDATORY before deletion** (per `~/.claude/rules/development-practices.md` § Change Discipline):

  ```bash
  grep -rn "payments\\.gateway_url_template" app components lib scripts prisma
  grep -rn "\"payments\"" lib/cms-schema.ts
  grep -rn "paymentsGatewayUrlTemplate" app components lib
  grep -rn "qrDataUrl\\|qrCaption\\|resolvePaymentUrl" app components lib
  grep -rn "import.*qrcode" app components lib
  ```

  Confirm the call sites match the scope (the four files above + the stub plan). If anything else matches, surface it before deleting — particularly the `prisma/seed.ts` grep, which gates the no-data-migration assumption.
- **`lib/cms-schema.ts`** — remove:
  - `| "payments"` from the `CMSGroup` union (line ~27 — verify exact location).
  - `payments: "Платёжный шлюз"` entry in `GROUP_LABELS` (line ~78).
  - The note + entry for `payments` in `GROUP_ORDER` (lines ~83-86 and the actual array member).
  - The `"payments.gateway_url_template"` key definition (around line 839) and the surrounding YooKassa-anticipating comment (~line 847).
- **`lib/load-requisites.ts`** — remove:
  - `"payments.gateway_url_template"` from the keys array passed to `getCMSMany` (line ~44).
  - `paymentsGatewayUrlTemplate` from the `Requisites` interface AND the returned object (line ~71).
- **`scripts/verify-cms.ts`** — two edits:
  1. Remove the `HIDDEN_FROM_CMS_GRID` set entry for `"payments.gateway_url_template"` (lines ~65-67). If the set becomes empty, simplify the surrounding `allKeysInDisplayOrder` length check (the comment about hidden keys becomes stale — drop it).
  2. (Cross-cutting — also part of Task 5, but easier to do here in the same file pass) — fix the image-type defaults round-trip per Task 5's spec.
- **`lib/estimate-pdf-document.tsx`** — surgical edits:
  - `EstimatePdfExtras` interface: drop `qrDataUrl` (line ~96) and `qrCaption` (if present).
  - Page-2 JSX: delete the `<View style={styles.page2HeroLeft}>...<Image src={extras.qrDataUrl} ... />...</View>` block.
  - Page-2 JSX: replace the `{extras?.qrDataUrl ? "Отсканируйте..." : "..."}` conditional subtitle with a single static subtitle: `"Подробные условия и реквизиты для оплаты по сделке."`.
  - Page-2 heading: rename "Условия и онлайн-оплата" → "Условия и гарантия".
  - Layout shift: the existing `page2HeroRow` flex container can stay (becomes a single-column row with just the terms blocks) — OR collapse to a plain `<View>` if the flex direction logic is empty when only the right column remains. Implementer's choice; either renders correctly.
  - Style cleanup: drop the now-unused style keys (`page2HeroLeft`, `page2QrImage`, `page2QrCaption`, possibly `page2HeroRow` if absorbed). Leave `page2TermsBlock`, `page2TermsHeader`, `page2TermsBody`, `page2HeroRight` if they still describe the remaining layout; rename if appropriate.
  - JSDoc / header comment at line ~122 — drop the "payment block" mention if present.
- **`app/api/estimates/[id]/pdf/route.ts`** — surgical edits:
  - Delete the `resolvePaymentUrl(...)` helper function (around line ~73).
  - Delete the `paymentUrl = resolvePaymentUrl(...)` call and the `QRCode.toDataURL` block (lines ~165–185).
  - Remove `qrDataUrl` and `qrCaption` from the `extras` literal passed to `renderToBuffer`.
  - Remove the `QRCode` import (top of file) — only if the grep confirms no other usage in this file.
  - The handler keeps its auth, Prisma query, requisites load, and PDF rendering otherwise unchanged.
- **`docs/plans/2026-05-11-yookassa-integration.md`** — delete via `rm`. The Verify step includes `ls` to confirm the file is gone.
- **`qrcode` and `@types/qrcode` npm packages**: leave installed for now. This task's diff is "remove the runtime call site"; uninstalling is a documented follow-up (see Out of Scope).

**Definition of Done:**

- [ ] Pre-flight grep run; results match the documented scope (call sites listed above).
- [ ] All file edits made; no orphan references to `payments.gateway_url_template`, `paymentsGatewayUrlTemplate`, `qrDataUrl`, `qrCaption`, or `resolvePaymentUrl` in production code.
- [ ] `docs/plans/2026-05-11-yookassa-integration.md` deleted.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] PDF still renders 2 pages; page 2 heading reads "Условия и гарантия"; no QR (TS-004).
- [ ] `npm run verify-cms` exits 0 (TS-005 step 2).
- [ ] Admin `/admin/cms` does not show the "Платёжный шлюз" section (TS-005 step 4).

**Verify:**

- `npx tsc --noEmit && npm run verify-cms && npm run lint`
- TS-004, TS-005 in browser.

---

### Task 5: One-liner cleanups — `verify-cms.ts` image-type fix + `theme-init.js` `_e`

**Objective:** Fix the verify-cms script's missing handling of the `image` content type (so the defaults round-trip passes for `home.hero.image`), and silence the unused-variable lint warning in `public/theme-init.js`.

**Dependencies:** None (independent of all other tasks; bundled here for review locality)
**Mapped Scenarios:** TS-005

**Files:**

- Modify: `scripts/verify-cms.ts` (the same file as Task 4 — fold into the same commit if convenient; the file's two edits are independent and can land together)
- Modify: `public/theme-init.js`

**Trivial:** Partially — the `theme-init.js` edit is trivial (≤ 5 LoC, no new branch, no new public symbol; covered by `npm run lint` in TS-005). The verify-cms fix is a bug fix and the script itself is the test; no Trivial escape applied. Both edits are tracked together in the same task for review locality.

**Key Decisions / Notes:**

- `scripts/verify-cms.ts` — line 55–58 currently restricts types to `text|richtext|list`:

  ```ts
  } else if (def.type === "text" || def.type === "richtext") {
    check(`${k}: defaultValue is string`, typeof def.defaultValue === "string");
  } else {
    check(`${k}: type is one of text|richtext|list`, false, `type=${def.type}`);
  }
  ```

  Change to widen the accepted types:

  ```ts
  } else if (def.type === "text" || def.type === "richtext" || def.type === "image") {
    check(`${k}: defaultValue is string`, typeof def.defaultValue === "string");
  } else {
    check(`${k}: type is one of text|richtext|list|image`, false, `type=${def.type}`);
  }
  ```

- `scripts/verify-cms.ts` — line 158–163 (the defaults round-trip):

  ```ts
  if (def.type === "text") payload = { value: def.defaultValue };
  else if (def.type === "richtext") payload = { markdown: def.defaultValue };
  else payload = { items: def.defaultValue };
  ```

  Add an explicit `image` branch:

  ```ts
  if (def.type === "text") payload = { value: def.defaultValue };
  else if (def.type === "richtext") payload = { markdown: def.defaultValue };
  else if (def.type === "image") payload = { url: def.defaultValue };
  else payload = { items: def.defaultValue };
  ```

- `public/theme-init.js` line 13: `} catch (e) {` → `} catch (_e) {`. Body unchanged.

**Definition of Done:**

- [ ] `npm run verify-cms` exits 0 — output ends with "Summary: ALL PASSED".
- [ ] `npm run lint` shows no warning citing `public/theme-init.js` line 13.

**Verify:**

- `npm run verify-cms`
- `npm run lint`
