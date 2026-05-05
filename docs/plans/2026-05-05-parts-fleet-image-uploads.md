# Parts & Rental Fleet Image Uploads Implementation Plan

Created: 2026-05-05
Author: aleksandr.spiskov@gmail.com
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Let admins upload, reorder, and remove product/fleet photos from the admin panel. Uploaded images live in Postgres (BYTEA) so they survive Railway redeploys; they're served via a dedicated route handler with long-lived cache headers and rendered by the existing public parts and rentals UI.

**Architecture:** A new `UploadedImage` Prisma model holds processed image bytes. A `POST /api/upload` route handler accepts a multipart file from admins, validates type/size, runs it through `sharp` (resize to max 1600 px wide, convert to WebP), and returns `{ url: "/api/images/<id>" }`. A `GET /api/images/[id]` handler streams the bytes back with `Cache-Control: public, max-age=31536000, immutable`. A reusable `<PhotoUploader>` client component wraps the upload + drag-and-drop reorder UI and writes the final ordered URL list into a hidden form field that the existing server actions persist into the already-present `Part.photos` and `Vehicle.photos` `String[]` columns. Reference-counted cleanup deletes orphan `UploadedImage` rows when admins remove photos. A one-shot `npm run migrate-static-photos` script ports the three seeded `/public/images/rentals/g-*.jpg` files into the new pipeline.

**Tech Stack:** Next.js 16.2.3 (App Router, Route Handlers), React 19.2, Prisma 6 + Postgres (BYTEA), `sharp` (new dependency), `tsx` (already a devDep, used for the migration script). No client-side image library — drag-and-drop uses HTML5 native APIs.

## Scope

### In Scope

- New Prisma model `UploadedImage` (id, bytes, mimeType, width, height, size, createdAt, createdById) with migration.
- GIN indexes on `Part.photos` and `Vehicle.photos` (`String[]`) so reference-count lookups are fast.
- `lib/uploads.ts` server-only helpers: `processImage`, `parsePhotosFromForm`, `imageIdFromUrl`, `deleteOrphanImages`.
- `POST /api/upload` route handler — admin-only, accepts one image, returns its public URL.
- `GET /api/images/[id]` route handler — public, byte-streams the image with immutable cache headers and ETag.
- New shared client component `components/admin/PhotoUploader.tsx` — uploads files, shows thumbnails, reorder via HTML5 drag-and-drop, remove buttons, validation feedback.
- Wire the uploader into `PartForm`, `PartEditForm`, and into a new `RentalCarForm` (extracted from the inline new-rental page) and the existing `RentalEditForm`.
- Update server actions `createPart`, `updatePart`, `createRentalCar`, `updateRentalCar` to persist the `photos` array and run reference-counted cleanup of removed UploadedImage rows.
- One-shot migration script `scripts/migrate-static-photos.ts` (+ `npm run migrate-static-photos`) that ports the 3 seeded `/public/images/rentals/g-*.jpg` files into `UploadedImage` rows and rewrites `Vehicle.photos`. Idempotent.
- E2E browser-automation verification that uploaded images render on `/parts`, `/parts/[slug]`, `/rentals`, and `/rentals/[id]`.
- Add `sharp` to `next.config.ts` `serverExternalPackages` so it isn't bundled.

### Out of Scope

- Migration to object storage (R2/S3/Railway Volume). Staying on BYTEA per the chosen approach. Switching later means replacing `lib/uploads.ts` plus the two route handlers — the rest of the code is storage-agnostic.
- Switching public `<img>` tags to `next/image`. Existing parts and rentals pages already use `<img>` — keep that consistent. (Adding `next/image` would require allowlisting the `/api/images/` source in `next.config.ts` and is a separate polish task.)
- Generating thumbnails (separate small artifacts for list views). Single 1600 px WebP per upload is sufficient for current page sizes; can be added by extending `processImage`.
- Per-image alt text or captions. Existing UI uses `Part.name` / `Vehicle.model` as alt; sufficient for v1.
- Bulk upload from CSV. Existing `/admin/parts/import/route.ts` continues to import CSV without photos.
- Cleanup of the static files in `/public/images/rentals/` after migration. The files stay on disk as harmless dead static assets; removing them is a follow-up commit if desired.
- Concurrent-edit conflict handling on photos (last-write-wins matches existing form pattern).
- Image deletion audit log.

## Approach

**Chosen:** Postgres BYTEA storage + sharp WebP processing + admin `<PhotoUploader>` client component + reference-counted orphan cleanup.

**Why:** Zero new infra to provision (no S3/R2 credentials, no Railway Volume), images survive every Railway redeploy, single backup target, and ref-counted delete keeps the row count from drifting. Sharp adds ~30 MB of native binaries to the deploy but produces ~5–10× smaller files than typical phone photos, which more than offsets the BYTEA storage cost.

**Alternatives considered:**

- **Object storage (R2/S3):** more scalable and CDN-cached, but requires bucket provisioning and credentials, plus an SDK dep. Premature for current traffic.
- **Railway Volume:** persistent on Railway specifically, but ties storage to one platform and one region, and requires manual volume provisioning before deploy.
- **Local `/public/uploads/`:** simplest code path but uploaded files vanish on every Railway redeploy — non-viable for production.
- **Store originals as-is (no `sharp`):** lower complexity, but admins uploading 8–10 MB phone photos would bloat the DB and slow public pages. WebP at 1600 px is a clear win.
- **Up/down arrow reorder buttons:** lower UX polish, similar code volume to drag-and-drop. Drag-and-drop is the target.
- **Leave-orphans + manual cleanup script:** simpler write path but accumulates dead bytes until cleanup runs.

## Context for Implementer

> The repo is **not** the Next.js you have in your training data — it's 16.2.3 with App Router conventions evolved past common docs. Read `node_modules/next/dist/docs/01-app/...` before writing route handlers. In particular, route handlers receive a `RouteContext<'/path/[id]'>` where `params` is a Promise (`await ctx.params`). See `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`.

- **Patterns to follow:**
  - Multipart upload pattern already used: `app/api/parts/import/route.ts:82` — `await request.formData()` then `formData.get("file") as File | null`. Mirror this for `/api/upload`.
  - Server actions for admin mutations: `app/actions/parts.ts` (`updatePart`) — `useActionState`-compatible, first param is `_prevState`, returns `{ error: string | null }`, redirects on success.
  - JSON-encoded array as a hidden form field: `app/actions/parts.ts:21` `parseTrimIds` shows the parse + validate flow; `components/admin/PartTrimPicker.tsx` shows the matching client side. Mirror this for the photos array.
  - Prisma type pattern: results lose inference through `db` singleton — use explicit interfaces or `Record<string, unknown>` casts. See `app/(admin)/admin/parts/[id]/page.tsx:30`.
  - Auth in pages vs route handlers: pages use `getSession()` + `redirect()` (or `requireRole` only outside page bodies); route handlers can call `requireRole(["ADMIN", "MANAGER"])` directly because they don't unwrap the way page components do — `app/api/parts/import/route.ts:81` does this.
  - Public image render: existing list/detail pages already read `Part.photos`/`Vehicle.photos` and feed them into `<img>` tags or `<ImageGallery>` (`components/shared/ImageGallery.tsx`). No public-page changes needed beyond making sure new URLs work.

- **Conventions:**
  - File naming: components PascalCase, actions kebab-case, lib kebab-case (`geleoteka-conventions.md`).
  - All styling via CSS variables and component classes — `.btn`, `.btn-primary`, `.input`, `.card`. Never hardcode hex.
  - Import Prisma client from `@/app/generated/prisma/client`, never `@prisma/client`. (The DB singleton in `lib/db.ts` already does this — just import `db`.)
  - Translatable UI strings stay in Russian (matches existing admin UI: "Сохранить", "Загрузить фото", etc.).

- **Key files:**
  - `prisma/schema.prisma` — add `UploadedImage` model and the two GIN indexes here.
  - `app/api/upload/route.ts` — currently the directory exists empty; create the route handler here.
  - `app/api/images/[id]/route.ts` — new dynamic route handler for serving bytes.
  - `lib/uploads.ts` — new server-only module (helpers).
  - `components/admin/PhotoUploader.tsx` — new shared client component.
  - `components/admin/PartForm.tsx`, `PartEditForm.tsx`, `RentalEditForm.tsx` — wire in `<PhotoUploader>`.
  - `components/admin/RentalCarForm.tsx` — new shared form extracted from the inline new-rental page so the client component can mount.
  - `app/(admin)/admin/rentals/new/page.tsx` — convert to a server component that delegates to `RentalCarForm`.
  - `app/(admin)/admin/parts/[id]/page.tsx`, `app/(admin)/admin/rentals/[id]/page.tsx` — pass `photos` through to the edit forms.
  - `app/actions/parts.ts`, `app/actions/rentals.ts` — read `photos` from FormData, persist, run orphan cleanup.
  - `next.config.ts` — append `"sharp"` to `serverExternalPackages`.
  - `scripts/migrate-static-photos.ts` — new file (directory does not exist yet — create it).

- **Gotchas:**
  - `Part.photos` and `Vehicle.photos` are already `String[]` — **do not** add new columns. Just persist the array.
  - `createPart` currently writes `photos: []` (`app/actions/parts.ts:85`) — replace with the parsed array. `updatePart` currently doesn't include `photos` at all (`app/actions/parts.ts:121`) — add it.
  - `createRentalCar` writes `photos: []` (`app/actions/rentals.ts:56`) — replace. `updateRentalCar` spreads `data` (which doesn't include `photos`) — add.
  - The new-rental page is a `"use client"` page (`app/(admin)/admin/rentals/new/page.tsx:1`). To avoid losing `requireRole` server-side, convert it to a server component that renders `<RentalCarForm />` (analogous to `parts/new/page.tsx`).
  - Sharp must be in `serverExternalPackages` because the bundler tries to follow native binaries otherwise — without it `next build` fails or the wrong native binary ships.
  - Route handlers in Next.js 16 receive a `context` whose `params` is async: `const { id } = await ctx.params`. Use `RouteContext<'/api/images/[id]'>` for typing.
  - `request.formData()` in a route handler buffers the whole multipart body in memory — fine at our 5 MB cap.
  - The `<PhotoUploader>` lives in client components; never import server-only `lib/uploads.ts` from it. The component talks to `/api/upload` over `fetch`.
  - GIN indexes on `String[]` columns require `USING gin (photos)` raw SQL in the migration. Prisma's index DSL doesn't yet model GIN on text arrays, so the migration is hand-edited after `prisma migrate dev`.
  - When deleting an `UploadedImage`, do the orphan check inside the same transaction that updates `Part`/`Vehicle` — so a failed delete also rolls back the form submit, keeping the form state and DB consistent.
  - The migration script reads files from `public/images/rentals/g-black.jpg`, `g-white.jpg`, `g-grey.jpg`. These are the exact paths the seed inserts (`prisma/seed.ts:338,353,368`).
  - Public image render on lists already uses `<img src={(part.photos as string[])[0]} />` (`app/(public)/parts/page.tsx:171`). Once URLs change to `/api/images/<id>` the same code keeps working — no template changes.

- **Domain context:**
  - "Запчасть" = part. "Аренда" = rental. The brand voice in admin UI is Russian and pragmatic ("Загрузить", "Удалить", "Сохранить").
  - There is no public upload — only ADMIN/MANAGER (`UserPermissionRole`) can hit `/api/upload`. Public users only consume `/api/images/[id]` via image tags.

## Runtime Environment

- **Start command (dev):** `npm run dev` — boots Next on `https://localhost:443` with `--experimental-https`. Hot-reloads route handlers and components.
- **Start command (prod):** `npm run build && npm start` — `next start -H 0.0.0.0 -p ${PORT:-443}`.
- **Port:** 443 by default (HTTPS in dev).
- **Database:** `postgresql://alex@localhost:5432/geleoteka` (dev). Migrations via `npx prisma migrate dev --name <name>`. `npx prisma generate` after schema changes.
- **Deploy:** Railway auto-deploys on push to `main` (`github.com/0pt1m1sm/geleoteka`). Uploaded images live in Postgres and survive redeploys; no extra deploy steps.
- **Health check:** open `https://localhost/admin` (login admin@geleoteka.ru / admin123).
- **Restart:** stop the dev server (Ctrl-C) and re-run `npm run dev`. The next dev server picks up Prisma schema changes after `npx prisma generate`.

## Assumptions

- Sharp's prebuilt linux-x64 binaries ship via npm and work on Railway's container — supported by sharp's official docs. Tasks 2 & 8 depend on this.
- Postgres can store and serve a few hundred MB of BYTEA without operational pain on the current Railway plan — supported by typical Postgres workloads. All tasks depend.
- Admin users will upload reasonable photos (≤ 5 MB raw, JPG/PNG/WebP/AVIF). Validation enforces the cap at the API boundary. Tasks 2 & 4 depend.
- The existing `Part.photos` / `Vehicle.photos` `String[]` columns are the authoritative source of truth for ordered photo URLs (`prisma/schema.prisma:252,528`). All wiring tasks depend.
- The 3 seeded rental cars are the only DB rows that currently reference the static `/public/images/rentals/` paths — supported by `grep -n "/images" prisma/seed.ts`. Task 7 depends.
- HTML5 drag-and-drop is acceptable (no need for touch-device polish in v1). Admin users are on desktop (`geleoteka-project.md` describes admin panel as desktop-first). Task 4 depends.
- Browser caches `/api/images/<id>` immutably for one year, so list pages with 100 photos make 100 cold requests once and 0 on revisit. Tasks 3 & verification depend.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Sharp's native binary fails to install on Railway (different libc, ARM, etc.) | Low | High | Verify locally on a clean `node_modules` install (Task 2 DoD). Add `sharp` to `serverExternalPackages` so Next doesn't try to bundle it. If install fails, fall back to `@squoosh/lib` (pure WASM) — call out in Task 2. |
| BYTEA grows unbounded (admins keep uploading) | Medium | Medium | Reference-counted delete on photo removal removes the row immediately. Document the manual `npm run cleanup-orphan-uploads` follow-up if drift is observed. |
| Two simultaneous `updateRentalCar` calls on the same vehicle race the orphan-cleanup check, leaving an orphan UploadedImage | Low | Low | Accept (matches existing last-write-wins behavior). Periodic cleanup script catches drift. |
| Ref-counted delete misses references in legacy `String[]` rows because the URL string isn't normalized (e.g., trailing slash) | Low | Medium | Normalize URLs before storing and before checking — only `/api/images/<id>` (no extension, no slash). The `imageIdFromUrl` helper enforces this regex. |
| Migration script runs twice and double-uploads | Low | Medium | Idempotent: skip any vehicle whose first photo URL already starts with `/api/images/`. Verified by running the script twice in Task 7 DoD. |
| `request.formData()` buffers the whole file in memory and a malicious admin posts a large file | Low | Low | Hard cap at 5 MB checked **before** sharp processing. Admins are trusted (ADMIN/MANAGER role required). |
| Browser caches a stale `/api/images/<id>` after the byte content changes | Very Low | Low | UploadedImage rows are immutable — there is no edit endpoint. New uploads always get a new id. The `Cache-Control: immutable` header is therefore safe. |
| Sharp WebP encode fails on a corrupt input | Low | Low | Wrap `processImage` in try/catch, return 422 with a friendly error from `/api/upload`. Frontend shows it inline. |
| Existing static `/public/images/rentals/g-*.jpg` files are deleted by mistake before the migration script runs | Low | High | Migration script verifies file exists and reports a clear error if missing. Static files are not removed by any task in this plan. |
| Wiping `Part.photos` accidentally during update because of a parse bug | Low | High | If `parsePhotosFromForm` returns an error, the action returns the form error and does **not** call `db.part.update`. Tested by sending a malformed `photos` field in a unit test in Task 5 DoD. |

## Goal Verification

### Truths

1. An admin can navigate to `/admin/parts/<id>`, drop one or more JPG/PNG/WebP files into the photo uploader, click Save, and see those exact photos render on `/parts/<slug>` afterward (TS-001 passes end-to-end).
2. An admin can navigate to `/admin/rentals/<id>`, upload photos, reorder via drag-and-drop, save, and see the new order on both `/rentals` (cover photo first) and `/rentals/<id>` (full gallery in the chosen order) (TS-007 passes end-to-end).
3. `POST /api/upload` rejects requests from non-admins (`401`/`403`), files > 5 MB (`413`), and non-image MIME types (`400`) — verified directly via `fetch` in TS-005 + TS-003 + TS-004.
4. `GET /api/images/<id>` returns the original processed image bytes with `Cache-Control: public, max-age=31536000, immutable` and an `ETag` matching `<id>` — verified by curl + headers inspection in TS-006.
5. Removing a photo from a part/car and saving deletes the corresponding `UploadedImage` row when no other Part/Vehicle references it — verified by row-count delta in TS-002.
6. After running `npm run migrate-static-photos` once, the three seeded rental cars have `Vehicle.photos` URLs starting with `/api/images/`, and the public `/rentals` page shows the same three cars with images. Running it again is a no-op (TS-008).
7. `next build` succeeds with `sharp` listed in `serverExternalPackages` and no bundler warnings about native binaries.

### Artifacts

- `prisma/schema.prisma` (UploadedImage model + GIN index migration)
- `lib/uploads.ts`
- `app/api/upload/route.ts`
- `app/api/images/[id]/route.ts`
- `components/admin/PhotoUploader.tsx`
- `components/admin/RentalCarForm.tsx`
- `components/admin/PartForm.tsx`, `PartEditForm.tsx`, `RentalEditForm.tsx` (modified)
- `app/(admin)/admin/rentals/new/page.tsx` (server component now)
- `app/(admin)/admin/parts/[id]/page.tsx`, `app/(admin)/admin/rentals/[id]/page.tsx` (modified to pass `photos` through)
- `app/actions/parts.ts`, `app/actions/rentals.ts` (modified)
- `scripts/migrate-static-photos.ts`
- `next.config.ts` (modified)
- `package.json` (sharp dep + new script)

## E2E Test Scenarios

### TS-001: Admin uploads photos to a new part end-to-end
**Priority:** Critical
**Preconditions:** Logged in as `admin@geleoteka.ru` (`admin123`). Two test images on disk: `tmp/test-part-1.jpg` (~200 KB) and `tmp/test-part-2.jpg` (~300 KB).
**Mapped Tasks:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 8

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `https://localhost/admin/parts/new` | Form renders with empty PhotoUploader (placeholder text "Перетащите файлы или нажмите для загрузки", or similar copy) |
| 2 | Fill `article=TEST-001`, `name=Тестовая запчасть`, `price=1000` | Fields filled |
| 3 | Click upload button, select `tmp/test-part-1.jpg` | Upload progress indicator appears, then a thumbnail of test-part-1 is added to the grid |
| 4 | Click upload button, select `tmp/test-part-2.jpg` | Second thumbnail appears after the first |
| 5 | Drag the second thumbnail onto the first thumbnail position | Thumbnails reorder so test-part-2 is first |
| 6 | Click "Сохранить" | Form submits, redirects to `/admin/parts` |
| 7 | Navigate to `/parts/test-001-tеstовая-запчасть` (the slug) — find via list if slug differs | Detail page renders ImageGallery; the **first** image shown is test-part-2 (matching the drag order) |
| 8 | Open browser devtools → Network tab → reload page | Both image requests return 200 with `Content-Type: image/webp` |

### TS-002: Reference-counted cleanup removes orphan UploadedImage on photo removal
**Priority:** High
**Preconditions:** Part from TS-001 exists with 2 photos. No other Part/Vehicle uses these URLs.
**Mapped Tasks:** Task 5

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Note `count_before = SELECT count(*) FROM "UploadedImage"` | (e.g. 2) |
| 2 | Open `/admin/parts/<id>` | PhotoUploader shows 2 thumbnails |
| 3 | Click × button on first thumbnail | Thumbnail is removed from UI |
| 4 | Click "Сохранить" | Redirect to `/admin/parts` |
| 5 | Run `SELECT count(*) FROM "UploadedImage"` | `count_before - 1` |
| 6 | Re-open `/admin/parts/<id>` | One photo remains, displayed in PhotoUploader |
| 7 | Visit `/parts/<slug>` | Detail page shows only the remaining photo in the gallery |

### TS-003: Upload rejects oversize file
**Priority:** High
**Preconditions:** Admin logged in. A `tmp/big.jpg` of ~6 MB on disk.
**Mapped Tasks:** Task 2, Task 4

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `/admin/parts/new` | Form renders |
| 2 | Try to upload `tmp/big.jpg` via PhotoUploader | Inline error appears: "Файл слишком большой (макс. 5 МБ)" or similar |
| 3 | `SELECT count(*) FROM "UploadedImage"` (delta) | No new row created |

### TS-004: Upload rejects non-image MIME
**Priority:** High
**Preconditions:** Admin logged in. A `tmp/notes.pdf` on disk.
**Mapped Tasks:** Task 2, Task 4

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `/admin/parts/new` | Form renders |
| 2 | Try to upload `tmp/notes.pdf` | Inline error: "Поддерживаются только изображения (JPG, PNG, WebP, AVIF)" |
| 3 | `SELECT count(*) FROM "UploadedImage"` (delta) | No new row created |

### TS-005: Non-admin cannot upload
**Priority:** Critical
**Preconditions:** Logged out (or logged in as `client@test.ru`).
**Mapped Tasks:** Task 2

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | From the browser console: `await fetch('/api/upload', { method: 'POST', body: new FormData() })` | Status `401` or `403`, JSON `{ error: ... }` |
| 2 | `SELECT count(*) FROM "UploadedImage"` (delta) | No new row |

### TS-006: Image is served with immutable cache headers and ETag
**Priority:** High
**Preconditions:** UploadedImage row exists from TS-001.
**Mapped Tasks:** Task 3

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `curl -kI https://localhost/api/images/<id>` | Status `200`; `Content-Type: image/webp`; `Cache-Control: public, max-age=31536000, immutable`; `ETag: "<id>"` |
| 2 | `curl -kI -H 'If-None-Match: "<id>"' https://localhost/api/images/<id>` | Status `304 Not Modified` |
| 3 | `curl -kI https://localhost/api/images/does-not-exist` | Status `404` |

### TS-007: Admin uploads photos to a rental car end-to-end
**Priority:** Critical
**Preconditions:** Admin logged in. Two test car photos on disk.
**Mapped Tasks:** Task 1, Task 2, Task 3, Task 4, Task 6

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/admin/rentals/new` | Form renders with empty PhotoUploader |
| 2 | Fill `model=G 500`, `year=2024`, `dailyRate=35000` | Fields filled |
| 3 | Upload two photos via PhotoUploader | Two thumbnails appear |
| 4 | Drag to reorder | Order updates |
| 5 | Click "Сохранить" | Redirect to `/admin/rentals` |
| 6 | Navigate to `/rentals` | New car appears with the cover photo (first in array) |
| 7 | Click into new car's `/rentals/<id>` | ImageGallery shows both photos in the chosen order |

### TS-008: Migration script ports seeded rental photos and is idempotent
**Priority:** High
**Preconditions:** Database freshly seeded (`npx prisma db seed`). Static files exist at `public/images/rentals/g-black.jpg`, `g-white.jpg`, `g-grey.jpg`. New code deployed.
**Mapped Tasks:** Task 7

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `SELECT id, photos FROM "Vehicle" WHERE "ownershipType"='RENTAL'` | 3 rows, each `photos[0]` starts with `/images/rentals/` |
| 2 | `npm run migrate-static-photos` | stdout reports "Migrated 3 vehicles" (or similar); exit 0 |
| 3 | `SELECT id, photos FROM "Vehicle" WHERE "ownershipType"='RENTAL'` | All 3 `photos[0]` now start with `/api/images/` |
| 4 | `SELECT count(*) FROM "UploadedImage"` | 3 new rows (one per car) |
| 5 | Visit `/rentals` | All 3 cars render with the new image URLs |
| 6 | Run `npm run migrate-static-photos` again | stdout reports "Migrated 0 vehicles"; exit 0 |
| 7 | `SELECT count(*) FROM "UploadedImage"` | Still 3 (no duplicates) |

## Progress Tracking

- [x] Task 1: Add `UploadedImage` model + GIN indexes (schema + migration)
- [x] Task 2: Build upload pipeline (`lib/uploads.ts` + `POST /api/upload`)
- [x] Task 3: Build image-serving handler (`GET /api/images/[id]`)
- [x] Task 4: Build `<PhotoUploader>` shared client component
- [x] Task 5: Wire uploader into Part forms + actions (with ref-counted cleanup)
- [x] Task 6: Wire uploader into Rental forms + actions (with ref-counted cleanup)
- [x] Task 7: Migration script for the 3 seeded rental photos
- [x] Task 8: Add `sharp` to deps + `serverExternalPackages`; smoke-test `next build`

**Total Tasks:** 8 | **Completed:** 8 | **Remaining:** 0

## E2E Results

| Scenario | Priority | Result | Fix Attempts | Notes |
|----------|----------|--------|--------------|-------|
| TS-001 | Critical | PASS | 0 | API-equivalent: 2 photos uploaded via `/api/upload` as admin, persisted in `Part.photos` in reverse order (drag-reorder simulated), public `/parts/<slug>` renders cover-first then second photo. Browser-driven file picker not run (Chrome MCP permission denied) but the underlying flow — `/api/upload` → `Part.photos` array → public render — is fully exercised. |
| TS-002 | High | PASS | 0 | Direct call to the same `deleteOrphanImages` SQL the production `updatePart` runs inside its transaction: removed photo URL → `UploadedImage` count went 6→5 (delta −1), confirmed the specific row was deleted. |
| TS-003 | High | PASS | 0 | 6 MB upload → `413 Файл слишком большой (макс. 5 МБ)`, no `UploadedImage` row created. |
| TS-004 | High | PASS | 0 | PDF upload → `400 Поддерживаются только изображения...`. Bonus: corrupt JPG with valid MIME → `422 Не удалось обработать изображение`. |
| TS-005 | Critical | PASS | 0 | `POST /api/upload` with no cookie → `401 {"error":"Unauthorized"}`, no row created. |
| TS-006 | High | PASS | 0 | `GET /api/images/<id>` returns 200 with `Cache-Control: public, max-age=31536000, immutable` and `ETag: "<id>"`; conditional `If-None-Match: "<id>"` returns 304; `GET /api/images/does-not-exist` returns 404. Bytes round-trip identical (verified via `diff`). |
| TS-007 | Critical | PASS | 0 | API-equivalent: extra photo uploaded via `/api/upload`, appended to `Vehicle.photos`, public `/rentals` renders cover photos for all 3 cars, `/rentals/<id>` gallery includes both the migrated photo and the new upload. |
| TS-008 | High | PASS | 0 | First run: "Migrated 3 vehicles (skipped 0)"; second run: "Migrated 0 vehicles (skipped 3)"; all 3 rental cars now have `/api/images/<id>` URLs; public `/rentals` page preloads all 3 new image URLs. Static `/public/images/rentals/g-*.jpg` files untouched. |

**Note on browser automation:** Chrome MCP `navigate` returned "Permission denied by user" for this session, so the visible drag-and-drop and file-picker UI flow was not exercised through a real browser. The PhotoUploader component's HTML render was verified by curl (admin-cookie GET): `/admin/parts/new` and `/admin/rentals/<id>` both contain the `name="photos"` hidden field, the "Загрузить фото" trigger, the "Фотографии" label, and (on the rental edit page) the pre-populated `/api/images/<id>` thumbnail src. The full upload → persist → render pipeline was exercised at the API + DB + public-rendering layer. Pure UI interaction (drag events, file-picker invocation) is the only piece not covered.

## Implementation Tasks

### Task 1: Schema — `UploadedImage` model + GIN indexes

**Objective:** Add the `UploadedImage` Prisma model that holds processed image bytes, plus GIN indexes on the existing `Part.photos` and `Vehicle.photos` `String[]` columns so the orphan-cleanup lookup is fast.
**Dependencies:** None
**Mapped Scenarios:** TS-001..TS-008 (foundation)

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<auto-ts>_add_uploaded_image/migration.sql`

**Key Decisions / Notes:**

- Add the model in the order it appears alphabetically in the schema (between `Slot` and `SupplierOrder` is fine; the codebase doesn't enforce strict ordering).
- Model fields:
  ```prisma
  model UploadedImage {
    id          String   @id @default(cuid())
    bytes       Bytes
    mimeType    String   // always "image/webp" in v1
    width       Int
    height      Int
    size        Int      // byte length of `bytes`
    createdAt   DateTime @default(now())
    createdById String?  // User.id of the admin who uploaded; nullable for SetNull on user delete

    createdBy User? @relation("UploadedImageCreator", fields: [createdById], references: [id], onDelete: SetNull)

    @@index([createdAt])
    @@index([createdById])
  }
  ```
- Add a back-reference field on `User`:
  ```prisma
  uploadedImages UploadedImage[] @relation("UploadedImageCreator")
  ```
- Run `npx prisma migrate dev --name add-uploaded-image` to generate the SQL.
- After the migration is generated, **hand-edit** the generated `migration.sql` to append the GIN indexes — Prisma's index DSL doesn't model GIN on `text[]`:
  ```sql
  CREATE INDEX IF NOT EXISTS "Part_photos_gin_idx" ON "Part" USING gin ("photos");
  CREATE INDEX IF NOT EXISTS "Vehicle_photos_gin_idx" ON "Vehicle" USING gin ("photos");
  ```
- Run `npx prisma generate` to refresh the client at `app/generated/prisma/`.

**Definition of Done:**

- [ ] `npx prisma validate` passes.
- [ ] `npx prisma migrate dev` applies cleanly.
- [ ] `psql geleoteka -c '\d "UploadedImage"'` shows the table with all 7 columns plus the FK.
- [ ] `psql geleoteka -c "SELECT indexname FROM pg_indexes WHERE indexname LIKE '%photos_gin%';"` returns both GIN indexes.
- [ ] `npx prisma generate` produces no errors and `app/generated/prisma/client` exports `UploadedImage`.

**Verify:**

- `npx prisma validate && npx prisma migrate dev --name add-uploaded-image && npx prisma generate`

---

### Task 2: Upload pipeline — `lib/uploads.ts` + `POST /api/upload`

**Objective:** Provide the server-side helpers and the admin-only HTTP endpoint that accepts a single image file, validates it, processes it through `sharp`, persists an `UploadedImage` row, and returns the public URL.
**Dependencies:** Task 1
**Mapped Scenarios:** TS-001, TS-003, TS-004, TS-005, TS-008

**Files:**

- Create: `lib/uploads.ts`
- Create: `app/api/upload/route.ts`
- Modify: `package.json` (add `sharp` to `dependencies`)

**Key Decisions / Notes:**

- `lib/uploads.ts` is a server-only module; start with `import "server-only";` (the package is already installed).
- Public API:
  ```ts
  export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
  export const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
  export const MAX_OUTPUT_WIDTH = 1600;

  export async function processImage(input: Buffer): Promise<{ bytes: Buffer; mimeType: string; width: number; height: number; size: number }>;
  export function imageIdFromUrl(url: string): string | null;        // returns id from "/api/images/<id>"
  export function parsePhotosFromForm(raw: FormDataEntryValue | null): { urls: string[]; error: string | null };
  export async function deleteOrphanImages(removedUrls: string[], tx: PrismaTransactionClient): Promise<void>;
  ```
- `processImage`:
  - Use `sharp(input).rotate()` (auto-orient via EXIF), `.resize({ width: MAX_OUTPUT_WIDTH, withoutEnlargement: true })`, `.webp({ quality: 85 })`, `.toBuffer({ resolveWithObject: true })`.
  - Returns `{ bytes, mimeType: "image/webp", width: info.width, height: info.height, size: bytes.length }`.
  - Wrap in try/catch — sharp throws on corrupt input; the route handler should turn that into 422.
- `imageIdFromUrl`: regex `/^\/api\/images\/([a-z0-9]{20,})$/i`. Returns `match[1]` or `null`.
- `parsePhotosFromForm`:
  - Accepts string `"[]"`, `'["..."]'`, or `null`/`""` (treat as empty).
  - JSON.parse, validate it's a string array, validate every entry either matches `imageIdFromUrl` OR matches the legacy static prefix `^/images/(rentals|parts)/[\w.-]+$` (so legacy URLs still pass during the transition).
  - Returns `{ urls, error: null }` on success, `{ urls: [], error: "Некорректный список фото" }` on failure.
- `deleteOrphanImages`:
  - For each `url` in `removedUrls` whose `imageIdFromUrl(url) !== null`:
    - Run a count check inside the transaction: count Parts with `url` in `photos` (`@>`) plus Vehicles with `url` in `photos`.
    - If both counts are 0, `tx.uploadedImage.delete({ where: { id } })`.
  - Use raw SQL for the array contains lookup since Prisma's array filters on `String[]` are limited:
    ```ts
    const rows = await tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT (
        (SELECT count(*) FROM "Part" WHERE ${url} = ANY("photos"))
      + (SELECT count(*) FROM "Vehicle" WHERE ${url} = ANY("photos"))
      ) AS count
    `;
    ```
  - Skip non-`/api/images/...` URLs entirely (those are static files we don't manage).

- `app/api/upload/route.ts`:
  - `import "server-only";` not needed in a route handler — they're already server-only.
  - Use `RouteContext` only when there are params; for `/api/upload` just `export async function POST(request: Request)`.
  - Steps:
    1. `await requireRole(["ADMIN", "MANAGER"])` (throws 401/403; pattern from `app/api/parts/import/route.ts:81`).
    2. `const formData = await request.formData()`.
    3. `const file = formData.get("file") as File | null`. If null → 400 `{ error: "Файл не передан" }`.
    4. Check `file.size > MAX_UPLOAD_BYTES` → 413 `{ error: "Файл слишком большой (макс. 5 МБ)" }`.
    5. Check `!ALLOWED_MIME.has(file.type)` → 400 `{ error: "Поддерживаются только изображения (JPG, PNG, WebP, AVIF)" }`.
    6. `const buf = Buffer.from(await file.arrayBuffer())`.
    7. `const processed = await processImage(buf)` (catch errors → 422 `{ error: "Не удалось обработать изображение" }`).
    8. `const session = await getSession()` to grab uploader id (for `createdById`).
    9. `await db.uploadedImage.create({ data: { bytes: processed.bytes, mimeType: processed.mimeType, width: processed.width, height: processed.height, size: processed.size, createdById: session?.id ?? null } })`.
    10. Return `NextResponse.json({ url: \`/api/images/\${created.id}\`, width, height })`.

**Performance considerations:**

- `processImage` runs sharp synchronously per request; concurrent uploads are independent. No caching needed in v1.
- The whole request body (≤ 5 MB) is buffered in memory — acceptable.

**Definition of Done:**

- [ ] `npm install sharp` added; lockfile updated; `package.json` has `"sharp": "^X.Y.Z"` (latest stable).
- [ ] `lib/uploads.ts` exports the documented surface; no `any` types.
- [ ] `POST /api/upload` as admin with a valid 200 KB JPG returns `{ url: "/api/images/<cuid>" }` and creates one `UploadedImage` row whose `mimeType=image/webp` and `bytes` length matches `size`.
- [ ] `POST /api/upload` as logged-out → status `401` or `403`, no row created.
- [ ] `POST /api/upload` with a 6 MB file → status `413`, JSON error, no row created.
- [ ] `POST /api/upload` with `Content-Type: text/plain` → status `400`, JSON error, no row created.
- [ ] `POST /api/upload` with a corrupt JPG (file with `.jpg` ext but garbage bytes) → status `422`, JSON error, no row created.

**Verify:**

- `npm install sharp`
- Manual curl with admin cookie:
  ```bash
  curl -kX POST https://localhost/api/upload \
    -H "Cookie: session=<admin-jwt>" \
    -F file=@tmp/test-part-1.jpg
  ```
- Database check: `psql geleoteka -c 'SELECT id, "mimeType", width, height, size FROM "UploadedImage" ORDER BY "createdAt" DESC LIMIT 1;'`

---

### Task 3: Image serving — `GET /api/images/[id]`

**Objective:** Serve uploaded image bytes from Postgres with long-lived immutable cache headers and ETag-based revalidation.
**Dependencies:** Task 1
**Mapped Scenarios:** TS-001, TS-006, TS-007, TS-008

**Files:**

- Create: `app/api/images/[id]/route.ts`

**Key Decisions / Notes:**

- Signature follows Next.js 16 App Router: `export async function GET(_request: Request, ctx: RouteContext<'/api/images/[id]'>)` and `const { id } = await ctx.params`.
- Logic:
  1. `const ifNoneMatch = request.headers.get("if-none-match")`. If `ifNoneMatch === \`"\${id}"\`` → return `new Response(null, { status: 304, headers: { etag: \`"\${id}"\`, "cache-control": "public, max-age=31536000, immutable" } })`.
  2. `const img = await db.uploadedImage.findUnique({ where: { id }, select: { bytes: true, mimeType: true } })`.
  3. If `!img` → return `new Response("Not found", { status: 404 })`.
  4. Return `new Response(img.bytes, { status: 200, headers: { "content-type": img.mimeType, "cache-control": "public, max-age=31536000, immutable", etag: \`"\${id}"\` } })`.
- Public (no auth) — anyone with the URL can fetch. URLs are `cuid`s (~25 chars of high entropy) — enumerating is impractical.
- Do **not** mark this route as `force-static` — it must run per-request; cuids aren't known at build time.

**Performance considerations:**

- Cold request: one Postgres `SELECT` returning at most ~500 KB. Negligible.
- Hot request: browser cache hits the `Cache-Control: immutable` header — request never reaches Next.
- Conditional request: returns 304 with no body — cheap.

**Definition of Done:**

- [ ] `GET /api/images/<valid-id>` returns 200 with `Content-Type: image/webp` and the exact bytes saved in Task 2.
- [ ] Response has `Cache-Control: public, max-age=31536000, immutable` and `ETag: "<id>"`.
- [ ] `GET /api/images/<bogus>` returns 404.
- [ ] `GET /api/images/<valid>` with `If-None-Match: "<id>"` returns 304 with no body.
- [ ] Browsing `https://localhost/api/images/<valid>` shows the image inline.

**Verify:**

- `curl -kI https://localhost/api/images/<id>` (then with `-H 'If-None-Match: "<id>"'` for 304 case)
- Open `https://localhost/api/images/<id>` in browser; image renders.

---

### Task 4: `<PhotoUploader>` shared client component

**Objective:** A reusable client component that admins drop into any form. It manages a list of photo URLs (initial + uploaded), supports adding (multipart upload to `/api/upload`), removing, and reordering via HTML5 drag-and-drop, and emits the final ordered list as a JSON-encoded hidden form field.
**Dependencies:** Task 2 (depends on `/api/upload`)
**Mapped Scenarios:** TS-001, TS-002, TS-003, TS-004, TS-007

**Files:**

- Create: `components/admin/PhotoUploader.tsx`

**Key Decisions / Notes:**

- Component signature:
  ```ts
  interface Props {
    name: string;          // form field name; e.g., "photos"
    initial: string[];     // existing URLs (may include legacy /images/... paths)
    maxPhotos?: number;    // default 10
    accept?: string;       // default "image/jpeg,image/png,image/webp,image/avif"
  }
  export function PhotoUploader({ name, initial, maxPhotos = 10, accept }: Props): JSX.Element
  ```
- State: `const [urls, setUrls] = useState<string[]>(initial)`, `const [isUploading, setIsUploading] = useState(false)`, `const [error, setError] = useState<string | null>(null)`.
- Hidden input: `<input type="hidden" name={name} value={JSON.stringify(urls)} />`.
- File picker: hidden `<input type="file" accept={accept} multiple />` triggered by a styled "Загрузить фото" button (matches `.btn` class). On change, iterate selected files; for each, call `uploadFile(file)`.
- `uploadFile`:
  ```ts
  async function uploadFile(file: File): Promise<void> {
    setError(null);
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Ошибка загрузки");
        return;
      }
      setUrls((prev) => prev.length >= maxPhotos ? prev : [...prev, json.url]);
    } catch {
      setError("Сеть недоступна");
    } finally {
      setIsUploading(false);
    }
  }
  ```
- Drag-and-drop reorder using HTML5 `draggable` + `onDragStart` / `onDragOver` / `onDrop` on each thumbnail:
  - `onDragStart(e, idx)`: `e.dataTransfer.setData("text/plain", String(idx))`.
  - `onDragOver(e)`: `e.preventDefault()` (required to allow drop).
  - `onDrop(e, targetIdx)`: parse source idx, splice the array — `setUrls` to a new array with source moved to targetIdx.
- Remove button on each thumbnail: `setUrls((prev) => prev.filter((_, i) => i !== idx))`.
- Disable upload button when `isUploading || urls.length >= maxPhotos`.
- Render thumbnails as 96×96 squares using `<img src={url} className="object-cover w-24 h-24 rounded-lg" />` (works for both legacy and new URLs).
- Visual: grid of thumbnails followed by upload button + counter "X / maxPhotos". Error in the standard `bg-[var(--color-error-bg)]` style. Use existing `.card`/`.btn` classes.
- Accessibility: button labels in Russian, `aria-label="Удалить фото"` on × button, keyboard-tabbable thumbnails.

**Performance considerations:**

- Photo list never exceeds `maxPhotos` (10) — render cost is trivial. No memoization needed.
- `<img>` thumbnails use the production `/api/images/<id>` URL — browser caches across page loads.

**Definition of Done:**

- [ ] Component compiles with no TS errors.
- [ ] Manual test in `/admin/parts/new`: select an image, thumbnail appears within 2 s of `fetch` returning.
- [ ] Drag-and-drop reorders correctly (verify by submitting the form and reading `Part.photos` after).
- [ ] Remove button removes the URL from the hidden field.
- [ ] At `maxPhotos`, the upload button is visually disabled and `<input type="file">` is unreachable.
- [ ] Inline error renders for: oversize file (TS-003), wrong type (TS-004), and network failure.

**Verify:**

- Mount in `/admin/parts/new` (Task 5 wires it in). Manually upload, reorder, remove. Inspect `<input type="hidden">` value with devtools.

---

### Task 5: Wire `<PhotoUploader>` into Part forms + actions

**Objective:** Add the photo uploader to both Part forms (new + edit), pass existing photos through from the page, persist the new array in `createPart` / `updatePart`, and run reference-counted cleanup on photo removal.
**Dependencies:** Task 1, Task 2, Task 4
**Mapped Scenarios:** TS-001, TS-002, TS-003, TS-004

**Files:**

- Modify: `components/admin/PartForm.tsx`
- Modify: `components/admin/PartEditForm.tsx`
- Modify: `app/(admin)/admin/parts/[id]/page.tsx`
- Modify: `app/actions/parts.ts`

**Key Decisions / Notes:**

- `PartForm.tsx`: import `PhotoUploader`, render `<PhotoUploader name="photos" initial={[]} />` between the trim picker and the OEM checkbox row.
- `PartEditForm.tsx`: extend `PartData` interface with `photos: string[]`, render `<PhotoUploader name="photos" initial={part.photos} />`.
- `app/(admin)/admin/parts/[id]/page.tsx`: include `photos: (p.photos as string[]) ?? []` in the `serialized` object.
- `app/actions/parts.ts`:
  - Import `parsePhotosFromForm`, `deleteOrphanImages` from `lib/uploads.ts`.
  - In `createPart`:
    - After `parseTrimIds`, also call `parsePhotosFromForm(formData.get("photos"))`. Return its error if any.
    - Replace `photos: []` with `photos: photoUrls`.
  - In `updatePart`:
    - Inside the existing `db.$transaction` callback:
      1. Read the current `Part.photos` first: `const current = await tx.part.findUnique({ where: { id: partId }, select: { photos: true } })`.
      2. Compute `removed = current.photos.filter((u) => !photoUrls.includes(u))`.
      3. `await tx.part.update({ where: { id: partId }, data: { ..., photos: photoUrls } })`.
      4. After updating Part, call `await deleteOrphanImages(removed, tx)`.
- Validation: if `parsePhotosFromForm` returns an error, return early (no DB write) — protects against wiping `photos` from a malformed payload.

**Performance considerations:**

- The orphan-cleanup raw SQL hits Postgres once per removed URL. With ≤ 10 photos per part, that's at most a handful of cheap queries inside an already-running transaction. GIN indexes (Task 1) make the `= ANY(photos)` lookup index-backed.

**Definition of Done:**

- [ ] Adding a part with 2 uploaded photos persists `Part.photos` as a 2-element array.
- [ ] Editing a part: changing the photos array re-orders persistently and removed photos delete their `UploadedImage` row when no other Part/Vehicle references the URL.
- [ ] Submitting with malformed `photos` form value (manually crafted) returns the form error and does **not** wipe the existing `photos`.
- [ ] `npm run lint` passes with no new warnings on the modified files.
- [ ] `/parts` and `/parts/<slug>` render uploaded photos correctly.

**Verify:**

- E2E TS-001 + TS-002 with browser automation (see browser-automation rule).
- DB sanity: `psql geleoteka -c 'SELECT id, photos FROM "Part" ORDER BY "createdAt" DESC LIMIT 5;'`

---

### Task 6: Wire `<PhotoUploader>` into Rental forms + actions

**Objective:** Mirror Task 5 for rental cars. The new-rental page is currently `"use client"` and inlines its form — extract into a server-rendered page + new `RentalCarForm` so the auth check stays server-side.
**Dependencies:** Task 1, Task 2, Task 4
**Mapped Scenarios:** TS-007

**Files:**

- Create: `components/admin/RentalCarForm.tsx`
- Modify: `app/(admin)/admin/rentals/new/page.tsx` (convert to server component)
- Modify: `components/admin/RentalEditForm.tsx`
- Modify: `app/(admin)/admin/rentals/[id]/page.tsx`
- Modify: `app/actions/rentals.ts`

**Key Decisions / Notes:**

- `RentalCarForm.tsx`:
  - `"use client"`.
  - Same structure as the inline form currently in `app/(admin)/admin/rentals/new/page.tsx` — but with `<PhotoUploader name="photos" initial={[]} />` added before the action buttons.
  - `useActionState(createRentalCar, null)`.
- `app/(admin)/admin/rentals/new/page.tsx`:
  - Strip `"use client"`.
  - `await requireRole(["ADMIN", "MANAGER"])` then render `<div className="max-w-lg"><h1 ...>Добавить авто в аренду</h1><RentalCarForm /></div>`.
- `RentalEditForm.tsx`:
  - Extend `CarData` with `photos: string[]`.
  - Render `<PhotoUploader name="photos" initial={car.photos} />` between Features and the bottom button row.
- `app/(admin)/admin/rentals/[id]/page.tsx`:
  - Pass `photos: (c.photos as string[]) ?? []` into `RentalEditForm`'s `car` prop.
- `app/actions/rentals.ts`:
  - Import `parsePhotosFromForm`, `deleteOrphanImages`.
  - Add `photos` to `VehicleFormData` (`string[]`).
  - In `parseCarFormData`: do **not** parse photos here (it's async + needs error handling). Instead, parse photos separately in the actions:
    ```ts
    const { urls: photoUrls, error: photoErr } = parsePhotosFromForm(formData.get("photos"));
    if (photoErr) return { error: photoErr };
    ```
  - In `createRentalCar`: replace `photos: []` with `photos: photoUrls`.
  - In `updateRentalCar`: wrap in `db.$transaction(async (tx) => { ... })`; read current `Vehicle.photos`, compute removed, update vehicle with new `photos`, then `deleteOrphanImages(removed, tx)`.

**Performance considerations:**

- Same as Task 5 — at most a handful of cheap queries per save.

**Definition of Done:**

- [ ] `/admin/rentals/new` renders the new form with PhotoUploader; submit creates a Vehicle with the uploaded photos.
- [ ] `/admin/rentals/<id>` edit page shows existing photos and persists changes.
- [ ] Removed photos delete their `UploadedImage` row (when no other part/vehicle references them).
- [ ] `/rentals` and `/rentals/<id>` render uploaded photos.
- [ ] `requireRole` still runs server-side on the new-rental page (verify by hitting it as a non-admin → redirect).

**Verify:**

- E2E TS-007 with browser automation.
- DB sanity: `psql geleoteka -c 'SELECT id, photos FROM "Vehicle" WHERE "ownershipType"=\'RENTAL\';'`

---

### Task 7: Migration script for the 3 seeded rental photos

**Objective:** A one-shot, idempotent script that ports the static `/public/images/rentals/g-*.jpg` files into the new pipeline so the seeded fleet uses the same `UploadedImage` storage as future uploads.
**Dependencies:** Task 1, Task 2
**Mapped Scenarios:** TS-008

**Files:**

- Create: `scripts/migrate-static-photos.ts`
- Modify: `package.json` (add `"migrate-static-photos": "tsx scripts/migrate-static-photos.ts"`)

**Key Decisions / Notes:**

- Run with `tsx` (already a devDep): `npm run migrate-static-photos`.
- Logic:
  ```ts
  import { readFile } from "node:fs/promises";
  import { resolve } from "node:path";
  import { db } from "../lib/db";
  import { processImage, imageIdFromUrl } from "../lib/uploads";

  async function main(): Promise<void> {
    const vehicles = await db.vehicle.findMany({
      where: { ownershipType: "RENTAL" },
      select: { id: true, photos: true },
    });
    let migrated = 0;
    for (const v of vehicles) {
      const photos = v.photos as string[];
      if (photos.length === 0) continue;
      // Idempotent skip: any car whose first photo is already in the new format.
      if (imageIdFromUrl(photos[0])) continue;
      const newUrls: string[] = [];
      for (const url of photos) {
        if (!url.startsWith("/images/")) {
          newUrls.push(url);
          continue;
        }
        const filePath = resolve(process.cwd(), "public", url.replace(/^\//, ""));
        const buf = await readFile(filePath);
        const processed = await processImage(buf);
        const created = await db.uploadedImage.create({
          data: { ...processed, createdById: null },
        });
        newUrls.push(`/api/images/${created.id}`);
      }
      await db.vehicle.update({ where: { id: v.id }, data: { photos: newUrls } });
      migrated += 1;
    }
    console.log(`Migrated ${migrated} vehicles`);
  }

  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
  ```
- Idempotent: if the first photo URL already matches `/api/images/<id>`, skip.
- Failure mode: missing file on disk → `readFile` throws → script exits non-zero with a clear message. Report the file path so the operator can either restore the file or remove the URL manually.
- Not part of `npm run build` or any auto-deploy step — explicit manual run.

**Definition of Done:**

- [ ] `npm run migrate-static-photos` (first run on freshly-seeded DB) reports `Migrated 3 vehicles` and creates 3 new `UploadedImage` rows.
- [ ] `Vehicle.photos[0]` for all 3 rental cars now starts with `/api/images/`.
- [ ] Second run reports `Migrated 0 vehicles`.
- [ ] `/rentals` page still renders all 3 cars with the new image URLs (no broken images).
- [ ] Static files at `public/images/rentals/g-*.jpg` are untouched on disk.

**Verify:**

- `npx prisma db seed && npm run migrate-static-photos && npm run migrate-static-photos`
- `psql geleoteka -c 'SELECT id, photos FROM "Vehicle" WHERE "ownershipType"=\'RENTAL\';'`
- Visit `https://localhost/rentals`.

---

### Task 8: Add `sharp` to `serverExternalPackages` + smoke-test build

**Objective:** Tell Next.js not to bundle `sharp` (it has native binaries) and confirm the production build succeeds.
**Dependencies:** Task 2
**Mapped Scenarios:** Truth #7 in Goal Verification

**Files:**

- Modify: `next.config.ts`

**Key Decisions / Notes:**

- Append `"sharp"` to the existing `serverExternalPackages` array:
  ```ts
  const nextConfig: NextConfig = {
    serverExternalPackages: ["@prisma/client", "sharp"],
  };
  ```
- After change, run `npm run build` locally as a smoke test.
- If the build complains about another missing native dep, add it here too (e.g., `libvips` is bundled inside sharp's prebuilt binaries — should be fine on macOS/Linux x64).

**Performance considerations:**

- N/A — build-time / startup config only.

**Definition of Done:**

- [ ] `next.config.ts` lists `"sharp"` in `serverExternalPackages`.
- [ ] `npm run build` exits 0 with no warnings about `sharp` or native binaries.
- [ ] After build, `npm start` boots without throwing on the first `/api/upload` request.

**Verify:**

- `npm run build && PORT=3000 npm start &` then `curl -I http://localhost:3000/api/images/does-not-exist` should return 404 (proves the route handler loaded and Postgres works).

---
