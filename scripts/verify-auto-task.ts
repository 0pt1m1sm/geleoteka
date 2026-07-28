/**
 * Verifies `lib/crm/auto-task.ts` against the dev DB. RED-first per /spec
 * TDD: pre-fix the import fails (helper doesn't exist). Post-fix all six
 * assertions pass.
 *
 * Cases covered:
 *   (a) creates when no existing OPEN FOLLOW_UP for (customer, deal)
 *   (b) hits P2002 and updates when an OPEN FOLLOW_UP exists (atomic dedup)
 *   (c) creates a new one when prior was DONE (partial index allows)
 *   (d) falls back to first ADMIN when `deal.ownerUserId=null`
 *   (e) falls back to first ADMIN when `dealId=null`
 *   (f) two no-deal calls for same customer dedupe to one task (COALESCE)
 */
import "dotenv/config";
import { db } from "../lib/db";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

async function cleanup(customerUserId: string): Promise<void> {
  // Removes the deal AND its tasks (deal owns auto-tasks via dealId).
  await db.crmTask.deleteMany({
    where: { customerUserId, kind: "FOLLOW_UP", title: { startsWith: "Ответить клиенту:" } },
  });
  await db.deal.deleteMany({
    where: { customerUserId, source: "verify-auto-task" },
  });
}

async function main(): Promise<void> {
  console.log("[verify-auto-task] starting");

  const { ensureFollowUpTask } = await import("../lib/crm/auto-task");

  const admin = (await db.user.findFirst({
    where: { email: "admin@geleoteka.ru" },
    select: { id: true },
  })) as { id: string } | null;
  assert(admin, "seed admin@geleoteka.ru missing");
  const customer = (await db.user.findFirst({
    where: { email: "client@test.ru" },
    select: { id: true, name: true },
  })) as { id: string; name: string } | null;
  assert(customer, "seed client@test.ru missing");

  await cleanup(customer.id);

  // (a) create when no existing
  const dealWithOwner = (await db.deal.create({
    data: {
      customerUserId: customer.id,
      channel: "SERVICE",
      source: "verify-auto-task",
      stage: "NEW",
      ownerUserId: admin.id,
    },
    select: { id: true },
  })) as { id: string };

  const r1 = await ensureFollowUpTask({
    customerUserId: customer.id,
    customerName: customer.name,
    dealId: dealWithOwner.id,
  });
  assert(r1.created === true, `(a) expected created=true, got ${r1.created}`);
  console.log("  ✓ (a) creates when no existing");

  // (b) hits P2002 and updates when OPEN exists
  const r2 = await ensureFollowUpTask({
    customerUserId: customer.id,
    customerName: customer.name,
    dealId: dealWithOwner.id,
  });
  assert(r2.created === false, `(b) expected created=false on dedup, got ${r2.created}`);
  assert(r2.taskId === r1.taskId, `(b) expected same task id, got ${r2.taskId} vs ${r1.taskId}`);
  const updated = (await db.crmTask.findUnique({
    where: { id: r1.taskId },
    select: { body: true },
  })) as { body: string | null } | null;
  assert(updated?.body?.includes("+ ещё 1 ответ"), `(b) expected body to include '+ ещё 1 ответ', got: ${updated?.body}`);
  console.log("  ✓ (b) dedupes via P2002 and appends to body");

  // (d) deal.ownerUserId=null → first ADMIN fallback
  const dealNoOwner = (await db.deal.create({
    data: {
      customerUserId: customer.id,
      channel: "SERVICE",
      source: "verify-auto-task",
      stage: "NEW",
      ownerUserId: null,
    },
    select: { id: true },
  })) as { id: string };
  const r4 = await ensureFollowUpTask({
    customerUserId: customer.id,
    customerName: customer.name,
    dealId: dealNoOwner.id,
  });
  const t4 = (await db.crmTask.findUnique({
    where: { id: r4.taskId },
    select: { ownerUserId: true },
  })) as { ownerUserId: string } | null;
  // First-admin fallback: deterministic min(createdAt) of permissionRole=ADMIN.
  const firstAdmin = (await db.user.findFirst({
    where: { permissionRole: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  })) as { id: string };
  assert(t4?.ownerUserId === firstAdmin.id, `(d) expected first-ADMIN ${firstAdmin.id}, got ${t4?.ownerUserId}`);
  console.log("  ✓ (d) falls back to first ADMIN when deal.ownerUserId=null");

  // (e) dealId=null → first ADMIN fallback
  const r5 = await ensureFollowUpTask({
    customerUserId: customer.id,
    customerName: customer.name,
    dealId: null,
  });
  const t5 = (await db.crmTask.findUnique({
    where: { id: r5.taskId },
    select: { ownerUserId: true, dealId: true },
  })) as { ownerUserId: string; dealId: string | null } | null;
  assert(t5?.dealId === null, `(e) expected dealId=null, got ${t5?.dealId}`);
  assert(t5?.ownerUserId === firstAdmin.id, `(e) expected first-ADMIN ${firstAdmin.id}, got ${t5?.ownerUserId}`);
  console.log("  ✓ (e) falls back to first ADMIN when dealId=null");

  // (f) second no-deal call dedupes via COALESCE
  const r6 = await ensureFollowUpTask({
    customerUserId: customer.id,
    customerName: customer.name,
    dealId: null,
  });
  assert(r6.created === false, `(f) expected dedup on second no-deal call, got created=${r6.created}`);
  assert(r6.taskId === r5.taskId, `(f) expected same task id from COALESCE dedup, got ${r6.taskId} vs ${r5.taskId}`);
  console.log("  ✓ (f) two no-deal calls dedupe (COALESCE works)");

  // (c) creates new one when prior was DONE
  await db.crmTask.update({
    where: { id: r1.taskId },
    data: { status: "DONE", completedAt: new Date() },
  });
  const r3 = await ensureFollowUpTask({
    customerUserId: customer.id,
    customerName: customer.name,
    dealId: dealWithOwner.id,
  });
  assert(r3.created === true, `(c) expected created=true after prior DONE, got ${r3.created}`);
  assert(r3.taskId !== r1.taskId, `(c) expected new task id after DONE, got same id ${r3.taskId}`);
  console.log("  ✓ (c) creates new task when prior was DONE");

  // (g) reassigns owner when deal ownership changes between dedup hits
  //     Setup: dealNoOwner (currently owned by fallback first ADMIN per case d).
  //     Action: a manager claims the deal — set deal.ownerUserId = customer.id
  //             (just any non-admin user; we don't need a real manager here).
  //     Second inbound call should reassign the dedup task's ownerUserId.
  const t4Before = (await db.crmTask.findUnique({
    where: { id: r4.taskId },
    select: { ownerUserId: true },
  })) as { ownerUserId: string };
  await db.deal.update({
    where: { id: dealNoOwner.id },
    data: { ownerUserId: admin.id }, // simulate manager claim (use admin id since it's a real User id)
  });
  // Wait — if admin.id === firstAdmin.id and existing.ownerUserId is already
  // firstAdmin.id, the reassignment branch wouldn't fire. Pick a DIFFERENT
  // user so the diff is detectable. Use the customer user as the "new manager"
  // (User.id is a valid FK target regardless of permissionRole for this test).
  await db.deal.update({
    where: { id: dealNoOwner.id },
    data: { ownerUserId: customer.id },
  });
  const r7 = await ensureFollowUpTask({
    customerUserId: customer.id,
    customerName: customer.name,
    dealId: dealNoOwner.id,
  });
  assert(r7.created === false, `(g) expected dedup, got created=${r7.created}`);
  assert(r7.taskId === r4.taskId, `(g) expected same task id, got ${r7.taskId} vs ${r4.taskId}`);
  const t4After = (await db.crmTask.findUnique({
    where: { id: r4.taskId },
    select: { ownerUserId: true },
  })) as { ownerUserId: string };
  assert(
    t4After.ownerUserId === customer.id,
    `(g) expected ownerUserId reassigned to new deal owner ${customer.id}, got ${t4After.ownerUserId} (was ${t4Before.ownerUserId})`,
  );
  console.log("  ✓ (g) reassigns owner when deal ownership changes between dedup hits");

  // (h) dueAt runs from the moment of INGESTION, not the message date. A reply
  //     that physically arrived months ago (imported after a long downtime)
  //     must produce a task due ~now+4h — immediately actionable — while the
  //     body still shows the factual message date so the manager has context.
  const dealForDue = (await db.deal.create({
    data: {
      customerUserId: customer.id,
      channel: "SERVICE",
      source: "verify-auto-task",
      stage: "NEW",
      ownerUserId: admin.id,
    },
    select: { id: true },
  })) as { id: string };
  const messageDate = new Date("2026-01-15T10:00:00.000Z"); // months before "now"
  const expectedDueMs = Date.now() + 4 * 60 * 60 * 1000;
  const rh = await ensureFollowUpTask({
    customerUserId: customer.id,
    customerName: customer.name,
    dealId: dealForDue.id,
    messageOccurredAt: messageDate,
  });
  assert(rh.created === true, `(h) expected a fresh task, got created=${rh.created}`);
  const th = (await db.crmTask.findUnique({
    where: { id: rh.taskId },
    select: { dueAt: true, body: true },
  })) as { dueAt: Date; body: string | null } | null;
  assert(th, "(h) task not found");
  assert(
    Math.abs(th.dueAt.getTime() - expectedDueMs) < 60_000,
    `(h) dueAt must be ~now+4h (from ingestion), got ${th.dueAt.toISOString()}`,
  );
  assert(
    th.dueAt.getTime() - messageDate.getTime() > 30 * 24 * 60 * 60 * 1000,
    "(h) dueAt must NOT be anchored to the (months-old) message date",
  );
  const whenStr = messageDate.toLocaleString("ru-RU");
  assert(
    th.body?.includes(`письмо от ${whenStr}`),
    `(h) body must show the factual message date '${whenStr}', got: ${th.body}`,
  );
  console.log("  ✓ (h) dueAt from ingestion moment; factual message date in body");

  await cleanup(customer.id);

  console.log("[verify-auto-task] PASS");
}

main()
  .catch((err) => {
    console.error("[verify-auto-task] ERROR", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
