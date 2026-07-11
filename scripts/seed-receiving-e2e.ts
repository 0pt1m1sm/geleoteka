/**
 * Seeds fixtures for the receiving-semantics E2E (plan 2026-07-11, TS-001/002/003).
 * Creates a supplier + part + two supplier orders (ORDERED qty=3, DRAFT qty=2)
 * under E2E-RCV markers. Idempotent-ish: wipes prior E2E-RCV fixtures first.
 * Leaves data in place for the browser run; clean up with `--clean`.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import { TENANT_KEY, defaultWarehouseId } from "../lib/wms-host";

const MARK = "E2E-RCV";
const WORKER_EMAIL = "e2e-rcv-worker@test.local";
const WORKER_PASSWORD = "worker123";

async function clean(): Promise<void> {
  const parts = (await db.part.findMany({
    where: { article: { startsWith: MARK } },
    select: { id: true },
  })) as Array<{ id: string }>;
  const partIds = parts.map((p) => p.id);
  await db.supplierOrder.deleteMany({ where: { orderNumber: { startsWith: MARK } } });
  if (partIds.length) {
    await db.stockBinMovement.deleteMany({ where: { item: { partId: { in: partIds } } } });
    await db.stockBin.deleteMany({ where: { item: { partId: { in: partIds } } } });
    await db.stockMovement.deleteMany({ where: { item: { partId: { in: partIds } } } });
    await db.stockItem.deleteMany({ where: { partId: { in: partIds } } });
    await db.part.deleteMany({ where: { id: { in: partIds } } });
  }
  await db.user.deleteMany({ where: { email: { in: ["e2e-rcv-supplier@test.local", WORKER_EMAIL] } } });
  console.log(`[seed-receiving-e2e] cleaned ${partIds.length} parts + orders + supplier + worker`);
}

async function main(): Promise<void> {
  if (process.argv.includes("--clean")) {
    await clean();
    return;
  }
  await clean();

  const supplier = (await db.user.create({
    data: {
      email: "e2e-rcv-supplier@test.local",
      phone: "+79990000042",
      name: "E2E Поставщик",
      passwordHash: "x",
      permissionRole: "NONE",
      isSupplier: true,
    },
    select: { id: true },
  })) as { id: string };

  await db.user.create({
    data: {
      email: WORKER_EMAIL,
      phone: "+79990000043",
      name: "E2E Кладовщик",
      passwordHash: bcrypt.hashSync(WORKER_PASSWORD, 10),
      permissionRole: "WAREHOUSE_WORKER",
    },
  });

  const part = (await db.part.create({
    data: {
      slug: "e2e-rcv-part",
      article: `${MARK}-001`,
      name: "E2E тестовая деталь",
      price: 1000,
      isActive: true,
    },
    select: { id: true },
  })) as { id: string };
  await db.stockItem.create({
    data: { partId: part.id, tenantKey: TENANT_KEY, warehouseId: await defaultWarehouseId(db) },
  });

  const ordered = (await db.supplierOrder.create({
    data: {
      userId: supplier.id,
      orderNumber: `${MARK}-ORDERED`,
      orderDate: new Date(),
      status: "ORDERED",
      itemsCost: 3000,
      totalCost: 3000,
      items: {
        create: [{ type: "PART", partId: part.id, description: "E2E тестовая деталь", quantity: 3, unitCost: 1000, totalCost: 3000 }],
      },
    },
    select: { id: true },
  })) as { id: string };

  const draft = (await db.supplierOrder.create({
    data: {
      userId: supplier.id,
      orderNumber: `${MARK}-DRAFT`,
      orderDate: new Date(),
      status: "DRAFT",
      itemsCost: 2000,
      totalCost: 2000,
      items: {
        create: [{ type: "PART", partId: part.id, description: "E2E тестовая деталь", quantity: 2, unitCost: 1000, totalCost: 2000 }],
      },
    },
    select: { id: true },
  })) as { id: string };

  console.log(`[seed-receiving-e2e] partId=${part.id}`);
  console.log(`ORDERED: https://localhost/admin/suppliers/orders/${ordered.id}`);
  console.log(`DRAFT:   https://localhost/admin/suppliers/orders/${draft.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
