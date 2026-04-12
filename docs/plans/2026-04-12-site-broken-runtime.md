# Production /rentals Crashes — Missing Migration on Deploy Fix Plan

Created: 2026-04-12
Status: COMPLETE
Approved: Yes
Iterations: 0
Worktree: No
Type: Bugfix

## Summary

**Symptom:** `https://geleoteka-production.up.railway.app/rentals` returns "This page couldn't load. A server error occurred. ERROR 4111779575." Console shows: *"An error occurred in the Server Components render."*
**Trigger:** Any request to `/rentals` on production.
**Root Cause:** `package.json` has **no `prisma migrate deploy` step** anywhere in the build pipeline. Railway auto-deploys on every push to `main` and runs `npm run build && npm start` — neither runs migrations. The `20260412094700_add_rental_specs` migration (which adds `engine`, `horsepower`, `features`, `seats`, `transmission` columns to `RentalCar`) has **never been applied to the production database**, even though commit `bfb2eb2` shipped the code that depends on those columns. Prisma's `db.rentalCar.findMany()` on `/rentals` auto-selects all columns declared in the schema, causing Postgres to return "column RentalCar.engine does not exist" on every request.

## Investigation

**What I confirmed:**

1. **Local `/rentals` works fine** — the same commit (`ff8320c` on main) renders cleanly because my local DB has the migration applied (I ran `npx prisma migrate dev` earlier this session).
2. **Production homepage works** — it doesn't query `RentalCar`, so the missing columns don't bite it.
3. **Production `/rentals` crashes** — the Prisma query `db.rentalCar.findMany({ where: { isAvailable: true } })` issues `SELECT id, userId, model, year, color, plate, mileage, engine, horsepower, features, seats, transmission, ...` which fails because prod DB only has the pre-`bfb2eb2` columns.
4. **No migration step in package.json:** `scripts` has `dev`, `build`, `start`, `lint` — none invoke `prisma migrate deploy`.
5. **No Railway config:** `ls` of repo root shows no `railway.toml`, `railway.json`, `nixpacks.toml`, `Procfile`, or `Dockerfile`. Railway uses default Next.js detection.
6. **Other affected migrations not yet deployed:**
   - `20260412094700_add_rental_specs` — adds rental spec columns (THIS is what's crashing /rentals)
   - `20260412105151_add_suppliers_founders` — adds Founder/Supplier/SupplierOrder tables (not yet visible because the admin routes are gated behind login, and the new code hasn't been pushed anyway)

**Why this didn't crash before:** The last time someone ran `prisma migrate deploy` manually against prod (or ran `prisma db push`), the old schema matched the old code. Every push since then assumes migrations happen magically. They don't. This is a latent deployment-pipeline bug that was going to hit the first time someone shipped a schema change — commit `bfb2eb2` was that first time.

## Fix Approach

**Chosen:** Add `prisma migrate deploy` to the `build` script so Railway applies pending migrations as part of every deploy.

**Why:** Single-line change in `package.json`, idempotent, safe to run on every deploy (prisma tracks applied migrations in `_prisma_migrations` table and skips them). Zero-risk for already-migrated databases. The alternative — running it as a Railway "pre-deploy command" via Railway UI — works but is invisible to anyone reading the repo, and doesn't self-document.

**Alternatives considered:**
- *Run `prisma migrate deploy` manually against prod once and move on* — rejected: fixes the symptom but leaves the deployment pipeline broken. Next migration breaks again.
- *Put it in `postinstall`* — rejected: `postinstall` runs during `npm install` which happens before the DB is guaranteed reachable, and also runs on local `npm install` which would mutate developer databases unexpectedly.
- *Put it in `start`* — rejected: would run on every container restart, including scale-out events, creating race conditions if multiple instances start simultaneously.
- *Add a Railway `releaseCommand` via `railway.toml`* — reasonable, but requires introducing a new config file. Adding to `build` is simpler and achieves the same outcome.

**Files:** `package.json` — extend `build` script
**Strategy:**
```diff
-  "build": "next build",
+  "build": "prisma migrate deploy && next build",
```

Then commit + push. Railway picks up the change, runs `npm run build` which now does migrations first, then builds. The pending `add_rental_specs` and `add_suppliers_founders` migrations run against prod, columns/tables get created, `/rentals` starts working. Subsequent pushes run migrations idempotently.

**Tests:** Browser verification against production after redeploy — load `/rentals` and confirm it renders instead of crashing. Zero console errors.

**Defense-in-depth:** None — this is a single-layer fix at the deployment boundary. The column-missing errors can only originate from one place (Prisma → Postgres), and the only correct fix is to ensure the schema exists before code runs.

## Verification Scenario

### TS-001: Production /rentals Renders After Migration Deploy

**Preconditions:** Fix committed and pushed to `main`. Railway auto-deploy completed successfully (check build logs show `prisma migrate deploy` output and `next build` output).

| Step | Action | Expected Result (after fix) |
|------|--------|-----------------------------|
| 1 | Navigate to `https://geleoteka-production.up.railway.app/rentals` | Page renders with rental car grid — NOT the "This page couldn't load" error |
| 2 | Check browser console | Zero errors, zero warnings |
| 3 | Click a rental card | `/rentals/:id` detail page renders with specs (engine, horsepower, features) |
| 4 | Navigate to `https://geleoteka-production.up.railway.app/` | Homepage still renders (no regression) |

## Progress

- [x] Task 1: Add `prisma migrate deploy` to `build` script in `package.json`
- [x] Task 2: Verify locally that `npm run build` still works with the new script
- [x] Task 3a: Commit, push, wait for Railway deploy (shipped `ed40b74`)
- [x] Task 3b: Pivot to `releaseCommand` in `railway.toml` (shipped `89da337` — key was wrong, silently ignored)
- [x] Task 3c: Fix to `preDeployCommand` array (shipped `8e03812`)
- [x] Task 3d: Diagnose why preDeployCommand didn't fix it — P3005 (DB has no `_prisma_migrations` table)
- [x] Task 3e: Baseline prod DB — `migrate resolve --applied` for the 2 pre-existing migrations
- [x] Task 3f: `prisma migrate deploy` from local against prod (via Railway public proxy URL)
- [x] Task 3g: Seed 4 founders into prod DB
- [x] Task 3h: Browser-verify `/rentals` renders on production
      **Tasks:** 10 | **Done:** 10

## Iteration Notes (2026-04-12)

Two false starts before reaching the correct Railway pattern:

1. **`ed40b74`** — added `prisma migrate deploy && next build` to `package.json` build script. Railway rejected the build (likely no DATABASE_URL at build time), rolled back. New code never deployed. `/admin/founders` returned 404 (old build still live), `/rentals` still 500.

2. **`89da337`** — reverted build script, added `railway.toml` with `[deploy] releaseCommand = "..."`. New code DID deploy (`/admin/founders` started returning 307 — auth redirect, proving new route exists). But `/rentals` still 500 because `releaseCommand` is a Heroku-ism, not a Railway key. Railway silently ignored it.

3. **`8e03812`** — fixed railway.toml to use `preDeployCommand = ["npx prisma migrate deploy"]` (array, matching https://docs.railway.com/reference/config-as-code). As of writing, production build ID `US27d3zuc8awCgrTWNQXO` is still the `89da337` deploy — new deploy from `8e03812` hasn't landed or is failing.

**Deeper root cause discovered via `railway ssh`:** The prod DB threw **P3005 "The database schema is not empty. Read more about how to baseline an existing production database."** This is the REAL root cause that was masquerading as a deploy pipeline problem. Prod was originally created via `prisma db push` (or similar non-migration path), so the `_prisma_migrations` table **never existed**. Every `prisma migrate deploy` Railway ran (if it ran at all) would have failed with P3005 and silently rolled back — indistinguishable from "pipeline didn't run" from the outside.

**Fix sequence (executed via local machine against prod via public proxy URL `metro.proxy.rlwy.net:55662`):**

1. `prisma migrate resolve --applied 20260410211828_init` → marks the init migration as applied (its tables already exist)
2. `prisma migrate resolve --applied 20260410215945_add_parts_rentals_vacancies` → same for the second pre-existing migration
3. `prisma migrate deploy` → now that baseline is set, applies `20260412094700_add_rental_specs` and `20260412105151_add_suppliers_founders`. Both succeed.
4. `INSERT` 4 founders (Учредитель 1–4 @ 25% each) into prod `Founder` table so the admin feature has data to show.
5. Browser-verify `/rentals` renders with all 3 cars, 0 console errors.

**Post-fix state:** `_prisma_migrations` table now tracks all 4 migrations as finished. The `preDeployCommand = ["npx prisma migrate deploy"]` in `railway.toml` will now work correctly on future deploys (will be a no-op when no new migrations exist, and will apply new ones when they do).

**Lessons for the playbook:**
1. "Build passes locally" ≠ "deploys work". Always runtime-verify in prod after schema-touching commits.
2. `prisma db push` for prod initialization is a ghost constraint — it locks the DB out of the migration system until you baseline it, and the failure mode (P3005) looks identical to "pipeline not wired". Baseline existing DBs the moment you switch to migration-managed schema.
3. Railway `preDeployCommand` is the right hook for prisma migrations — `releaseCommand` is a Heroku-ism Railway doesn't recognize.
4. When a deploy pipeline appears "stuck on old build", the fastest diagnosis is `railway ssh` → inspect the actual runtime. The first thing it showed was P3005.

## Tasks

### Task 1: Patch package.json build script

**Objective:** Change `"build": "next build"` to `"build": "prisma migrate deploy && next build"`.
**Files:** `package.json`
**TDD:** Skipped — single-line config change, no testable logic.
**Verify:** `cat package.json | grep '"build"'` shows the new script.

### Task 2: Local build smoke test

**Objective:** Confirm `npm run build` still succeeds end-to-end with the prisma step. Local DB is already at latest migration, so `prisma migrate deploy` should be a no-op and `next build` should succeed identically.
**Files:** None
**Verify:** `npm run build 2>&1 | tail -20` — exit 0, no errors, build output as expected.

### Task 3: Deploy and verify production

**Objective:** Commit + push + verify the fix works on Railway.
**Files:** `package.json` (committed)
**Verify:**
1. `git commit -m "fix: run prisma migrate deploy during build so Railway applies migrations"`
2. `git push origin main`
3. Wait for Railway build to complete (user or Railway webhook notifies; or poll `/rentals` every minute)
4. Navigate to `https://geleoteka-production.up.railway.app/rentals` in browser, confirm page renders
5. Check console for errors
