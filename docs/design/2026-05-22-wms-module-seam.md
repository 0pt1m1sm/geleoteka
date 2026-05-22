# WMS Module Seam Design

**Mode:** multitenancy
**Created:** 2026-05-22
**Author:** architecture agent
**Status:** DESIGN (not implementation)
**Scope:** Defines the module boundary, Part-split, source-reference contract, ESLint enforcement, and multitenancy seam for the warehouse-management (WMS) core that Phase 2 of `docs/plans/2026-05-22-prd-consolidation-fulfillment-warehouse-crm.md` (Tasks 7–13) builds. This document is the seam the plan's Phase 2 tasks must be refactored around. It does NOT prescribe full implementations — it fixes the boundaries those tasks must respect.

---

## 0. The core constraint (why this design exists)

The owner licenses modules independently and intends to extract this WMS into a **standalone, multi-tenant, separately-licensed grocery-warehouse product** with barcode/NFC scanning. Therefore the WMS code written now must satisfy three properties that the plan's *current* draft violates:

1. **One-way dependency.** Host (auto-service) → WMS core. **Never** WMS core → host. The core must not know `Deal`, `Estimate`, `EstimateLine`, `RepairOrder`, `PartShipment`, `SupplierOrder`, channels, or CRM exist.
2. **Lift-and-shift extractability.** Moving `lib/wms/` into a new repo should require deleting the host adapter and swapping the Prisma datasource — not untangling auto-service concepts from stock logic.
3. **Tenant-ready.** A single tenant today, but the data model and the call seam must not have to be re-cut when tenancy/licensing arrives.

### Where the plan currently violates property #1

The plan (Tasks 8, 10) places WMS logic **inside the CRM module**:
- Task 8: `lib/crm/internal/apply-stock-movement.ts` and `lib/crm/public/stock.ts`
- Task 10: `lib/crm/internal/consume-parts.ts`

This is the entanglement to prevent. CRM is a host domain module — it imports `Deal`/`Estimate`/`RepairOrder` types freely. If stock logic lives in CRM, it inherits CRM's coupling and cannot be extracted. The CRM `public`/`internal` split is the right *idiom*, but the WMS core needs its **own** top-level module with a **stricter** rule: not just "don't reach internal" but "core imports zero host code at all."

**Refactor instruction for the plan:** move stock primitives out of `lib/crm/` into `lib/wms/`. CRM keeps only the *adapter* call sites (Tasks 9, 10, 11 dispatch sites). See §1 and §7 for the exact relocation.

---

## 1. Module layout — `lib/wms/` with public/internal split + a host-side adapter

```
lib/wms/                          # THE EXTRACTABLE CORE — zero host imports
  public/
    index.ts                      # the ONLY entry point host code may import
    record-movement.ts            # recordMovement(...) — the single chokepoint (was applyStockMovement)
    stock.ts                      # availableStock(item) pure helper
    lookup.ts                     # lookupByCode(code) — barcode/article → StockItemView
    types.ts                      # WmsItemRef, MovementReason, MovementSource, StockItemView, RecordMovementInput
    errors.ts                     # WmsError taxonomy (NotFound, NullSourceForIdempotentReason, ...)
  internal/
    counters.ts                   # reason→(quantityDelta, reservedDelta) map; the only place the math lives
    idempotency.ts                # (tenantKey, sourceType, sourceId, reason) dedupe handling (P2002 → no-op)
    repository.ts                 # the ONLY file that touches Prisma for stock rows/StockMovement
  README.md                       # "extraction checklist" — what to do to lift this out

lib/wms-host/                     # HOST ADAPTER — the bridge; this is what gets DELETED on extraction
    db.ts                         # re-exports the host `db` singleton as the wms DB port (see §2)
    actor.ts                      # maps host session → actorUserId
    constants.ts                  # host's tenant key constant (TENANT_KEY = "geleoteka") until real tenancy
```

**Rationale for the two-package split.** The core (`lib/wms/`) must not import `@/lib/db` directly, because `@/lib/db` is a host artifact — in the extracted product the DB singleton and the generated Prisma client live elsewhere. Instead the core depends on a **narrow DB port** (a TypeScript interface in `internal/repository.ts`) that the host wires up via `lib/wms-host/db.ts`. On extraction you delete `lib/wms-host/` and provide a new adapter; `lib/wms/` is untouched.

> **Cost / pragmatism note.** A fully abstract DB port (hand-rolled interface over Prisma) is gold-plating for a one-tenant app today. The honest middle ground: `lib/wms/internal/repository.ts` MAY import the *generated Prisma types* (`@/app/generated/prisma/client`) and a `db`-shaped client passed **in**, but MUST NOT import the host `db` *singleton* and MUST NOT import any host *domain* model usage (no `db.deal`, `db.estimate`, `db.repairOrder` calls). The client is injected through `lib/wms-host/db.ts`. This keeps the seam real without building a repository abstraction layer the team won't maintain. The ESLint rule (§4) enforces "no host singleton, no host domain modules"; the Prisma *type* import is the one allowed bridge and is documented as the extraction touch-point.

**What lives in core vs adapter:**

| Concern | Location | Why |
|---|---|---|
| `recordMovement` chokepoint | `lib/wms/public/record-movement.ts` | core logic, reason-agnostic to host |
| reason→counter math | `lib/wms/internal/counters.ts` | pure, no host knowledge |
| idempotency / dedupe | `lib/wms/internal/idempotency.ts` | core invariant |
| `availableStock` pure helper | `lib/wms/public/stock.ts` | pure; picker + API call it |
| `lookupByCode` (barcode/article) | `lib/wms/public/lookup.ts` | scanning foundation, extracts with core |
| Prisma reads/writes for stock | `lib/wms/internal/repository.ts` | only file touching the DB client |
| **Deciding WHEN to call** (RECEIVED, RO close, estimate reserve) | **host** (`app/actions/*`, dispatch helpers) | host knows fulfillment lifecycle; core does not |
| **Translating host events → `MovementSource`** | **host** | core never learns what a RepairOrder is |
| host `db` singleton injection | `lib/wms-host/db.ts` | the deletable bridge |

The host's Task 9/10/11 call sites stay in `app/actions/` (and may keep a thin CRM-side helper that *builds the source struct*), but the moment they need stock to change they call `recordMovement` from `@/lib/wms/public`. The CRM module no longer owns any stock code.

---

## 2. The shared `Part` problem — RECOMMENDATION: option (b), a `StockItem` table now, 1:1 to Part

### The three options weighed

**(a) Core owns only `StockMovement`; reads/writes `quantity`/`reserved` columns that physically live on `Part`, via a narrow `StockItem` interface keyed by `partId`.**
- Pro: zero new table, smallest migration, matches the plan's current "add `reserved` to Part" instinct.
- Con: the WMS core's writeable state lives on a **host-owned table** (`Part`, which also carries `slug`, `price`, `compareAtPrice`, `isOEM`, `categoryId` — pure catalog/e-commerce). On extraction you must carve stock columns out of a table the storefront owns: a destructive, coordinated migration on both products. The seam is logical-only; the physical schema stays entangled. **Not lift-and-shift.**

**(b) Introduce a `StockItem` table now, 1:1 with `Part` (`StockItem.partId @unique`), holding `quantity`, `reserved`, `barcode`, `gtin`, and the tenant key. `Part` keeps only catalog identity.** ✅ RECOMMENDED
- Pro: the WMS core owns **its own physical table** from day one. Catalog (`Part`: slug/article/name/price/photos/category/isActive) stays host-owned; stock (`StockItem`) is WMS-owned. Extraction = move the `StockItem` + `StockMovement` tables and the `lib/wms/` package; `Part` stays in the host. The `partId` becomes nothing more than an opaque external item key (it IS the `WmsItemRef.itemId`), exactly the shape the grocery product will use (its own SKU id). No coordinated column-carving migration later.
- Pro: enforces property #1 at the schema level — the core never selects `price`/`slug`, because they're not on its table.
- Con: every available-stock read for the storefront/picker is a `Part`→`StockItem` join (or a batched lookup). One extra index + join. For this catalog size (a G-Class parts shop, not millions of SKUs) this is negligible; add `@@unique([partId])` and the join is index-backed.
- Con: a one-time data migration to create one `StockItem` per existing active `Part`, copying current `quantity`. Idempotent backfill, ~one query. Acceptable.

**(c) Keep `Part` shared; define a TS port (`WmsItemRef`) as the only shape the core knows; stock columns stay on `Part`.**
- Same physical entanglement as (a) — the port is TS-only, the table is still shared. Good as a *complement* to (b) (we keep `WmsItemRef` as the core's type), but insufficient *alone* as the storage decision.

### Decision

**Adopt (b) for storage + (c)'s `WmsItemRef` as the core's type.** Create a `StockItem` table now, 1:1 with `Part` via `StockItem.partId @unique`. The WMS core knows items only as `WmsItemRef { itemId: string }` where `itemId === StockItem.partId` today (and `=== SKU id` in the grocery product tomorrow). `Part` loses no catalog columns; it simply stops being the home of `quantity`/`reserved`/`barcode`/`gtin`.

**Cost, stated plainly:**
1. **One new table + one-time idempotent backfill** (one `StockItem` per active `Part`, copy `quantity`). ~30 lines of migration SQL + a guarded backfill.
2. **Storefront and estimate-picker stock reads become a join** `Part ⨝ StockItem on partId`. Index-backed, negligible at this catalog size.
3. **The plan's Task 7 changes:** instead of adding `reserved`/`barcode`/`gtin` *to Part*, create `model StockItem` (owned by WMS, mapped table `StockItem`) with those fields + `quantity` + tenant key, and the `StockMovement.itemId` FK points at `StockItem`, **not** `Part`. `Part.quantity` is migrated into `StockItem.quantity` and then **dropped from Part** (multi-step per backend standards: stop writing it first, then drop). Until the drop lands, the storefront keeps reading `Part.quantity`; cut the storefront over to `StockItem.quantity` in the same task that introduces the join.

> If the team rejects the new table for schedule reasons, fall back to (a)+(c): keep columns on `Part` but route ALL stock access through `lib/wms/internal/repository.ts` and the `WmsItemRef` type, and accept that extraction will require a column-carving migration. State that explicitly in the plan as deferred extraction debt. **(b) is strongly preferred** — the table is cheap now and removes the only hard extraction blocker.

---

## 3. The source-reference contract (opaque seam)

The host calls the core through a single function whose `source` is an **opaque `{ type, id }` string pair** — the core never interprets it, only stores it and uses it for idempotency. This generalizes the plan's existing `applyStockMovement(... sourceType, sourceId)` instinct into the explicit module API.

```ts
// lib/wms/public/types.ts

/** The only shape the WMS core knows about a stockable item. itemId is opaque
 *  to the core: it is StockItem.partId in the host today, a SKU id in the
 *  grocery product tomorrow. */
export interface WmsItemRef {
  itemId: string;
}

export type MovementReason =
  | "RECEIPT"        // inbound on-hand
  | "CONSUMPTION"    // outbound on-hand (+ releases the matching hold)
  | "ADJUSTMENT"     // manual correction; the ONLY reason allowed a null source
  | "RESERVATION"    // raise reserved, leave on-hand
  | "RELEASE";       // lower reserved, leave on-hand

/** Opaque provenance. The core stores type+id verbatim and uses the triple
 *  (tenantKey, type, id, reason) as the idempotency key. The core attaches NO
 *  meaning to `type` — "RepairOrder" / "SupplierOrder" are just strings the
 *  host chose. The core has no enum of host source types and never will. */
export interface MovementSource {
  type: string;        // host-defined, e.g. "RepairOrder", "SupplierOrder", "EstimateLine"
  id: string | null;   // null permitted ONLY when reason === "ADJUSTMENT"
}

export interface RecordMovementInput {
  item: WmsItemRef;       // { itemId }
  reason: MovementReason;
  qty: number;            // always positive; the reason+counter map decides sign
  source: MovementSource; // opaque
  actorId?: string;       // host user id, opaque to core (no User import)
  note?: string;
  tenantKey?: string;     // see §5; defaults to the single host tenant when omitted
}

export interface MovementResult {
  applied: boolean;       // false when an idempotent no-op (duplicate triple)
  itemId: string;
  quantity: number;       // on-hand after
  reserved: number;       // reserved after
  available: number;      // quantity - reserved after
}
```

```ts
// lib/wms/public/record-movement.ts  (signature only — implementation is Task 8)
export async function recordMovement(
  input: RecordMovementInput,
  tx?: DbClientPort,        // optional injected tx so host can compose inside its own $transaction
): Promise<MovementResult>;
```

```ts
// lib/wms/public/stock.ts
export function availableStock(item: { quantity: number; reserved: number }): number;

// lib/wms/public/lookup.ts
export interface StockItemView {
  itemId: string; barcode: string | null; quantity: number; reserved: number; available: number;
}
export async function lookupByCode(code: string, tenantKey?: string): Promise<StockItemView | null>;
```

**Host-side translation (stays in the host, NOT in core).** The host turns its lifecycle events into `MovementSource`:

| Host event (host knows this) | `source` the host passes (core only stores it) |
|---|---|
| SupplierOrder → RECEIVED, per item | `{ type: "SupplierOrder", id: \`${orderId}:${itemId}\` }`, reason RECEIPT |
| RepairOrder/PartShipment close, per APPROVED estimate PART line | `{ type: "RepairOrder"\|"PartShipment", id: \`${orderId}:${estimateLineId}\` }`, reason CONSUMPTION |
| Estimate PART line add | `{ type: "EstimateLine", id: estimateLineId }`, reason RESERVATION |
| Estimate decline / line delete / qty edit | same `EstimateLine` source, reason RELEASE |

The core's idempotency triple `(tenantKey, source.type, source.id, reason)` exactly subsumes the plan's `(sourceType, sourceId, reason)` unique key (Task 7) — the plan's null-source guard (Task 8) becomes the core's `NullSourceForIdempotentReason` error: `source.id === null` is rejected for every reason except `ADJUSTMENT`.

**Refactor instruction:** Tasks 9/10/11 keep their *event detection* logic but replace direct `applyStockMovement(...)` calls with `recordMovement({ item: { itemId: partId }, reason, qty, source: {...}, actorId })` imported from `@/lib/wms/public`.

---

## 4. Dependency-direction enforcement (ESLint flat config, eslint 9)

Append to `eslint.config.mjs`. Two new config objects extend Task 6's existing CRM-boundary block (do not replace it). The first forbids the **core** from importing **anything host-shaped**; the second forbids **host code** from reaching `lib/wms/internal`.

```js
// --- WMS module boundary (append to the defineConfig array) ---

// (1) The WMS CORE may not import host/app/CRM/domain code at all.
//     This is the one-way-dependency guarantee. The ONE allowed bridge —
//     generated Prisma *types* — is whitelisted by omission (it is not in
//     any forbidden group). Everything host-shaped is banned.
{
  files: ["lib/wms/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        { group: ["@/lib/db", "**/lib/db"],
          message: "WMS core must not import the host db singleton. Use the injected DbClientPort (wired by lib/wms-host)." },
        { group: ["@/lib/crm/*", "**/lib/crm/*"],
          message: "WMS core must not import CRM. Stock is host-agnostic." },
        { group: ["@/app/actions/*", "**/app/actions/*", "@/app/(*)/**", "@/components/*", "**/components/*"],
          message: "WMS core must not import host app/actions/components. Dependency direction is host → wms only." },
        { group: ["@/lib/wms-host/*", "**/lib/wms-host/*"],
          message: "WMS core must not import its host adapter. The adapter wires the core, not vice versa." },
        // Block importing host DOMAIN model usage even from the generated client surface
        // is enforced by review (the type import is allowed); add specific bans here if a
        // domain barrel ever appears, e.g. "@/lib/fulfillment/*".
      ],
    }],
  },
},

// (2) Host code (everything OUTSIDE lib/wms) may not reach lib/wms/internal.
//     Public surface is lib/wms/public only — mirrors the CRM idiom.
{
  files: ["**/*.{ts,tsx}"],
  ignores: ["lib/wms/**"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        { group: ["@/lib/wms/internal/*", "**/lib/wms/internal/*"],
          message: "Import from @/lib/wms/public instead. lib/wms/internal is private to the WMS core." },
      ],
    }],
  },
},
```

Notes:
- The `lib/wms-host/` adapter is host code and is **allowed** to import `@/lib/db` (it is the bridge) and `@/lib/wms/public`. It must NOT import `@/lib/wms/internal`.
- Object (1) deliberately does NOT ban `@/app/generated/prisma/client` — that generated-type import is the single documented extraction touch-point (see §2 cost note). If you want zero-tolerance, ban it too and have `repository.ts` receive Prisma types via generics; that is more friction than this team needs today.
- These objects compose with Task 6's CRM rule because flat-config `no-restricted-imports` blocks are merged per matched file; keep all three (CRM, WMS-core, WMS-internal) as separate scoped objects.

**Verification (add to whichever task lands the rule — recommend a new Task 6b or fold into Task 7):** a temporary `import "@/lib/db"` inside any `lib/wms/` file must make `npm run lint` error; a temporary `import "@/lib/wms/internal/repository"` inside an `app/` file must error.

---

## 5. Multitenancy seam — now vs defer (decisive)

The host has **exactly one tenant today.** Do not build tenant management, tenant tables, row-level security, or per-tenant connection routing now — that is gold-plating for a one-tenant app and the user explicitly said be decisive and not over-build.

### MUST design in NOW (cheap, irreversible-if-skipped):

1. **A `tenantKey String` column on `StockItem` and `StockMovement`, defaulting to a single host constant** (`lib/wms-host/constants.ts` → `TENANT_KEY = "geleoteka"`). This is the ONE thing that is painful to add later: backfilling a tenant discriminator onto a populated ledger after the product has multiple tenants means re-keying every historical movement. Adding it now (one column, one default, one index) costs nothing and means the extracted product's tenant-scoping is a `WHERE tenantKey = ?` that already has a home.
2. **`tenantKey` threaded through the contract** (`RecordMovementInput.tenantKey?`, `lookupByCode(code, tenantKey?)`) — optional in the signature, defaulted by the adapter. The core's idempotency key becomes `(tenantKey, source.type, source.id, reason)` so two tenants can have the same source id without colliding. The host passes the constant; callers don't think about it.
3. **All core reads/writes go through `repository.ts`** — the single file where a future `WHERE tenantKey = ?` filter is injected. Because every query already funnels here, turning on tenant scoping later is a one-file change, not a grep-and-pray across the codebase. (This is also why §1 mandates `repository.ts` as the only Prisma-touching file.)
4. **`@@index([tenantKey, partId])` on `StockItem`** and `@@index([tenantKey, partId, createdAt])` on `StockMovement` so the future scoped queries are index-backed from day one.

### SAFE to defer (do NOT build now):

- Tenant CRUD, tenant onboarding, a `Tenant` table with metadata — the grocery product owns that.
- License/entitlement checks ("did this tenant buy WMS?") — host-app concern, lives outside the core.
- Per-tenant connection pools / schema-per-tenant / RLS policies — a deployment decision for the standalone product; the `tenantKey` column supports either shared-schema-with-discriminator or future migration to schema-per-tenant.
- Cross-tenant access *enforcement* (the security boundary) — there is one tenant, so there is no cross-tenant path to guard yet. **But** because all access funnels through `repository.ts` with `tenantKey` already in the key, the enforcement point is pre-built: when tenancy ships, the boundary check is "every repository query MUST carry a tenantKey; a query without one throws" — a single guard in one file. Treat the tenant boundary as a security boundary *in the design* (the column + the funnel) even though there's nothing to enforce against today.

**The now-vs-defer line, one sentence:** add the `tenantKey` column + funnel everything through `repository.ts` now; build nothing tenant-aware above the storage layer until the standalone product exists.

---

## 6. Barcode/NFC scanning surface

The scanning foundation must extract with the core, so the resolution logic lives in the core and only the HTTP shell lives in the host.

- **Core:** `lib/wms/public/lookup.ts` → `lookupByCode(code, tenantKey?)`. Resolution order: exact `barcode` match (first active) → exact `article` match. Returns `StockItemView | null`. This is pure WMS logic (it knows items, codes, stock) with zero host coupling — it extracts verbatim.
  - Note: `article` lives on the host `Part` (catalog identity), `barcode`/`gtin` live on `StockItem` (WMS). `lookupByCode` resolves `barcode`/`gtin` directly in the core; the **article** fallback requires a catalog lookup. To keep the core clean, the core resolves by `barcode`/`gtin` only, and the **host adapter** (`lib/wms-host`) provides an optional `articleResolver(code) => itemId | null` callback that the route passes in. In the grocery product, items are scanned by barcode/GTIN — the article fallback is host-specific and correctly stays host-side. (Plan TS-007 expects article to resolve too; satisfy it via the adapter resolver, not by teaching the core about `article`.)
- **Host:** `app/api/stock/lookup/route.ts` (Task 12) — the GET shell: session/role gate, parse `?code=`, call `lookupByCode` (passing the host article resolver), shape the `{ data }` / `{ error }` envelope, return 200/404/401/403. This is a thin host adapter over the core; it does not extract (the grocery product writes its own route) and that's correct.
- **Future NFC/scanner service** (the grocery product's scanner client/daemon) targets `lookupByCode` + `recordMovement` — both already in `lib/wms/public`. No new seam needed; the scanning device talks to the same two functions.

**Refactor instruction:** Task 12's resolution logic moves into `lib/wms/public/lookup.ts`; the route file keeps only auth + envelope + the article-resolver wiring.

---

## 7. Concrete changes to plan Tasks 7–13 (the actionable delta)

| Task | Current plan | After this seam |
|---|---|---|
| **7** | Add `reserved`/`barcode`/`gtin` to `Part`; `StockMovement.partId → Part` | Create `model StockItem` (WMS-owned: `partId @unique`, `quantity`, `reserved`, `barcode`, `gtin`, `tenantKey`, indexes); migrate `Part.quantity → StockItem.quantity`; `StockMovement.itemId → StockItem`; add `tenantKey` to `StockMovement`; multi-step drop of `Part.quantity` after storefront cutover |
| **8** | `lib/crm/internal/apply-stock-movement.ts` + `lib/crm/public/stock.ts` | `lib/wms/public/record-movement.ts` (`recordMovement`), `lib/wms/internal/counters.ts`, `lib/wms/internal/idempotency.ts`, `lib/wms/internal/repository.ts`, `lib/wms/public/stock.ts`; `lib/wms-host/db.ts` injects the host `db`. Add the ESLint blocks (§4) here or as 6b. |
| **9** | RECEIVED handler calls `applyStockMovement` | RECEIVED handler builds `source = { type:"SupplierOrder", id:\`${orderId}:${itemId}\` }` and calls `recordMovement` from `@/lib/wms/public` |
| **10** | `lib/crm/internal/consume-parts.ts` calls `applyStockMovement` | Host-side consume helper (may stay near the action or in a host fulfillment lib — NOT in `lib/wms/`) reads APPROVED estimate PART lines, builds `source`, calls `recordMovement`. Core gains nothing host-specific. |
| **11** | Picker uses `availableStock`; lines write RESERVATION/RELEASE | Picker reads available via `Part ⨝ StockItem` (or `lookupByCode`/a core read); reservation calls `recordMovement` with `source={type:"EstimateLine", id:lineId}` |
| **12** | `/api/stock/lookup` resolves barcode then article | Route = auth + envelope; resolution = `lib/wms/public/lookup.ts` `lookupByCode` + host `articleResolver` for the article fallback |
| **13** | Stock history reads `db.stockMovement` on part page | Unchanged location (host admin page) but reads via the core's read API or a `StockMovement` query scoped by `itemId` (= `partId`); header available from `availableStock` |

**Net:** zero stock primitives remain in `lib/crm/`. CRM keeps deal/estimate/fulfillment logic; WMS owns stock; the host wires them at the action layer through `recordMovement`'s opaque `source`.

---

## 8. Extraction checklist (the payoff — goes in `lib/wms/README.md`)

To extract the WMS into the standalone grocery product:
1. Copy `lib/wms/` verbatim into the new repo.
2. Delete `lib/wms-host/`; write a new adapter providing: the DB client port, the actor mapper, the tenant key source (now real, not a constant), and the article/code resolver.
3. Move the `StockItem` + `StockMovement` tables (and their data) — they are self-contained, FK only to themselves and to an opaque `itemId`. `Part` stays behind in the auto-service host.
4. Turn on tenant scoping: enforce non-null `tenantKey` in `repository.ts`; wire the adapter's tenant key to the real tenant context.
5. Build the scanner client against `lib/wms/public` (`lookupByCode`, `recordMovement`) — no core changes.

Nothing in step 1's payload references `Deal`, `Estimate`, `RepairOrder`, or any auto-service concept. That is the design's success criterion.
