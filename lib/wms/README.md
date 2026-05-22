# WMS core (`lib/wms`)

Extractable warehouse-management core. **Zero imports of host/CRM/Deal/Estimate/RepairOrder code.** The host calls in through `lib/wms/public`; the host injects a Prisma client per call and translates its own lifecycle events into the opaque `MovementSource`.

Design: `docs/design/2026-05-22-wms-module-seam.md`.

## Public surface (`lib/wms/public`)

- `recordMovement(client, input)` — the single chokepoint. Writes a `StockMovement` and atomically adjusts `StockItem` on-hand/reserved. Idempotent on `(tenantKey, source.type, source.id, reason)`.
- `availableStock({ quantity, reserved })` — pure: `quantity − reserved`.
- `lookupByCode(client, code, tenantKey?)` — resolve barcode/gtin → `StockItemView`.
- `lookupByItemId(client, itemId)` — resolve by external item id (= partId today).
- Types: `WmsItemRef`, `MovementReason`, `MovementSource`, `RecordMovementInput`, `MovementResult`, `StockItemView`, `DbClientPort`.

## Boundary

- The core imports zero host code. Enforced by ESLint (`eslint.config.mjs`): any `@/lib/db`, `@/lib/crm`, `@/app/*`, or `@/lib/wms-host` import inside `lib/wms/**` is an error. The one allowed bridge is the generated Prisma **types** in `internal/repository.ts`.
- Host code may import `lib/wms/public` only — never `lib/wms/internal`.
- `lib/wms-host` is the host adapter (TENANT_KEY, the host db as the injected client, session→actorId). It is the deletable bridge.

## Extraction checklist

To lift this into a standalone product:

1. Copy `lib/wms/` verbatim.
2. Delete `lib/wms-host/`; write a new adapter providing the DB client, the real tenant key, the actor mapper, and the article/code resolver.
3. Move the `StockItem` + `StockMovement` tables (and data) — they FK only to themselves and to an opaque `partId`/`itemId`. `Part` stays in the host.
4. Enforce non-null `tenantKey` in `internal/repository.ts` and wire the adapter's tenant context.
5. Build the scanner client against `lookupByCode` + `recordMovement` — no core changes.
