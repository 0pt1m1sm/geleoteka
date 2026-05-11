# Technical Debt

Tracked items not on the active backlog. When picking one up, copy its block into a fresh `docs/plans/YYYY-MM-DD-<slug>.md` and run `/spec`.

---

## TD-001: Warehouse / inventory management

**Status:** DEFERRED
**Logged:** 2026-05-12
**Trigger to revisit:** before scaling the retail-parts channel beyond the current single-operator-flow (manager manually edits `Part.quantity` per receipt).

### Current state (what works)

- `Part.quantity: Int @default(0)` — single number per part.
- Retail order side: `app/actions/part-orders.ts:124` decrements on `createPartOrder` (`quantity: { decrement: item.quantity }`).
- Public catalog: `app/(public)/parts/page.tsx:255` renders «В наличии» / «Под заказ» based on `quantity > 0`.
- `SupplierOrder` pipeline status (`DRAFT → ORDERED → IN_TRANSIT → CUSTOMS → RECEIVED → COMPLETED`) at `prisma/schema.prisma:887` — sets `receivedAt` on transition but does NOT increment `Part.quantity`.
- `PartLine.status` enum (`NEEDED / ORDERED / RECEIVED / INSTALLED`) on `RepairOrder` exists at `prisma/schema.prisma:51` but has no write-back to `Part.quantity` on INSTALL.

### Gaps

1. **Receiving doesn't restock.** `app/actions/supplier-orders.ts:97–104` (`updateSupplierOrderStatus("RECEIVED")`) only stamps `receivedAt`. Manager has to edit each `Part.quantity` by hand in `/admin/parts`.
2. **No reservation on cart.** Two customers can put the last item in cart simultaneously → both see "В наличии" → both check out → quantity goes negative. Decrement happens only at `createPartOrder`, not when added to cart.
3. **No stock-movement ledger.** Only the current count is stored. No history of "what went in/out, when, why, by whom" — blocks audit, inventory counts, troubleshooting.
4. **Service-side `PartLine.INSTALLED` doesn't decrement.** If a part is consumed via RepairOrder (technician installs it from shelf) instead of retail PartOrder, stock is never debited.
5. **No low-stock alerts / reorder thresholds.** No way for a manager to see "fuel filter down to 1 unit, reorder."
6. **No returns flow.** Cancelled `PartOrder` / cancelled `RepairOrder` with installed parts — `Part.quantity` is not restored.
7. **Single warehouse.** One `quantity` field per part; can't split across magazin / склад / cervice bay locations.
8. **No inventory audit / cycle-count UI.** Manual recount → no record of who adjusted what.

### Minimal scope when picked up

1. **`StockMovement` ledger table.** Fields: `{ id, partId, delta (Int, signed), reason (enum: RECEIVE / SALE / INSTALL / RETURN / ADJUST), refType, refId, byUserId, note, createdAt }`. All changes to `Part.quantity` must go through this ledger via a `recordStockMovement()` helper that does the ledger insert + `Part.quantity` update in a single transaction.
2. **Receiving wires to ledger.** `updateSupplierOrderStatus("RECEIVED")` walks `SupplierOrderItem[]` and emits one `RECEIVE` movement per item with `refType=SupplierOrderItem`.
3. **Installation wires to ledger.** `PartLine` transition to `INSTALLED` emits an `INSTALL` movement with `refType=PartLine`.
4. **Cancel / refund restores via `RETURN`.** Reversal records its own ledger entry — never silently undo the original row.
5. **Manual adjust** via `recordStockAdjustment(partId, delta, note)` server action — ledger entry with `reason=ADJUST`.
6. **`Part.reorderAt: Int?`** field. `/admin/parts` list shows a «мало» badge when `quantity <= reorderAt`.
7. **History panel** at `/admin/parts/[id]` — last 50 movements with date / reason / delta / source link / actor.

### Out of scope (for the first iteration)

- Cart reservations / TTL holds — separate decision (decrement-at-checkout vs short-lived reservation). Independent design pass.
- Multi-warehouse / per-location stock — defer until a second physical location appears.
- Cycle-count / inventory-audit UI.
- Costing layer (FIFO/LIFO/weighted-avg) — `Part.price` stays single-value for now.

### Why deferred

The current single-operator flow works: the manager owns the stock and edits `Part.quantity` by hand on receipt. The fragile spots (no ledger, no reservation) only become real bugs at higher retail throughput or with a second shop user. Until then, this is a quality-of-life item, not a launch blocker.

### Files in play

- `prisma/schema.prisma` — `Part`, `SupplierOrder`, `SupplierOrderItem`, `PartOrder`, `RepairOrder`, `PartLine`, enums.
- `app/actions/supplier-orders.ts` — receiving status transition.
- `app/actions/part-orders.ts` — retail decrement.
- `app/(admin)/admin/parts/` — admin UI for parts + edits.
- `app/(admin)/admin/suppliers/orders/` — supplier-order admin.
