/**
 * In-memory fake of the Prisma delegates the WMS core + receiving host code
 * touch, faithful to the invariants under test:
 *
 *  - StockMovement uniques throw P2002 exactly like Postgres:
 *    (tenantKey, sourceType, sourceId, reason, warehouseId) — NULL sourceId is
 *    distinct (never collides), and (tenantKey, idempotencyKey).
 *  - StockBinMovement unique (tenantKey, idempotencyKey).
 *  - supplierOrderItem.updateMany is a REAL conditional CAS: the receivedQuantity
 *    filter must match or count is 0 — an always-matching fake would false-green
 *    the whole suite.
 *
 * Any query shape the production code does not use throws loudly instead of
 * returning something plausible — a fake that guesses is worse than none.
 */

export interface FakeStockItem {
  id: string;
  partId: string;
  warehouseId: string;
  tenantKey: string;
  quantity: number;
  reserved: number;
  barcode: string | null;
  gtin: string | null;
}

export interface FakeMovement {
  id: string;
  itemId: string;
  reason: string;
  quantityDelta: number;
  reservedDelta: number;
  sourceType: string;
  sourceId: string | null;
  actorUserId: string | null;
  note: string | null;
  idempotencyKey: string | null;
  warehouseId: string;
  tenantKey: string;
}

export interface FakeBin {
  itemId: string; // StockItem.id
  warehouseId: string;
  location: string;
  quantity: number;
  tenantKey: string;
  createdAt: number;
}

export interface FakeBinMovement {
  itemId: string;
  reason: string;
  fromLocation: string | null;
  toLocation: string | null;
  quantity: number;
  actorUserId: string | null;
  note: string | null;
  idempotencyKey: string | null;
  tenantKey: string;
}

export interface FakeLocation {
  code: string;
  warehouseId: string;
  tenantKey: string;
  zone: string | null;
  isActive: boolean;
  isBlocked: boolean;
}

export interface FakePart {
  id: string;
  name: string;
  article: string;
}

export interface FakeSupplierOrder {
  id: string;
  status: string;
  receivedAt: Date | null;
}

export interface FakeSupplierOrderItem {
  id: string;
  orderId: string;
  partId: string | null;
  type: string;
  quantity: number;
  receivedQuantity: number;
}

function p2002(): Error {
  const e = new Error("Unique constraint failed (fake P2002)");
  (e as unknown as { code: string }).code = "P2002";
  return e;
}

function unsupported(delegate: string, method: string, args: unknown): never {
  throw new Error(
    `fake-db: unsupported ${delegate}.${method} query shape: ${JSON.stringify(args)}`,
  );
}

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq}`;
}

export class FakeDb {
  stockItems: FakeStockItem[] = [];
  movements: FakeMovement[] = [];
  bins: FakeBin[] = [];
  binMovements: FakeBinMovement[] = [];
  locations: FakeLocation[] = [];
  supplierOrders: FakeSupplierOrder[] = [];
  supplierOrderItems: FakeSupplierOrderItem[] = [];
  parts: FakePart[] = [];

  /** Test hook: the next stockMovement.create throws P2002 (forced source-triple
   *  collision) — lets atomicity tests simulate `recordMovement` no-op/abort paths
   *  that event-unique source ids make impossible to trigger naturally. */
  failNextMovementInsertWithP2002 = false;

  /**
   * Postgres-transaction emulation: snapshot all stores, run `fn` against a tx
   * view (same FakeDb, but WITHOUT $transaction so WMS self-wrap composes), and
   * restore the snapshot when `fn` throws. Rollback swaps the store arrays —
   * assertions after a rollback must re-read via db helpers, not held row refs.
   */
  async $transaction<T>(fn: (tx: FakeDb) => Promise<T>): Promise<T> {
    const snapshot = {
      stockItems: structuredClone(this.stockItems),
      movements: structuredClone(this.movements),
      bins: structuredClone(this.bins),
      binMovements: structuredClone(this.binMovements),
      locations: structuredClone(this.locations),
      supplierOrders: structuredClone(this.supplierOrders),
      supplierOrderItems: structuredClone(this.supplierOrderItems),
      parts: structuredClone(this.parts),
    };
    try {
      return await fn(this.txView());
    } catch (e) {
      this.stockItems = snapshot.stockItems;
      this.movements = snapshot.movements;
      this.bins = snapshot.bins;
      this.binMovements = snapshot.binMovements;
      this.locations = snapshot.locations;
      this.supplierOrders = snapshot.supplierOrders;
      this.supplierOrderItems = snapshot.supplierOrderItems;
      this.parts = snapshot.parts;
      throw e;
    }
  }

  /** The delegate surface without $transaction (what production code sees inside a tx). */
  txView(): FakeDb {
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (prop === "$transaction") return undefined;
        return Reflect.get(target, prop, receiver);
      },
    }) as FakeDb;
  }

  // ── seeding helpers ────────────────────────────────────────────────────────

  seedStockItem(partial: Partial<FakeStockItem> & { partId: string; warehouseId: string; tenantKey: string }): FakeStockItem {
    const row: FakeStockItem = {
      id: partial.id ?? nextId("si"),
      quantity: 0,
      reserved: 0,
      barcode: null,
      gtin: null,
      ...partial,
    };
    this.stockItems.push(row);
    return row;
  }

  seedOrder(partial: Partial<FakeSupplierOrder> & { status: string }): FakeSupplierOrder {
    const row: FakeSupplierOrder = { id: partial.id ?? nextId("so"), receivedAt: null, ...partial };
    this.supplierOrders.push(row);
    return row;
  }

  seedLine(
    partial: Partial<FakeSupplierOrderItem> & { orderId: string; quantity: number },
  ): FakeSupplierOrderItem {
    const row: FakeSupplierOrderItem = {
      id: partial.id ?? nextId("sol"),
      partId: null,
      type: "PART",
      receivedQuantity: 0,
      ...partial,
    };
    this.supplierOrderItems.push(row);
    return row;
  }

  seedLocation(
    partial: Partial<FakeLocation> & { code: string; warehouseId: string; tenantKey: string },
  ): FakeLocation {
    const row: FakeLocation = { zone: null, isActive: true, isBlocked: false, ...partial };
    this.locations.push(row);
    return row;
  }

  seedPart(partial: FakePart): FakePart {
    this.parts.push(partial);
    return partial;
  }

  binQty(stockItemId: string, location: string): number {
    return this.bins.find((b) => b.itemId === stockItemId && b.location === location)?.quantity ?? 0;
  }

  movementsFor(stockItemId: string, reason?: string): FakeMovement[] {
    return this.movements.filter((m) => m.itemId === stockItemId && (!reason || m.reason === reason));
  }

  // ── Prisma-delegate surface (only the shapes production code uses) ────────

  get stockItem() {
    return {
      findUnique: async (args: {
        where: { partId_warehouseId?: { partId: string; warehouseId: string }; id?: string };
        select?: unknown;
      }) => {
        const w = args.where;
        let row: FakeStockItem | undefined;
        if (w.partId_warehouseId) {
          row = this.stockItems.find(
            (s) => s.partId === w.partId_warehouseId!.partId && s.warehouseId === w.partId_warehouseId!.warehouseId,
          );
        } else if (w.id) {
          row = this.stockItems.find((s) => s.id === w.id);
        } else {
          unsupported("stockItem", "findUnique", args);
        }
        return row ? { ...row } : null;
      },
      create: async (args: { data: { partId: string; tenantKey: string; warehouseId: string } }) => {
        const row = this.seedStockItem({ ...args.data });
        return { ...row };
      },
      update: async (args: {
        where: { id: string };
        data: { quantity?: { increment: number }; reserved?: { increment: number } };
        select?: unknown;
      }) => {
        const row = this.stockItems.find((s) => s.id === args.where.id);
        if (!row) unsupported("stockItem", "update(missing row)", args);
        if (args.data.quantity?.increment !== undefined) row!.quantity += args.data.quantity.increment;
        if (args.data.reserved?.increment !== undefined) row!.reserved += args.data.reserved.increment;
        return { ...row! };
      },
      findFirst: async (args: unknown) => unsupported("stockItem", "findFirst", args),
    };
  }

  get stockMovement() {
    return {
      create: async (args: { data: Omit<FakeMovement, "id"> }) => {
        const d = args.data;
        if (this.failNextMovementInsertWithP2002) {
          this.failNextMovementInsertWithP2002 = false;
          throw p2002();
        }
        // Postgres NULLs are distinct: only non-null sourceId collides.
        if (
          d.sourceId !== null &&
          this.movements.some(
            (m) =>
              m.tenantKey === d.tenantKey &&
              m.sourceType === d.sourceType &&
              m.sourceId === d.sourceId &&
              m.reason === d.reason &&
              m.warehouseId === d.warehouseId,
          )
        ) {
          throw p2002();
        }
        if (
          d.idempotencyKey !== null &&
          this.movements.some((m) => m.tenantKey === d.tenantKey && m.idempotencyKey === d.idempotencyKey)
        ) {
          throw p2002();
        }
        const row: FakeMovement = { id: nextId("mv"), ...d };
        this.movements.push(row);
        return { ...row };
      },
      findUnique: async (args: {
        where: { tenantKey_idempotencyKey?: { tenantKey: string; idempotencyKey: string } };
        select?: unknown;
      }) => {
        const k = args.where.tenantKey_idempotencyKey;
        if (!k) unsupported("stockMovement", "findUnique", args);
        const row = this.movements.find(
          (m) => m.tenantKey === k!.tenantKey && m.idempotencyKey === k!.idempotencyKey,
        );
        return row ? { ...row } : null;
      },
      findFirst: async (args: {
        where: { tenantKey: string; sourceType: string; sourceId: string; reason: string; warehouseId: string };
        select?: unknown;
      }) => {
        const w = args.where;
        const row = this.movements.find(
          (m) =>
            m.tenantKey === w.tenantKey &&
            m.sourceType === w.sourceType &&
            m.sourceId === w.sourceId &&
            m.reason === w.reason &&
            m.warehouseId === w.warehouseId,
        );
        return row ? { id: row.id } : null;
      },
      findMany: async (args: {
        where: {
          tenantKey?: string;
          sourceType?: string;
          reason?: string;
          sourceId?: { startsWith: string };
        };
        select?: unknown;
      }) => {
        const w = args.where;
        return this.movements
          .filter(
            (m) =>
              (w.tenantKey === undefined || m.tenantKey === w.tenantKey) &&
              (w.sourceType === undefined || m.sourceType === w.sourceType) &&
              (w.reason === undefined || m.reason === w.reason) &&
              (w.sourceId === undefined || (m.sourceId ?? "").startsWith(w.sourceId.startsWith)),
          )
          .map((m) => ({ ...m }));
      },
    };
  }

  get part() {
    return {
      findMany: async (args: { where: { id?: { in: string[] } }; select?: unknown }) => {
        const ids = args.where.id?.in;
        if (!ids) unsupported("part", "findMany", args);
        return this.parts.filter((p) => ids!.includes(p.id)).map((p) => ({ ...p }));
      },
      findUnique: async (args: unknown) => unsupported("part", "findUnique", args),
    };
  }

  get stockBin() {
    return {
      aggregate: async (args: { where: { tenantKey: string; itemId: string }; _sum: { quantity: true } }) => {
        const sum = this.bins
          .filter((b) => b.tenantKey === args.where.tenantKey && b.itemId === args.where.itemId)
          .reduce((s, b) => s + b.quantity, 0);
        return { _sum: { quantity: sum } };
      },
      upsert: async (args: {
        where: { tenantKey_itemId_location: { tenantKey: string; itemId: string; location: string } };
        create: { itemId: string; location: string; quantity: number; tenantKey: string; warehouseId: string };
        update: { quantity: { increment: number } };
      }) => {
        const k = args.where.tenantKey_itemId_location;
        const row = this.bins.find(
          (b) => b.tenantKey === k.tenantKey && b.itemId === k.itemId && b.location === k.location,
        );
        if (row) {
          row.quantity += args.update.quantity.increment;
          return { ...row };
        }
        const created: FakeBin = { ...args.create, createdAt: seq };
        this.bins.push(created);
        return { ...created };
      },
      updateMany: async (args: {
        where: { tenantKey: string; itemId: string; location: string; quantity: { gte: number } };
        data: { quantity: { decrement: number } };
      }) => {
        const w = args.where;
        const row = this.bins.find(
          (b) =>
            b.tenantKey === w.tenantKey &&
            b.itemId === w.itemId &&
            b.location === w.location &&
            b.quantity >= w.quantity.gte,
        );
        if (!row) return { count: 0 };
        row.quantity -= args.data.quantity.decrement;
        return { count: 1 };
      },
      findMany: async (args: {
        where: { tenantKey: string; itemId?: string; quantity?: { gt: number }; warehouseId?: string; location?: string };
        select?: unknown;
        orderBy?: unknown;
      }) => {
        const w = args.where;
        return this.bins
          .filter(
            (b) =>
              b.tenantKey === w.tenantKey &&
              (w.itemId === undefined || b.itemId === w.itemId) &&
              (w.location === undefined || b.location === w.location) &&
              (w.warehouseId === undefined || b.warehouseId === w.warehouseId) &&
              (w.quantity === undefined || b.quantity > w.quantity.gt),
          )
          .map((b) => ({ location: b.location, quantity: b.quantity, item: { partId: this.stockItems.find((s) => s.id === b.itemId)?.partId ?? "?" } }));
      },
      groupBy: async (args: unknown) => unsupported("stockBin", "groupBy", args),
    };
  }

  get stockBinMovement() {
    return {
      create: async (args: { data: FakeBinMovement }) => {
        const d = args.data;
        if (
          d.idempotencyKey !== null &&
          this.binMovements.some((m) => m.tenantKey === d.tenantKey && m.idempotencyKey === d.idempotencyKey)
        ) {
          throw p2002();
        }
        this.binMovements.push({ ...d });
        return { ...d };
      },
      findUnique: async (args: {
        where: { tenantKey_idempotencyKey?: { tenantKey: string; idempotencyKey: string } };
        select?: unknown;
      }) => {
        const k = args.where.tenantKey_idempotencyKey;
        if (!k) unsupported("stockBinMovement", "findUnique", args);
        const row = this.binMovements.find(
          (m) => m.tenantKey === k!.tenantKey && m.idempotencyKey === k!.idempotencyKey,
        );
        return row ? { ...row } : null;
      },
    };
  }

  get stockLocation() {
    return {
      findUnique: async (args: {
        where: {
          tenantKey_warehouseId_code?: { tenantKey: string; warehouseId: string; code: string };
        };
        select?: unknown;
      }) => {
        const k = args.where.tenantKey_warehouseId_code;
        if (!k) unsupported("stockLocation", "findUnique", args);
        const row = this.locations.find(
          (l) => l.tenantKey === k!.tenantKey && l.warehouseId === k!.warehouseId && l.code === k!.code,
        );
        return row ? { ...row } : null;
      },
      upsert: async (args: {
        where: { tenantKey_warehouseId_code: { tenantKey: string; warehouseId: string; code: string } };
        create: { code: string; tenantKey: string; warehouseId: string; isActive: boolean; isBlocked: boolean };
        update: Record<string, unknown>;
        select?: unknown;
      }) => {
        const k = args.where.tenantKey_warehouseId_code;
        let row = this.locations.find(
          (l) => l.tenantKey === k.tenantKey && l.warehouseId === k.warehouseId && l.code === k.code,
        );
        if (!row) {
          row = this.seedLocation({ ...args.create });
        } else {
          Object.assign(row, args.update);
        }
        return { ...row };
      },
    };
  }

  get supplierOrder() {
    return {
      findUnique: async (args: { where: { id: string }; select?: unknown }) => {
        const row = this.supplierOrders.find((o) => o.id === args.where.id);
        return row ? { ...row } : null;
      },
      update: async (args: {
        where: { id: string };
        data: { status?: string; receivedAt?: Date | null };
      }) => {
        const row = this.supplierOrders.find((o) => o.id === args.where.id);
        if (!row) unsupported("supplierOrder", "update(missing row)", args);
        if (args.data.status !== undefined) row!.status = args.data.status;
        if ("receivedAt" in args.data) row!.receivedAt = args.data.receivedAt ?? null;
        return { ...row! };
      },
    };
  }

  get supplierOrderItem() {
    return {
      findUnique: async (args: { where: { id: string }; select?: unknown }) => {
        const row = this.supplierOrderItems.find((l) => l.id === args.where.id);
        return row ? { ...row } : null;
      },
      // Faithful conditional CAS: the receivedQuantity equality filter is the
      // invariant under test — count 0 when it does not match.
      updateMany: async (args: {
        where: { id: string; orderId?: string; receivedQuantity?: number };
        data: { receivedQuantity?: { increment?: number; decrement?: number } };
      }) => {
        const w = args.where;
        const row = this.supplierOrderItems.find(
          (l) =>
            l.id === w.id &&
            (w.orderId === undefined || l.orderId === w.orderId) &&
            (w.receivedQuantity === undefined || l.receivedQuantity === w.receivedQuantity),
        );
        if (!row) return { count: 0 };
        const d = args.data.receivedQuantity;
        if (d?.increment !== undefined) row.receivedQuantity += d.increment;
        if (d?.decrement !== undefined) row.receivedQuantity -= d.decrement;
        return { count: 1 };
      },
      findMany: async (args: {
        where: { orderId?: string; type?: string; partId?: string };
        select?: unknown;
        orderBy?: unknown;
      }) => {
        const w = args.where;
        return this.supplierOrderItems
          .filter(
            (l) =>
              (w.orderId === undefined || l.orderId === w.orderId) &&
              (w.type === undefined || l.type === w.type) &&
              (w.partId === undefined || l.partId === w.partId),
          )
          .map((l) => ({ ...l }));
      },
    };
  }
}

/** A fresh fake plus the ids the receiving tests keep reaching for. */
export function makeReceivingFixture(opts?: {
  orderStatus?: string;
  quantity?: number;
  received?: number;
}): {
  db: FakeDb;
  order: FakeSupplierOrder;
  line: FakeSupplierOrderItem;
  stockItem: FakeStockItem;
  warehouseId: string;
  tenantKey: string;
} {
  const db = new FakeDb();
  const tenantKey = "geleoteka"; // must match lib/wms-host TENANT_KEY
  const warehouseId = "wh_main";
  const stockItem = db.seedStockItem({ partId: "part_1", warehouseId, tenantKey });
  const order = db.seedOrder({ status: opts?.orderStatus ?? "ORDERED" });
  const line = db.seedLine({
    orderId: order.id,
    partId: "part_1",
    quantity: opts?.quantity ?? 5,
    receivedQuantity: opts?.received ?? 0,
  });
  return { db, order, line, stockItem, warehouseId, tenantKey };
}
