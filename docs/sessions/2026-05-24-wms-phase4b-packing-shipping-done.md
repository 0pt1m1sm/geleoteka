# Session Handover — WMS Phase 4b (Packing / упаковка + отгрузка) SHIPPED

**Date:** 2026-05-24
**Status:** ✅ DONE — committed `9871921`, pushed to `main`, Railway auto-deploying
**Continues:** mem obs #13106 (Phase 4) → this session is mem obs #13146
**Plan:** `docs/plans/2026-05-24-warehouse-packing-shipping.md` (Status: VERIFIED)

---

## What shipped this session

Commit **9871921** on `main` (`7525d69..9871921`). **Zero schema changes** (movement-derived model), so Railway's `prisma migrate deploy` pre-deploy is a no-op. Full `/spec` cycle on Opus; both reviewers ran in plan **and** verify phases.

**Goal achieved:** A warehouse worker opens an outbound customer part-order (`PartShipment`), scans a parcel (box) → scans each part from its bin; the system verifies the part belongs to the order (`WRONG_ITEM` otherwise), consumes it bin-aware, and confirms shipment (→ `SHIPPED`) once all required lines are fulfilled. Covers **both** retail cart orders (consumed at sale → instantly shippable) and CRM estimate-dispatched orders (bin-aware picked here — the customer-order picking deferred from Phase 4). `WMS:ORDER`/`WMS:BOX` scan types now resolve in the standalone scanner (were `WRONG_OBJECT_TYPE`).

## Key files

| File | What |
|------|------|
| `lib/warehouse/pack.ts` (new) | Packing domain. **Unified line model**: `requiredLines` = `PartOrderItem` rows if present (retail, lineKey=`partId`) else APPROVED-estimate PART lines (CRM, lineKey=`estimateLineId`). "Packed" = a CONSUMPTION movement exists for `PartShipment:${orderId}:${lineKey}`. `PACKABLE_STATUSES={PROCESSING}` gate lives inside `requiredLines`. `applyPackLine` selects the line BY `lineKey` (disambiguates CRM split lines), WRONG_ITEM if part mismatch, else `consumeStock(fromLocation, server-derived qty)`. `isFullyPacked`, `packProgress`. |
| `app/actions/packing.ts` (new) | `listOrdersNeedingPacking`, `getPackProgress`, `getOpenPackLines`, `packOrderLine`, `recordPackBoxScan` (audit-only, single-box), `shipPackedOrder` (TOCTOU-safe — `isFullyPacked` re-checked inside the tx; no consume — gate guarantees it; notifies customer). Role: ADMIN/MANAGER/WAREHOUSE_WORKER. One ScanEvent per scan. |
| `app/actions/part-order-admin.ts` (mod) | Dispatch guard: coarse `alreadyConsumed` count → `isFullyPacked` (so a partially-packed CRM order tops up remaining lines at manual dispatch; per-line source-triple idempotency is the backstop). Excludes `CANCELLED` source status. |
| `app/(admin)/admin/warehouse/packing/{page,[id]/page}.tsx` (new) | Pack queue + per-order pack page. |
| `components/admin/{PackBox,PackingOrderList}.tsx` (new) | Box input + per-line bin/part scan + ship button (enabled only when no open lines). Mirror picking UI. |
| `app/(admin)/admin/warehouse/page.tsx` (mod) | "Упаковка →" link. |
| `app/(admin)/admin/orders/page.tsx` (mod) | Per-PROCESSING-order "упаковано X/Y" + "Упаковка →" cross-link (`packProgress` via `Promise.all`, PROCESSING only). |
| `lib/warehouse/scan-router.ts` (mod) | `OrderCard`/`BoxCard` added to `ScanCard`; `resolveOrder` (by orderNumber→id); ORDER→200 card/404, BOX→200 echo. |
| `components/admin/WarehouseScanBox.tsx` (mod) | Renders order card (status, packed/required, pack link) + box card. |
| `scripts/verify-packing.ts` (new) | 10 scenarios (a–j) — all pass. |
| `scripts/seed-packing-e2e.ts` (new) | E2E fixtures (`--clean`). |

## Verification

- `npx tsx scripts/verify-packing.ts` — 10/10 PASS (retail-empty, CRM-all-open, happy-pack-no-drift, WRONG_ITEM, INSUFFICIENT_BIN-rollback, re-pack-no-double-consume, isFullyPacked, pack-then-dispatch-idempotent, CANCELLED-packs-nothing, partial-pack+dispatch-topup).
- `tsc --noEmit` + `eslint` clean.
- E2E TS-001..005 PASS via Chrome DevTools MCP on dev HTTPS:443 + psql (status=SHIPPED, `Σbins === on-hand` no drift, ScanEvent audit correct).
- Reviewers: changes-review (compliance/quality high, 2/2 truths) + Codex (approve, 0 findings). All should_fix/suggestions applied.

## Roadmap status (`docs/prd/2026-05-22-warehouse-wms-roadmap.md`)

- **SHIPPED:** Phase 1, 2.5, 2, 3 (stocktake), 4 (bin-aware picking), **4b (packing/shipping — this session)**.
- **REMAINING — each its own `/spec`, in order:**
  - **Phase 5 — Replenishment/дозаказ.** Per-item min/max reorder points + a "to reorder" report feeding `SupplierOrder`. Seed = the fixed `LOW_STOCK_THRESHOLD=3` in `lib/wms-host/index.ts` → make per-item + persisted. **Decide at planning:** new columns on `StockItem` vs a new table; report auto-creates a `SupplierOrder` DRAFT vs just suggests. ⚠️ Per-item persistence likely needs a migration — **create it manually** (psql `ALTER` + `prisma migrate resolve --applied <name>`); **do NOT run `prisma migrate dev`** (resets dev over the Phase-3 stocktake checksum drift).
  - **Phase 6 — Reports.** Stock valuation, movement export, dead-stock/ABC, multi-warehouse via `tenantKey`. ⚠️ **Flag at planning:** there is **no stored cost-per-`StockItem`** — valuation needs a cost-basis decision (`SupplierOrderItem.unitCost` / landed cost vs `Part.price`). Raise before writing tasks.

## Project facts (carry-over)

- prod=geleoteka.ru, Railway auto-deploys `main`. Push: `env -u GITHUB_TOKEN git push origin main`. Repo: github.com/0pt1m1sm/geleoteka.
- dev: `npm run dev` (HTTPS:443, Turbopack). Admin: `admin@geleoteka.ru` / `admin123`. DB: `postgresql://alex@localhost:5432/geleoteka`.
- Chrome DevTools MCP drives the React forms reliably; Chrome profile already logged in.
- **No jest/vitest** — tests are `tsx scripts/verify-*.ts`. Prisma client `@ts-nocheck` at `app/generated/prisma` (cast delegate results `as {...}`).
- `lib/wms` = host-agnostic seam (zero host imports); `lib/wms-host` = deletable adapter (`TENANT_KEY="geleoteka"`, `STAGING_LOCATION="ПРИЁМКА"`, `LOW_STOCK_THRESHOLD=3`).
- `recordMovement` is the aggregate chokepoint — **never rewrite**; layer higher ops (`placement.ts`, `consumption.ts`, `pick.ts`, `pack.ts`).
- consumeStock source triple `{type, id}`: `PartShipment:orderId:lineKey` (retail lineKey=`partId`, CRM lineKey=`estimateLineId`), `RepairOrder:roId:estLineId`.
- ⛔ `prisma migrate dev` resets dev — create migrations manually.
- Working tree clean at `9871921`.

## Next session: start here

`/spec replenishment / дозаказ (WMS Phase 5)` — per-item reorder points + to-reorder report. Raise the StockItem-columns-vs-table and auto-DRAFT-vs-suggest decisions at planning, and plan the per-item threshold migration as a manual psql migration.
