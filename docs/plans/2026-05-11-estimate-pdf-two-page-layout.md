# Estimate PDF — Two-Page Layout Implementation Plan

Created: 2026-05-11
Author: aleksandr.spiskov@gmail.com
Status: VERIFIED
Approved: Yes
Iterations: 1
Worktree: No
Type: Feature

## Summary

**Goal:** Restructure `lib/estimate-pdf-document.tsx` so the server-rendered estimate PDF is split into two A4 pages — page 1 stays focused on the financial estimate (header, parties, line items, totals, signatures, light watermark seal); page 2 becomes a dedicated "Conditions & online payment" sheet that carries a large QR pointing at a configurable payment-gateway URL, separate labor- and parts-warranty text, payment terms, requisites, and the responsible-manager line. Replace the current cabinet-review QR target with a `payments.gateway_url_template` CMS-resolved URL.

**Architecture:** Same single-file `EstimatePdfDocument` server component invoked by `app/api/estimates/[id]/pdf/route.ts`. The component renders two `<Page size="A4">` elements inside one `<Document>` — that is the idiomatic @react-pdf split and keeps `fixed` elements (watermark seal, signatures) automatically scoped to the page that declares them. CMS schema gains one new group `payments` with key `payments.gateway_url_template` (text) and one new `requisites.parts_warranty` (richtext). `loadRequisites` is extended to surface both. `route.ts` resolves the template, substitutes `{estimateId}` and `{number}` (URL-encoded), generates a QR only when the resolved URL is non-empty, and passes everything through as the existing `extras` channel.

**Tech Stack:** Next.js 16 App Router (route handlers, `runtime = "nodejs"`), `@react-pdf/renderer` (existing dep), `qrcode` (already installed), Prisma 6 (no schema change), in-house CMS via `lib/cms.ts` + `lib/cms-schema.ts`.

## Scope

### In Scope

- New CMS group `payments` registered in `CMS_SCHEMA` / `GROUP_LABELS` / `GROUP_ORDER` / `CMSGroup` union.
- New CMS key `payments.gateway_url_template` (type `text`) with empty default — `URL` containing `{estimateId}` and/or `{number}` placeholders.
- New CMS key `requisites.parts_warranty` (type `richtext`) with a sensible Russian default.
- `lib/load-requisites.ts` returns `paymentsGatewayUrlTemplate` and `partsWarranty` in addition to existing fields.
- `lib/estimate-pdf-document.tsx`:
  - Two-page layout: Page 1 = estimate; Page 2 = "Условия и онлайн-оплата".
  - Page 1 keeps current sections **except** QR (moved) and warranty/payment terms/requisites/manager (moved to page 2).
  - Page 1 watermark seal opacity reduced from `0.45` to `0.18`.
  - Page 2 layout: compact brand strip (logo + wordmark + "К смете № X" reference line) → page heading → two-column hero (QR ~180×180pt left, right column = "Условия оплаты" + "Гарантия на работы" + "Гарантия на запчасти") → full-width requisites grid → manager line → legal footer note.
  - When `payments.gateway_url_template` resolves to empty: QR block + scan-instruction text both hide; the rest of page 2 still renders.
- `app/api/estimates/[id]/pdf/route.ts`:
  - Replace the current `claimToken` review-URL QR target with the resolved `payments.gateway_url_template`.
  - Substitute `{estimateId}` → `encodeURIComponent(estimate.id)`, `{number}` → `encodeURIComponent(estimate.number ?? estimate.id.slice(-6).toUpperCase())`.
  - Generate the QR only when the resolved URL is non-empty and starts with `http`. Otherwise skip QR generation entirely.
  - Pass new fields through `extras` (renamed/extended interface) to the document component.
- TypeScript: `EstimatePdfRequisites` interface extended with `paymentsGatewayUrlTemplate`, `partsWarranty`. `EstimatePdfExtras` extended with optional `paymentUrl` (kept short for diagnostics; the QR-data URL stays the rendering input).

### Out of Scope

- **PDF authentication** stays as the existing 3-tier (ADMIN/MANAGER session, owner CLIENT session, `?token=<claimToken>` guest). No change.
- **Customer cabinet / guest review UI** (`/cabinet/estimates/[id]`, `/estimate/[token]`) — untouched. Customer approval still flows through the cabinet, the new payment QR does NOT replace approval.
- **PDF filename format** — keep `smeta-<number-or-id>.pdf`. No change.
- **Prisma schema** — no model changes; payment gateway URL is content, not data.
- **Database backfills / migrations** — none.
- **Page-2 print layout** for very long warranty/payment-terms text overflowing onto a 3rd page — react-pdf will auto-wrap; we don't add manual break logic.
- **Localization (i18n)** — Russian-only strings as in the rest of the doc.
- **Watermark seal on page 2** — explicitly disabled; user requested page-1-only.

## Approach

**Chosen:** Two `<Page size="A4">` blocks inside one `<Document>`, sharing the same registered Manrope font and the same StyleSheet.

**Why:** Idiomatic @react-pdf — every `fixed` element (watermark, signatures, table-header) is auto-scoped to the `<Page>` that declares it, so we don't need conditional repeat logic or `break={true}` views. Adding page 2 is then additive: the existing page-1 JSX stays in place, a new `<Page>` block is appended for page-2 content. The cost is a tiny duplication of the brand-strip props (mitigated by a small `<BrandStrip>` sub-component used by both pages with a `compact` prop).

**Alternatives considered:**

- **Single `<Page>` with manual `break={true}` views.** Rejected: `break` collides with `fixed` headers/seals, especially when page 1's table auto-wraps onto a continuation — the manual break for page 2 would land on the wrong physical page. Higher debugging cost for zero rendering benefit.
- **Two separate render calls concatenated.** Rejected: `@react-pdf/renderer` produces single-document PDFs per `Document`; merging two output buffers would require a separate PDF-merge dep (`pdf-lib`) for no benefit.

## Context for Implementer

> Write for an implementer who has never seen this codebase.

- **PDF document lives at** `lib/estimate-pdf-document.tsx`. It's a server component (no `"use client"`, no React state). Renders via `renderToBuffer` in `app/api/estimates/[id]/pdf/route.ts`.
- **Font registration** happens at module top-level (lines 73–92). Don't change — Manrope WOFF files load from `public/fonts/` via absolute filesystem path.
- **`formatPricePdf(n)`** at the top replaces `₽` with `руб.` because the Manrope cyrillic subset ships no `₽` glyph. Keep using it on page 2 too.
- **`<Page>` parent semantics:** Both pages share the same `styles.page` (gutter, font, color). `fixed` views inside one `<Page>` are repeated across pages produced by that `<Page>`'s wrap behavior — but they DO NOT cross over to a sibling `<Page>` block. This is the key reason the two-page split works without conditional rendering.
- **CMS resolver** is `lib/cms.ts`. New keys are read via `getCMSText(...)` for text type and `getCMSRichtext(...)` for richtext. Both are typed by the `CMS_SCHEMA` literal so a typo will fail compilation.
- **Adding a new CMS group:** four spots — (1) `CMSGroup` union (line 16–27), (2) `GROUP_LABELS` record (line 68–78), (3) `GROUP_ORDER` array (line 81–91), (4) the actual key definition with `group: "payments"`. Admin UI iterates `GROUP_ORDER` dynamically (`app/(admin)/admin/cms/page.tsx:37`) so it picks the new group up automatically.
- **`encodeURIComponent`** is the correct substitution helper — both `estimate.id` (cuid-style) and `estimate.number` (e.g. `СМ-000142` may contain Cyrillic) must be encoded. The estimate number's prefix is currently ASCII (see `prisma/schema.prisma` Estimate.number autogen), but defensive encoding costs nothing.
- **Currently-committed state** (commit `1e92ab8`):
  - `requisites.warranty` already exists (richtext) — interpret as "labor warranty"; do NOT rename it.
  - `requisites.payment_terms` already exists (richtext).
  - `qrcode` and `@types/qrcode` are already installed.
  - QR is currently generated against the customer-review URL in `route.ts:145–152`. We replace that target, NOT the QR generation mechanics.
- **Gotcha — `<Page>` style sharing:** Setting `styles.page` on both pages is fine, but `paddingTop: GUTTER` applies to both. If page 2 needs a different top inset (it doesn't, but watch for it during impl), use a per-page override prop.
- **Gotcha — image data-URL size:** QR data URLs at 220×220 are ~3–4 KB; large enough that we don't want them in the React props log on errors. Keep `qrDataUrl` out of any `console.log` lines added during impl.
- **Branding rule:** "Geleoteka" — gold (`#d4af37`/`#b8860b` PDF). NEVER use "AMG Service".

## Runtime Environment

- **Start command:** `npm run dev` (port 443, HTTPS — see `.claude/rules/geleoteka-project.md`)
- **PDF endpoint:** `GET /api/estimates/<id>/pdf` (returns `application/pdf`, `runtime = "nodejs"`)
- **Deploy:** Railway auto-deploy from `main` push (`github.com/0pt1m1sm/geleoteka`)
- **Manual verification:** authenticated browser session on dev, hit the PDF URL, open the downloaded file. Sample data already on file (`СМ-000142` etc.).

## Assumptions

- **Two `<Page>` blocks render in order page-1-then-page-2** in the produced PDF — supported by react-pdf docs and confirmed in the existing single-page setup (`Page` is a top-level child of `Document`). Tasks 4–5 depend on this.
- **The `fixed` prop scopes the absolute-positioned element to ONLY the `<Page>` it's declared inside,** not to all pages of the document. Tasks 4 (seal placement) and 5 (page-1 signature row) depend on this.
- **The `payments.gateway_url_template` CMS value is plain text** — even when `type: "text"`, the resolver returns the unmodified string. Task 3 (template resolution) depends on this.
- **CMS `getCMSText<K>(key)` is typed against `CMS_SCHEMA`,** so adding `payments.gateway_url_template` to the schema makes the call compile only after the schema add — natural ordering for Tasks 1 → 2.
- **`renderToBuffer` returns a Node `Buffer`** that satisfies `BodyInit` after the `as unknown as BodyInit` cast already in `route.ts:174`. No change needed.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Page 1 already overflows when there are > ~12 line items, pushing signatures to a new page-1 continuation that visually duplicates with the "real" page 2. | Medium | Medium (looks unprofessional on long estimates) | **Revised during implementation:** signatures and table header are both **in-flow** (not `fixed`). Rationale: (a) repeated signatures on every page-1 continuation is wrong for a legal estimate — there must be exactly one signature line per side; (b) the empty table header band on a totals-only continuation looked bad. Signatures land at the natural end of estimate flow with `wrap={false}` so the row + М.П. stamp never split across pages. Page 2 (conditions) is a separate `<Page>` and is unaffected by overflow. **Verification:** TS-002 below. |
| Empty `payments.gateway_url_template` accidentally produces a QR with the literal string `{estimateId}`. | Low | High (wrong QR ships to customers) | Resolve template ONLY when non-empty AND after substitution, validate result starts with `http`. If not, skip QR generation. **Verification:** TS-003 (empty template). |
| `encodeURIComponent` over-encodes a number with intentional `/` (e.g. fleet numbering schemes). | Low | Low (URL still works on every payment gateway tested) | Document behavior in code comment; if a user needs raw `/` they can update the template to use `{numberRaw}` later (deferred — not in scope). |
| Lowering watermark opacity from 0.45 → 0.18 makes the seal invisible on light printers. | Low | Low (cosmetic) | Verify visually on the sample render in TS-001. If too faint, raise to 0.22 within the same task (no plan re-approval needed for a numeric tweak). |
| New `payments` group breaks an existing CMS admin page that hard-codes group names. | Low | Medium | `GROUP_ORDER.map` in `app/(admin)/admin/cms/page.tsx:37` is dynamic; `GROUP_LABELS[group]` lookup in `CMSGroupSection.tsx:160` resolves at runtime. No hard-coded group enumeration outside the schema file (verified via grep). |
| Long warranty/payment-terms text on page 2 pushes the manager + requisites onto a third page. | Low | Low (text still readable) | Acceptable — react-pdf auto-wraps. Out of scope: tightening to fit in two pages always. |

## Goal Verification

### Truths

1. The PDF produced by `GET /api/estimates/<id>/pdf` against the **standard sample** (~7 line items, our tightened spacing accommodates this comfortably) is 2 A4 pages when `payments.gateway_url_template` is set, AND 2 A4 pages when it is empty (page 2 still renders, just hides QR + scan instruction). For estimates whose line-item table naturally overflows past one printable page-1 region, page 1 expands to multiple physical pages (table auto-wraps, header is in-flow and does NOT repeat) while page 2 remains the **single, final** conditions page — never duplicated, never preceded by signatures. Signatures appear exactly once at the natural end of the estimate flow, kept on a single page via `wrap={false}`.
2. Page 1 contains: brand strip, "Смета № X от …", validity line, Mercedes block, заказчик/исполнитель, vehicle facts row, line-item table, totals (Работы / Запчасти / НДС / Итого), signatures (Исполнитель + Заказчик), watermark seal at executor position with opacity 0.18.
3. Page 1 does NOT contain: QR, warranty text, payment-terms text, full requisites grid, manager block.
4. Page 2 contains: compact brand strip, page heading, large QR (~180–200pt) when template is non-empty, "Условия оплаты", "Гарантия на работы" (`requisites.warranty`), "Гарантия на запчасти" (`requisites.parts_warranty`), full requisites grid, manager line, footer note.
5. Page 2 does NOT contain: watermark seal, signature row, line-item table.
6. When `payments.gateway_url_template` is `https://pay.test/x?eid={estimateId}&n={number}` and estimate `id=abc123` `number=СМ-000142`, the encoded URL embedded in the QR is `https://pay.test/x?eid=abc123&n=%D0%A1%D0%9C-000142` (Cyrillic encoded).
7. The CMS admin UI shows a new "Платежи" / "Платёжный шлюз" section between Контакты and Реквизиты with one text field.
8. `npx tsc --noEmit` passes with zero errors; `npm run lint` passes with no new errors.

### Artifacts

- `lib/cms-schema.ts` (modified) — `CMSGroup` union extended, `GROUP_LABELS`/`GROUP_ORDER` extended, `payments.gateway_url_template` and `requisites.parts_warranty` keys added.
- `lib/load-requisites.ts` (modified) — surface the two new fields; preserve the existing labor-warranty/payment-terms exposure.
- `lib/estimate-pdf-document.tsx` (modified) — refactor to two `<Page>` blocks; extend `EstimatePdfRequisites`; reduce seal opacity; remove QR/warranty/terms/requisites/manager from page-1 JSX and add them to page-2 JSX.
- `app/api/estimates/[id]/pdf/route.ts` (modified) — replace review-URL QR target with the resolved payment-gateway URL; placeholder substitution.

## E2E Test Scenarios

### TS-001: Standard estimate renders two pages with QR

**Priority:** Critical
**Preconditions:**
- Admin session active (`admin@geleoteka.ru`).
- CMS row exists for `payments.gateway_url_template` with value `https://pay.example.com/checkout?estimate={estimateId}&number={number}`.
- CMS row exists for `requisites.parts_warranty` with non-empty richtext.
- An estimate with > 0 line items and a non-null `number` (use existing seeded estimate or create a fresh DRAFT one through `/admin/crm/estimates`).
**Mapped Tasks:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open `GET /api/estimates/<estimateId>/pdf` in browser (admin session) | PDF downloads / displays inline. |
| 2 | Save file, open it in Preview (or use a Quartz/Swift render harness to convert pages to PNG) | The PDF has exactly **2 pages**. |
| 3 | Visually inspect page 1 | Header, "Смета № X", validity line + Mercedes block top-right, заказчик/исполнитель two-column, vehicle facts, line-item table, totals block, signatures pinned to bottom (Исполнитель name from `requisites.directorName` and `М.П.` line; Заказчик name + Подпись line). Watermark seal visible but faint (~0.18 opacity) over the executor stamp area. **No QR. No warranty text. No requisites grid.** |
| 4 | Visually inspect page 2 | Compact brand strip + "К смете № <num>" reference line; page heading "Условия и онлайн-оплата" (or equivalent); large QR (~180–200pt) on the left; right column with "Условия оплаты", "Гарантия на работы", "Гарантия на запчасти"; below — full requisites grid; manager contact line; footer note. **No watermark, no signatures, no line-item table.** |
| 5 | Decode the QR with an external QR tool (or `node`: `console.log(jsQR(...).data)`) | URL is `https://pay.example.com/checkout?estimate=<encoded id>&number=<encoded number>` — values match the live record. |

### TS-002: Long estimate (>15 line items) still produces clean two-page split

**Priority:** High
**Preconditions:**
- Same auth + CMS setup as TS-001.
- An estimate with 15+ line items so page-1's table overflows into a second physical page-1 instance.
**Mapped Tasks:** Task 4, Task 5

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open the PDF for the long-line-items estimate | PDF has at least 3 pages. |
| 2 | Inspect the page where line items continue | Table header repeats (current `fixed` behavior preserved); signatures still pinned at the bottom of THIS page-1-continuation. |
| 3 | Inspect the last page | It is page 2: brand strip, page heading, QR, warranty/payment terms, requisites, manager, footer. **No leftover line items. No double signatures.** |

### TS-003: Empty payment template — page 2 still renders without QR

**Priority:** Critical
**Preconditions:**
- Admin session.
- CMS row `payments.gateway_url_template` either absent or value is `""`.
- CMS row `requisites.parts_warranty` is non-empty.
**Mapped Tasks:** Task 3, Task 6

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open the PDF for any estimate | PDF still has 2 pages. |
| 2 | Inspect page 2 | The QR block is **absent** AND the scan-instruction text is absent. The rest of page 2 (heading, warranty for labor, warranty for parts, payment terms, requisites, manager, footer) renders normally. The right column expands to fill the now-empty QR slot OR the QR slot collapses cleanly without leaving a gap. |

### TS-004: CMS admin can edit the new keys

**Priority:** High
**Preconditions:** Admin session, visit `/admin/cms`.
**Mapped Tasks:** Task 1

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open `/admin/cms` | A new section "Платежи" (or `GROUP_LABELS["payments"]`) appears in the group list between Контакты and Реквизиты. |
| 2 | Expand the Платежи section | A single field whose **label** is `URL платёжного шлюза (шаблон) — {estimateId}, {number}` (placeholders embedded directly in the label, since `CMSTextDef` has no helperText slot — see Task 1 notes). |
| 3 | In Реквизиты section, find "Гарантия на запчасти" | Field exists with the seeded richtext default. |
| 4 | Edit and save the `payments.gateway_url_template` value | Save succeeds; reloading the PDF reflects the new URL in the QR. |

## Progress Tracking

- [x] Task 1: CMS schema additions (`payments` group + 2 new keys)
- [x] Task 2: `lib/load-requisites.ts` surface the new fields
- [x] Task 3: `route.ts` resolves payment-gateway URL template + builds QR conditionally
- [x] Task 4: `lib/estimate-pdf-document.tsx` — extract `<BrandStrip>` sub-component; split into two `<Page>` blocks; reduce seal opacity
- [x] Task 5: Page-2 content — heading + QR + warranty/parts-warranty/payment-terms two-column hero + requisites grid + manager + footer
- [x] Task 6: Final visual verification via render harness — TS-001, TS-002, TS-003 manually

**Total Tasks:** 6 | **Completed:** 6 | **Remaining:** 0

## Implementation Tasks

### Task 1: CMS schema additions

**Objective:** Register a new CMS group `payments` and two new keys (`payments.gateway_url_template`, `requisites.parts_warranty`) so the admin UI and PDF loader can read them.

**Dependencies:** None
**Mapped Scenarios:** TS-001 (prerequisite), TS-003, TS-004

**Files:**

- Modify: `lib/cms-schema.ts`

**Trivial:** No — new public CMS keys + new union member is a public-surface change covered by TS-004 and the verify script.

**Key Decisions / Notes:**

- Add `"payments"` to the `CMSGroup` union at `lib/cms-schema.ts:16–27`. Place it after `"contacts"` to keep finance-related groups adjacent.
- Add `payments: "Платёжный шлюз"` to `GROUP_LABELS` at `lib/cms-schema.ts:68–78`.
- Add `"payments"` to `GROUP_ORDER` between `"contacts"` and `"requisites"` (line 81–91) — matches the admin UX expectation of paying section grouping.
- Add key definition:

  ```ts
  "payments.gateway_url_template": {
    type: "text",
    group: "payments",
    label: "URL платёжного шлюза (шаблон)",
    defaultValue: "",
  },
  ```

  The default is intentionally empty — TS-003 covers the empty-template branch.
- **Label must embed the placeholder names** because `CMSTextDef` (lines 35–40) has no `helperText` slot — that field lives only on `CMSRichtextDef` (47) and `CMSImageDef` (63). Use:

  ```ts
  label: "URL платёжного шлюза (шаблон) — {estimateId}, {number}",
  ```

  This matches TS-004 step 2 verbatim. Do NOT widen `CMSTextDef` — out of scope.
- Add `requisites.parts_warranty` after the existing `requisites.warranty` key (currently lines 820–826):

  ```ts
  "requisites.parts_warranty": {
    type: "richtext",
    group: "requisites",
    label: "Гарантия на запчасти",
    defaultValue: "Гарантия на запчасти — по условиям производителя (от 6 до 24 месяцев). Гарантия не распространяется на расходные материалы и узлы, повреждённые в результате нарушения эксплуатации.",
  },
  ```

- Confirmed: `scripts/verify-cms.ts` exists (verified via `ls scripts/verify-cms.ts`); imports `GROUP_ORDER` and `allKeysInDisplayOrder` for sanity checks. Run `npx tsx scripts/verify-cms.ts` after the change — it lints `GROUP_ORDER` completeness.
- Confirmed: `app/(admin)/admin/cms/page.tsx:37` is the `GROUP_ORDER.map((group) => (...))` call. Adding a new group renders automatically — no admin-UI code change.

**Definition of Done:**

- [ ] `CMSGroup` union has `"payments"` (no other strings added).
- [ ] `GROUP_LABELS["payments"]` returns `"Платёжный шлюз"`.
- [ ] `GROUP_ORDER` includes `"payments"` exactly once.
- [ ] `CMS_SCHEMA["payments.gateway_url_template"]` resolves with `type: "text"`, `defaultValue: ""`.
- [ ] `CMS_SCHEMA["requisites.parts_warranty"]` resolves with `type: "richtext"`, non-empty default.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npx tsx scripts/verify-cms.ts` exits 0.

**Verify:**

- `npx tsc --noEmit`
- `npx tsx scripts/verify-cms.ts`

---

### Task 2: `loadRequisites` surfaces new fields

**Objective:** Extend the `Requisites` interface and `loadRequisites()` function so callers receive `paymentsGatewayUrlTemplate` (text) and `partsWarranty` (richtext).

**Dependencies:** Task 1
**Mapped Scenarios:** TS-001, TS-003

**Files:**

- Modify: `lib/load-requisites.ts`

**Trivial:** No — adds two new public interface fields. Covered functionally by TS-001/TS-003 via the PDF rendering path.

**Key Decisions / Notes:**

- Add two new optional-only-by-absence string fields to the `Requisites` interface:

  ```ts
  partsWarranty: string;
  paymentsGatewayUrlTemplate: string;
  ```

  Both default to `""` — never `null`. The empty string is the empty-content signal everywhere in this codebase (matches `warranty`, `paymentTerms`).
- **Use the existing `getCMSMany` pattern for the new text key** — `lib/load-requisites.ts` already loads all plain-text keys in one `getCMSMany([...])` call (lines 28–43). Add `"payments.gateway_url_template"` to that keys array, then destructure as `paymentsGatewayUrlTemplate: base["payments.gateway_url_template"] ?? ""`. This matches the file's established pattern and avoids importing `getCMSText` just for one key.
- For `requisites.parts_warranty` (richtext), add a `getCMSRichtext("requisites.parts_warranty")` call to the existing `Promise.all` — same pattern as the existing `getCMSRichtext("requisites.estimate_footer")` line.
- Existing call-sites of `loadRequisites()`: only `app/api/estimates/[id]/pdf/route.ts:138`. Verified via `grep -rn loadRequisites` (Step 6.4 — one caller). No other callers to update.

**Definition of Done:**

- [ ] `Requisites` has both new fields.
- [ ] `loadRequisites()` reads both keys via the existing `lib/cms.ts` typed helpers.
- [ ] Returned object always has string values (never `null`/`undefined`).
- [ ] `npx tsc --noEmit` exits 0.

**Verify:**

- `npx tsc --noEmit`

---

### Task 3: Route handler resolves payment-gateway URL + builds QR conditionally

**Objective:** Replace the current claim-token review-URL QR generation in `app/api/estimates/[id]/pdf/route.ts` with payment-gateway URL resolution. QR is built only when the resolved URL is non-empty AND starts with `http`.

**Dependencies:** Task 2
**Mapped Scenarios:** TS-001 (QR present), TS-003 (QR absent)

**Files:**

- Modify: `app/api/estimates/[id]/pdf/route.ts`

**Trivial:** No — replaces user-facing QR target.

**Key Decisions / Notes:**

- Remove the `reviewUrl` block (`route.ts:140–152`):

  ```ts
  const origin = new URL(req.url).origin;
  const reviewUrl = estimate.deal.claimToken
    ? `${origin}/estimate/${estimate.deal.claimToken}`
    : `${origin}/cabinet/estimates/${estimate.id}`;
  const qrDataUrl = await QRCode.toDataURL(reviewUrl, { ... });
  ```

- Replace with template resolution. Add a small inline helper at the bottom of the file (or above the `GET` handler):

  ```ts
  function resolvePaymentUrl(template: string, vars: { id: string; number: string }): string | null {
    if (!template) return null;
    const resolved = template
      .replace(/\{estimateId\}/g, encodeURIComponent(vars.id))
      .replace(/\{number\}/g, encodeURIComponent(vars.number));
    if (!/^https?:\/\//i.test(resolved)) return null;
    return resolved;
  }
  ```

- In the handler body, after `loadRequisites()`:

  ```ts
  const paymentUrl = resolvePaymentUrl(requisites.paymentsGatewayUrlTemplate, {
    id: estimate.id,
    number: estimate.number ?? estimate.id.slice(-6).toUpperCase(),
  });
  let qrDataUrl: string | null = null;
  if (paymentUrl) {
    qrDataUrl = await QRCode.toDataURL(paymentUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320, // larger raster — page-2 prints at ~180pt
      color: { dark: "#1a1a1a", light: "#ffffff" },
    });
  }
  const extras: EstimatePdfExtras = {
    qrDataUrl,
    qrCaption: "Отсканируйте для оплаты онлайн",
  };
  ```

  Note: `qrDataUrl` is now `string | null`; the existing `EstimatePdfExtras.qrDataUrl` field is already `string | null | undefined` (`null` permitted) — verify in Task 4 that the rendering check treats `null` as "no QR".
- `claimToken` is still needed for the 3-tier auth (`route.ts:131`) — DO NOT remove the `claimToken: true` field from the Prisma `select`. Only the URL-construction is going away.
- Confirmed against `prisma/schema.prisma:1130` — `Estimate.number` is `String? @unique` (nullable). The fallback `estimate.id.slice(-6).toUpperCase()` is therefore NOT dead code: a DRAFT estimate may not yet have a number assigned. Encoded fallback values are still scannable URLs but should be treated as informational — payment gateways that need the human-readable number will see a 6-char cuid tail when `number` is null. Add a one-line inline comment in `route.ts` explaining the fallback.

**Definition of Done:**

- [ ] Old `reviewUrl` block removed.
- [ ] `resolvePaymentUrl` helper present, returns `null` when template empty or post-substitution result not `http(s)://…`.
- [ ] `qrDataUrl` is `null` when `paymentUrl` is `null`.
- [ ] `qrCaption` text is "Отсканируйте для оплаты онлайн" (or final wording — match Task 5 caption choice).
- [ ] `claimToken` auth path still works (`?token=` query still grants access).
- [ ] `npx tsc --noEmit` exits 0.

**Verify:**

- `npx tsc --noEmit`
- Manual: open `/api/estimates/<id>/pdf?token=<token>` and confirm 200 + PDF body.

---

### Task 4: Refactor `estimate-pdf-document.tsx` into two `<Page>` blocks

**Objective:** Move all page-1-only JSX into the first `<Page>` element; create a second `<Page>` element that will (in Task 5) host the conditions content. Reduce watermark seal opacity. Extract a small `<BrandStrip>` sub-component used by both pages.

**Dependencies:** Task 2 (interface change), Task 3 (extras shape — `qrDataUrl` may be `null`)
**Mapped Scenarios:** TS-001, TS-002, TS-003

**Files:**

- Modify: `lib/estimate-pdf-document.tsx`

**Trivial:** No — primary structural refactor.

**Key Decisions / Notes:**

- Extract a `<BrandStrip>` internal component taking props `{ requisites, compact, reference? }`:
  - `compact = false`: full strip (current behavior — logo+wordmark+tag+contacts row+rule).
  - `compact = true`: logo+wordmark only; `reference` (e.g. `"К смете № СМ-000142"`) renders right-aligned in a smaller font.
- Move the existing `<Page>` children verbatim into a new outer `<Page size="A4" style={styles.page} wrap>` — already the current structure. Inside, render `<BrandStrip compact={false} ... />`, then keep the title row, parties, facts, table, totals (without QR — see Task 5 for the new page-2 QR), signatures fixed at bottom, and the seal.
- **Remove from page 1:** the `extras?.qrDataUrl` totals-flank QR block (current lines 600–609), the `requisites.warranty`/`paymentTerms` two-column block (lines 654–670), the requisites grid `hasReqs` block (lines 672–702), the manager block (lines 704–718), and the `footerNote` (lines 720–727). These all move to page 2 in Task 5.
- **Totals on page 1:** keep the totals block (lines 610–651) but unwrap it from the now-removed `totalsWrap` flex container. Make it `marginLeft: auto`-aligned (already is via `styles.totals.marginLeft: "auto"` — just remove the parent flex wrapper).
- Reduce seal opacity from `0.45` to `0.18` (line 430). Keep position and rotation.
- Append a second `<Page size="A4" style={styles.page}>` element AFTER the first `</Page>` and BEFORE `</Document>`. **For Task 4 itself, the second page MUST render with at least a placeholder `<Text>Условия и онлайн-оплата (страница 2)</Text>`** so the document is renderable end-to-end and Task 5 is a pure content-fill task.
- The `signatures` fixed view stays inside `<Page>` #1 only — by definition, it won't appear on `<Page>` #2.

**Definition of Done:**

- [ ] `<BrandStrip>` sub-component defined in same file (private, not exported).
- [ ] Document contains exactly two `<Page>` siblings.
- [ ] Page 1 JSX no longer contains: QR block (`extras?.qrDataUrl`), warranty/payment-terms two-column block, full requisites grid, manager block, footer note.
- [ ] Page 1 JSX still contains: brand strip, title row, parties, vehicle facts, table, totals, signatures, seal.
- [ ] Seal opacity is `0.18` (or final user-approved value, document the choice inline).
- [ ] Page 2 JSX exists as a `<Page>` element with at least the placeholder content (real content lands in Task 5).
- [ ] `npx tsc --noEmit` exits 0.
- [ ] Rendering a sample estimate produces exactly 2 pages (visual check via render harness — same Swift/Quartz approach used in the previous PDF iteration).

**Verify:**

- `npx tsc --noEmit`
- Render harness: produce PDF, page count == 2.

---

### Task 5: Page-2 content composition

**Objective:** Populate the second `<Page>` with the final page-2 layout — compact brand strip, page heading, QR-left/text-right hero, requisites grid, manager line, footer note.

**Dependencies:** Task 4
**Mapped Scenarios:** TS-001, TS-002, TS-003

**Files:**

- Modify: `lib/estimate-pdf-document.tsx`

**Trivial:** No — substantial new JSX + new styles.

**Key Decisions / Notes:**

- **Top of page 2:**
  - `<BrandStrip compact reference={`К смете № ${docNumber}`} />`
  - Page heading (large): `Условия и онлайн-оплата` — fontSize 18–20, weight 700, color INK, marginTop ~18.
  - Optional one-line subtitle: `Для оплаты сметы отсканируйте QR-код или используйте реквизиты ниже.` — fontSize 9.5, INK_2.
- **Hero block (QR + right column):**
  - Flex row, gap 24, marginTop 18.
  - Left column: width 200 (matches QR raster). When `extras.qrDataUrl` truthy:
    - `<Image src={extras.qrDataUrl} style={{ width: 180, height: 180 }} />` (180pt ~ 6.4 cm — matches user-chosen "крупный, доминирующий" 180–200pt range).
    - Below QR (margin-top 6): small caption: `extras.qrCaption ?? "Отсканируйте для оплаты онлайн"` — fontSize 8.5, INK_MUTED, letterSpacing 0.4.
  - When `extras.qrDataUrl` is null/undefined: render NOTHING in the left column (no placeholder square). The right column then flexes to fill via `flex: 1`.
  - Right column (flex 1):
    - `Условия оплаты` header (microlabel style) → body = `requisites.paymentTerms`.
    - `Гарантия на работы` header → body = `requisites.warranty`.
    - `Гарантия на запчасти` header → body = `requisites.partsWarranty`.
    - Each block has vertical spacing 8.
- **Requisites grid:** keep the existing `Реквизиты для оплаты` block + `<Req>` grid from the previous page-1 implementation. marginTop ~22 from the hero block. Only renders when `hasReqs` (same condition as before).
- **Manager block:** keep the existing two-column row. marginTop ~18.
- **Footer note:** keep `styles.footerNote` text — `validUntil ? "Смета действительна до …" : ""` + "По вопросам согласования — отдел сервиса.". marginTop ~14.
- **No watermark, no signatures on page 2** — confirmed by NOT including the seal `<View fixed>` or `<View style={styles.signatures} fixed>` in this `<Page>`.
- **Performance note:** the QR data URL is ~3–4 KB; passing it through the component tree once is fine. Do not memoize.
- **Styles to add:**
  - `page2Heading`, `page2Subtitle`, `page2HeroRow`, `page2HeroLeft`, `page2HeroRight`, `page2TermsBlock`, `page2TermsHeader`, `page2TermsBody`, `page2ReferenceLine`.
  - Reuse `styles.reqsGrid`, `styles.twoCol`, `styles.blockHeader`, `styles.footerNote`.

**Definition of Done:**

- [ ] Page 2 renders with: compact brand strip + reference line, heading, hero (QR-left when present + 3-block right text), requisites grid (conditional on `hasReqs`), manager (conditional on `estimate.manager`), footer note.
- [ ] When `extras.qrDataUrl` is `null`: QR slot disappears cleanly — no empty box, no gap larger than the natural flex gap.
- [ ] All three text blocks (`warranty`, `partsWarranty`, `paymentTerms`) appear with their labeled microheaders.
- [ ] `npx tsc --noEmit` exits 0; `npm run lint` no new warnings.
- [ ] Visual render shows TS-001, TS-002, TS-003 all behave correctly.

**Verify:**

- `npx tsc --noEmit`
- `npm run lint -- lib/estimate-pdf-document.tsx`
- Render harness for TS-001, TS-003 (TS-002 needs the long-estimate fixture but can be approximated by duplicating sample lines).

---

### Task 6: Visual verification + cleanup

**Objective:** Render the PDF against three configurations matching TS-001 / TS-002 / TS-003, capture page-by-page PNGs, confirm all goal-verification truths.

**Dependencies:** Tasks 1–5
**Mapped Scenarios:** TS-001, TS-002, TS-003

**Files:**

- Test (temporary, deleted at the end): `render-estimate-pdf.ts` at repo root — same harness pattern used during the previous PDF iteration (uses `@react-pdf/renderer` `renderToBuffer`).
- Verify: `/tmp/render-pages.swift` (one-off Quartz rasterizer used previously — re-use or recreate inline).

**Trivial:** Verification-only task — no new production code.

**Key Decisions / Notes:**

- Build the harness with three scenarios as separate runs:
  1. Standard: 13 sample lines + full warranty + payment template `https://pay.test/x?eid={estimateId}&n={number}`. Confirm 2 pages, QR decodes to encoded URL.
  2. Long: 18+ sample lines. Confirm page-1 wraps but signatures pin per-page and page 2 is still a clean last page.
  3. Empty template: same sample but `paymentsGatewayUrlTemplate: ""`. Confirm 2 pages, page 2 hides QR + caption, rest of page 2 still renders.
- After each scenario: convert PDF → PNG per-page via the Quartz Swift script, Read the PNGs to confirm visually.
- **Delete** `render-estimate-pdf.ts` and any `/tmp/*.png`/`/tmp/*.pdf`/`/tmp/render-pages.swift` artifacts at the end. Verify with `git status` — only the four production files should appear in the diff.

**Definition of Done:**

- [ ] TS-001 verified: 2 pages, QR present with encoded URL.
- [ ] TS-002 verified: long estimate produces ≥ 3 pages, last page is the conditions page (no double signatures, no leftover line items).
- [ ] TS-003 verified: 2 pages even with empty template; page 2 collapses QR cleanly.
- [ ] No leftover test files in the repo (`git status` confirms only the production files in Tasks 1–4 are modified).

**Verify:**

- `git status` — only `lib/cms-schema.ts`, `lib/load-requisites.ts`, `lib/estimate-pdf-document.tsx`, `app/api/estimates/[id]/pdf/route.ts` modified.
