# Code Quality Audit (Tooling-Only)

Created: 2026-05-04
Author: aleksandr's.spiskov@gmail.com
Category: Documentation
Status: Final
Research: None

## Problem Statement

The Geleoteka codebase iterated fast through six rounds of polish on the public-site v2 effort, plus several earlier feature waves (data-model redesign, public-site-refresh, booking flows, parts catalog, portal). After that velocity, structural debt has likely accumulated — duplicated patterns across components, modules importing across boundaries they shouldn't, dead exports, and shared logic that grew in place instead of being extracted. Before committing to any refactor program, we want **visibility** into what's accumulated, ranked by impact, so we can pick the highest-leverage fixes deliberately rather than chase whatever's most recent in memory. The deliverable is a single audit document; refactors are downstream.

## Core User Flows

This is an internal engineering deliverable, not a user-facing feature. The "user" is the developer (the codebase owner) who reads the audit doc to decide what to fix next.

### Flow 1: Generate the audit

1. Developer runs the three audit tools via `npx` against the working tree (no install). Sensible thresholds prevent noise (jscpd min 10 lines / 50 tokens; madge cycles-only; ts-prune ignoring re-exports).
2. Raw tool output is captured to a working directory (e.g., `/tmp/audit-<date>/`).
3. The audit produces a curated Markdown document at `docs/audits/2026-05-04-code-quality-audit.md` containing:
   - One section per axis (Reuse / Modularity / Quality).
   - Each finding lists evidence (file:line refs or symbol names) + a one-paragraph rationale + a leverage rating (High / Medium / Low).
   - A short "Top 5–10" summary at the top of the document.
4. Developer commits the audit doc to the repo.

### Flow 2: Act on the audit

1. Developer opens the audit doc, scans the Top section.
2. For each High-leverage item the developer wants to tackle, they invoke `/spec` (or `/prd` if more open-ended) with the finding as input. That spec is its own bounded effort.
3. Refactor lands; the audit doc stays as a historical snapshot — it is not re-edited as items are fixed (a future audit run produces a new dated doc instead).

## Scope

### In Scope

- **Audit run** of the whole codebase: `app/`, `components/`, `lib/`, `prisma/` — excluding `app/generated/` and `node_modules/`.
- **Three tools, one-shot via `npx`:**
  - **jscpd** — duplicated code blocks. Threshold: min 10 lines / 50 tokens. Ignore generated code.
  - **ts-prune** — unused exports across the TypeScript graph. Ignore exports re-exported from index files; ignore Next.js convention exports (`page.tsx` default exports, `layout.tsx`, route handlers, `metadata`, etc.) which look unused but are framework entry points.
  - **madge** — module dependency cycles + cross-domain import violations. The audit explicitly checks for component-domain bleed: `components/portal` should not import from `components/admin`, `app/(public)` should not pull from `(admin)` actions, etc.
- **Findings bucketing** into three axes corresponding to the user's priorities:
  - **Reuse over duplication** — jscpd output, plus any near-duplicates surfaced by inspection of jscpd clones (e.g., two components with the same structure but different field names).
  - **Modularity / module independence** — madge cycles + cross-domain imports.
  - **Code quality** — ts-prune dead exports + any oversized files (>800 lines per project rules) detected via `wc -l`.
- **Leverage ranking** for each finding (High / Medium / Low) with one-paragraph rationale: what fixing it unlocks, what it costs to leave, dependency on other findings.
- **Single Markdown deliverable** at `docs/audits/2026-05-04-code-quality-audit.md` committed to the repo.
- **Tool noise filter** — manually triage tool output before writing findings. Examples to drop: jscpd hits inside generated files (already excluded but double-check), ts-prune hits on framework-required exports, madge edges that are intentional layered architecture.

### Explicitly Out of Scope

- **Any actual refactoring.** The audit produces a report, not code changes. Each high-leverage finding becomes a separate downstream PRD/spec.
- **Manual file-by-file review.** Intent-level issues (poor abstractions, naming, ghost constraints) are not surfaced by the tools — those wait for a separate manual-review pass if and when the user wants one.
- **TypeScript-strict re-audit.** Stricter compiler flags (e.g., `noUncheckedIndexedAccess`) would surface type-safety gaps but require a separate pass.
- **Convention-deviation review** against `.claude/rules/geleoteka-conventions.md` (Prisma type-cast pattern, useSyncExternalStore cached snapshot, no `requireRole` in pages, etc.). Convention enforcement is a separate concern.
- **Persistent tooling install.** No `devDependencies` additions, no `npm run audit:*` scripts, no GitHub Action / CI gate. If repeatable enforcement is wanted later, that's a separate PRD.
- **Performance / security / accessibility audits.** Each is its own initiative.
- **Prisma schema audit.** The schema is in scope only insofar as TypeScript code references it; schema-level concerns (e.g., denormalized `Part.compatibleModels: string[]` already flagged in the v2 plan as deferred) are not re-audited here.
- **Auth / permission boundary review.** Belongs in a security audit.
- **Updating the audit doc as fixes land.** It's a dated snapshot. Future audits get new files.

## Technical Context

- **Project shape:** ~130 `.ts/.tsx` files (excluding Prisma generated). Six component domains: `admin`, `booking`, `parts`, `portal`, `rentals`, `shared`, plus an empty `ui` directory. Four route groups: `(admin)`, `(cabinet)`, `(portal)`, `(public)`. Sixteen server-action files in `app/actions/`. Ten files in `lib/`.
- **Notable existing duplication signals to confirm with tools:**
  - `(cabinet)` and `(portal)` route groups co-exist (memo'd as "Alternative portal layout") — suspect legacy duplication worth surfacing.
  - The `defaultContact` pattern (server-side `getSession()` → form prefill) was implemented twice this session: `app/(public)/parts/cart/page.tsx` + `app/(public)/booking/step-3/page.tsx`. jscpd may pick this up; if so, candidate for extraction into a `lib/session-defaults.ts`.
  - `useSyncExternalStore` cached-snapshot pattern is repeated in at least `lib/my-car-store.ts`, `components/booking/BookingProvider.tsx`, and `components/parts/PartsCart.tsx`.
- **Project rules to respect when interpreting tool output:**
  - Prisma client is imported from `@/app/generated/prisma/client` (custom output path); explicit type assertions are intentional per `geleoteka-conventions.md`.
  - `page.tsx` default exports look "unused" to ts-prune but are Next.js framework entry points — must be filtered.
- **Tooling targets** (`npx`, no install):
  - `npx jscpd@latest --pattern "{app,components,lib}/**/*.{ts,tsx}" --ignore "**/generated/**" --min-lines 10 --min-tokens 50 --reporters json,markdown --output /tmp/audit-<date>/jscpd`
  - `npx ts-prune@latest --error 2>&1 > /tmp/audit-<date>/ts-prune.txt` (or equivalent)
  - `npx madge@latest --circular --extensions ts,tsx app components lib > /tmp/audit-<date>/madge-cycles.txt`; plus a second invocation generating the dependency graph for cross-domain inspection.
  - Exact flags / versions to be finalized during `/spec` planning; the above are working assumptions.
- **No CI integration, no package.json edits.** All commands are ephemeral.

## Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Initiative shape | Audit-only (no refactor bundled) | After 6 polish iterations, visibility on accumulated debt is more valuable than racing to fix; refactors get their own bounded PRDs. |
| Detection method | Tooling-only (jscpd + ts-prune + madge) | Mechanical findings are reproducible and unbiased. Manual review surfaces different signals (intent, naming) and is a separate concern if the user wants it. |
| Persistence | One-shot via `npx`, no devDependencies | The user wants a snapshot, not an ongoing system. CI gates and `audit:*` scripts can be a follow-up if the team decides regression-prevention is worthwhile. |
| Output depth | Findings + leverage ranking + rationale (no fix-shape suggestions) | High/Medium/Low + a paragraph each is enough to scan and pick top items. Suggested fix shapes belong in the per-finding `/spec`, not here. |
| Scope width | Whole codebase | User explicitly selected this. Bounding to subsystems would miss cross-cutting issues (e.g., a duplicated pattern that spans public + portal). |
| Where the doc lives | `docs/audits/2026-05-04-code-quality-audit.md` | Distinct from `docs/plans/` (specs) and `docs/prd/` (requirements). Dated filename so future audits live alongside without overwriting. |
| Updating the audit | Never (dated snapshot) | Updating in place would lose history. Re-audits create a new dated file. |
| Scope of `prisma/` | TypeScript references only | Schema-level concerns (denormalized fields, missing relations) are already tracked in the v2 plan's deferred-PRD list and don't belong here. |
