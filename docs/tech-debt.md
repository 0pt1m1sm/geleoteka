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

---

## TD-002: Claim-token TTL + invalidate-on-claim

**Status:** DEFERRED
**Logged:** 2026-05-12
**Trigger to revisit:** before retail-volume scales OR if a token-misdelivery security incident occurs.

### Current state

- `Deal.claimToken`, `RepairOrder.claimToken`, `PartOrder.claimToken`, `RentalBooking.claimToken` are `String?` columns with no expiration field (see `prisma/schema.prisma:486, 793, 846, 1070`).
- Tokens are generated by `generateClaimToken()` in `lib/customer-onboarding.ts`.
- Tokens are cleared on claim (`customer-onboarding.ts:findOrCreateGuestCustomer` flow), but a token that's never claimed lives forever.
- Tokens are transmitted via SMS (`lib/sms.ts:sendBookingConfirmation`) and will be transmitted via email (per `docs/plans/2026-05-12-smtp-email-integration.md` once shipped).

### Gap

A typo'd phone or email at booking time delivers the bearer token to the wrong inbox; the recipient can claim the order indefinitely until the customer chases up. No expiry window to bound the damage.

### Scope when picked up

1. **Add `claimTokenExpiresAt: DateTime?` to all four tables** (`Deal`, `RepairOrder`, `PartOrder`, `RentalBooking`). Migration. Default to `now() + 72 hours` at insertion via `generateClaimToken()` callers.
2. **Server-side claim flow rejects expired tokens** — `findOrCreateGuestCustomer` checks the expiry and returns a structured error when stale.
3. **Background sweep** (optional in v1): a cron that nulls expired tokens to reduce attack surface, but this is dispensable if the runtime check is in place.
4. **UI surface:** post-checkout panel handles the "your link expired" error gracefully.

### Out of scope (for the first iteration)

- Re-issuing a new token via a "resend my claim link" customer-self-service flow.
- Token rotation analytics / dashboard.

### Why deferred

Current SMS already transmits the same long-lived token; email is not a new exposure surface. The one-shot consumption + email-recipient-matches-booking-email correlation keeps the residual risk low. Worth fixing pre-scale but not blocking pre-launch.

---

## TD-003: Link-based guest claim-account flow

**Status:** DEFERRED
**Logged:** 2026-05-12
**Trigger to revisit:** when SMTP email goes live and customers ask "I missed the post-checkout panel — how do I claim my order from the email?"

### Current state

- Guest claim flow is implemented at `components/shared/PostCheckoutAuthPanel.tsx`, rendered inline immediately after a successful checkout (booking, parts, rental).
- Panel consumes `{ kind, orderId, claimToken, email }` as in-memory React props from the checkout result.
- No route under `/cabinet`, `/claim`, or anywhere else accepts a `claimToken` from a URL and reconstructs the panel's context.
- SMS confirmations (`lib/sms.ts:sendBookingConfirmation`) transmit a claim URL today — it's a stale link that doesn't actually drive any flow.

### Gap

A guest who closes the post-checkout panel before claiming has no way back. Email/SMS CTAs like "claim your account" would be a dead link.

### Scope when picked up

1. **New route:** `app/(public)/claim/[token]/page.tsx`. Reads the token from the URL.
2. **Resolution helper:** new `lib/customer-onboarding/resolve-claim-token.ts` that looks up the token across `Deal`, `RepairOrder`, `PartOrder`, `RentalBooking` (sequentially OR via a single union query) and returns `{ kind, orderId, email }` or `null`.
3. **Server component renders `<PostCheckoutAuthPanel>`** with the resolved context.
4. **Error states:** expired token (once TD-002 is implemented), already-claimed token (token has been nulled), invalid token. Each renders a clear message + CTA to `/register`.
5. **Update SMS + email templates** to use the new `/claim/<token>` URL pattern (drop the broken `/cabinet?claim=<token>` from SMS too).
6. **Decision:** does `?kind=` and `?id=` need to be in the URL, or is the token enough to look up everything? Recommendation: token-only — keeps the URL short and impossible to spoof.

### Out of scope (for the first iteration)

- Token-rotation flow ("resend my claim link").
- Per-entity-type custom landing pages — one panel handles all kinds.

### Why deferred

The SMTP email plan (`docs/plans/2026-05-12-smtp-email-integration.md`) ships intentionally without claim CTAs to keep that PR focused. Customers can still register normally; orders attach by phone+email match at registration. This TD becomes worth the work when (a) the SMS claim links are noticed to be dead, OR (b) we see customer-support requests asking how to claim retroactively.
