# Code Quality Audit Implementation Plan

Created: 2026-05-05
Author: aleksandr's.spiskov@gmail.com
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Run a tooling-only audit (jscpd, ts-prune, madge) over the whole codebase and produce a single curated Markdown deliverable at `docs/audits/2026-05-05-code-quality-audit.md` with findings bucketed by axis (Reuse / Modularity / Quality), each ranked High/Medium/Low leverage with a one-paragraph rationale. Driven by `docs/prd/2026-05-04-code-quality-audit.md`.

**Architecture:** Pure tooling-driven analysis — no production code changes. Three CLIs run via `npx` against `app/`, `components/`, `lib/`, write their raw output to `/tmp/audit-2026-05-05/`, then we read-back-and-curate into a Markdown doc committed to `docs/audits/`. Working directory and raw output are transient (not committed). One curated deliverable, dated, never re-edited.

**Tech Stack:** `jscpd@4.0.9` (duplications), `ts-prune@latest` (unused exports), `madge@8.0.0` (cycles + dep graph). Node 23, npm. No new devDependencies installed.

## Scope

### In Scope

- Run `jscpd` against `{app,components,lib}/**/*.{ts,tsx}` with `--min-lines 10 --min-tokens 50`, exclude `**/generated/**`. JSON + Markdown reporters.
- Run `ts-prune` against the project's tsconfig. Filter out Next.js framework exports (`page.tsx` defaults, `layout.tsx` defaults, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts` HTTP-method exports, `metadata`, `dynamic`, `generateStaticParams`, `revalidate`).
- Run `madge` twice: once with `--circular` for cycle detection; once producing a JSON dep-graph for cross-domain inspection.
- Cross-domain inspection: enumerate edges where module A in one component domain (`admin|booking|parts|portal|rentals|shared|ui`) imports from another domain it shouldn't (e.g., `portal → admin`, `public → admin/actions`).
- File-length scan via `wc -l` over the same glob; flag files > 800 lines per project rules.
- Triage all four raw outputs — drop confirmed false positives — and bucket surviving findings into three axes (Reuse / Modularity / Quality).
- Rank each finding **High / Medium / Low** leverage with a one-paragraph rationale (what fixing it unlocks, what it costs to leave, dependencies between findings).
- Curate a "Top 10" summary at the top of the deliverable.
- Write the deliverable to `docs/audits/2026-05-05-code-quality-audit.md` and commit.

### Out of Scope

- **Any actual refactoring.** Audit produces a doc, not code changes. Each high-leverage finding becomes its own downstream `/spec`.
- **Manual file-by-file review.** Intent-level smells (poor abstractions, naming, ghost constraints) wait for a separate manual-review pass.
- **TypeScript-strict re-audit.** `noUncheckedIndexedAccess` etc. is a separate pass.
- **Convention-deviation review** against `.claude/rules/geleoteka-conventions.md`.
- **Persistent tooling install.** No `devDependencies`, no `npm run audit:*`, no GitHub Action / CI gate.
- **Performance / security / accessibility / Prisma schema audits.** Separate initiatives.
- **Updating the audit doc as fixes land.** It's a dated snapshot. Future audits = new dated file.

## Approach

**Chosen:** Three-task linear pipeline — `Run tooling` → `Triage and bucket` → `Write deliverable + commit`.

**Why:** Each phase has a distinct deliverable (raw outputs, triaged findings, final Markdown) and a distinct verifiability signal. Linear keeps the implementer from interleaving triage with tool runs and accidentally biasing the output. The cost is one extra context switch between phases — acceptable since the whole audit is bounded.

**Alternatives considered:**
- **One mega-task.** Would entangle running with curating; harder to verify intermediate state.
- **Per-axis tasks (one task per axis).** Tools produce mixed output (jscpd contributes to Reuse, madge contributes to Modularity, ts-prune contributes to Quality), so axis-per-task would force redundant per-task tool runs.
- **Persistent tooling + CI gate.** Out of scope per PRD.

## Context for Implementer

> Write for an implementer who has never seen the codebase.

- **Project rules to respect when filtering tool output:**
  - Prisma client is imported from `@/app/generated/prisma/client` (custom output path) — `app/generated/**` MUST be excluded from every tool. Already excluded by jscpd `--ignore`; confirm in ts-prune (its `.tsprunerc` or CLI flags) and madge (use `--exclude` if needed).
  - `page.tsx` `default export` looks unused to ts-prune but is a Next.js framework entry point — drop these.
  - `layout.tsx` `default export`, `loading.tsx`, `error.tsx`, `not-found.tsx` defaults — drop.
  - `route.ts` named exports `GET`/`POST`/`PUT`/`PATCH`/`DELETE`/`OPTIONS` are framework HTTP handlers — drop.
  - Special Next.js page-level exports: `metadata`, `dynamic`, `revalidate`, `runtime`, `generateStaticParams`, `generateMetadata` — drop if appearing in `page.tsx`/`layout.tsx`/`route.ts`.
- **Component domain boundaries (for madge cross-domain check):**
  - `components/admin` — admin-panel only; should not be imported by anything outside `app/(admin)`.
  - `components/booking` — booking flow on public site.
  - `components/parts` — parts catalog on public + cart on portal.
  - `components/portal` — client cabinet only; should not be imported by `app/(public)` or `app/(admin)`.
  - `components/rentals` — rentals on public + admin uses some.
  - `components/shared` — cross-cutting; importable from anywhere.
  - `components/ui` — currently empty per project rules; flagging anything here is an architectural marker.
- **Route-group boundaries (for cross-route-group imports via `app/`):**
  - `app/(public)` should not import from `app/(admin)` or `(portal)/(cabinet)`.
  - `app/(admin)` may import from `app/actions/admin.ts` etc.; cross-route-group action imports are usually fine.
  - `app/(cabinet)` is a TOP-LEVEL ROUTE GROUP that currently contains zero `.ts/.tsx` files — only empty subdirectories (`cars`, `history`, `loyalty`, `notifications`, `tracking`). The actual portal pages live under `app/(portal)/cabinet/`. The empty `(cabinet)` skeleton is a candidate Code Quality finding ("ghost structure") that the audit should surface — and the cross-domain script should NOT spuriously flag the empty-dir absence as a violation.
- **Known duplication signals to confirm with tools (PRD context):**
  - `defaultContact` pattern (server-side `getSession()` → form prefill) implemented in `app/(public)/parts/cart/page.tsx` AND `app/(public)/booking/step-3/page.tsx`. jscpd should pick this up; if so, candidate for extraction.
  - `useSyncExternalStore` cached-snapshot pattern repeated in `lib/my-car-store.ts`, `components/booking/BookingProvider.tsx`, `components/parts/PartsCart.tsx`.
  - `(cabinet)` and `(portal)` route groups co-exist (memo'd as "Alternative portal layout") — suspect legacy.
- **Working directory convention:** raw tool outputs land in `/tmp/audit-2026-05-05/` (transient, not committed). The committed deliverable is `docs/audits/2026-05-05-code-quality-audit.md`.
- **Tooling-output read pattern (avoid context blowup):** jscpd JSON, ts-prune text, and madge cycle/JSON outputs can be tens of KB. Read them via `Read` only after confirming size with `wc -l`/`wc -c`. For huge files, use targeted greps to extract relevant sections. Or use `node` one-liners to parse JSON and emit summary tables — most efficient.

## Runtime Environment

This audit produces no running artifact. The codebase itself runs via `npm run dev` (port 443, HTTPS) for verification of unrelated work; not relevant to this plan. Verification is "the deliverable file exists, is well-formed, and reflects the actual tool output."

## Assumptions

- `/tmp/audit-2026-05-05/` is acceptable as a transient output dir (not committed). Supported by PRD §"Tool noise filter" implying intermediate output is throwaway. Tasks 1, 2, 3 depend on this.
- `jscpd@4.0.9`, latest `ts-prune`, `madge@8.0.0` are the right versions and are already cached in npx (verified during planning). Task 1 depends on this; if a tool fails to run, fall back to its previous major.
- The "Top 10" summary count is a soft target (5–10 per PRD); we'll write up to 10 but won't pad if there are fewer high-leverage items. Task 3 depends on this.
- jscpd `--min-lines 10 --min-tokens 50` is the right noise threshold. Lower = more dups (mostly trivial); higher = fewer findings (may miss the duplications we already know about). Tuning is allowed if zero structural duplicates surface — if zero, lower min-lines to 6 and re-run. Task 1 depends on this.
- Cross-domain edges in `app/` route groups are detectable by inspecting madge JSON edges and matching the source/target prefix paths. Madge does not have a built-in "cross-group" filter; we implement that filter in a small node script as part of Task 2. Task 2 depends on this.
- Files > 800 lines is a meaningful "code quality" signal per project rules; <800 is fine, >1000 must be flagged. Task 2 depends on this.
- The deliverable is a snapshot: never re-edited as fixes land; future re-audits get a new dated file. Task 3 depends on this convention.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Tool output is overwhelming and triage takes hours of context | Medium | Medium | Read raw outputs only via small `node` parser scripts that emit summary tables (counts per category, top-N per metric). Avoid loading entire JSON dumps into the conversation. Cap effort: drop noisy hits aggressively — when in doubt, exclude with a one-line justification in the deliverable's "Filtered" section. |
| ts-prune flags hundreds of Next.js framework exports as unused | High | Medium | Pre-built exclusion list (see Context for Implementer above). Apply via a small post-process node script that reads ts-prune output line-by-line and drops matches against the exclusion list. Confirm in the deliverable's appendix that the exclusion list was applied. |
| `npx` versions drift between local + future re-runs | Low | Low | Pin versions in the deliverable's "Tooling" appendix (`jscpd@4.0.9`, etc.) so a future audit can repro. The PRD already says re-runs produce new dated files — version drift is a re-audit concern, not this audit's. |
| madge cross-domain "violations" are intentional architecture (e.g., `(public)` rendering an admin shared util) | High | Medium | Triage step (Task 2) requires a manual pass over each cross-domain edge. Justified edges go in the deliverable's "Filtered" section with a sentence each. Unjustified edges become findings. |
| Tool runs are slow on a 140-file repo + Prisma generated noise | Low | Low | jscpd `--ignore "**/generated/**,**/.next/**,**/migrations/**"`. ts-prune does NOT inherit tsconfig excludes — pass `--ignore 'app/generated\|.next'` explicitly. madge `--exclude '^app/generated\|^\.next'`. Each tool should finish in < 30s. |
| Findings list is empty (codebase happens to be clean) | Low | Low | Acceptable outcome. The deliverable still exists, says "Top 10: none — codebase is in good shape", documents the tools and thresholds for future re-runs. |

## Goal Verification

### Truths

1. **Deliverable file exists** at `docs/audits/2026-05-05-code-quality-audit.md` and is committed to git.
2. **Three axis sections** are present in the deliverable, named exactly: "Reuse over duplication", "Modularity / module independence", "Code quality".
3. **Each finding** has: (a) location reference (file path or `file:line` or symbol name), (b) leverage rating (`High` / `Medium` / `Low`), (c) one-paragraph rationale.
4. **Top summary** at the top of the doc lists up to 10 highest-leverage findings (or fewer if the codebase is genuinely cleaner than that).
5. **Tooling appendix** at the bottom of the doc records the exact CLI invocations + tool versions used (so future re-audits are reproducible) and a "Filtered" subsection naming false-positive categories that were dropped (e.g., "Next.js framework exports").
6. **No production code changes** in the same commit as the audit doc — only the deliverable + any tiny script files (in `scripts/audit/` if needed) added to the repo.
7. **PRD assumptions held**: jscpd ran with `--min-lines 10 --min-tokens 50`, ts-prune output filtered Next.js framework exports, madge ran cycles + cross-domain. The Tooling appendix is the verification anchor.

### Artifacts

- `docs/audits/2026-05-05-code-quality-audit.md` — the deliverable (Task 3).
- (Optional) `scripts/audit/filter-ts-prune.mjs` — small node script that filters ts-prune output against the Next.js exclusion list (Task 2). Committed only if used.
- (Optional) `scripts/audit/cross-domain-edges.mjs` — node script that reads madge JSON dep graph and emits cross-domain violations (Task 2). Committed only if used.

## Progress Tracking

- [x] Task 1: Run jscpd / ts-prune / madge / file-length scan; capture raw outputs to `/tmp/audit-2026-05-05/`
- [x] Task 2: Triage raw outputs into three axes; rank findings High/Medium/Low; produce a structured findings list
- [x] Task 3: Write `docs/audits/2026-05-05-code-quality-audit.md` (Top 10 + axis sections + Tooling appendix); commit

      **Total Tasks:** 3 | **Completed:** 3 | **Remaining:** 0

## Implementation Tasks

### Task 1: Run tooling — capture raw outputs

**Objective:** Run all four detectors (jscpd, ts-prune, madge, wc -l) against the codebase with the PRD-specified thresholds. Land raw outputs in `/tmp/audit-2026-05-05/` for the next task to consume.

**Dependencies:** None
**Mapped Scenarios:** None (Minimal runtime profile — no E2E)

**Files:**
- Create: `/tmp/audit-2026-05-05/jscpd/jscpd-report.json` (jscpd writes inside a subdir named after `--output`)
- Create: `/tmp/audit-2026-05-05/jscpd/jscpd-report.md`
- Create: `/tmp/audit-2026-05-05/ts-prune.txt`
- Create: `/tmp/audit-2026-05-05/madge-cycles.txt`
- Create: `/tmp/audit-2026-05-05/madge-graph.json`
- Create: `/tmp/audit-2026-05-05/file-lengths.txt`
- Create: `/tmp/audit-2026-05-05/run.log` (timestamp + command + exit code per tool, for the deliverable's Tooling appendix)

**Key Decisions / Notes:**
- Use `Bash` with the working directory set to the repo root. Each command runs sequentially (not parallel) so failures are easy to attribute.
- Exact commands (lock these in the run.log):
  ```bash
  mkdir -p /tmp/audit-2026-05-05

  # The brace pattern is quoted intentionally — jscpd handles brace expansion
  # internally. Do not unquote — the shell would expand the braces and pass
  # multiple positional patterns that jscpd doesn't expect.
  # Scope includes prisma/ per PRD In Scope.
  npx --yes jscpd@4.0.9 \
    --pattern "{app,components,lib,prisma}/**/*.{ts,tsx}" \
    --ignore "**/generated/**,**/node_modules/**,**/.next/**,**/migrations/**" \
    --min-lines 10 \
    --min-tokens 50 \
    --reporters json,markdown \
    --output /tmp/audit-2026-05-05/jscpd \
    > /tmp/audit-2026-05-05/jscpd-stdout.txt 2>&1

  # ts-prune does NOT inherit tsconfig excludes; pass --ignore explicitly. Without
  # this flag the output is ~hundreds of lines of false positives from
  # app/generated/prisma/*.ts and .next/types/routes.d.ts.
  # Capture the actual version into run.log so re-runs can be reproduced.
  npx --yes ts-prune --version 2>/dev/null >> /tmp/audit-2026-05-05/run.log || true
  npx --yes ts-prune --ignore 'app/generated|.next' \
    > /tmp/audit-2026-05-05/ts-prune.txt 2>&1

  # madge writes a spinner to stderr; without --no-spinner --no-color and with
  # 2>&1 the JSON file gets ANSI sequences prepended and JSON.parse fails.
  npx --yes madge@8.0.0 --circular --extensions ts,tsx \
    --no-spinner --no-color \
    --exclude '^app/generated|^\\.next' \
    app components lib prisma \
    > /tmp/audit-2026-05-05/madge-cycles.txt

  npx --yes madge@8.0.0 --json --extensions ts,tsx \
    --no-spinner --no-color \
    --exclude '^app/generated|^\\.next' \
    app components lib prisma \
    > /tmp/audit-2026-05-05/madge-graph.json

  # File-length scan covers all PRD-In-Scope dirs (app, components, lib, prisma).
  find app components lib prisma -type f \( -name "*.ts" -o -name "*.tsx" \) \
    ! -path "*/generated/*" \
    ! -path "*/migrations/*" \
    -exec wc -l {} \; \
    | sort -rn \
    > /tmp/audit-2026-05-05/file-lengths.txt
  ```
- Confirm each tool exited 0 (or with expected non-zero — ts-prune exits non-zero when it has findings, that's fine). Log exit codes.
- Confirm `wc -l` of each output file is non-zero (an empty file means the tool failed silently). If empty, re-run with `--debug` or report in run.log.

**Definition of Done:**

- [ ] `/tmp/audit-2026-05-05/jscpd.json` exists, non-empty, valid JSON (`node -e "JSON.parse(require('fs').readFileSync('/tmp/audit-2026-05-05/jscpd/jscpd-report.json','utf8'))"` exits 0 — note jscpd writes to a subdir under `--output`).
- [ ] `/tmp/audit-2026-05-05/ts-prune.txt` exists; line count recorded in run.log.
- [ ] `/tmp/audit-2026-05-05/madge-cycles.txt` exists; "No circular dependency found." OR a list of cycles.
- [ ] `/tmp/audit-2026-05-05/madge-graph.json` exists, valid JSON, contains an object whose keys are file paths.
- [ ] `/tmp/audit-2026-05-05/file-lengths.txt` exists, sorted descending, header line shows the largest file's line count.
- [ ] `/tmp/audit-2026-05-05/run.log` records: tool, version, command, exit code, output size for each of the four detectors.

**Verify:**
- `ls -la /tmp/audit-2026-05-05/` — all expected files present.
- `cat /tmp/audit-2026-05-05/run.log` — every detector logged a 0 or expected exit code.

---

### Task 2: Triage raw outputs — bucket and rank findings

**Objective:** Read the raw outputs from Task 1, drop confirmed false positives, group surviving findings into three axes (Reuse / Modularity / Quality), rank each High/Medium/Low leverage, and produce an in-memory structured findings list ready for Task 3 to render.

**Dependencies:** Task 1
**Mapped Scenarios:** None

**Files:**
- (Optional) Create: `scripts/audit/filter-ts-prune.mjs` — node script applying the Next.js exclusion list to ts-prune output. Commit only if it ends up in use; otherwise leave the filtering inline in the deliverable's appendix.
- (Optional) Create: `scripts/audit/cross-domain-edges.mjs` — node script reading madge JSON and emitting cross-domain edges per the boundaries defined in Context for Implementer.
- (No code changes outside `scripts/audit/` — production source untouched.)

**Key Decisions / Notes:**
- **ts-prune exclusion list** (apply in `filter-ts-prune.mjs` or inline as a `grep -v -f exclusions.txt` pipeline):
  - Match by file path + symbol name. Drop entries where:
    - File matches `app/**/page.tsx` AND symbol is `default`, `metadata`, `dynamic`, `revalidate`, `runtime`, `generateStaticParams`, `generateMetadata`, `fetchCache`
    - File matches `app/**/layout.tsx` AND symbol is `default`, `metadata`, `dynamic`, `revalidate`, `generateMetadata`
    - File matches `app/**/loading.tsx`, `app/**/error.tsx`, `app/**/not-found.tsx`, `app/**/template.tsx` AND symbol is `default`
    - File matches `app/**/route.ts` AND symbol is one of `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`, `dynamic`, `revalidate`
    - File matches `**/middleware.ts` AND symbol is `middleware` or `config` (Next.js middleware convention)
    - File is `next.config.ts` AND symbol is `default`
    - File is `prisma.config.ts` AND symbol is `default`
    - File is `prisma/seed.ts` — skipped entirely (no exports; runs as a script)
    - File is `prisma/seed-vehicles.ts` AND symbol is `seedVehicleCatalog` (consumed by seed.ts via dynamic-ish import that ts-prune may not trace)
- **Cross-domain rules** (apply in `cross-domain-edges.mjs` or inline):
  - Domain prefixes: `components/admin`, `components/booking`, `components/parts`, `components/portal`, `components/rentals`, `components/shared`, `components/ui`.
  - Route groups: `app/(admin)`, `app/(public)`, `app/(portal)`, `app/(cabinet)`.
  - Forbidden edges (each violation is a Modularity finding):
    - `components/portal/*` → `components/admin/*`
    - `components/admin/*` → `components/portal/*`
    - `components/parts/*` → `components/admin/*`
    - `components/booking/*` → `components/admin/*`
    - `components/booking/*` → `components/portal/*`
    - `app/(public)/**` → `app/(admin)/**`
    - `app/(public)/**` → `components/admin/**`
    - `app/(portal)/**` → `app/(admin)/**`
    - `app/(portal)/**` → `components/admin/**`
  - Allowed edges (do NOT flag): anything → `components/shared/*`, anything → `lib/*`, server actions in `app/actions/` cross-imported from any route group (server actions are global by convention).
  - Note: `app/(cabinet)` is currently a top-level directory with empty subdirs only — no `.ts/.tsx` files exist there. The actual portal lives at `app/(portal)/cabinet/`. The empty `(cabinet)` dirs are themselves a candidate Quality finding (ghost structure). The cross-domain script should treat `app/(cabinet)/**` with the same boundary rules as `app/(portal)/**` if any file ever appears there.
- **Leverage rubric:**
  - **High** — fixing it removes ≥ 2 future bug surfaces or unlocks an obvious extraction (e.g., `defaultContact` pattern duplicated 3 times = High; one stray cross-domain import = Medium).
  - **Medium** — fixing it improves clarity but doesn't move the needle on bugs. Most things end up here.
  - **Low** — cosmetic or single-instance; mention in the deliverable but don't recommend tackling soon.
- **Triage outputs to capture for Task 3** (in-memory data structure or `/tmp/audit-2026-05-05/findings.json`):
  ```json
  {
    "axes": {
      "reuse": [{ "title": "...", "evidence": ["file:line", ...], "leverage": "High|Medium|Low", "rationale": "..." }],
      "modularity": [...],
      "quality": [...]
    },
    "filtered": {
      "ts_prune_framework_exports": 0,
      "madge_allowed_edges": 0,
      "jscpd_trivial_below_threshold": 0
    },
    "tooling": { "jscpd": "4.0.9", "tsPrune": "...", "madge": "8.0.0" }
  }
  ```
- **Performance note:** Use `node` one-liners or short `.mjs` scripts to parse JSON / filter text. Do NOT load full raw outputs into the conversation context — they're large (jscpd JSON can be 50KB+). Read summaries only.

**Definition of Done:**

- [ ] Every finding in the structured list has all four fields (title, evidence, leverage, rationale) — no placeholders, no "TBD".
- [ ] Each axis has a finding count recorded; if any axis is empty, document why (e.g., "Modularity: zero cycles, zero forbidden cross-domain edges — codebase respects boundaries").
- [ ] The three known PRD-flagged duplication signals (`defaultContact`, `useSyncExternalStore` cached snapshot, `(cabinet)` vs `(portal)`) are explicitly addressed in the Reuse axis — either as findings or with a sentence explaining why the tools didn't flag them.
- [ ] The `filtered` section enumerates how many entries were dropped per category, so the deliverable can show the noise/signal ratio.

**Verify:**
- `cat /tmp/audit-2026-05-05/findings.json | node -e "const j = JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(Object.keys(j.axes).map(a => a + ':' + j.axes[a].length).join(' '));"` — prints axis-by-axis finding counts.
- Sanity-spot-check: confirm at least one of the PRD-flagged signals (e.g., `defaultContact`) appears in the `reuse` axis. If absent, justify in the `filtered` section or re-run jscpd with a lower min-lines.

---

### Task 3: Write deliverable + commit

**Objective:** Render the triaged findings into a Markdown deliverable at `docs/audits/2026-05-05-code-quality-audit.md`, commit, and push. The doc is the single artifact a reader needs to scan + pick the highest-leverage items.

**Dependencies:** Task 1, Task 2
**Mapped Scenarios:** None

**Files:**
- Create: `docs/audits/2026-05-05-code-quality-audit.md`
- (Possibly) Commit: `scripts/audit/*.mjs` if scripts were used in Task 2.

**Key Decisions / Notes:**
- **Document structure** (lock these section headings):
  ```markdown
  # Code Quality Audit — 2026-05-05

  Generated by: tooling-only run (jscpd / ts-prune / madge / wc -l).
  Plan: docs/plans/2026-05-05-code-quality-audit.md
  PRD: docs/prd/2026-05-04-code-quality-audit.md

  ## Top Findings (highest leverage first)

  | # | Axis | Title | Leverage | Evidence |
  |---|------|-------|----------|----------|
  | 1 | Reuse | ... | High | ... |
  ...

  ## Reuse over duplication

  ### [Title] — High
  **Evidence:** file:line, file:line, ...
  **Rationale:** one paragraph.

  ## Modularity / module independence

  ### [Title] — High
  **Evidence:** ...
  **Rationale:** ...

  ## Code quality

  ### [Title] — Medium
  **Evidence:** ...
  **Rationale:** ...

  ## Filtered (false positives + intentional)

  - **Next.js framework exports** (N entries): `page.tsx` `default`, `layout.tsx` `metadata`, `route.ts` `GET/POST/...`. Dropped because these are required entry points.
  - **Allowed cross-domain edges** (N): anything → `components/shared`, anything → `lib`. Dropped because these are by convention global.
  - **Trivial duplications below threshold** (N implied by jscpd's own `--min-lines 10 --min-tokens 50` setting). Dropped via tool config, not post-processing.

  ## Tooling

  - jscpd: `4.0.9` — `--min-lines 10 --min-tokens 50 --pattern "{app,components,lib}/**/*.{ts,tsx}" --ignore "**/generated/**"`.
  - ts-prune: `0.10.3` (npm `ts-prune@latest` at audit time) — default config, post-filtered against the Next.js convention list.
  - madge: `8.0.0` — `--circular --extensions ts,tsx --exclude '^app/generated' app components lib`; plus a JSON dep-graph run for cross-domain inspection.
  - File-length scan: `find ... -exec wc -l \;` over the same glob; threshold > 800 lines per project rules.

  ## Reproducing this audit

  Plan file at `docs/plans/2026-05-05-code-quality-audit.md` documents the exact CLI invocations + tool versions. Re-running on a future date should produce a new dated file (e.g., `docs/audits/2026-08-XX-code-quality-audit.md`) — this audit is a snapshot.
  ```
- **Top Findings count:** up to 10. Stop early if there are fewer high-leverage items — don't pad with low-leverage to hit the number.
- **Per-finding evidence formatting:** prefer `file:line` when the tool gives it; fall back to `symbol@file` or `file (entire file)` when not. For jscpd dups, list both ends of the pair: `app/(public)/parts/cart/page.tsx:1-30 ↔ app/(public)/booking/step-3/page.tsx:1-30`.
- **Length sanity:** total deliverable should fit in ~300–600 lines. If approaching 1000+ lines, the leverage filter wasn't aggressive enough — re-triage Low-leverage items into the Filtered section.
- **Performance note:** rendering is straight string-templating; no hot path. Generate the Markdown in a short node script or inline in the implementation phase — either is fine.

**Definition of Done:**

- [ ] `docs/audits/2026-05-05-code-quality-audit.md` exists. (Note: a markdownlint sanity check via `npx --yes markdownlint-cli2 docs/audits/2026-05-05-code-quality-audit.md` is recommended but not a gate — it's a style linter, not a correctness check.)
- [ ] All section headings match the structure above.
- [ ] Top Findings table has up to 10 rows, each with all four columns filled.
- [ ] Each axis section has at least the per-finding fields (Evidence, Rationale, Leverage). Empty axis is acceptable IF the deliverable explains why.
- [ ] Tooling appendix lists exact CLI invocations + tool versions matching what was actually run in Task 1.
- [ ] No `TBD` / `TODO` / `FIXME` / placeholder text anywhere in the deliverable.
- [ ] Committed with message `docs(audit): code-quality audit 2026-05-05` (or similar) and pushed to origin/main.
- [ ] No production code changes in the same commit (only `docs/audits/...` + optionally `scripts/audit/*`).

**Verify:**
- `ls -l docs/audits/2026-05-05-code-quality-audit.md` — file exists.
- `wc -l docs/audits/2026-05-05-code-quality-audit.md` — ≤ 1000 lines.
- `grep -nEi "TBD|TODO|FIXME" docs/audits/2026-05-05-code-quality-audit.md` — no matches.
- `git log -1 --stat docs/audits/2026-05-05-code-quality-audit.md` — appears in the most recent commit; production code paths (app/, components/, lib/, prisma/) are NOT in the same commit.
