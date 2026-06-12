# Resolve PR #1 — Land `expandCellSpec` extraction

## Overview

**Problem**: [PR #1](https://github.com/0pt1m1sm/geleoteka/pull/1) (`refactor(warehouse): move expandCellSpec to lib/warehouse/codes`) is APPROVED in review (0 critical / 0 high / 0 medium; 1 LOW explicitly deferred) but cannot merge because the `Verify` GitHub Actions workflow fails at the `Generate Prisma client` step with `Missing required environment variable: DATABASE_URL`. The blocker is CI infra, not the diff itself.

**Solution**: (1) Unblock CI by tolerating a missing `DATABASE_URL` during `prisma generate` (the schema-only step) on the PR branch's `.github/workflows/verify.yml`. (2) Realize the move's stated benefit by adding a `scripts/verify-cell-codes.ts` verifier — the explicit motivation in the PR body was that `expandCellSpec` was "un-unit-testable without the Next.js runtime". (3) Merge PR #1.

**Branch**: `archon/task-archon-architect-1781275339869` (the PR #1 head branch; pushes here re-run `Verify` and unblock merge)

---

## Goals & Success

### Primary Goal

Drive PR #1 (https://github.com/0pt1m1sm/geleoteka/pull/1) from `OPEN, checks failing` to `MERGED` without regressing behaviour and without expanding scope beyond what the review explicitly recommended.

### Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| `Verify` workflow on PR #1 head | `success` | `gh pr checks 1 --repo 0pt1m1sm/geleoteka` |
| PR #1 merge state | `MERGED` | `gh pr view 1 --repo 0pt1m1sm/geleoteka --json state` |
| `expandCellSpec` behaviour | byte-identical to pre-PR | `verify-cell-codes.ts` exits 0; outputs match documented examples |
| Diff additions outside scope | 0 | `git diff main...HEAD --stat` — only the CI workflow file + the new verify script touched |

### Non-Goals (Out of Scope)

- **Splitting `lib/warehouse/codes.ts`** into pure/DB-bound halves (LOW review finding). The PR review's Option A recommendation is to defer this to the planned `lib/warehouse/` rename; doing it here would expand scope and likely conflict with that rename.
- **Wider `lib/warehouse/` rename, `crm/estimates.ts` split, CRM public barrel, typed-delegate shim for `DbClientPort` casts, `generateTempPassword` dedup, `wms-host` constants extraction** — explicitly deferred follow-ups in the PR body.
- **Introducing a unit-test framework** (vitest/jest). The repo's convention is `scripts/verify-*.ts` (~30 such files); follow it.
- **Backporting the CI fix to `main`** — fix on PR branch is sufficient because `pull_request` workflows run from the PR head. A `main`-side fix is fine if the merge is a fast-forward but should not be a separate PR.

---

## User & Context

### Target User

- **Who**: Repository maintainer / Ralph executor closing out an architectural-sweep refactor PR.
- **Role**: Lands small mechanical refactors as the safe baseline before bigger module-boundary work.
- **Current Pain**: PR #1 has been approved by the reviewer and auto-fix workflow but cannot merge — the `Verify` check is a required signal and currently red for reasons unrelated to the diff (CI infra, not the code change).

### User Journey

1. **Trigger**: Ralph loop picks up `resolve-pr-1-warehouse-extract` PRD.
2. **Action**: Apply CI fix → push → wait for `Verify` to go green → add the verifier script → push → confirm green → merge.
3. **Outcome**: PR #1 is merged; `expandCellSpec` lives in `lib/warehouse/codes.ts`; a `scripts/verify-cell-codes.ts` pins its behaviour; deferred follow-ups remain queued in the PR body for future PRs.

---

## UX Requirements

### Interaction Model

- Edits to `.github/workflows/verify.yml` on the PR branch.
- New file `scripts/verify-cell-codes.ts` on the PR branch.
- `gh` CLI commands for status polling and merge.

### States to Handle

| State | Description | Behavior |
|-------|-------------|----------|
| CI red (current) | `Verify` workflow exits 1 at `prisma generate` with `Missing required environment variable: DATABASE_URL` | US-001 stubs the env var for the generate step so `prisma generate` reads the schema only and succeeds |
| Verifier negative | `expandCellSpec("")`, `expandCellSpec("A-1-1..A-3-4")` (mismatched segments), oversized range (>500), oversized product (>1000), non-numeric range segment | Each must return `{ error: <documented Russian string> }`; the verifier asserts on the exact `error` text |
| Verifier positive | `expandCellSpec("A-1-1")`, `expandCellSpec("A-1-1..A-1-3")`, `expandCellSpec(" a-1-1 .. A-1-2 ")` (case + whitespace) | Each must return the expected `string[]` (uppercased, trimmed) |
| CI green | All `Verify` steps succeed on the head SHA | Proceed to merge |
| Merge succeeds | `gh pr merge 1 --squash --delete-branch` exits 0 | Done — PR state is `MERGED` |

---

## Technical Context

### Patterns to Follow

- **CI workflow style**: `.github/workflows/verify.yml:25-28` — the existing `Generate Prisma client` step. Add an `env:` block scoped to that step (NOT job-level) with a dummy `DATABASE_URL` value; do not introduce a repo secret. The existing comment at line 27 (`No DATABASE_URL needed for prisma generate; it reads the schema only.`) is now incorrect — `prisma.config.ts:14` calls `env("DATABASE_URL")` which throws when unset. Update the comment to reflect that the stub is a workaround for the strict `env()` reader, not a real database connection.
- **Verifier script structure**: `scripts/verify-stock-analysis.ts:1-60` is the canonical small-verifier shape — `import "dotenv/config"`, a local `assert()` that `console.error`s and `process.exit(1)`, a `main()` invoked at module bottom. For `expandCellSpec`, drop the DB-related parts (no `db`, no fixtures, no cleanup) — it is a pure function.
- **Import path**: New verifier imports from `../lib/warehouse/codes` (matches `scripts/verify-warehouse.ts:23` which already imports `assignCodes, DuplicateCodeError` from the same module).
- **Russian error strings**: Already in the function body — assertions must compare against the exact text (e.g., `"Укажите код или диапазон ячеек"`, `"Слишком большой диапазон"`, `"Слишком много ячеек (макс. 1000)"`). Do not translate.

### Types & Interfaces

```typescript
// From lib/warehouse/codes.ts (post-PR #1, in tree on PR branch):
export const CELL_RE: RegExp; // /^[A-Z0-9-]{1,32}$/
export function expandCellSpec(spec: string): string[] | { error: string };
```

The return is a discriminated union by `Array.isArray`. The verifier asserts on both arms:

```typescript
const r = expandCellSpec("A-1-1..A-1-3");
assert(Array.isArray(r), "valid range expands to array");
assert(r.length === 3 && r[0] === "A-1-1" && r[2] === "A-1-3", "range body matches");

const e = expandCellSpec("");
assert(!Array.isArray(e), "empty input returns error");
assert(e.error === "Укажите код или диапазон ячеек", "empty error text matches");
```

### Architecture Notes

- **Why a step-scoped `env:` and not job-level**: Job-level env would silently leak the dummy URL into the `Type check` and `Lint` steps that follow, which is technically harmless today but masks any future code that accidentally reads `DATABASE_URL` at module load. Step-scoped keeps the workaround surgical.
- **Why `postgresql://stub`-shaped value**: `prisma generate` only validates that `env("DATABASE_URL")` resolves to a non-empty string; it does not connect. Use a clearly-fake value (e.g., `postgresql://prisma-generate-stub:stub@localhost:5432/stub`) to signal intent to anyone reading the workflow later.
- **No `prisma.config.ts` changes**: Editing the config to make `DATABASE_URL` optional would have wider blast radius (every migration / introspection command would silently lose the env-not-set safety net). Fix the CI side instead.
- **Why the verifier locks in behaviour**: The PR review noted missing test-coverage lane is "low marginal risk" because of the byte-identical move — but the PR's stated motivation was testability. Landing a verifier on the way in turns that motivation into a delivered artifact and provides a regression baseline if future PRs (e.g., the deferred `lib/warehouse/` rename) touch the function.
- **Merge command**: `gh pr merge 1 --squash --delete-branch --repo 0pt1m1sm/geleoteka` — squash matches the recent commit history style (each `acadba6`, `61d1f04`, etc. is a single squashed feature commit).

---

## Implementation Summary

### Story Overview

| ID | Title | Priority | Dependencies |
|----|-------|----------|--------------|
| US-001 | Stub `DATABASE_URL` for `prisma generate` in `verify.yml` | 1 | — |
| US-002 | Add `scripts/verify-cell-codes.ts` to lock in `expandCellSpec` behaviour | 2 | US-001 |
| US-003 | Merge PR #1 once `Verify` is green | 3 | US-001, US-002 |

### Dependency Graph

```
US-001 (CI unblock)
    ↓
US-002 (verifier — push together to revalidate CI in one round trip)
    ↓
US-003 (merge)
```

---

## Validation Requirements

- [ ] `Verify` workflow on PR #1 head SHA: all steps pass (`gh pr checks 1 --repo 0pt1m1sm/geleoteka` → `verify  pass`)
- [ ] `npx tsx scripts/verify-cell-codes.ts` exits 0 locally (no DB needed — pure function)
- [ ] `git diff main...HEAD --stat` shows only: `app/actions/warehouse.ts`, `lib/warehouse/codes.ts` (from the existing PR commit), `.github/workflows/verify.yml`, `scripts/verify-cell-codes.ts`
- [ ] `gh pr view 1 --repo 0pt1m1sm/geleoteka --json state` reports `"state":"MERGED"`
- [ ] PR #1 branch is deleted post-merge (`--delete-branch`)

---

*Generated: 2026-06-12*
