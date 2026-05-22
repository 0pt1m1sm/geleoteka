# PRD — Warehouse (Склад) admin module, barcode-HID first

Created: 2026-05-22
Author: aleksandr.spiskov@gmail.com
Status: DRAFT (feeds a future `/spec`)

## Why

The WMS *engine* shipped (`docs/plans/2026-05-22-prd-consolidation-fulfillment-warehouse-crm.md`, VERIFIED): `lib/wms` core, `StockItem`/`StockMovement`, reservations, receipt/consumption, `/api/stock/lookup`, per-part stock history. But there is **no dedicated «Склад» admin section** — stock is only visible per-part and inside fulfillment flows. A warehouse operator has no single place to see stock, scan items, or watch movements.

This module adds that section, **scanning-first via barcode HID** (cheapest, works on any device today), with the seam left open for NFC/RFID later.

## Goal

A manager opens **«Склад»** in the admin nav and can: see every part's on-hand / reserved / available with low-stock highlighting; scan a barcode (or type an article) to pull up an item and act on it; and watch a live feed of stock movements across all parts.

## Scope (in)

1. **Nav + route.** Add a «Склад» link in the admin nav (`app/(admin)/layout.tsx`) → `/admin/warehouse`.
2. **Stock overview.** Table/list of all active parts: name, article, barcode, on-hand, reserved, **available** (`availableStock` from `@/lib/wms/public`), with low-stock highlighting (e.g. available ≤ a threshold). Search by name/article/barcode. Paginated.
3. **Scan box (barcode HID).** A focused text input that accepts a keyboard-wedge scanner (scanner "types" the code + Enter). On submit → call `/api/stock/lookup?code=` → show the resolved item with its stock, and quick actions:
   - **Adjust on-hand** (manual correction → `recordMovement` ADJUSTMENT, the audited path),
   - optionally **Receive N** (RECEIPT) — decide in planning whether receipts stay supplier-order-only.
4. **Movements feed.** Cross-part recent `StockMovement` list (date, part, reason, deltas, source, actor) — the warehouse-wide version of the per-part history (Task 13).
5. **Barcode assignment.** A way to set/edit `StockItem.barcode` (and `gtin`) — currently there is no UI to assign codes, so scanning can't be used until codes exist. Likely on the part edit page and/or inline from the scan box.

## Scope (out / deferred)

- **NFC** (Web NFC `NDEFReader`, Android-Chrome only) and **UHF RFID** (needs a native bridge / batch endpoint) — explicitly deferred. Keep `/api/stock/lookup` generic so they slot in later without API changes; optionally reserve `StockItem.nfcTag`/`rfidEpc` fields when convenient.
- Multi-warehouse / bin locations (single warehouse per the WMS PRD).
- Receiving workflow beyond what SupplierOrder RECEIVED already does, unless planning decides the scan box should also receive.

## Design constraints (carry into the spec)

- **Reuse the WMS core, don't fork it.** The warehouse UI is a *host consumer* of `@/lib/wms/public` (`availableStock`, `lookupByCode`, `recordMovement` via the host adapter `@/lib/wms-host`). The ESLint boundary (`lib/wms/**` imports no host code) must stay green. All stock writes go through `recordMovement` (ADJUSTMENT for manual edits) so the ledger keeps reconciling to the counters.
- **HID scanner = keyboard wedge.** No special API: a text input + an Enter handler. Make sure the input auto-focuses and re-focuses after each scan so an operator can scan continuously.
- **Auth:** admin/manager only (match existing admin pages — `getSession` + role gate, redirect non-admins).
- **Extractability:** any new tag fields belong on `StockItem` (WMS-owned), not `Part`, so they move with the warehouse product into the future multi-tenant grocery WMS.

## Open questions for planning

- Which devices will operators use (desktop + USB scanner? Android tablet + Bluetooth scanner?) — affects layout/touch targets.
- Should the scan box only *look up*, or also *record movements* (adjust/receive) inline?
- Low-stock threshold: fixed constant, per-part reorder point, or just `available ≤ 0`?

## To start

Run: `/spec docs/prd/2026-05-22-warehouse-module-barcode.md`
