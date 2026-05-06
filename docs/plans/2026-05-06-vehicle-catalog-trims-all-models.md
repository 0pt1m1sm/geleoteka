# Vehicle Catalog Trims — All Models Audit Implementation Plan

Created: 2026-05-06
Author: aleksandr.spiskov@gmail.com
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Curate trim data in `prisma/seed-trims.ts` for all 21 non-G-Class Mercedes-Benz models in the catalog, sourced from auto-data.net (with Wikipedia fallback for engine codes), then reseed prod.

**Architecture:** Pure data-layer change. Append new `CuratedGeneration` blocks to the existing `CURATED` array in `prisma/seed-trims.ts`; replace the four existing entries flagged "needs re-verification" with cited auto-data.net sources. The existing `seedTrims` function upserts idempotently by `(generationId, code)` — no logic changes needed.

**Tech Stack:** TypeScript seed script, Prisma, PostgreSQL. Sources: auto-data.net (per-generation pages), Wikipedia (engine codes when auto-data is silent).

## Scope

### In Scope

- 21 non-G-Class models, all 61 generations (current production AND historical)
- Re-verify the 4 existing curated sets (C-Class W205, E-Class W213, GLE V167, GLS X167) against auto-data.net — overwrite with sourced data
- One commit per model family (6 families) + final prod deploy commit
- ROW-spec / EU-market variants only (skip explicit USA-spec sub-trims)
- Engine code from auto-data first, Wikipedia fallback when missing
- Each `CuratedGeneration` block cites its source URL, like the existing G-Class blocks

### Out of Scope

- USA-spec sub-variants (e.g. `AMG G 63 V8 (577 Hp) USA` was skipped for G-Class; same here)
- China-only "L"-suffix sub-variants on dedicated `...china` URLs (skip uniformly to avoid noise; standard L-EWB/L-WB variants on the main generation page ARE in scope)
- Schema changes (no new `FuelType` enum values; PHEV mapped to `HYBRID` per Conventions below)
- Frontend changes (the picker UI already renders any trims in DB)
- G-Class generations W460–W463A and W465 (already done in commits `dd39bdf`, `dbc38ef`, `22c764f`). G-Class W464 IS in scope — see Task 6 catch-up note.

## Approach

**Chosen:** Phased per model family — 6 implementation tasks (one per family) + 1 prod-deploy task.

**Why:** Smaller diffs are easier to review and revert if a family's data turns out wrong. Each family commits independently after a local-DB seed-and-verify, so an error in (say) Mid-Size Saloons doesn't block SUVs. Cost: 7 commits instead of 1, ~30 min more wall time than a mega-commit.

**Alternatives considered:**
- *All-at-once mega-commit:* Faster wall time but a 200+-row diff is unreviewable; one bad row blocks the whole thing.
- *Generate-then-curate:* Auto-fetch all pages into a draft JSON first, then curate. Adds an intermediate artifact and the curation step still happens manually — no real savings.

## Context for Implementer

> Write for an implementer who has never seen the codebase.

- **Patterns to follow:**
  - `prisma/seed-trims.ts:35-105` — existing G-Class blocks (W460–W465) are the gold-standard template. Each block has `modelSlug`, `generationCode`, `source` URL, and `trims[]`.
  - `prisma/seed-trims.ts:225-273` — `seedTrims()` upserts by `(generationId, code)` idempotently. Adding new trims = no DB schema migration needed.
  - `lib/vehicle-catalog-types.ts:8` — `FuelType = "PETROL" | "DIESEL" | "ELECTRIC" | "HYBRID"`. Use `"ELECTRIC"` for EQA/B/C/E/S.
- **Conventions:**
  - Trim `code` is the customer-facing badge as it appears on the rear (e.g. `"E 220 d"`, `"GLC 300 4MATIC"`, `"AMG E 53"`).
  - **Engine code format — MANDATORY: Mercedes-style with spaces.** Examples: `"M 177"`, `"M 256"`, `"OM 642 DE 30 LA"`, `"OM 654"`, `"OM 656"`. Apply this even where existing G-Class entries used the no-space form (`"OM656"`, `"M256"`) — fix those during Task 1 as a one-liner cleanup so the format is uniform across the file before adding 250+ new entries. The picker label (`trimLabel()` in `lib/vehicle-catalog-types.ts:84`) renders engineCode verbatim, so consistency matters.
  - `displacementL` is a number (3.0, not 2998).
  - `notes` field — use Russian. Pattern: `"<engine architecture>; <year span>; <caveat if any>"` e.g. `"V8 битурбо AMG; 2017–2021"`.
  - **PHEV (plug-in hybrid) rule — MANDATORY:** any trim that combines a combustion engine with a battery+motor that allows plug-in charging (e.g. `E 300 e`, `GLE 350 de`, `S 580 e`, `AMG C 63 S E PERFORMANCE`) uses `fuelType: "HYBRID"`. The base fuel goes in `notes` along with battery capacity if available — e.g. `"бензин+электро PHEV; батарея 25.4 кВт·ч; 2023–"` or `"дизель+электро PHEV; батарея 31.2 кВт·ч; 2019–"`. The schema enum `FuelType = PETROL | DIESEL | ELECTRIC | HYBRID` does not have `DIESEL_HYBRID`; this convention preserves the diesel/petrol distinction in notes without a schema migration.
  - **48V mild-hybrid** (e.g. M256 EQ Boost, M139 with starter-generator) is NOT a PHEV — keep `fuelType: "PETROL"` or `"DIESEL"`. Mention `"48V mild hybrid"` in notes if relevant.
  - `bodyStyle` — only set when there is a meaningful per-trim distinction the chassis code does NOT already capture. Examples where it IS useful: SL R230 `"coupe"` vs `"cabriolet"` (same chassis, different body), V-Class W447 `"lang"` vs `"extralang"` if engine offerings differ. Examples where it is NOT useful: AMG GT C190 (2-door) vs X290 (4-door) — those are SEPARATE chassis codes, so `bodyStyle` is redundant and produces a misleading picker label. Omit it for X290.
  - `drivetrain` — `"4MATIC"` (AWD), `"4MATIC+"` (AMG variable AWD), `"RWD"` (rear-only), `"FWD"` (front-only). Omit if unknown.
  - **Auto-data.net URL pattern:** `https://www.auto-data.net/en/mercedes-benz-<model-slug>-<chassis>-generation-<id>` where `<id>` is opaque (e.g. `9955`). Discover via WebSearch with query `site:auto-data.net mercedes-benz <model-slug> <chassis>`. Cache the discovered URLs in the new `Source URLs` section of this plan as you find them — the next re-verification audit can skip discovery.
  - **EV motor codes:** for ELECTRIC trims, populate `engineCode` with motor type per auto-data.net when available — common values are `"PSM"` (Permanent-Synchronous), `"PSM x2"` (twin-motor AWD), `"ASM"` (Asynchronous), `"ASM+PSM"` (mixed). Battery capacity (kWh) and motor count go in `notes`.
- **Key files:**
  - `prisma/seed-trims.ts` — the one file being edited.
  - `prisma/seed-vehicles.ts` — reference for what generations exist (DO NOT modify; trim seed reads from DB).
  - `prisma/seed.ts` — orchestrator that calls `seedTrims()` after `seedVehicles()`.
- **Gotchas:**
  - Auto-data.net often **omits engine codes** for newer gens (W465, W463A all had no engine code in our G-Class fetch). Fall back to Wikipedia.
  - Auto-data.net lists **per-facelift sub-variants** (e.g. "G 500 (388 Hp) 2008-2010" and "G 500 (388 Hp) 2010-2012" as two rows). Schema unique constraint `(generationId, code)` means **identical codes must collapse into one row** — span the years in `notes`.
  - **Pre-DELETE blast radius (CRITICAL):** `seedTrims` does NOT delete orphans. Re-verifying W205/W213/V167/X167 with renamed trim codes leaves orphan rows in DB. The pre-delete SQL `DELETE FROM "VehicleTrim" WHERE "generationId" = ... AND NOT "isDefault"` triggers TWO cascading effects:
    - `PartTrim.trimId` has `onDelete: Cascade` (`prisma/schema.prisma:794`) — admin-created PartTrim rows are silently destroyed.
    - `RepairOrder.trimId` has `onDelete: SetNull` (`prisma/schema.prisma:327`) — historical repair-order trim associations are silently nulled.
    Tasks 2, 4, and 7 must follow the **snapshot-then-reconcile** pattern: (a) snapshot affected `PartTrim` rows and `RepairOrder.trimId` values to a temp table BEFORE the DELETE, (b) re-seed, (c) attempt to re-link by matching trim `code`, (d) print an explicit reconciliation report — for every old `code`, did a new trim with the same `code` exist? If yes, links restored automatically. If no, list it for manual review.
  - **Sample-part trim references in `prisma/seed.ts:309-317`:** `seed.ts` has hard-coded references `c-class:W205 trimCode "AMG C 63 S"`, `e-class:W213 trimCode "AMG E 63 S"`, `gle:V167 trimCode "AMG GLE 63 S"`. If re-verification renames any of these (e.g. auto-data lists it as `"Mercedes-AMG E 63 S 4MATIC+"`), the seed resolver prints a WARNING (not an error) and silently skips the PartTrim link. Each re-verification task MUST: (a) preserve these exact codes if they match auto-data, OR (b) update both `seed-trims.ts` AND `seed.ts:309-317` in the same commit to use the new code.
  - `npm run dev` is on port 443 (HTTPS, sudo) — irrelevant to this work but noted.
- **Domain context:** This catalog drives the customer's "My Car" picker on `/parts` and the booking wizard's vehicle step. Trims appear as a third dropdown after model→generation. Customer experience: more accurate trims = better parts compatibility filtering.

## Runtime Environment

- **DB target (local):** `postgresql://alex@localhost:5432/geleoteka`
- **DB target (prod):** `postgresql://postgres:cQNZolosjoxpJFZntPCNImVwzbGsTLWJ@metro.proxy.rlwy.net:55662/railway` (Railway public proxy)
- **Seed command:** `DATABASE_URL="<url>" npx prisma db seed`
- **Verify command:** `DATABASE_URL="<url>" npx tsx scripts/verify-vehicle-catalog.ts` (validates generation structure, NOT trims)
- **Trim count check (local):**
  ```sql
  SELECT m.name, g.code, COUNT(t.id) FILTER (WHERE NOT t."isDefault") as curated
  FROM "VehicleModel" m
  JOIN "VehicleGeneration" g ON g."modelId" = m.id
  LEFT JOIN "VehicleTrim" t ON t."generationId" = g.id
  GROUP BY m.name, g.code, g."yearFrom"
  ORDER BY m.name, g."yearFrom";
  ```

## Assumptions

- **Auto-data.net coverage:** every non-G-Class generation in our catalog has a corresponding auto-data.net page — supported by spot-checking C-Class W205, E-Class W213, GLE V167 (all confirmed present). Tasks 1–6 depend on this.
- **Auto-data.net does not rate-limit polite serial fetches** — supported by 5+ successful fetches during the G-Class work. Task 1–6 depend on this.
- **Wikipedia provides engine codes for any trim whose code is known** — supported by G-Class fetch where all OM/M codes were resolvable. Tasks 1–6 depend on this.
- **No new generations need to be added** — the catalog (`prisma/seed-vehicles.ts`) already has all gens we care about; this work only adds trims to existing gens. Tasks 1–6 depend on this.
- **Re-verifying W205/W213/V167/X167 will rename ≤2 trims per generation** — supported by spot-checking; existing names (`C 200`, `GLE 450`, `AMG E 53`) match auto-data.net naming. Task 2 (mid-saloons) and Task 4 (SUVs) handle pre-cleanup.
- **EQS/EQE have separate Sedan and SUV chassis codes (V297/X296, V295/X294) already split as 2 generations each in DB** — verified in `prisma/seed-trims.ts` reference and DB query. Task 5 (EVs) handles each chassis independently.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Auto-data.net rate-limits the ~122 ops (61 search + 61 fetch) over 6 tasks | Medium | Medium | Pre-build a `Source URLs` map in Task 1 by sweeping the per-model overview pages once (e.g. `https://www.auto-data.net/en/mercedes-benz-c-class-model-1364`) and harvesting per-generation links from each. Cache the resolved URLs in this plan. Subsequent tasks read the cache, not search. Cuts ops from ~122 to ~67. If a page still blocks, fall back to Wikipedia. |
| A generation has zero documented trims on auto-data.net (very old or rare) | Medium | Low | Leave the gen with only its `ALL` default trim; document in plan's Open Questions section. Don't fabricate. Also expected for G-Class W464 utility (Wikipedia-noted limited public info). |
| Pre-DELETE on prod silently destroys admin-created PartTrim rows or nulls RepairOrder.trimId for re-verified gens | High | High | Snapshot-then-reconcile: (1) BEFORE pre-DELETE, snapshot affected rows to JSON file or temp table; (2) re-seed; (3) match snapshot rows by trim `code` to new trim ids; (4) re-INSERT PartTrim links and re-SET RepairOrder.trimId where matches found; (5) print explicit reconciliation report listing unmatched rows for manual review. Tasks 2, 4, 7 implement this. |
| Renamed trim codes break sample-part links in `seed.ts:309-317` (silent warning, not error) | Medium | Medium | Each re-verification task runs a SQL diff: SELECT old codes BEFORE pre-delete, SELECT new codes AFTER seed, print symmetric difference. For every renamed code, the implementer updates `seed.ts:309-317` in the SAME commit. |
| Auto-data.net and Wikipedia disagree on HP for a trim | Medium | Low | Prefer auto-data for HP (more current), Wikipedia for engine code (more careful with chassis nomenclature). Note discrepancy in trim's `notes` field if >5% delta. |
| Trim code collision when collapsing year sub-variants | Low | High (seed crashes) | Pre-research: list all variant codes per gen before writing. Collapse identical codes into one row spanning year range in `notes`. The `seedTrims` upsert by `(generationId, code)` deduplicates writes, but two CURATED entries with the same code in the seed source would overwrite each other; the second wins. |
| PHEV `fuelType` mapping ambiguity (no `DIESEL_HYBRID` enum) | High | Low | Resolved in Conventions: PHEV → `HYBRID`, base fuel in notes. Documented once, applied uniformly. |
| AMG GT X290 `bodyStyle: "long"` produces misleading user-facing label ("AMG GT 53 · M256 · 4MATIC+ · long") | High | Low | Drop bodyStyle for X290 entirely. Chassis code (C190 vs X290 vs C192) already disambiguates 2-door vs 4-door in the picker. |
| Prod seed run takes >5 minutes due to ~250 upserts | Low | Low | Each upsert is one round-trip; ~3 sec/100 rows on Railway. Total ~10 sec. Not a concern. |

## Goal Verification

### Truths

1. `prisma/seed-trims.ts` contains a `CuratedGeneration` entry for every non-G-Class generation in `prisma/seed-vehicles.ts` AND for G-Class W464 (the previously-missed gen). Verifiable by `grep -cE '^\s+modelSlug:' prisma/seed-trims.ts` returning exactly `67` (5 existing G-Class W460/W461/W463/W463A/W465 + 1 W464 catch-up + 61 non-G entries). Note: a plain `grep -c "modelSlug:"` returns `68` because it also matches the `CuratedGeneration` interface declaration on line 14 — anchor the regex to leading whitespace to count only array entries.
2. Every new `CuratedGeneration` block has a `source` field starting with `https://www.auto-data.net/` or `https://en.wikipedia.org/`.
3. Running `npx prisma db seed` against prod reports `Trims seeded: ... 0 curated rows skipped` (no model/generation lookup failures).
4. SQL query against prod shows every non-G-Class generation has ≥ 2 trims (1 default `ALL` + ≥ 1 curated). G-Class W464 may be the sole exception if auto-data.net has no documented utility-line trims (documented in plan).
5. No trim row in prod has `code` containing the substring `USA` (Russian-market filter held).
6. The 4 previously-flagged "needs re-verification" generations (C-Class W205, E-Class W213, GLE V167, GLS X167) have a `source` field pointing to auto-data.net (no longer says "previously-approved seed").
7. Reconciliation report from Task 7 shows 0 unrecovered `PartTrim` rows and 0 unrecovered `RepairOrder.trimId` values for the 4 re-verified generations (or each unrecovered row is explicitly listed for manual review).
8. `seed.ts:309-317` sample-part `trimCode` references match real trim codes in seed-trims.ts after re-verification (no warning lines from the seed run for missing specific trims).

### Artifacts

- `prisma/seed-trims.ts` — the one file modified
- Git history: 6 family commits + 1 prod deploy commit (or 1 merge commit if squashed)
- Prod DB: `VehicleTrim` table with ~250+ curated rows across 21 models

## Source URLs (populated by Task 1, read by Tasks 2–6)

> Cache for auto-data.net per-generation URLs. Discovered via WebSearch in Task 1; later tasks read from here. URLs link to the base generation; facelift variants are listed on the same parent page.

```
# Compact saloons (used in Task 1)
a-class W168: https://www.auto-data.net/en/mercedes-benz-a-class-w168-generation-2787
a-class W169: https://www.auto-data.net/en/mercedes-benz-a-class-w169-generation-2786
a-class W176: https://www.auto-data.net/en/mercedes-benz-a-class-w176-generation-4106
a-class W177: https://www.auto-data.net/en/mercedes-benz-a-class-w177-generation-6101
b-class W245: https://www.auto-data.net/en/mercedes-benz-b-class-w245-generation-2726
b-class W246: https://www.auto-data.net/en/mercedes-benz-b-class-w246-generation-3858
b-class W247: https://www.auto-data.net/en/mercedes-benz-b-class-w247-generation-6581
cla    C117: https://www.auto-data.net/en/mercedes-benz-cla-coupe-c117-generation-4116
cla    C118: https://www.auto-data.net/en/mercedes-benz-cla-coupe-c118-generation-6817

# Mid-size saloons (used in Task 2)
c-class W202: https://www.auto-data.net/en/mercedes-benz-c-class-w202-generation-2736
c-class W203: https://www.auto-data.net/en/mercedes-benz-c-class-w203-generation-2732
c-class W204: https://www.auto-data.net/en/mercedes-benz-c-class-w204-generation-2730
c-class W205: https://www.auto-data.net/en/mercedes-benz-c-class-w205-generation-4111
c-class W206: https://www.auto-data.net/en/mercedes-benz-c-class-w206-generation-8159
e-class W124: https://www.auto-data.net/en/mercedes-benz-e-class-w124-generation-2771
e-class W210: https://www.auto-data.net/en/mercedes-benz-e-class-w210-generation-2769
e-class W211: https://www.auto-data.net/en/mercedes-benz-e-class-w211-generation-2767
e-class W212: https://www.auto-data.net/en/mercedes-benz-e-class-w212-generation-2765
e-class W213: https://www.auto-data.net/en/mercedes-benz-e-class-w213-generation-4670
e-class W214: https://www.auto-data.net/en/mercedes-benz-e-class-w214-generation-9442
cls    C219: https://www.auto-data.net/en/mercedes-benz-cls-coupe-c219-generation-5386
cls    C218: https://www.auto-data.net/en/mercedes-benz-cls-coupe-c218-generation-3860
cls    C257: https://www.auto-data.net/en/mercedes-benz-cls-coupe-c257-generation-6026

# Full-size saloons + GTs (used in Task 3)
s-class W140: https://www.auto-data.net/en/mercedes-benz-s-class-w140-generation-2778
s-class W220: https://www.auto-data.net/en/mercedes-benz-s-class-w220-generation-2776
s-class W221: https://www.auto-data.net/en/mercedes-benz-s-class-w221-generation-2775
s-class W222: https://www.auto-data.net/en/mercedes-benz-s-class-w222-generation-4130
s-class W223: https://www.auto-data.net/en/mercedes-benz-s-class-w223-generation-7908
amg-gt  C190: https://www.auto-data.net/en/mercedes-benz-amg-gt-c190-generation-4380
amg-gt  X290: https://www.auto-data.net/en/mercedes-benz-amg-gt-4-door-coupe-x290-generation-6161
amg-gt  C192: https://www.auto-data.net/en/mercedes-benz-amg-gt-c192-generation-9604
sl     R129: https://www.auto-data.net/en/mercedes-benz-sl-r129-generation-7878
sl     R230: https://www.auto-data.net/en/mercedes-benz-sl-r230-generation-7874
sl     R231: https://www.auto-data.net/en/mercedes-benz-sl-r231-generation-3869
sl     R232: https://www.auto-data.net/en/mercedes-benz-sl-r232-generation-8669
slk    R170: https://www.auto-data.net/en/mercedes-benz-slk-r170-generation-7883
slk    R171: https://www.auto-data.net/en/mercedes-benz-slk-r171-generation-7885
slk    R172: https://www.auto-data.net/en/mercedes-benz-slk-r172-generation-4131

# SUVs (used in Task 4)
gla    X156: https://www.auto-data.net/en/mercedes-benz-gla-x156-generation-4127
gla    H247: https://www.auto-data.net/en/mercedes-benz-gla-h247-generation-7468
glb    X247: https://www.auto-data.net/en/mercedes-benz-glb-x247-generation-7171
glc    X204: https://www.auto-data.net/en/mercedes-benz-glk-x204-generation-2744 (GLK predecessor)
glc    X253: https://www.auto-data.net/en/mercedes-benz-glc-suv-x253-generation-4568
glc    X254: https://www.auto-data.net/en/mercedes-benz-glc-suv-x254-generation-8900
gle    W163: https://www.auto-data.net/en/mercedes-benz-m-class-w163-generation-2752 (M-class predecessor)
gle    W164: https://www.auto-data.net/en/mercedes-benz-m-class-w164-generation-2751 (M-class predecessor)
gle    W166: https://www.auto-data.net/en/mercedes-benz-gle-suv-w166-generation-4570
gls    X164: https://www.auto-data.net/en/mercedes-benz-gl-x164-generation-3865 (GL-Class predecessor)
gls    X166: https://www.auto-data.net/en/mercedes-benz-gls-x166-generation-4650
gls    X167: https://www.auto-data.net/en/mercedes-benz-gls-x167-generation-7091

# EVs (used in Task 5)
eqa    H243: https://www.auto-data.net/en/mercedes-benz-eqa-h243-generation-8069
eqb    X243: https://www.auto-data.net/en/mercedes-benz-eqb-x243-generation-8323
eqc    N293: https://www.auto-data.net/en/mercedes-benz-eqc-n293-generation-6575
eqe    V295: https://www.auto-data.net/en/mercedes-benz-eqe-v295-generation-8561 (sedan)
eqe    X294: https://www.auto-data.net/en/mercedes-benz-eqe-suv-x294-generation-9056 (SUV)
eqs    V297: https://www.auto-data.net/en/mercedes-benz-eqs-v297-generation-8321 (sedan)
eqs    X296: https://www.auto-data.net/en/mercedes-benz-eqs-suv-x296-generation-8844 (SUV)

# Vans (used in Task 6)
v-class W638: https://www.auto-data.net/en/mercedes-benz-vito-w638-generation-2757 (Vito)
v-class W639: https://www.auto-data.net/en/mercedes-benz-viano-w639-generation-2783 (Viano)
v-class W447: https://www.auto-data.net/en/mercedes-benz-v-class-v447-generation-4379

# G-Class W464 catch-up (used in Task 6)
g-class W464: https://ggb.mercedes-benz.com/en/vehicles/base-vehicles-model-series-464 (auto-data has no W464 page; HP/engine cross-checked at https://www.ultimatespecs.com/car-specs/Mercedes-Benz/118793)
```

## Progress Tracking

- [x] Task 1: Engine-code format cleanup + URL discovery + Compact saloons (A-Class, B-Class, CLA)
- [x] Task 2: Mid-size saloons (C-Class, E-Class, CLS) — re-verify W205, W213 with snapshot-reconcile
- [x] Task 3: Full-size saloon + grand tourers (S-Class, AMG GT, SL, SLK/SLC)
- [x] Task 4: SUVs / Crossovers (GLA, GLB, GLC, GLE, GLS) — re-verify V167, X167 with snapshot-reconcile
- [x] Task 5: EVs (EQA, EQB, EQC, EQE, EQS)
- [x] Task 6: Vans (V-Class) + G-Class W464 catch-up
- [x] Task 7: Verification script + prod deploy + final verification

**Total Tasks:** 7 | **Completed:** 7 | **Remaining:** 0

## Implementation Tasks

### Task 1: Engine-code format cleanup + URL discovery + Compact saloons (A-Class, B-Class, CLA)

**Objective:** (a) Normalise existing G-Class engine codes to the Mercedes-with-spaces format. (b) Sweep auto-data.net per-model overview pages to populate the plan's `Source URLs` cache for all 21 non-G models. (c) Add curated trims for 9 generations: A-Class (W168, W169, W176, W177), B-Class (W245, W246, W247), CLA (C117, C118).
**Dependencies:** None
**Mapped Scenarios:** None (data-only; no UI test required)

**Files:**
- Modify: `prisma/seed-trims.ts`
- Modify: `docs/plans/2026-05-06-vehicle-catalog-trims-all-models.md` (populate Source URLs section)

**Key Decisions / Notes:**

**Sub-step 1a — Format cleanup (do FIRST before adding new entries):**
- In existing G-Class blocks, replace `"OM656"` → `"OM 656"`, `"M256"` → `"M 256"`, `"M176"` → `"M 176"`, `"M177"` → `"M 177"`, etc. Use `Edit` with `replace_all: false` for each unique pair to verify each change, or one `replace_all` per token after grep-confirming uniqueness. Verify with `npx tsc --noEmit` after.

**Sub-step 1b — URL discovery (do BEFORE writing any trim blocks):**
- For each of the 21 non-G models, fetch the model overview page (e.g. `https://www.auto-data.net/en/mercedes-benz-c-class-model-1364` — the `1364` is opaque but discoverable via one WebSearch `site:auto-data.net mercedes-benz c-class model`). Each overview page lists per-generation links.
- Append to the plan's `Source URLs` section a line per generation: `c-class W202: https://www.auto-data.net/en/mercedes-benz-c-class-w202-generation-...`.
- This is one fetch per model (~21 fetches total) instead of one per generation (~61). After Task 1 ships, Tasks 2–6 read this cache.

**Sub-step 1c — Compact saloons trim blocks (alphabetical: A-Class, B-Class, CLA):**
- Append blocks AFTER the G-Class W465 block (around line 119) and BEFORE the GLE V167 block. Group A-Class blocks together, then B-Class, then CLA.
- A-Class W168 (1997–2004) is the first hatchback Mercedes; trims like A 140, A 160, A 170 CDI, A 190, A 210 Evolution.
- A-Class W177 (2018–) trims: A 180, A 200, A 220 4MATIC, A 250, AMG A 35, AMG A 45 S.
- B-Class W245 (2005–2011) is the first Sport Tourer; B 150, B 170, B 200, B 200 CDI, B 200 Turbo.
- CLA C117 (2013–2019): CLA 180, CLA 200, CLA 220 d, CLA 250, AMG CLA 45.
- CLA C118 (2019–): CLA 180, CLA 200, CLA 250 4MATIC, AMG CLA 35, AMG CLA 45 S, **CLA 250 e** (PHEV → fuelType: HYBRID, base: бензин).
- Collapse identical-code year sub-variants. Span years in `notes`.

**Definition of Done:**
- [ ] All G-Class entries' `engineCode` values use Mercedes-with-spaces format (`grep -E '"M[0-9]+|OM[0-9]+"' prisma/seed-trims.ts` returns 0 matches).
- [ ] Plan's `Source URLs` section has ≥ 21 entries (one per non-G model overview).
- [ ] `prisma/seed-trims.ts` contains a `CuratedGeneration` block for each of the 9 compact-saloon generations.
- [ ] Each new block has `source` URL starting with `https://www.auto-data.net/`.
- [ ] `npx prisma db seed` against local DB succeeds, reports `0 curated rows skipped`, and curated trim count for each of the 9 generations is ≥ 1.
- [ ] `npx tsc --noEmit` passes.
- [ ] Git: one commit, message `catalog: A-Class + B-Class + CLA curated trims + engine-code format cleanup + URL discovery`.

**Verify:**
```bash
DATABASE_URL="postgresql://alex@localhost:5432/geleoteka" npx prisma db seed
psql "postgresql://alex@localhost:5432/geleoteka" -c "
  SELECT m.name, g.code, COUNT(t.id) FILTER (WHERE NOT t.\"isDefault\") AS curated
  FROM \"VehicleModel\" m
  JOIN \"VehicleGeneration\" g ON g.\"modelId\" = m.id
  LEFT JOIN \"VehicleTrim\" t ON t.\"generationId\" = g.id
  WHERE m.name IN ('A-Class', 'B-Class', 'CLA')
  GROUP BY m.name, g.code, g.\"yearFrom\"
  ORDER BY m.name, g.\"yearFrom\";"
# Expect every row's `curated` ≥ 1.
```

---

### Task 2: Mid-size saloons (C-Class, E-Class, CLS) — re-verify W205, W213 with snapshot-reconcile

**Objective:** Add curated trims for 14 generations: C-Class (W202, W203, W204, W205, W206), E-Class (W124, W210, W211, W212, W213, W214), CLS (C219, C218, C257). Re-verify W205 and W213 using snapshot-then-reconcile to protect downstream PartTrim and RepairOrder data.
**Dependencies:** Task 1 (sequential — same file edits, avoids merge conflicts; reads Source URLs from Task 1)

**Files:**
- Modify: `prisma/seed-trims.ts`
- Modify: `prisma/seed.ts` (lines 309–317 — update sample-part `trimCode` references if W205/W213 trim codes change)

**Key Decisions / Notes:**
- Read C-Class and E-Class auto-data URLs from the plan's `Source URLs` section populated by Task 1.
- BEFORE adding new blocks for W205 and W213, REPLACE the existing entries (currently flagged `"previously-approved seed (vehicle-trims spec); needs re-verification"`).

**Snapshot-then-reconcile pattern (run on local DB before pre-delete):**
1. Capture old codes for the 4 re-verified gens (this task: W205, W213):
   ```sql
   SELECT g.code AS gen_code, t.code AS trim_code, t.id AS trim_id
   FROM "VehicleTrim" t
   JOIN "VehicleGeneration" g ON g.id = t."generationId"
   JOIN "VehicleModel" m ON m.id = g."modelId"
   WHERE NOT t."isDefault"
     AND ((m.name = 'C-Class' AND g.code = 'W205') OR (m.name = 'E-Class' AND g.code = 'W213'));
   ```
   Save output to a Bash variable or scratch file.
2. Snapshot affected `PartTrim` and `RepairOrder.trimId`:
   ```sql
   CREATE TEMP TABLE _trim_snapshot_pt AS
   SELECT pt."partId", pt."trimId", t.code AS old_trim_code, g.code AS gen_code, m.name AS model_name
   FROM "PartTrim" pt
   JOIN "VehicleTrim" t ON t.id = pt."trimId"
   JOIN "VehicleGeneration" g ON g.id = t."generationId"
   JOIN "VehicleModel" m ON m.id = g."modelId"
   WHERE NOT t."isDefault"
     AND ((m.name = 'C-Class' AND g.code = 'W205') OR (m.name = 'E-Class' AND g.code = 'W213'));

   CREATE TEMP TABLE _trim_snapshot_ro AS
   SELECT ro.id AS repair_order_id, ro."trimId", t.code AS old_trim_code, g.code AS gen_code, m.name AS model_name
   FROM "RepairOrder" ro
   JOIN "VehicleTrim" t ON t.id = ro."trimId"
   JOIN "VehicleGeneration" g ON g.id = t."generationId"
   JOIN "VehicleModel" m ON m.id = g."modelId"
   WHERE NOT t."isDefault"
     AND ((m.name = 'C-Class' AND g.code = 'W205') OR (m.name = 'E-Class' AND g.code = 'W213'));
   ```
   (On local DB the `_trim_snapshot_*` tables die with the session — for prod, use real tables `_pt_snapshot_w205_w213` and `_ro_snapshot_w205_w213` so they survive across `psql` invocations.)
3. Pre-delete (CASCADE removes PartTrim, sets-null on RepairOrder.trimId — that's fine because we have the snapshot):
   ```sql
   DELETE FROM "VehicleTrim" WHERE NOT "isDefault" AND "generationId" IN (
     SELECT g.id FROM "VehicleGeneration" g
     JOIN "VehicleModel" m ON m.id = g."modelId"
     WHERE (m.name = 'C-Class' AND g.code = 'W205') OR (m.name = 'E-Class' AND g.code = 'W213')
   );
   ```
4. Run `npx prisma db seed` to upsert the new W205/W213 trims.
5. Reconcile: re-link PartTrim and RepairOrder by matching old `trim_code` to new `trim_id`:
   ```sql
   -- PartTrim re-link
   INSERT INTO "PartTrim" ("partId", "trimId")
   SELECT s."partId", t.id
   FROM _trim_snapshot_pt s
   JOIN "VehicleGeneration" g ON g.code = s.gen_code
   JOIN "VehicleModel" m ON m.id = g."modelId" AND m.name = s.model_name
   JOIN "VehicleTrim" t ON t."generationId" = g.id AND t.code = s.old_trim_code AND NOT t."isDefault"
   ON CONFLICT DO NOTHING;

   -- RepairOrder.trimId re-link
   UPDATE "RepairOrder" ro
   SET "trimId" = t.id
   FROM _trim_snapshot_ro s
   JOIN "VehicleGeneration" g ON g.code = s.gen_code
   JOIN "VehicleModel" m ON m.id = g."modelId" AND m.name = s.model_name
   JOIN "VehicleTrim" t ON t."generationId" = g.id AND t.code = s.old_trim_code AND NOT t."isDefault"
   WHERE ro.id = s.repair_order_id AND ro."trimId" IS NULL;
   ```
6. Reconciliation report: count rows in snapshot tables that did NOT find a new trim with the same code (these are the renamed-trim casualties needing manual review):
   ```sql
   SELECT s.model_name, s.gen_code, s.old_trim_code, COUNT(*) AS lost_part_trim_links
   FROM _trim_snapshot_pt s
   LEFT JOIN "VehicleGeneration" g ON g.code = s.gen_code
   LEFT JOIN "VehicleModel" m ON m.id = g."modelId" AND m.name = s.model_name
   LEFT JOIN "VehicleTrim" t ON t."generationId" = g.id AND t.code = s.old_trim_code AND NOT t."isDefault"
   WHERE t.id IS NULL
   GROUP BY s.model_name, s.gen_code, s.old_trim_code;
   ```
   For every row in the report, the implementer MUST: (a) decide whether the new trim code is a rename of the old one, (b) if yes, run a targeted UPDATE to relink to the new trim id, (c) if no, document in the commit message that the link is intentionally dropped.

**Trim block content:**
- C-Class W202 (1993–2000): C 180, C 200 Kompressor, C 220 CDI, C 230 Kompressor, C 280, AMG C 36, AMG C 43.
- C-Class W206 (2021–): C 180, C 200, C 220 d, C 300, C 300 4MATIC, AMG C 43, **AMG C 63 S E PERFORMANCE** (4-cyl plug-in hybrid → `fuelType: "HYBRID"`, notes: `"бензин+электро PHEV; M139 + EM, 2023–"`).
- E-Class W124 (1985–1995) — sold as `200 E`, `220 E`, `230 E`, `260 E`, `280 E`, `300 E`, `320 E`, `400 E`, `500 E`, `E 36 AMG`, `E 50 AMG`, `E 60 AMG` (post-1993 facelift renumbered to `E 200`, `E 220`, etc. — keep both naming styles documented in `notes`).
- E-Class W214 (2023–): E 200, E 220 d, **E 300 e** (PHEV → HYBRID), **E 400 e** (PHEV → HYBRID), E 450 d, **AMG E 53 4MATIC+** (AMG inline-6 PHEV → HYBRID; **pre-research the exact code**: official Mercedes naming is `AMG E 53 HYBRID 4MATIC+` but auto-data may list as `AMG E 53 4MATIC+` — check before writing to avoid duplicate-key collisions).
- CLS C219 (2003–2010): CLS 280, CLS 320 CDI, CLS 350, CLS 500, CLS 55 AMG, CLS 63 AMG.

**Critical: sample-part trim code preservation.** `seed.ts:309-317` references:
- `c-class:W205 trimCode "AMG C 63 S"`
- `e-class:W213 trimCode "AMG E 63 S"`
If auto-data.net lists either trim under a different name, EITHER preserve the old name in seed-trims.ts (most consistent with prior data), OR update both seed-trims.ts AND seed.ts in this commit.

**Definition of Done:**
- [ ] All 14 generations have a curated trim block.
- [ ] W205 and W213 blocks no longer say `"needs re-verification"` — `source` is an auto-data.net URL.
- [ ] Snapshot tables `_pt_snapshot_w205_w213` and `_ro_snapshot_w205_w213` were created on local DB before pre-delete.
- [ ] After re-seed, reconciliation report ran and count of lost PartTrim links + lost RepairOrder.trimId values is reported. Each non-zero entry has a commit-message line explaining whether it was relinked or intentionally dropped.
- [ ] `seed.ts:309-317` runs without "specific trim not found" warnings (verify by re-running `npx prisma db seed` and grepping the output).
- [ ] All new PHEV trims have `fuelType: "HYBRID"` and `notes` mentioning `"PHEV"` and base fuel.
- [ ] `npx prisma db seed` succeeds locally with `0 curated rows skipped`.
- [ ] `npx tsc --noEmit` passes.
- [ ] Git: one commit, message `catalog: C-Class + E-Class + CLS curated trims (W205/W213 re-verified with reconcile)`.

**Verify:**
```bash
DATABASE_URL="postgresql://alex@localhost:5432/geleoteka" npx prisma db seed 2>&1 | grep -iE "specific trim not found|curated rows skipped"
# Expect: "0 curated rows skipped" and NO "specific trim not found" lines.

psql "postgresql://alex@localhost:5432/geleoteka" -c "
  SELECT m.name, g.code, COUNT(t.id) FILTER (WHERE NOT t.\"isDefault\") AS curated
  FROM \"VehicleModel\" m
  JOIN \"VehicleGeneration\" g ON g.\"modelId\" = m.id
  LEFT JOIN \"VehicleTrim\" t ON t.\"generationId\" = g.id
  WHERE m.name IN ('C-Class', 'E-Class', 'CLS')
  GROUP BY m.name, g.code, g.\"yearFrom\"
  ORDER BY m.name, g.\"yearFrom\";"
grep -A1 'generationCode: "W205"\|generationCode: "W213"' prisma/seed-trims.ts | grep source
```

---

### Task 3: Full-size saloon + grand tourers (S-Class, AMG GT, SL, SLK/SLC)

**Objective:** Add curated trims for 15 generations: S-Class (W140, W220, W221, W222, W223), AMG GT (C190, X290, C192), SL (R129, R230, R231, R232), SLK/SLC (R170, R171, R172).
**Dependencies:** Task 2

**Files:**
- Modify: `prisma/seed-trims.ts`

**Key Decisions / Notes:**
- S-Class W223 (2020–): S 350 d, S 400 d 4MATIC, S 450, S 500 4MATIC, S 580 4MATIC, S 580 e (PHEV), S 680 (Maybach V12), AMG S 63 E PERFORMANCE.
- AMG GT C190 (2014–2022) — 2-door coupe/roadster: AMG GT, AMG GT S, AMG GT C, AMG GT R, AMG GT Black Series. Omit `bodyStyle`.
- AMG GT X290 (2018–) — 4-door coupe (different chassis): AMG GT 43, AMG GT 53, AMG GT 63, AMG GT 63 S, **AMG GT 63 S E PERFORMANCE** (PHEV → HYBRID). **Omit `bodyStyle`** — chassis code X290 already disambiguates from C190/C192 in the picker tree, and `trimLabel()` would render `"AMG GT 53 · M256 · 4MATIC+ · long"` which is misleading (long ≠ 4-door coupe).
- AMG GT C192 (2023–) — 2nd gen 2-door: AMG GT 43, AMG GT 55, AMG GT 63. Omit `bodyStyle`.
- SL R129 (1988–2001): SL 280, SL 320, SL 500, SL 600, SL 60 AMG, SL 70 AMG, SL 73 AMG.
- SL R232 (2021–) — AMG-developed: AMG SL 43, AMG SL 55 4MATIC+, AMG SL 63 4MATIC+, AMG SL 63 S E PERFORMANCE.
- SLK/SLC R172 (2011–2020): rebadged from SLK to SLC in 2016 — keep both naming styles in `notes`.

**Definition of Done:**
- [ ] All 15 generations have a curated trim block.
- [ ] AMG GT C190, X290, C192 all OMIT `bodyStyle` (chassis code already disambiguates).
- [ ] All PHEV trims (S 580 e, AMG S 63 E PERFORMANCE, AMG GT 63 S E PERFORMANCE, AMG SL 63 S E PERFORMANCE) use `fuelType: "HYBRID"` and `notes` mentioning `"PHEV"` and base fuel.
- [ ] `npx prisma db seed` succeeds locally with `0 curated rows skipped`.
- [ ] `npx tsc --noEmit` passes.
- [ ] Git: one commit, message `catalog: S-Class + AMG GT + SL + SLK/SLC curated trims`.

**Verify:**
```bash
DATABASE_URL="postgresql://alex@localhost:5432/geleoteka" npx prisma db seed
psql "postgresql://alex@localhost:5432/geleoteka" -c "
  SELECT m.name, g.code, COUNT(t.id) FILTER (WHERE NOT t.\"isDefault\") AS curated
  FROM \"VehicleModel\" m
  JOIN \"VehicleGeneration\" g ON g.\"modelId\" = m.id
  LEFT JOIN \"VehicleTrim\" t ON t.\"generationId\" = g.id
  WHERE m.name IN ('S-Class', 'AMG GT', 'SL', 'SLK / SLC')
  GROUP BY m.name, g.code, g.\"yearFrom\"
  ORDER BY m.name, g.\"yearFrom\";"
```

---

### Task 4: SUVs / Crossovers (GLA, GLB, GLC, GLE, GLS) — re-verify V167, X167 with snapshot-reconcile

**Objective:** Add curated trims for 13 generations: GLA (X156, H247), GLB (X247), GLC (X204, X253, X254), GLE (W163, W164, W166, V167), GLS (X164, X166, X167). Re-verify V167 and X167 using snapshot-then-reconcile (same pattern as Task 2).
**Dependencies:** Task 3

**Files:**
- Modify: `prisma/seed-trims.ts`
- Modify: `prisma/seed.ts` (lines 309–317 — update sample-part `trimCode` for V167 if `AMG GLE 63 S` gets renamed)

**Key Decisions / Notes:**
- Read GLE/GLS auto-data URLs from the plan's `Source URLs` cache populated by Task 1.
- **Snapshot-then-reconcile pattern**: same as Task 2 but applied to V167 and X167. See Task 2 SQL for the exact 6-step procedure (snapshot PartTrim + RepairOrder.trimId, pre-delete, seed, re-link, report).
- GLC X204 (2008–2015) was the **GLK-Class** until renamed GLC in 2015. Trims: GLK 200 CDI, GLK 220 CDI, GLK 250 CDI, GLK 280, GLK 300, GLK 320 CDI, GLK 350. Note in `notes`: `"продавался как GLK"`.
- GLC X254 (2022–): GLC 200 4MATIC, GLC 220 d 4MATIC, GLC 300 4MATIC, **GLC 300 e 4MATIC** (PHEV → HYBRID), **GLC 400 e 4MATIC** (PHEV → HYBRID), AMG GLC 43, **AMG GLC 63 S E PERFORMANCE** (PHEV → HYBRID).
- GLE W163 (1997–2004) was the **M-Class / ML**. Trims: ML 230, ML 270 CDI, ML 320, ML 350, ML 400 CDI, ML 430, ML 500, ML 55 AMG. Note `"продавался как M-Class / ML"`.
- GLE V167 (2019–): GLE 300 d, GLE 350 d, GLE 400 d, GLE 450, GLE 53 AMG, GLE 63 S AMG, **GLE 350 de** (PHEV diesel+electric → HYBRID; notes: `"дизель+электро PHEV; OM654 + EM, 2019–"`), **GLE 450 e** (PHEV petrol+electric → HYBRID). Re-verify HP/engines vs auto-data.
- GLS X164 (2006–2012) was the **GL-Class**: GL 320 CDI, GL 350 CDI, GL 420 CDI, GL 450, GL 500, GL 550. Note `"продавался как GL-Class"`.
- GLS X167 (2019–): GLS 350 d, GLS 400 d, GLS 450, GLS 500 4MATIC, GLS 580, GLS 600 (Maybach), AMG GLS 63. Re-verify HP.

**Critical: sample-part trim code preservation.** `seed.ts:309-317` references:
- `gle:V167 trimCode "AMG GLE 63 S"` (multiple part references)
Preserve this code if it still matches auto-data, or update both files in this commit.

**Definition of Done:**
- [ ] All 13 generations have a curated trim block.
- [ ] V167 and X167 source URLs are auto-data.net, no longer say `"needs re-verification"`.
- [ ] Snapshot tables `_pt_snapshot_v167_x167` and `_ro_snapshot_v167_x167` were created on local DB before pre-delete.
- [ ] After re-seed, reconciliation report ran. Each non-zero unrecovered entry has a commit-message line.
- [ ] `seed.ts:309-317` runs without "specific trim not found" warnings for V167 references.
- [ ] X204 trim codes start with `GLK` (historical accuracy).
- [ ] W163, W164, W166 trim codes start with `ML` (historical accuracy).
- [ ] X164 trim codes start with `GL`.
- [ ] All PHEV trims (GLC 300 e, GLC 400 e, AMG GLC 63 S E PERFORMANCE, GLE 350 de, GLE 450 e) use `fuelType: "HYBRID"` with base fuel in notes.
- [ ] `npx prisma db seed` succeeds locally with `0 curated rows skipped`.
- [ ] `npx tsc --noEmit` passes.
- [ ] Git: one commit, `catalog: GLA + GLB + GLC + GLE + GLS curated trims (V167/X167 re-verified with reconcile)`.

**Verify:**
```bash
DATABASE_URL="postgresql://alex@localhost:5432/geleoteka" npx prisma db seed
psql "postgresql://alex@localhost:5432/geleoteka" -c "
  SELECT m.name, g.code, COUNT(t.id) FILTER (WHERE NOT t.\"isDefault\") AS curated
  FROM \"VehicleModel\" m
  JOIN \"VehicleGeneration\" g ON g.\"modelId\" = m.id
  LEFT JOIN \"VehicleTrim\" t ON t.\"generationId\" = g.id
  WHERE m.name IN ('GLA', 'GLB', 'GLC', 'GLE', 'GLS')
  GROUP BY m.name, g.code, g.\"yearFrom\"
  ORDER BY m.name, g.\"yearFrom\";"
grep -A1 'generationCode: "V167"\|generationCode: "X167"' prisma/seed-trims.ts | grep source
```

---

### Task 5: EVs (EQA, EQB, EQC, EQE, EQS)

**Objective:** Add curated trims for 7 generations: EQA (H243), EQB (X243), EQC (N293), EQE (V295 sedan, X294 SUV), EQS (V297 sedan, X296 SUV).
**Dependencies:** Task 4

**Files:**
- Modify: `prisma/seed-trims.ts`

**Key Decisions / Notes:**
- All trims use `fuelType: "ELECTRIC"`. Omit `displacementL`. Use `horsepower` for combined motor output.
- **EV motor codes:** populate `engineCode` with the motor type per auto-data.net when available — `"PSM"` (Permanent-Synchronous), `"PSM x2"` (twin-motor AWD), `"ASM"` (Asynchronous), `"ASM+PSM"` (mixed). Skip if auto-data is silent.
- Put battery capacity (kWh) and motor count in `notes` (Russian): e.g. `"батарея 90.6 кВт·ч; 1 двигатель PSM"` or `"батарея 107.8 кВт·ч; 2 двигателя PSM AWD"`.
- EQA H243 (2021–): EQA 250, EQA 250+, EQA 300 4MATIC, EQA 350 4MATIC.
- EQB X243 (2021–): EQB 250+, EQB 300 4MATIC, EQB 350 4MATIC.
- EQC N293 (2019–2023): EQC 400 4MATIC (only one trim; ~408 HP, 80 kWh).
- EQE V295 (sedan, 2022–): EQE 300, EQE 350+, EQE 350 4MATIC, EQE 500 4MATIC, AMG EQE 43 4MATIC, AMG EQE 53 4MATIC+.
- EQE X294 (SUV, 2022–): EQE 300, EQE 350+, EQE 350 4MATIC, EQE 500 4MATIC, AMG EQE 43 4MATIC, AMG EQE 53 4MATIC+.
- EQS V297 (sedan, 2021–): EQS 450+, EQS 450 4MATIC, EQS 500 4MATIC, EQS 580 4MATIC, AMG EQS 53 4MATIC+, Maybach EQS 680 4MATIC.
- EQS X296 (SUV, 2022–): EQS 450+, EQS 450 4MATIC, EQS 500 4MATIC, EQS 580 4MATIC, Maybach EQS 680 4MATIC.

**Definition of Done:**
- [ ] All 7 generations have a curated trim block.
- [ ] Every trim has `fuelType: "ELECTRIC"`.
- [ ] Every trim has `horsepower` set.
- [ ] Where auto-data lists motor type, `engineCode` is populated with `"PSM"`, `"ASM"`, `"PSM x2"`, etc.
- [ ] EQE V295 and X294 are SEPARATE blocks (different chassis).
- [ ] EQS V297 and X296 are SEPARATE blocks.
- [ ] `npx prisma db seed` succeeds locally with `0 curated rows skipped`.
- [ ] `npx tsc --noEmit` passes.
- [ ] Git: one commit, `catalog: EQA/EQB/EQC/EQE/EQS curated trims`.

**Verify:**
```bash
DATABASE_URL="postgresql://alex@localhost:5432/geleoteka" npx prisma db seed
psql "postgresql://alex@localhost:5432/geleoteka" -c "
  SELECT m.name, g.code,
    COUNT(t.id) FILTER (WHERE NOT t.\"isDefault\") AS curated,
    COUNT(t.id) FILTER (WHERE t.\"fuelType\" = 'ELECTRIC') AS electric
  FROM \"VehicleModel\" m
  JOIN \"VehicleGeneration\" g ON g.\"modelId\" = m.id
  LEFT JOIN \"VehicleTrim\" t ON t.\"generationId\" = g.id
  WHERE m.name IN ('EQA', 'EQB', 'EQC', 'EQE', 'EQS')
  GROUP BY m.name, g.code, g.\"yearFrom\"
  ORDER BY m.name, g.\"yearFrom\";"
# Expect: curated == electric (every curated EV trim is ELECTRIC).
```

---

### Task 6: Vans (V-Class) + G-Class W464 catch-up

**Objective:** Add curated trims for V-Class (W638, W639, W447). Also research and (if possible) add curated trims for G-Class W464 (the utility-line gen left bare in earlier G-Class commits because Wikipedia coverage was thin).
**Dependencies:** Task 5

**Files:**
- Modify: `prisma/seed-trims.ts`

**Key Decisions / Notes:**
- V-Class W638 (1996–2003) sold as **V-Class** — V 200, V 230, V 230 TD, V 280.
- V-Class W639 (2003–2014) sold as **Viano** — Viano 2.2 CDI, Viano 3.0 CDI, Viano 3.0 V6, Viano 3.5 V6. Note `"продавался как Viano"` in trim notes.
- V-Class W447 (2014–): V 200 d, V 220 d, V 250 d, V 300 d, V 250 4MATIC, V 300 d 4MATIC.
- Body style: V-Class has `kompakt` / `lang` / `extralang` lengths. Use `bodyStyle: "lang"` etc. only if auto-data documents per-length engine differences. Otherwise omit.

**G-Class W464 catch-up:**
- W464 is the post-2022 utility-line G that replaced the W461 (kept the ladder frame and military/commercial focus). Mercedes-Benz Defense and Special Vehicles arms sell it.
- Wikipedia coverage is thin (already documented as `"details limited in source"` in `prisma/seed-vehicles.ts` line 92). Auto-data.net likely has even less.
- Research order: (1) check auto-data.net for `mercedes-benz g-class W464`. (2) check Wikipedia "Mercedes-Benz G-Class" article's W464 section. (3) check Mercedes-Benz Defense product brochures (PDF, may not be web-fetchable).
- If auto-data lists ≥ 1 trim: add a `CuratedGeneration` block with what's documented (likely G 400 d Professional or G 230 Professional).
- If no source documents trims: leave the gen with only its `ALL` default — note in this plan's `Open Questions` section that W464 trims are intentionally bare pending public Mercedes Defense documentation.

**Definition of Done:**
- [ ] All 3 V-Class generations have a curated trim block.
- [ ] W639 trim notes mention "Viano".
- [ ] G-Class W464: either has ≥ 1 curated trim with cited source, OR Open Questions section documents that W464 stays bare and lists the sources searched.
- [ ] `npx prisma db seed` succeeds locally with `0 curated rows skipped`.
- [ ] `npx tsc --noEmit` passes.
- [ ] Git: one commit, `catalog: V-Class curated trims + G-Class W464 catch-up`.

**Verify:**
```bash
DATABASE_URL="postgresql://alex@localhost:5432/geleoteka" npx prisma db seed
psql "postgresql://alex@localhost:5432/geleoteka" -c "
  SELECT g.code, COUNT(t.id) FILTER (WHERE NOT t.\"isDefault\") AS curated
  FROM \"VehicleGeneration\" g
  JOIN \"VehicleModel\" m ON m.id = g.\"modelId\"
  LEFT JOIN \"VehicleTrim\" t ON t.\"generationId\" = g.id
  WHERE m.name = 'V-Class'
  GROUP BY g.code, g.\"yearFrom\"
  ORDER BY g.\"yearFrom\";"
```

---

### Task 7: Verification script + prod deploy + final verification

**Objective:** (a) Add a `scripts/verify-vehicle-trims.ts` that warns on bare generations and reports trim counts. (b) Apply all 6 family commits to prod via snapshot-reconcile re-seed. (c) Verify every non-G-Class generation has ≥ 1 curated trim, no orphaned downstream rows, and source URLs are correct.
**Dependencies:** Tasks 1–6

**Files:**
- Create: `scripts/verify-vehicle-trims.ts` (~30 lines, mirrors `scripts/verify-vehicle-catalog.ts` style)
- Modify: `package.json` (add `"verify-vehicle-trims": "tsx scripts/verify-vehicle-trims.ts"` to scripts)

**Key Decisions / Notes:**

**Sub-step 7a — verification script:** Mirror the existing `verify-vehicle-catalog.ts` pattern. Query: every active generation, count curated trims (NOT isDefault). Report:
- Total generations and total curated trims.
- Per-model summary: model name, count of bare gens (curated = 0), list of bare gens.
- Exit code 0 if all generations have ≥ 1 curated trim, exit code 1 otherwise (so CI can block).
- Add intentionally-bare exceptions allow-list: G-Class W464 if Task 6 documented it as bare. The script accepts a `--allow-bare g-class:W464` flag.

**Sub-step 7b — prod deploy with snapshot-reconcile:**

1. Push code first so prod app matches seed (Railway auto-deploys):
   ```bash
   git push origin main
   ```

2. Snapshot affected PartTrim and RepairOrder rows on PROD using REAL tables (not TEMP) so they survive across psql invocations:
   ```bash
   PROD_DB="postgresql://postgres:cQNZolosjoxpJFZntPCNImVwzbGsTLWJ@metro.proxy.rlwy.net:55662/railway"
   psql "$PROD_DB" <<'SQL'
   DROP TABLE IF EXISTS _pt_snapshot_reverify;
   DROP TABLE IF EXISTS _ro_snapshot_reverify;

   CREATE TABLE _pt_snapshot_reverify AS
   SELECT pt."partId", pt."trimId", t.code AS old_trim_code, g.code AS gen_code, m.name AS model_name
   FROM "PartTrim" pt
   JOIN "VehicleTrim" t ON t.id = pt."trimId"
   JOIN "VehicleGeneration" g ON g.id = t."generationId"
   JOIN "VehicleModel" m ON m.id = g."modelId"
   WHERE NOT t."isDefault"
     AND ((m.name = 'C-Class' AND g.code = 'W205')
       OR (m.name = 'E-Class' AND g.code = 'W213')
       OR (m.name = 'GLE' AND g.code = 'V167')
       OR (m.name = 'GLS' AND g.code = 'X167'));

   CREATE TABLE _ro_snapshot_reverify AS
   SELECT ro.id AS repair_order_id, ro."trimId", t.code AS old_trim_code, g.code AS gen_code, m.name AS model_name
   FROM "RepairOrder" ro
   JOIN "VehicleTrim" t ON t.id = ro."trimId"
   JOIN "VehicleGeneration" g ON g.id = t."generationId"
   JOIN "VehicleModel" m ON m.id = g."modelId"
   WHERE NOT t."isDefault"
     AND ((m.name = 'C-Class' AND g.code = 'W205')
       OR (m.name = 'E-Class' AND g.code = 'W213')
       OR (m.name = 'GLE' AND g.code = 'V167')
       OR (m.name = 'GLS' AND g.code = 'X167'));

   SELECT 'PartTrim snapshot rows:' AS label, COUNT(*) FROM _pt_snapshot_reverify
   UNION ALL SELECT 'RepairOrder snapshot rows:', COUNT(*) FROM _ro_snapshot_reverify;
   SQL
   ```

3. **GUARD: row-count sanity check** — count curated rows about to be deleted on prod. Compare to the local-DB count. If prod count > local count + 5 (5-row fudge), ABORT and ask user — that catches admin-created curated trims the local seed doesn't know about:
   ```bash
   psql "$PROD_DB" -c "
     SELECT COUNT(*) FROM \"VehicleTrim\" t
     JOIN \"VehicleGeneration\" g ON g.id = t.\"generationId\"
     JOIN \"VehicleModel\" m ON m.id = g.\"modelId\"
     WHERE NOT t.\"isDefault\"
       AND ((m.name = 'C-Class' AND g.code = 'W205')
         OR (m.name = 'E-Class' AND g.code = 'W213')
         OR (m.name = 'GLE' AND g.code = 'V167')
         OR (m.name = 'GLS' AND g.code = 'X167'));"
   # Compare to local count.
   ```

4. Pre-delete + reseed (single shell flow):
   ```bash
   psql "$PROD_DB" -c "
     DELETE FROM \"VehicleTrim\" WHERE NOT \"isDefault\" AND \"generationId\" IN (
       SELECT g.id FROM \"VehicleGeneration\" g
       JOIN \"VehicleModel\" m ON m.id = g.\"modelId\"
       WHERE (m.name = 'C-Class' AND g.code = 'W205')
          OR (m.name = 'E-Class' AND g.code = 'W213')
          OR (m.name = 'GLE' AND g.code = 'V167')
          OR (m.name = 'GLS' AND g.code = 'X167')
     );"
   DATABASE_URL="$PROD_DB" npx prisma db seed
   ```

5. Reconcile (re-link by matching codes):
   ```bash
   psql "$PROD_DB" <<'SQL'
   INSERT INTO "PartTrim" ("partId", "trimId")
   SELECT s."partId", t.id
   FROM _pt_snapshot_reverify s
   JOIN "VehicleGeneration" g ON g.code = s.gen_code
   JOIN "VehicleModel" m ON m.id = g."modelId" AND m.name = s.model_name
   JOIN "VehicleTrim" t ON t."generationId" = g.id AND t.code = s.old_trim_code AND NOT t."isDefault"
   ON CONFLICT DO NOTHING;

   UPDATE "RepairOrder" ro
   SET "trimId" = t.id
   FROM _ro_snapshot_reverify s
   JOIN "VehicleGeneration" g ON g.code = s.gen_code
   JOIN "VehicleModel" m ON m.id = g."modelId" AND m.name = s.model_name
   JOIN "VehicleTrim" t ON t."generationId" = g.id AND t.code = s.old_trim_code AND NOT t."isDefault"
   WHERE ro.id = s.repair_order_id AND ro."trimId" IS NULL;
   SQL
   ```

6. Reconciliation report (count of unrecovered rows):
   ```bash
   psql "$PROD_DB" -c "
     SELECT s.model_name, s.gen_code, s.old_trim_code, COUNT(*) AS lost_part_trim_links
     FROM _pt_snapshot_reverify s
     LEFT JOIN \"VehicleGeneration\" g ON g.code = s.gen_code
     LEFT JOIN \"VehicleModel\" m ON m.id = g.\"modelId\" AND m.name = s.model_name
     LEFT JOIN \"VehicleTrim\" t ON t.\"generationId\" = g.id AND t.code = s.old_trim_code AND NOT t.\"isDefault\"
     WHERE t.id IS NULL
     GROUP BY s.model_name, s.gen_code, s.old_trim_code;"
   # Expect: zero rows. If non-zero, list each old code and decide manually.
   ```

7. Drop snapshot tables once reconciliation is verified clean:
   ```bash
   psql "$PROD_DB" -c "DROP TABLE _pt_snapshot_reverify; DROP TABLE _ro_snapshot_reverify;"
   ```

**Sub-step 7c — final verification:**
```bash
# Run the new script against prod
DATABASE_URL="$PROD_DB" npx tsx scripts/verify-vehicle-trims.ts --allow-bare g-class:W464

# Spot checks
psql "$PROD_DB" -c "SELECT COUNT(*) FROM \"VehicleTrim\" WHERE code LIKE '%USA%';"
# Expect: 0.

psql "$PROD_DB" -c "
  SELECT m.name, g.code, COUNT(t.id) FILTER (WHERE NOT t.\"isDefault\") AS curated
  FROM \"VehicleModel\" m
  JOIN \"VehicleGeneration\" g ON g.\"modelId\" = m.id
  LEFT JOIN \"VehicleTrim\" t ON t.\"generationId\" = g.id
  WHERE m.name <> 'G-Class'
  GROUP BY m.name, g.code, g.\"yearFrom\"
  HAVING COUNT(t.id) FILTER (WHERE NOT t.\"isDefault\") = 0
  ORDER BY m.name, g.\"yearFrom\";"
# Expect: zero rows (every non-G-Class gen has ≥ 1 curated trim).
```

**Definition of Done:**
- [ ] `scripts/verify-vehicle-trims.ts` exists, exits 0 against local DB.
- [ ] `package.json` has the `verify-vehicle-trims` script.
- [ ] All 6 family commits pushed to `origin/main`.
- [ ] Snapshot tables `_pt_snapshot_reverify` and `_ro_snapshot_reverify` were created on prod and reported row counts (line 2 of step 2's output).
- [ ] Row-count guard in step 3 confirms prod count is within `local + 5` rows; otherwise paused for user.
- [ ] Pre-delete + seed on prod completed; seed reports `0 curated rows skipped`.
- [ ] Reconciliation re-link executed; report from step 6 shows 0 unrecovered rows OR each unrecovered row was manually addressed.
- [ ] Snapshot tables dropped from prod.
- [ ] `verify-vehicle-trims.ts` against prod exits 0 (with `--allow-bare g-class:W464` if W464 is documented bare).
- [ ] Prod query confirms 0 trim rows with `code LIKE '%USA%'`.
- [ ] Final report posted to user: counts per family, list of intentionally-bare gens (if any), reconciliation summary.

## Open Questions

- **Russian-market trims that auto-data.net doesn't list:** the Russian Mercedes site (https://www.mercedes-benz.ru/) may list local-market-specific trims (e.g. `200 4MATIC` long-wheelbase variants for L-EWB models). Auto-data.net is European-market-centric. We may miss some local variants. Acceptable for V1; add a follow-up plan if customers complain about missing trims.
- **L-EWB / long-wheelbase variants:** if auto-data.net's standard generation page lists L-WB trims with different engine offerings (e.g. S-Class W223 long), include them with `bodyStyle: "long"`. SKIP China-only "L" pages (separate URLs containing `/china`). When in doubt, skip — better silence than China-spec inaccuracy.
- **G-Class W464 utility-line trims:** if Task 6 research finds nothing, document W464 as intentionally bare here (with sources searched listed); customers searching for utility variants will fall back to the `ALL` default trim until Mercedes Defense documentation surfaces.
- **AMG hybrid naming variations:** `AMG E 53 4MATIC+` vs `AMG E 53 HYBRID 4MATIC+` vs `AMG E 53 e 4MATIC+` — auto-data, Mercedes.com, and aftermarket sources all differ. Each AMG hybrid task entry should pre-research the exact code string before writing to avoid duplicate-key collisions.

### Deferred Ideas

- Add `bodyStyle` distinctions for V-Class lengths (kompakt/lang/extralang) and S-Class L-EWB if customers report needing them. Currently optional per task notes.
- Source-of-truth dataset: bundle the per-generation source URLs into a single JSON manifest checked into the repo (alternative to the in-plan `Source URLs` section) for future re-verification audits.
- Schema migration: add `DIESEL_HYBRID` to `FuelType` enum to natively distinguish diesel-PHEV from petrol-PHEV. Currently both are `HYBRID` with base fuel in notes. If picker UX needs to show diesel-PHEV separately, this becomes worth doing.
- Add a CI hook running `scripts/verify-vehicle-trims.ts` on every PR that touches `prisma/seed-trims.ts`.
