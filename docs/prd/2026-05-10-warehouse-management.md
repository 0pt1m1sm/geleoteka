# Warehouse Management — Stock, Movements, Scanner

Created: 2026-05-10
Author: aleksandr.spiskov@gmail.com
Category: Product / Module
Status: Draft
Research: Light

## Problem Statement

Geleoteka has a parts catalog (`Part`) with a single `quantity Int` column and inbound (`SupplierOrder`) / outbound (`PartLine`) flows that don't write back to that quantity. Today the manager filling an estimate has no way to know whether the part is in stock, and there's no audit trail when stock changes — which means no defensible reconciliation against Splus, the external accounting system that holds the source-of-truth quantity.

Two near-term needs make this a blocker:

1. **Estimate UX**: when adding a Part to a JobLine, the manager wants a real picker that filters on `quantity > 0` and shows current stock per row, not a free-text field.
2. **Splus reconciliation**: nightly Splus pull will reset `Part.quantity` to whatever Splus says. Without a movement log we can't tell whether a discrepancy is a real loss, a missed sale, or a Splus lag.

A future roadmap item is **RFID/barcode scanning** for inventory counts — that needs the same movement log as its write target, plus a `Part.barcode` lookup.

## Goals

1. Single source of truth for current stock: `Part.quantity` keeps current absolute value; `StockMovement` records every delta with reason/actor/source.
2. Estimate flow can pick a Part by article/name/barcode with live stock readout; selecting a Part for a JobLine writes a reservation movement.
3. Inbound `SupplierOrder.RECEIVED` writes a `RECEIPT` movement; outbound RO close writes a `CONSUMPTION` movement.
4. Splus reconciliation pull is well-defined: Splus quantity wins on `Part.quantity`; movements log the diff so we know what was lost.
5. RFID/barcode scanner-friendly: `Part.barcode` indexed, `/api/stock/lookup?code=` resolves a code to a Part with current stock.

## Non-Goals

- Multi-warehouse / bin location tracking (single warehouse for now).
- Serial numbers per unit (per-unit tracking is overkill; lot-level via `SupplierOrderItem` is enough).
- Pick-pack workflows (manual handover stays manual).
- Real-time Splus push (we pull, not push, until explicit need).

## Data Model

### New: `StockMovement`
```prisma
enum StockMovementReason {
  RECEIPT          // From SupplierOrder receipt
  CONSUMPTION      // To RepairOrder JobLine close
  SALE             // To PartOrder fulfillment
  ADJUSTMENT       // Manual correction (admin-only)
  SPLUS_SYNC       // Reconciliation diff vs Splus
  COUNT            // Physical inventory count (RFID/barcode)
  RETURN           // Customer/supplier return
}

model StockMovement {
  id              String              @id @default(cuid())
  partId          String
  delta           Int                 // signed: positive = in, negative = out
  resultingQty    Int                 // Part.quantity after this movement applied
  reason          StockMovementReason
  actorUserId     String?             // who triggered (null = system, e.g. SPLUS_SYNC)
  repairOrderId   String?             // origin link
  partOrderId     String?
  supplierOrderId String?
  notes           String?
  createdAt       DateTime            @default(now())

  part           Part           @relation(fields: [partId], references: [id], onDelete: Cascade)
  actor          User?          @relation("StockMovementActor", fields: [actorUserId], references: [id], onDelete: SetNull)
  repairOrder    RepairOrder?   @relation(fields: [repairOrderId], references: [id], onDelete: SetNull)
  partOrder      PartOrder?     @relation(fields: [partOrderId], references: [id], onDelete: SetNull)
  supplierOrder  SupplierOrder? @relation(fields: [supplierOrderId], references: [id], onDelete: SetNull)

  @@index([partId, createdAt])
  @@index([reason])
  @@index([repairOrderId])
  @@index([supplierOrderId])
}
```

### Mutations on `Part`
- Add `barcode String? @unique` and `gtin String?`. Indexed for scanner lookup.
- Add `lastSplusSyncAt DateTime?` and `splusExternalId String? @unique` for the reconciliation pin.
- Keep `quantity` — but every write goes through the `applyStockMovement` server action that updates both rows in a transaction.

### Splus reconciliation table (lightweight)
```prisma
model SplusSyncRun {
  id          String   @id @default(cuid())
  startedAt   DateTime @default(now())
  finishedAt  DateTime?
  partsSeen   Int      @default(0)
  partsDiff   Int      @default(0)
  errors      String?
  rawDigest   String?  // sha256 of the pulled payload for replay
}
```

## Server actions / API

| Action | Purpose | Auth |
|---|---|---|
| `applyStockMovement(partId, delta, reason, refs)` | Single mutation gate. Writes movement + updates `Part.quantity` in a tx. | ADMIN/MANAGER (CONSUMPTION/SALE), ADMIN (ADJUSTMENT) |
| `recordSupplierReceipt(supplierOrderId)` | On `SupplierOrder.status=RECEIVED`, walks items, writes RECEIPT movements. | ADMIN/MANAGER |
| `consumePartsForRepairOrder(repairOrderId)` | On RO `CLOSED`, walks PartLines, writes CONSUMPTION. | ADMIN/MANAGER |
| `runSplusSync()` | Background job; pull from Splus, diff each part, write SPLUS_SYNC adjustments. | system / cron |
| `GET /api/stock/lookup?code=...` | Scanner endpoint. Resolves barcode/article/gtin → Part with current stock. | ADMIN/MANAGER |

## Estimate Flow Integration

`JobLineEditor` parts panel gains a picker:
- Search input with debounced lookup against Part (article + name + barcode).
- Selected Part fills `partDescription`, `partUnitPrice`, locks qty cap to `quantity`.
- "Свободный текст" toggle preserves the current free-text path for non-catalog parts.
- Stock chip per result: green ≥ qty, yellow 1..qty-1, red 0 (still selectable with warning).

## Splus Sync Strategy

1. **Truth-on-pull**: Splus is authoritative for `quantity`. Every sync run computes `delta = splus.qty - geleoteka.quantity` per part, writes `SPLUS_SYNC` movement with that delta, then sets `Part.quantity = splus.qty`.
2. **Movements are immutable**: a discrepancy isn't "fixed" by editing past movements; it's recorded as a fresh SPLUS_SYNC entry. Audit trail intact.
3. **Cron schedule**: hourly during business hours, daily at 03:00 outside.
4. **Failure mode**: sync errors are logged on `SplusSyncRun.errors`; nothing changes on `Part.quantity`. Admin is notified via existing `Notification` model.

## Modularity

This module lives at `components/parts/warehouse/`, `lib/warehouse/`, `app/actions/warehouse.ts`. Imports from the Service module are forbidden by the existing module-boundaries ESLint rule; the Service module imports the **public surface** only:
- `applyStockMovement` (write contract)
- `lookupPartForJobLine(query)` (read contract for the picker)

Splus integration goes in `lib/integrations/splus/` (already partially scaffolded). It depends on warehouse, never the reverse.

## RFID / Barcode Roadmap (informational)

Once the warehouse module ships, the scanner UI is a thin client:
- `/admin/warehouse/scan` page, opens camera (browser BarcodeDetector API) or accepts USB-HID barcode wedge input.
- Each scan calls `GET /api/stock/lookup?code=...` then `POST /api/stock/movement` with reason `COUNT`.
- For RFID readers (USB or Bluetooth), the same endpoints plus a small reader-driver Web Bluetooth shim.
- Mobile-PWA deferred but the endpoints are PWA-ready (no auth coupling beyond cookie).

No schema changes when scanner ships — the model already supports it.

## Acceptance Criteria

- [ ] `StockMovement` migration applied; `Part.quantity` writes go through `applyStockMovement`.
- [ ] Estimate part picker filters on stock and shows quantity per result.
- [ ] Receiving a `SupplierOrder` increments stock and writes RECEIPT movements.
- [ ] Closing a `RepairOrder` decrements stock for its `PartLine`s and writes CONSUMPTION movements.
- [ ] `/admin/parts/[id]` has a "История движений" tab listing all movements.
- [ ] Splus sync stub exists with the contract shape (real Splus credentials separate task).
- [ ] `GET /api/stock/lookup?code=...` returns a part by article OR barcode.
- [ ] Module boundaries: warehouse code is in its own dir, ESLint forbids inverse imports.

## Open Questions

- Reservations vs. consumption: do we decrement on JobLine ADD (reservation) or RO CLOSE (consumption)? Recommendation: consumption-only initially; revisit if double-booking happens.
- Do partial returns warrant their own `RETURN` reason or share `ADJUSTMENT`? Recommendation: separate enum; separate UX later.
- Bin/location tracking: out of scope now, but if we ever go there we'll add `StockBin` + `Part.binId` without breaking movements.
