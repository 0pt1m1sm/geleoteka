# Handover — Warehouse Workflow Review & Rework

**Created:** 2026-05-26
**Status:** ANALYSIS ONLY — do NOT implement from this doc directly. Use it to open a `/spec` (or `/fix`) in a fresh session.
**Author context:** raised by the product owner after testing the live (Railway) build of the WMS layout/receiving/pick-pack features.

> ⚠️ This is a research/handover artifact. Each section ends with **Open questions** that must be answered (or decided in the next session) before code is written. Nothing here is approved scope yet.

---

## 0. THE OVERARCHING CONCERN (highest priority)

> *"Самый важный момент — проверка логики работы склада и workflow. Важно понимать, как работает кладовщик и последовательность его действий. Например, глупо ожидать, что кладовщик отсканирует QR-код, когда напечатанной наклейки ещё не существует."*

Before polishing any single screen, the next session must **map the real storekeeper action sequence end-to-end** and check that the software never demands an artifact that doesn't exist yet at that step. The known chicken-and-egg risk is **scan-before-label-printed**.

### What the code does today (grounded)

**Scan resolution has a manufacturer-barcode/article fallback for PARTS — so parts do NOT strictly require an internal QR:**
- `lib/warehouse/packing.ts:resolveItemCode` (and the picking twin) parse a scan as `WMS:PART:` **or** `RAW`, then `lookupByCode` → if miss, fall back to `db.part.findFirst({ where: { article } })`. So a worker can scan the **supplier's barcode** or type the **article** before any internal label is printed. ✅ no chicken-and-egg for parts.
- Part labels are printed at `/admin/warehouse/labels?part=<id,…>` and the QR encodes the **barcode if present, else the article** (`app/(admin)/admin/warehouse/labels/page.tsx:60`) — i.e. the printed QR is just the re-scannable manufacturer code, not a new opaque id. So "print label" is optional convenience, not a prerequisite.

**Cells/locations:**
- Cell labels print at `/admin/warehouse/labels?loc=A-1-1,…` (same page, `:65-67`), QR = `WMS:LOC:<code>`.
- Pick/pack location resolution (`resolveLocationCode`) accepts `LOC` **or** `RAW`, so a worker can scan a cell QR **or** type the code. ✅ no hard chicken-and-egg.
- **Gap:** the new "Раскладка склада" cell manager (`WarehouseLocationsAdmin.tsx`) has **no "print labels for these cells" affordance** — you must hand-navigate to `/labels?loc=…`. A worker who just created A-1-1..A-3-4 has nowhere obvious to print their QR labels.

### Open questions (section 0)
1. **Document the canonical happy-path sequence** for each role (receiving clerk, putaway, picker, packer). The next session should write it down (even as ASCII) and validate every screen against it. Candidate sequence:
   - Receiving: scan supplier barcode → resolve/confirm part → receive (order-backed or blind) into ПРИЁМКА → **print internal label if the part had no barcode** → putaway ПРИЁМКА→shelf.
   - Pick (repair): open RO → for each line: scan part → scan shelf → consume.
   - Pack (shipment): open order → for each line: scan part → scan shelf → consume → scan box → ship.
2. Is there a need for a **"new part with no barcode"** path at receiving where the internal label genuinely must be printed *before* it can be re-scanned? (The supplier-order "NEW_PART" row creates a draft Part — does it get a barcode? If not, the FIRST scan of that part can only be by article. Confirm this is acceptable.)
3. Should cell creation in "Раскладка" offer an inline **"Печать наклеек"** button (deep-link to `/labels?loc=<created codes>`)?

---

## 1. Blind receiving ("приёмка без заказа") + the "требуется сверка" badge

> *"Достаточно странно реализован механизм приёмки без заказа, когда можно разместить сразу в ячейку и потом загорается лэйбл «сверка». Не понимаю, как это должно работать."*

### How it actually works (grounded)

- **Blind receive** = `applyBlindReceive` (`lib/warehouse/scan-receive.ts:92`). One transaction: `recordMovement(RECEIPT, +qty)` **then** `placeStock(+qty into the receive cell)` — but placement runs **only if the movement was newly applied** (idempotency). So on-hand **and** placed both rise by `qty` → they stay equal. **Blind receive by itself never creates drift.**
- The **"требуется сверка"** badge is driven by `reconcileNeeded` = **placed > on-hand** (`lib/wms/public/placement.ts:270`, type doc `types.ts:76-83`). It's a Phase-1 drift guard.
- **What actually lights it up:** the SAME part card (`WarehouseScanBox.tsx`) also exposes **"Новый остаток"** = `adjustStock`, which sets on-hand to an **absolute** value **without touching bins** (`lib/warehouse/adjust.ts`). So: receive 3 into ПРИЁМКА (on-hand 3 / placed 3) → later set "Новый остаток" = 1 → placed(3) > on-hand(1) → badge appears. Bin-aware `consumeStock` keeps them in sync; only the manual absolute adjust (or genuine Phase-1 drift) breaks the invariant.

### Why it's confusing (the real design issue)

1. One card crams **three different mutations** with overlapping semantics: Приёмка (raise+place), "Новый остаток" (absolute on-hand, bins untouched), and "Размещение по ячейкам" (place/transfer). Nothing explains how on-hand, placed, and unplaced relate.
2. The badge names a problem ("требуется сверка") but there is **no reconcile ACTION** — nothing to click to resolve it. The worker is told something's wrong with no path forward.
3. Blind receive auto-placing into a cell blurs the line between "receive" (raise stock) and "putaway" (decide the shelf), which the worker may expect to be two explicit steps.

### Open questions (section 1)
1. Should blind receive **always land in ПРИЁМКА** (staging) and force an explicit putaway step, rather than letting the worker type any target cell inline? (Cleaner mental model: receive → staging → putaway.)
2. Should "Новый остаток" (absolute adjust) be **removed from the scan card** or gated, since it's the main way a worker accidentally creates `placed > on-hand`? Or should adjust-down auto-shrink bins (FIFO) to preserve the invariant?
3. The "требуется сверка" badge needs **either a reconcile action** (e.g., "snap placed to on-hand" / open a count session for this part) **or** clearer copy. Which?

---

## 2. Deleting warehouses (currently missing)

> *"Так и не вижу, где можно удалять склады."*

### Grounded facts
- Warehouse actions in `app/actions/warehouses.ts`: `listWarehouses`, `createWarehouse`, `editWarehouse`, `setDefaultWarehouse`, `setWarehouseActive`. **No `deleteWarehouse`.**
- UI `components/admin/WarehouseAdmin.tsx` has per-row Изменить / Сделать основным / Деактивировать — **no delete.**
- We just shipped cell deletion (`deleteLocation`, empty-only) — warehouse deletion is the analogous missing piece one level up.

### Proposed direction (to confirm)
- Add `deleteWarehouseAction` + a Trash control in `WarehouseAdmin.tsx`, mirroring the cell pattern (icon button + inline confirm).
- **Guards (hard requirements):** refuse to delete if (a) it's the default warehouse, (b) it holds any stock (`StockItem.quantity > 0` or any `StockBin` for that `warehouseId`), (c) it has movement history you want to preserve. Soft alternative already exists (`setWarehouseActive(false)` = deactivate).

### Open questions (section 2)
1. Hard-delete empty warehouses only, or is **deactivate** (already implemented) the intended "removal" and we just need to make it more discoverable / relabel it?
2. What to do with a warehouse that has **history but zero current stock** — allow delete (history rows are movement audit; deleting the warehouse row may orphan them) or force deactivate?

---

## 3. Pick vs Pack — near-duplicate flows

> *"Шаги отбор и упаковка фактически одинаковые — кладовщик сканирует товар и полку, убеждается, что отгружает правильные товары. Проанализируй текущую логику и подумай, нужно ли дорабатывать."*

### Grounded comparison

| Aspect | Pick (`lib/warehouse/pick.ts`, `app/actions/picking.ts`) | Pack (`lib/warehouse/pack.ts`, `app/actions/packing.ts`) |
|---|---|---|
| Trigger entity | `RepairOrder` (service job) | `PartShipment` (customer parts order) |
| Line source | RO's deal → latest **APPROVED estimate** PART lines | retail `PartOrderItem` rows **OR** deal's APPROVED estimate lines |
| "done" marker | CONSUMPTION movement for `RepairOrder:${roId}:${lineId}` | CONSUMPTION movement for `PartShipment:${orderId}:${lineKey}` |
| Worker action | **scan part + scan shelf → consume FULL line qty from that bin** | **identical** |
| Qty source | server-derived `Math.round(line.qty)`, never client | identical |
| Allowed statuses | SCHEDULED / IN_PROGRESS / READY | PROCESSING |
| Wrong-item guard | `PickError("WRONG_ITEM")` | `PackError("WRONG_ITEM")` (identical shape) |
| Downstream | parts go onto the car (internal consumption) | order advances toward SHIPPED (+ box scan, + ship gate, + customer notify) |

**Verdict:** the *physical worker action and the consume mechanic are identical*; `applyPickLine` and `applyPackLine` are ~95% structurally the same (find open line → match scanned part → `consumeStock` against a source triple). The genuine differences are: the **source-triple prefix**, the **line-resolver**, the **allowed statuses**, and the **packing-only extras** (box scan, ship confirmation, customer notification).

### Options for the next session (pick ONE)
- **(A) Extract a shared engine** `scanConsumeOrderLine(client, { sourceType, resolveOpenLines, allowedStatuses, … })` that both pick and pack call. Removes the duplication; keeps the two domain wrappers (RO close vs PartShipment ship) thin. **Cost:** a new abstraction coupling two lifecycles — must keep the line-resolver pluggable so retail/CRM/RO shapes stay independent.
- **(B) Keep them separate** (current). **Cost:** ongoing parallel maintenance; a fix to one (e.g., partial-qty support) must be mirrored.
- **(C) Unify the UX only** — one "Сканировать к отгрузке/отбору" worker screen that detects whether the scanned/opened order is an RO or a PartShipment and routes to the right engine, leaving the two engines as-is. Addresses the worker's "these feel the same" complaint without risky backend coupling.

**Recommendation to discuss:** (C) for UX + (A) for the backend duplication, done as two separate small specs — but **only if** the planned future divergence (partial picks? serial/lot tracking? different qty rules) is small. If pick and pack are expected to diverge significantly, prefer (B)/(C) and leave the engines separate.

### Open questions (section 3)
1. Are pick and pack expected to **diverge** later (partial-qty picking, lot/serial, kitting)? If yes → don't over-unify the backend.
2. Is the worker pain primarily **UX** (two screens that feel identical) or **maintenance** (us)? That decides between (C) and (A).
3. Pick currently consumes the **full line in one scan** (no partial). Is partial pick/pack a requirement? (Affects whether a shared engine needs a qty parameter.)

---

## Files to read first in the new session
- `lib/warehouse/scan-receive.ts` — receiving (order-backed + blind)
- `lib/wms/public/placement.ts` (`reconcileNeeded` at :270), `lib/warehouse/adjust.ts` — the drift source
- `components/admin/WarehouseScanBox.tsx` — the conflated receive/adjust/place card
- `lib/warehouse/pick.ts` + `lib/warehouse/pack.ts` + `app/actions/{picking,packing}.ts` — the duplicate flows
- `components/admin/PickBox.tsx` + `components/admin/PackBox.tsx` — the two worker UIs
- `app/actions/warehouses.ts` + `components/admin/WarehouseAdmin.tsx` — where warehouse-delete would go
- `app/(admin)/admin/warehouse/labels/page.tsx` — label printing (part + cell)

## Suggested sequencing for the next session
1. **Section 0 first** — write the canonical workflow doc, validate screens against it. This may reframe sections 1–3.
2. Section 1 (receiving/сверка) — likely the biggest UX win.
3. Section 2 (warehouse delete) — smallest, well-scoped (mirror the cell-delete we just shipped).
4. Section 3 (pick/pack) — decide unify-or-not based on the workflow doc.
