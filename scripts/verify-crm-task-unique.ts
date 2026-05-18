/**
 * Verifies the partial unique index `CrmTask_open_followup_unique` rejects
 * duplicate OPEN FOLLOW_UP tasks per (customerUserId, dealId) — including
 * the dealId=null COALESCE case. Run as part of /spec Task 1 DoD.
 */
import "dotenv/config";
import { db } from "../lib/db";
import { addHours } from "date-fns";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

interface Admin {
  id: string;
}

async function main(): Promise<void> {
  console.log("[verify-crm-task-unique] starting");

  const admin = (await db.user.findFirst({
    where: { email: "admin@geleoteka.ru" },
    select: { id: true },
  })) as Admin | null;
  assert(admin, "seed admin@geleoteka.ru not found");
  const customer = (await db.user.findFirst({
    where: { email: "client@test.ru" },
    select: { id: true },
  })) as { id: string } | null;
  assert(customer, "seed client@test.ru not found");
  const adminId = admin.id;
  const customerId = customer.id;

  // Cleanup from previous runs.
  await db.crmTask.deleteMany({
    where: { ownerUserId: adminId, customerUserId: customerId, title: { startsWith: "verify-unique-" } },
  });

  const dueAt = addHours(new Date(), 4);

  // Case 1: two OPEN FOLLOW_UP with same (customerUserId, dealId=null) → second must fail P2002.
  await db.crmTask.create({
    data: {
      title: "verify-unique-A",
      kind: "FOLLOW_UP",
      status: "OPEN",
      dueAt,
      ownerUserId: adminId,
      customerUserId: customerId,
      dealId: null,
    },
  });
  console.log("  ✓ first OPEN FOLLOW_UP (dealId=null) created");

  let raisedP2002 = false;
  try {
    await db.crmTask.create({
      data: {
        title: "verify-unique-B",
        kind: "FOLLOW_UP",
        status: "OPEN",
        dueAt,
        ownerUserId: adminId,
        customerUserId: customerId,
        dealId: null,
      },
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    raisedP2002 = code === "P2002";
  }
  assert(raisedP2002, "second OPEN FOLLOW_UP with dealId=null must raise P2002 (COALESCE not working)");
  console.log("  ✓ second OPEN FOLLOW_UP (dealId=null) rejected with P2002 — COALESCE works");

  // Case 2: closed task does NOT block a new OPEN one for same pair.
  const firstTask = await db.crmTask.findFirst({
    where: { ownerUserId: adminId, customerUserId: customerId, title: "verify-unique-A" },
    select: { id: true },
  });
  if (firstTask) {
    await db.crmTask.update({ where: { id: firstTask.id }, data: { status: "DONE", completedAt: new Date() } });
  }
  await db.crmTask.create({
    data: {
      title: "verify-unique-C-after-close",
      kind: "FOLLOW_UP",
      status: "OPEN",
      dueAt,
      ownerUserId: adminId,
      customerUserId: customerId,
      dealId: null,
    },
  });
  console.log("  ✓ new OPEN allowed after prior was closed (partial index works)");

  // Case 3: different kind (GENERIC) on same pair allowed.
  await db.crmTask.create({
    data: {
      title: "verify-unique-D-generic",
      kind: "GENERIC",
      status: "OPEN",
      dueAt,
      ownerUserId: adminId,
      customerUserId: customerId,
      dealId: null,
    },
  });
  console.log("  ✓ GENERIC OPEN task allowed on same pair — index does not affect non-FOLLOW_UP");

  // Cleanup.
  await db.crmTask.deleteMany({
    where: { ownerUserId: adminId, customerUserId: customerId, title: { startsWith: "verify-unique-" } },
  });

  console.log("[verify-crm-task-unique] PASS");
}

main()
  .catch((err) => {
    console.error("[verify-crm-task-unique] ERROR", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
