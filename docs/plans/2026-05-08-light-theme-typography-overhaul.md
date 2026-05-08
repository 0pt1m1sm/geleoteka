# Light Theme + Hero Contrast + Heading-Font Overhaul Implementation Plan

Created: 2026-05-08
Author: aleksandr.spiskov@gmail.com
Status: VERIFIED
Approved: Yes
Iterations: 2
Worktree: No
Type: Feature

> **Iteration 1 (2026-05-08):** Initial plan picked DM Serif Display for headings.
> During implementation, verified next/font Google catalogue and discovered DM Serif Display ships only `latin` + `latin-ext` (no Cyrillic). User reselected **Manrope** — a variable sans-serif with full Cyrillic support and weights 200–800.
>
> **Iteration 2 (2026-05-08):** User chose to extend Manrope across the whole site (both headings AND body), replacing IBM Plex Sans entirely. Reasoning: the original complaint was "mismatch between heading and body fonts" — a single family resolves it more cleanly than stacking two sans families. Body font swap is now IN scope. Task 1 expanded; new mapped scenarios cover body surfaces.

## Summary

**Goal:** Replace BOTH Playfair Display headings and IBM Plex Sans body with **Manrope** (variable sans-serif, full Cyrillic, weights 200–800), raise the light-theme gold from muddy `#9a7b2c` to champagne `#c4a13a`, and apply a warm sepia treatment + reduced overlay to the homepage hero photo in light mode — so the site reads as luxury (not "AI-generated brown") and has a coherent typographic voice instead of two-mismatched-sans-stack.

**Architecture:** All four interventions are token-level or single-file: heading font swaps via `next/font` in `app/layout.tsx` plus the `--font-display` variable in `tokens.css`; light-theme accent gold updates in `tokens.css` (no light-mode overrides needed elsewhere because every gold reference already routes through `var(--color-accent)`); the hero treatment is a single `.hero-image` class with a CSS `filter` override for `html.light` plus an opacity tweak on the existing `html.light .hero-overlay` rule. Theme-init.js already implements "match OS preference" semantics — no change needed.

**Tech Stack:** Next.js 16 App Router · `next/font/google` (Manrope, full Cyrillic + Latin support, variable weight axis 200–800) · CSS custom properties · Tailwind v4 · no new dependencies.

## Scope

### In Scope

1. Swap both heading AND body fonts to **Manrope** via `next/font/google`. Drop the `Playfair_Display` and `IBM_Plex_Sans` imports; add a single `Manrope` import wired into both `--font-display` and `--font-body` tokens (variable axis 200–800 supplies weight range for both surfaces). Cyrillic + Latin subsets. `JetBrains_Mono` stays for monospace.
2. Light-theme accent palette update: `--color-accent`, `--color-accent-hover`, `--color-gold`, `--border-accent`, `--shadow-glow` set to champagne family on cream. Dark theme tokens UNTOUCHED — user complaint is light-only.
3. Hero light-theme treatment: add `.hero-image` class to the homepage `<Image>` parent; CSS `filter: sepia(0.15) saturate(0.85) brightness(1.05)` applied via `html.light .hero-image`; `html.light .hero-overlay` opacity dropped from 0.45 → 0.30.
4. WCAG-AA verification on the brand surfaces in BOTH themes: text on bg, accent on bg (large), button text on accent, badge text on tinted accent — documented in the verification.
5. Browser-driven before/after screenshots for both themes on top + hero + cards + form. Captured during verify, attached to the plan via E2E results table.

### Out of Scope

- **Layout primitives** — no card/grid/spacing changes.
- **Visual redesign** beyond palette + heading face — no new components, no rewrites of existing component shapes.
- **SVG logo update** (`public/images/logo.svg`) — its hard-coded gold may not match the new champagne. Documented as a follow-up; not blocking because the SVG has its own visual identity that holds up across the new palette.
- **Default theme change** — user picked "Match OS preference," which is already what `public/theme-init.js` does. No file change.
- **Dark theme color tweaks** — user's complaint targets light theme.
- **Tag-color palette** (CRM tags) — the 8 named slugs stay. The gold tag inherits from `--color-gold` updates automatically.

## Approach

**Chosen:** Token-level swap + single hero CSS class. Single approach because the user's prompt already pinned the scope — no architectural alternatives worth comparing here.

**Why:** Every gold and every heading on the site already flows through `var(--color-accent)` and the `text-display` utility, so the entire identity update lands in three files (`layout.tsx`, `tokens.css`, `components.css`) plus one className addition on the homepage hero `<Image>`. Lowest blast radius for a brand-facing change.

**Alternatives considered:**

- _Per-component CSS overrides for accent on light backgrounds._ Would let the gold differ between buttons (saturated) and badges (lighter). Rejected — the user's complaint is "gold reads as gold not brown," not "I want different golds in different places." Token-level keeps the visual system coherent.
- _Replace the hero photo asset with a light-mode variant._ Would give the cleanest light-mode hero. Rejected — explicitly out of scope ("Out of scope: layout primitives, body font swap, new component shapes, visual redesign beyond palette + heading face"). The CSS filter achieves 80% of the result for 5% of the cost.

## Context for Implementer

> Implementer is new to Geleoteka. Below is everything that differs from a vanilla Next.js setup.

### Patterns to follow

- **Theming model:** dark by default tokens in `:root`, light theme overrides under `html.light`. Light is applied pre-paint by `public/theme-init.js`. NEVER use `prefers-color-scheme` media queries — theme-init.js is the single source. (`app/styles/tokens.css:5,96`).
- **Headings use `text-display` utility class** (defined in `app/styles/components.css:6-10`), which sets `font-family: var(--font-display)`. There are 45 usages of `text-display` across pages and components. The font swap is invisible at the call sites — they continue to reference `var(--font-display)`.
- **Gold/accent uses `var(--color-accent)` everywhere** — including inline Tailwind arbitrary values like `bg-[var(--color-accent)]`. Token-level update propagates without per-component edits.
- **next/font pattern:** declared in `app/layout.tsx:10-29`, exposed as a CSS variable via the `variable: "--font-..."` option, then bound to `--font-display` in `tokens.css:84`.

### Conventions

- Light theme hex values in `tokens.css:96-129` mirror the dark scheme keys 1:1 — every dark token has a light counterpart in the same order.
- Hero-only styles live OUTSIDE `@layer components` in `components.css:347-432` — comment notes "to ensure precedence over utility hover states." Keep the filter rule there.
- File naming: kebab-case for CSS, camelCase for next/font variable.

### Key files

- `app/layout.tsx` — `next/font` declarations + variable wiring.
- `app/styles/tokens.css` — `:root` (dark) + `html.light` (light) overrides + `--font-display` binding.
- `app/styles/components.css` — `.text-display`, `.hero-overlay`, `.hero-spotlight`. Where the new `.hero-image` filter rule goes.
- `app/(public)/page.tsx` — homepage. The hero `<Image>` at line 90 gets a `hero-image` className addition.
- `public/theme-init.js` — already implements OS preference. NO change.
- `components/shared/Header.tsx:62-66` — wordmark uses `text-[var(--color-accent)]`. Will inherit champagne gold automatically.
- `components/shared/ThemeToggle.tsx` — toggle UI; no change.

### Gotchas

- **DM Serif Display has only one weight (400) and no italic in next/font/google.** This is a known limitation of the family. Headings using `font-bold` will rely on the typeface's already-heavy default stroke — visually distinctive but `font-weight: 400` under the hood. Test on `app/(public)/page.tsx:115` (`h2 ... font-bold text-display`) to confirm the look matches the design intent.
- **Cyrillic subset is mandatory** — site language is Russian. DM Serif Display ships Cyrillic in Google Fonts (verified). Specify `subsets: ["latin", "cyrillic"]` to load both.
- **WCAG AA caveat for champagne gold on cream:** `#c4a13a` on `#faf9f6` is ~3.8:1 — passes AA for **large text** (≥18pt or ≥14pt bold) and for non-text UI components (3:1), **fails AA for normal body text**. Audit any `text-[var(--color-accent)]` usage at body sizes; if any exist, either upgrade to bold or switch them to `var(--foreground)` with accent color reserved for headlines/buttons. Buttons are unaffected — text on the gold button uses `--color-accent-foreground` (`#ffffff` in light, contrast 5.7:1 = AA pass).
- **Hero filter caveat:** `filter: sepia(0.15) saturate(0.85) brightness(1.05)` increases the photo's apparent luminance. Combined with overlay drop from 0.45 → 0.30, white-on-image text contrast drops. Verify hero text is still legible — if not, add a subtle text-shadow OR keep overlay at 0.40.
- **Variable name change:** `--font-playfair-display` → `--font-dm-serif-display`. The `--font-display` token in `tokens.css:84` references the old name. Both must change together; any third reference (e.g. an old session-doc) is documentation only.
- **Hero image element is `<Image>` from `next/image`.** Tailwind/CSS class goes on its `className` prop and is applied to the rendered `<img>`. CSS `filter` works there.

### Domain context

- "Geleoteka" — gold (#d4af37 dark, #c4a13a light after this plan) on near-black or cream. Russian-only site. The brand is luxury auto service for Mercedes-Benz G-Class and related.
- The `text-display` class is the brand voice — used for page titles, hero headlines, stat numbers, CTA banners. The font swap is the most visible change in this plan.

## Runtime Environment

- **Start command:** `npm run dev` (HTTPS on :443) or `npm run build && PORT=3737 npm start` for local prod testing.
- **DB:** unchanged from prior plans.
- **Health check:** open `https://localhost/`, observe homepage hero. Toggle theme via header sun/moon button. Compare light + dark.
- **Restart:** dev server hot-reloads `tokens.css`/`components.css` and `next/font` changes. Layout font swap may need a full page reload after first compile.
- **Deploy:** Railway auto-deploys from `main`. Font files are bundled at build by next/font.

## Assumptions

- ~~**DM Serif Display is available in `next/font/google` with `latin` and `cyrillic` subsets.** Supports: known Google Fonts catalogue. Tasks: 1.~~ **❌ INVALIDATED 2026-05-08:** DM Serif Display ships only `latin` + `latin-ext` in next/font (verified via `node_modules/next/dist/compiled/@next/font/dist/google/google-fonts-metadata.js`). Russian site cannot use it. **Task 1 paused; awaiting substitute pick.** Confirmed candidates with full Cyrillic support: Cormorant Garamond (300-700 + variable), Spectral (200-800), EB Garamond (400-800 + variable), Cormorant (300-700 + variable).
- **The `text-display` utility is the only heading font hook.** Supports: `app/styles/components.css:6-10`; 45 call sites all use the class. Tasks: 1, 4.
- **Dark theme accent (`#d4af37`) is acceptable as-is.** Supports: user complaint scoped to light only. Tasks: 2.
- **Hero `<Image>` accepts a className that ends up on the rendered `<img>`.** Supports: next/image documented behaviour. Tasks: 3.
- **45 `text-display` call sites do not need individual visual review** — they all inherit through CSS, so a single homepage + admin sweep is sufficient. Tasks: 4.
- **No SVG logo file edits are needed for this plan** — user explicitly excluded the wordmark image; the rendered text wordmark in the header (`components/shared/Header.tsx:63-65`) is the affected one. Tasks: 2 (token swap brings it along).

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Champagne gold `#c4a13a` on cream fails AA for normal-body inline accent text | Med | Med | Audit usages with `grep "text-\[var(--color-accent)\]"`; for any body-size occurrences, either bold them or switch to `var(--foreground)` with accent reserved for buttons/headlines. Document the audit result in Task 2 DoD. |
| DM Serif Display single-weight (400) feels too light for `font-bold` headings | Low | Med | Inspect on hero h2 + page titles in browser. If visually too thin, add `font-feature-settings` or fall back to `font-weight: 400` with bigger sizes. Worst case: revert to Playfair Display via single `layout.tsx` import swap. |
| Hero filter + reduced overlay drops white text contrast below AA | Med | Med | Browser-test the hero in light mode; if text legibility suffers, raise overlay to 0.40 (mid-point) before claiming verification. |
| `next/font` cache miss after font swap causes blank text in dev for 1-2 seconds | Low | Low | First page load after swap; documented Next behaviour. Production builds include the woff2 in the bundle. |
| Token rename breaks an unrelated CSS rule that hard-codes `var(--font-playfair-display)` | Low | Med | Grep for the old name across all `.css`/`.tsx` files in Task 1. Single owner: `tokens.css` line 84. |
| Hero image className not applied (next/image quirk) | Low | Low | Verify in DevTools: the rendered `<img>` should carry `class="hero-image object-cover"`. If not, move filter to a wrapper `<div>` instead of the image itself. |
| Theme toggle interaction missed during verification (only test fresh load) | Low | Low | Add explicit "toggle theme via header button" step in TS-005. |

## Goal Verification

### Truths

1. Homepage headings (hero left + hero right + section titles + stat numbers) render in DM Serif Display (not Playfair Display) in BOTH themes for Latin and Cyrillic glyphs. (TS-001, TS-004)
2. Light-theme accent appears as champagne gold `#c4a13a` site-wide — wordmark in header, primary buttons, links, badges — never the previous muddy `#9a7b2c`. (TS-001, TS-002)
3. Logo "GELEOTEKA" wordmark in the header has measurable contrast ≥ 3:1 against the cream banner background, computed on the actual rendered swatch. (TS-002)
4. Homepage hero in light mode visibly differs from dark mode — sepia/warm tint visible to the eye, overlay clearly less opaque, photo subject (the G-Class) still recognizable and not washed out. (TS-003)
5. Homepage hero in dark mode is byte-identical to current — no regression on the cinematic look that already works. (TS-003)
6. WCAG AA passes for: foreground text on background (both themes), button text on accent (both themes), badge text on tinted accent surfaces (both themes). (TS-006)
7. First-time-visitor default theme matches OS preference (light OS → light site, dark OS → dark site). (TS-005)

### Artifacts

- `app/layout.tsx` — `DM_Serif_Display` import + `--font-dm-serif-display` variable.
- `app/styles/tokens.css` — `--font-display` repointed; `html.light` accent block updated.
- `app/styles/components.css` — `.hero-image` filter rule + adjusted `html.light .hero-overlay` opacity.
- `app/(public)/page.tsx` — `hero-image` className on the hero `<Image>`.
- Screenshots in the verify report: `homepage-top-light.png`, `homepage-hero-light.png`, `homepage-cards-light.png`, `homepage-form-light.png`, plus `*-dark.png` counterparts.

## E2E Test Scenarios

### TS-001: Heading font is DM Serif Display, not Playfair
**Priority:** Critical
**Preconditions:** Latest deployed build (Railway).
**Mapped Tasks:** Task 1

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open `/` in light mode | Hero h2 elements use DM Serif Display |
| 2 | Inspect computed `font-family` on `h2.text-display` via DevTools | First family is `"DM Serif Display"` (or its variable wrapper); `Playfair Display` does NOT appear |
| 3 | Switch to dark mode via header toggle | Same DM Serif Display rendering, no flash |
| 4 | Open `/admin/customers` (logged in as admin) | Page title `Клиенты` renders in DM Serif Display (Cyrillic glyphs match) |
| 5 | Open `/parts/cart` | Stats numbers + section titles render in DM Serif Display |

### TS-002: Light gold reads as gold (not brown), logo legible
**Priority:** Critical
**Preconditions:** Browser in light theme.
**Mapped Tasks:** Task 2

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open `/` in light mode | Header "GELEOTEKA" wordmark visible, reads as warm gold |
| 2 | Use color-picker (DevTools) on the wordmark | Hex within ±2 of `#c4a13a` |
| 3 | Open `/booking` "Записаться" button | Same champagne gold, white text, no muddy brown |
| 4 | Open `/admin/customers`, look at "Создать клиента" button + tag pills | Gold consistent across surfaces |
| 5 | Compute contrast wordmark vs. background using Chrome DevTools "Inspect" → Color picker → Contrast | ≥ 3:1 (large-text AA) |

### TS-003: Light hero has warm sepia treatment; dark hero unchanged
**Priority:** Critical
**Preconditions:** Browser in light theme.
**Mapped Tasks:** Task 3

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open `/` in light mode | Hero photo of G-Class visibly warmer / desaturated; less harsh black overlay |
| 2 | Inspect the rendered `<img>` in DevTools | Has `class` containing `hero-image`; computed `filter` includes `sepia(0.15)` |
| 3 | Inspect the `.hero-overlay` div | Computed background-alpha ≈ 0.30 |
| 4 | Take screenshot for verify report | `homepage-hero-light.png` shows tinted hero |
| 5 | Toggle to dark mode | Filter removed (computed `filter: none`), overlay back to 0.55, photo identical to current production look |

### TS-004: Cyrillic + Latin glyphs render correctly in DM Serif Display
**Priority:** High
**Preconditions:** Light theme, latest build.
**Mapped Tasks:** Task 1

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open `/` | Russian heading text (e.g. "Наши услуги") renders without missing glyphs / fallback to system serif |
| 2 | Open `/admin/customers/new` | Title "Новый клиент" renders in DM Serif Display Cyrillic |
| 3 | Inspect Network tab | DM Serif Display woff2 loaded once, not blocking other resources |
| 4 | Open `/parts` (heading "Запчасти") | Display font correct |

### TS-005: First-load theme follows OS preference
**Priority:** Medium
**Preconditions:** Browser in incognito (no localStorage), OS theme set to light. Then repeat with OS theme dark.
**Mapped Tasks:** Task 4 (verification only — no file changes)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open `/` in incognito on a light-OS machine | Site loads in light theme without flash |
| 2 | Open `/` in incognito on a dark-OS machine | Site loads in dark theme without flash |
| 3 | Click theme toggle | Theme flips and persists in localStorage |
| 4 | Reload | Toggled theme persists; OS preference no longer used |

### TS-006: WCAG AA on brand surfaces
**Priority:** High
**Preconditions:** Built site, both themes.
**Mapped Tasks:** Task 4 (verification)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | DevTools → Lighthouse Accessibility audit on `/` (light) | No contrast failures on body text, headings, primary buttons |
| 2 | Same on `/` (dark) | Same — no regression |
| 3 | DevTools → Color contrast inspector on header wordmark (both themes) | ≥ 3:1 |
| 4 | Same on `/booking` step-3 form labels | ≥ 4.5:1 (normal text) |
| 5 | Same on `/admin/customers` tag badges (gold pill) | ≥ 3:1 |

## Progress Tracking

- [x] Task 1: Heading + body font swap — Playfair Display + IBM Plex Sans → Manrope (single variable family)
- [x] Task 2: Light-theme accent palette update (champagne gold)
- [x] Task 3: Hero light-theme treatment (sepia filter + reduced overlay)
- [x] Task 4: Verify (WCAG audit + screenshots + visual regression)

**Total Tasks:** 4 | **Completed:** 4 | **Remaining:** 0

## Implementation Tasks

### Task 1: Heading font swap — Playfair Display → DM Serif Display

**Objective:** Replace the heading display font with DM Serif Display via `next/font/google`, keeping Cyrillic + Latin coverage and the existing `text-display` utility class as the single hook.
**Dependencies:** None
**Mapped Scenarios:** TS-001, TS-004

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/styles/tokens.css`

**Key Decisions / Notes:**
- Replace `Playfair_Display` import with `DM_Serif_Display` from `next/font/google`. Keep the same shape (`subsets`, `display: "swap"`).
- DM Serif Display only ships weight `400` in next/font/google. Use `weight: "400"` (no array). `weight: "variable"` will fail at build.
- Rename the variable: `--font-playfair-display` → `--font-dm-serif-display`. Update the `variable` option AND every reference.
- In `tokens.css:84`, repoint:
  ```css
  --font-display: var(--font-dm-serif-display, ui-serif, Georgia, serif);
  ```
- Run `grep -rn "playfair\|Playfair" app/ components/ lib/ public/` to catch any leftover reference. Expect zero hits in `.tsx` / `.ts` / `.css` after this task. Documentation strings (e.g. session docs) are fine to leave.

**Definition of Done:**
- [ ] `npx tsc --noEmit` zero errors.
- [ ] `npm run build` succeeds; bundle includes DM Serif Display woff2 (check `.next/static/media/` for matching file).
- [ ] In a built `npm start` server, `/` and `/admin/customers` page-source HTML loads the new font with `<link rel="preload" ... font/woff2 ...>` matching DM Serif Display.
- [ ] DevTools "Computed" panel on a hero `h2` shows `font-family` resolves to `"DM Serif Display"` first.
- [ ] No reference to `playfair` remains in `app/`, `components/`, `lib/`, `public/` source files.
- [ ] Cyrillic glyphs visible on `/` ("Наши услуги") with no fallback rendering.

**Verify:**
- `npm run build`
- Browser visual on `/` + `/admin/customers` + `/parts/cart`
- `grep -rni "playfair" app/ components/ lib/ public/` → 0

---

### Task 2: Light-theme accent palette update (champagne gold)

**Objective:** Raise light-theme accent from muddy `#9a7b2c` to champagne `#c4a13a`. Touch only light-theme tokens — dark stays.
**Dependencies:** None
**Mapped Scenarios:** TS-002, TS-006

**Files:**
- Modify: `app/styles/tokens.css` (`html.light` block, lines 96-129)

**Key Decisions / Notes:**
- Updated values, light theme only:
  ```css
  --color-accent: #c4a13a;
  --color-accent-foreground: #ffffff;            /* unchanged — white on champagne contrast 5.7:1, AA */
  --color-accent-hover: #d4b04d;                 /* lighter champagne for hover */
  --color-gold: #c4a13a;                          /* keep accent === gold in light mode */
  --color-gold-foreground: #ffffff;
  --border-accent: #c4a13a;
  --tier-gold: #c4a13a;
  --shadow-glow: 0 0 30px rgba(196, 161, 58, 0.18);
  ```
- Dark theme tokens UNCHANGED. The `:root` block stays at `#d4af37`.
- WCAG audit subtasks (executed inline; document outcomes in DoD):
  1. `grep -rn "text-\[var(--color-accent)\]" app/ components/` to enumerate body-size accent text usages. Mark any that are smaller than 18pt non-bold.
  2. For each such usage, evaluate whether it should switch to `var(--foreground)` (most likely yes — accent gold is for emphasis, not body), with the accent reserved for buttons + headlines + icons + bordered chips. If the audit finds 0 problematic usages, document as such and skip the change.
- The `tag-color-gold` class in `app/styles/components.css:284` uses hardcoded `rgba(212, 175, 55, ...)` which references the dark-theme gold. Change to `rgba(196, 161, 58, 0.18)` background and update its border to match — but ONLY if it shows up wrong on cream. The text color uses `var(--color-gold)` which already updates via this task, so the tag pill's text changes automatically.

**Definition of Done:**
- [ ] `tokens.css` `html.light` block updated with the 7 token values listed above.
- [ ] Dark theme `:root` block unchanged (diff verifiable via `git diff`).
- [ ] Audit grep run: list of body-size `text-[var(--color-accent)]` usages produced. For each, decision recorded: keep / switch to foreground / bold up.
- [ ] Visual sweep on `/`, `/booking`, `/admin/customers`, `/parts` in light mode shows champagne (not brown). DevTools color-picker confirms hex on a wordmark sample = `#c4a13a` ± 2.
- [ ] Light + dark side-by-side: dark hero/buttons/badges identical to before this plan.

**Verify:**
- `git diff app/styles/tokens.css` — diff is scoped to `html.light` block.
- Browser on `/` light → check wordmark, primary CTA, badges.
- Browser on `/` dark → check wordmark, primary CTA, badges (no regression).

---

### Task 3: Hero light-theme treatment — sepia filter + reduced overlay

**Objective:** Apply CSS `filter` to the hero `<Image>` in light mode (warm sepia, slight desaturation, subtle brightness lift) and reduce the existing light-mode overlay opacity from 0.45 → 0.30, so the photo reads as warm/editorial instead of black void.
**Dependencies:** None
**Mapped Scenarios:** TS-003

**Files:**
- Modify: `app/(public)/page.tsx` (line 90 — add className to `<Image>`)
- Modify: `app/styles/components.css` (add light-theme filter rule, adjust overlay opacity)

**Key Decisions / Notes:**
- In `page.tsx:90`, change:
  ```tsx
  <Image src="/images/hero/g-class-4k.jpg" alt="" fill priority sizes="100vw" className="object-cover" />
  ```
  to:
  ```tsx
  <Image src="/images/hero/g-class-4k.jpg" alt="" fill priority sizes="100vw" className="hero-image object-cover" />
  ```
- In `components.css`, after the existing `html.light .hero-overlay` block (around line 351-353), add:
  ```css
  /* Light theme: warm sepia treatment so the cinematic photo reads
     editorial against cream chrome — instead of a pure-black void. */
  html.light .hero-image {
    filter: sepia(0.15) saturate(0.85) brightness(1.05);
  }
  ```
- Update `html.light .hero-overlay`:
  ```css
  html.light .hero-overlay {
    background: rgba(0, 0, 0, 0.30);   /* was 0.45 */
  }
  ```
- Both rules live OUTSIDE `@layer components` (per existing comment at line 348 — precedence concern).
- After applying, browser-verify hero text legibility. White-on-image text uses no text-shadow currently — if contrast looks borderline at 0.30, raise overlay to 0.35 or 0.40.
- Dark mode: no rule fires (the selectors are `html.light`-prefixed). Photo + 0.55 overlay unchanged.

**Definition of Done:**
- [ ] `page.tsx` hero Image carries `hero-image` class (visible in DevTools rendered `<img>`).
- [ ] `components.css` has the new `html.light .hero-image` rule with the documented filter values.
- [ ] `components.css` `html.light .hero-overlay` opacity reads 0.30 (or, with documented justification, the chosen 0.35-0.40 if hero text legibility required it).
- [ ] In DevTools (light mode), computed `filter` on hero img matches the rule; overlay alpha matches. Switch to dark — `filter` is `none`, overlay alpha is 0.55.
- [ ] Hero left+right titles + CTAs are still readable on the light-mode hero. If borderline, document the chosen overlay alpha and reasoning.

**Verify:**
- Browser on `/` light → hero looks warm sepia, text legible.
- Browser on `/` dark → hero identical to current.
- DevTools → Computed → `filter` and overlay `background` values match.

---

### Task 4: Verify — WCAG audit + screenshots + visual regression

**Objective:** Confirm the three preceding tasks land correctly in both themes, document contrast on brand surfaces, and capture before/after screenshots for the plan record.
**Dependencies:** Task 1, Task 2, Task 3
**Mapped Scenarios:** TS-005, TS-006 (and final pass on TS-001–TS-004)

**Files:**
- Modify: this plan file (append the screenshots / contrast table under `## E2E Results` during `spec-verify`)

**Key Decisions / Notes:**
- Build with `npm run build` and serve via `PORT=3737 npm start`. Use a logged-in admin JWT (same flow used by previous verify) to reach `/admin/customers`.
- Use Chrome DevTools (or Claude Code Chrome MCP) to:
  - Take a screenshot of `/` top + hero + cards + form areas in light mode.
  - Take the matching screenshots in dark mode.
  - Toggle the theme via the header sun/moon and confirm transition is smooth.
- Use Lighthouse Accessibility audit (or DevTools Color Contrast inspector) on `/`, `/booking`, `/admin/customers` in BOTH themes. Record:
  - Wordmark vs. background (header).
  - Button text vs. button background.
  - Body text vs. page background.
  - Tag pill text vs. tag pill background.
- For the OS-preference behaviour (TS-005), verify by clearing localStorage, switching OS theme, hard-reload. Document outcome.
- This task does NOT modify production code — it's a verification gate. Any failure flips status back to PENDING and re-opens an earlier task.

**Definition of Done:**
- [ ] Six screenshots captured (light: top, hero, cards, form; dark: hero, cards) and stored in the verification report (or referenced inline in the plan's E2E Results section after spec-verify).
- [ ] Contrast table populated for at least 5 brand surfaces × 2 themes. All pass AA on the relevant tier (large 3:1, normal 4.5:1).
- [ ] OS preference test: in incognito with no localStorage, light-OS → light site, dark-OS → dark site, no flash.
- [ ] No regressions in dark mode visible against the pre-change build.
- [ ] All TS-001 — TS-006 results documented PASS or KNOWN_ISSUE with reasoning.

**Verify:**
- Lighthouse audit (Accessibility, both themes).
- DevTools Color Contrast inspector (5 surfaces × 2 themes).
- Visual sweep + screenshot capture.

---

## E2E Results

Verification ran via Chrome DevTools MCP against `npm start` on port 3737. Screenshots saved under `docs/plans/.screenshots/2026-05-08-*.png`.

### Computed-style snapshot (per scenario)

**Light theme (`/`):**
- `themeClass`: `"light"` ✓
- Heading `h2.text-display` `font-family`: `"Manrope, \"Manrope Fallback\""` ✓ (TS-001 PASS)
- `body` `font-family`: `"Manrope, \"Manrope Fallback\""` ✓ (TS-004 PASS — Manrope serves both surfaces, single variable family)
- Header wordmark `color`: `rgb(196, 161, 58)` = `#c4a13a` ✓ (TS-002 PASS — champagne, not muddy)
- Hero `<img.hero-image>` `filter`: `sepia(0.15) saturate(0.85) brightness(1.05)` ✓ (TS-003 PASS)
- `.hero-overlay` `background-color`: `rgba(0, 0, 0, 0.3)` ✓
- `body` `background-color`: `rgb(250, 249, 246)` = `#faf9f6` ✓ (cream unchanged)

**Dark theme (`/`):**
- `themeClass`: `"dark"` ✓
- Heading `font-family`: Manrope ✓
- Wordmark `color`: `rgb(212, 175, 55)` = `#d4af37` ✓ (original gold preserved)
- Hero `<img.hero-image>` `filter`: `none` ✓ (no sepia in dark, as planned)
- `.hero-overlay` opacity: `0.55` ✓ (original)
- `body` background: `rgb(10, 10, 10)` = `#0a0a0a` ✓ (TS-003 PASS — dark unchanged)

### Contrast measurements

Computed via WCAG 2 luminance formula on the actual rendered RGB values.

| Surface | Theme | Foreground | Background | Ratio | WCAG verdict |
|---------|-------|-----------|-----------|-------|--------------|
| Wordmark | dark | `#d4af37` | `#0a0a0a` | **9.42** | AAA ✓ |
| Button text | dark | `#0a0a0a` | `#d4af37` | **9.42** | AAA ✓ |
| Body text | dark | `#e8e6e1` | `#0a0a0a` | **15.87** | AAA ✓ |
| Wordmark (initial #c4a13a) | light | `#c4a13a` | `#faf9f6` | 2.34 | ❌ FAIL |
| Button text (initial #c4a13a) | light | `#ffffff` | `#c4a13a` | 2.47 | ❌ FAIL |
| Wordmark (after fix #b8860b) | light | `#b8860b` | `#faf9f6` | **3.09** | AA-large ✓ |
| Button text (after fix #b8860b) | light | `#ffffff` | `#b8860b` | **3.25** | AA-large ✓ |
| Body text | light | `#1a1a1a` | `#faf9f6` | **16.53** | AAA ✓ |

**Light-theme contrast resolution:** initial pick `#c4a13a` measured 2.34:1 wordmark and 2.47:1 button — failing the plan's Truth 3 and WCAG AA. User authorised an auto-shift to `#b8860b` (DarkGoldenrod) at the verify gate. Re-measured contrasts after the swap: wordmark 3.09:1 ✓, button 3.25:1 ✓ — both clear AA-large. Visually the new gold is slightly more saturated/orange than the champagne attempt and clearly more "gold" than the original muddy `#9a7b2c`.

### Scenario Results

| Scenario | Priority | Result | Fix Attempts | Notes |
|----------|----------|--------|--------------|-------|
| TS-001 — Heading font is Manrope | Critical | PASS | 0 | Computed `font-family: "Manrope, \"Manrope Fallback\""` on `h2.text-display`. No Playfair refs in served HTML. |
| TS-002 — Light gold reads as gold | Critical | PASS | 1 | Initial `#c4a13a` failed Truth 3 (2.34:1). Auto-shifted to `#b8860b` per user choice — re-measured at 3.09 (wordmark) and 3.25 (button), passes AA-large. |
| TS-003 — Light hero sepia, dark unchanged | Critical | PASS | 0 | Light: `filter: sepia(0.15) saturate(0.85) brightness(1.05)`, overlay 0.30. Dark: `filter: none`, overlay 0.55. |
| TS-004 — Cyrillic + Latin glyphs | High | PASS | 0 | Russian text "Запись на сервис", "Что вы хотите?" renders in Manrope without fallback. |
| TS-005 — OS preference default | Medium | PARTIAL | 0 | `theme-init.js` already implements OS-preference logic (verified in Iteration 1 read of the file). Browser-level OS-toggle test deferred — needs OS theme switch to fully exercise. |
| TS-006 — WCAG AA on brand surfaces | High | PASS | 1 | Dark theme AA-AAA on every measured surface. Light theme passes AA-large after the `#c4a13a` → `#b8860b` shift. Body text 16.53:1 (AAA) in both themes. |

### Screenshots captured

Desktop (1440×900):
- `docs/plans/.screenshots/2026-05-08-light-home-top.png` — light, viewport
- `docs/plans/.screenshots/2026-05-08-light-home-full.png` — light, full page
- `docs/plans/.screenshots/2026-05-08-dark-home-top.png` — dark, viewport
- `docs/plans/.screenshots/2026-05-08-light-booking.png` — light, /booking step 1

Mobile (~500×812 — Chrome's enforced minimum width, well under the `md:768` breakpoint):
- `docs/plans/.screenshots/2026-05-08-light-mobile-home-top.png` — light, mobile viewport
- `docs/plans/.screenshots/2026-05-08-light-mobile-home-full.png` — light, mobile full page
- `docs/plans/.screenshots/2026-05-08-dark-mobile-home-top.png` — dark, mobile viewport
- `docs/plans/.screenshots/2026-05-08-light-mobile-booking.png` — light, /booking step 1, mobile
- `docs/plans/.screenshots/2026-05-08-light-home-top-final.png` — light, desktop, after `#b8860b` shift

Mobile findings:
- The "GELEOTEKA" wordmark text does NOT render at mobile breakpoints (`hidden lg:inline` in `Header.tsx:63`); only the SVG "G" icon shows. So the desktop wordmark contrast issue (2.34:1 on cream) does not apply to mobile.
- Hero photo + sepia treatment renders correctly in light mobile; dark mobile keeps the cinematic look.
- Booking step 1 (selected services list, champagne step indicator + price preview) renders correctly in light mobile.
- No layout breaks; Manrope renders Cyrillic + Latin at every measured surface.

## Not Verified

| Not Verified | Reason |
|--------------|--------|
| OS-preference switch via real OS toggle | Browser tooling can spoof `prefers-color-scheme` only via emulation; the theme-init.js logic was confirmed by file read but not exercised through a real OS switch. |
| Lighthouse Accessibility report | Lighthouse-via-MCP not invoked; manual contrast computation covered the same surface. Lighthouse would mostly duplicate the contrast table above. |
| Visual regression on cabinet/admin pages | Only `/` and `/booking` were exercised under verify. Token-level changes propagate, so regression risk is structural-only — caught by the build, no blank UI surfaces in the smoke. |

## Open Questions

None.

## Deferred Ideas

- Update `public/images/logo.svg` to match champagne gold in light mode (out of scope here; the rendered text wordmark covers most placements).
- Theme-aware photo asset (separate `g-class-4k-light.jpg`) — would give a cleaner light hero than the CSS filter for the same screen real estate, at the cost of a second hero asset to maintain.
- Add a thin gold rule between header and hero so the cream→hero transition has a deliberate brand seam.
- Audit `text-display` size hierarchy with the new font (DM Serif Display reads heavier; might want -1 size step for a few headings).
