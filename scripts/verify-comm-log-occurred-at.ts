/**
 * Verifies the occurred-at editable-date pipeline for CommunicationLog.
 * Pure-helper cases run in-process; DB-side cases hit Prisma directly
 * (the server actions are skipped because requireRole needs a Next.js
 * request context).
 *
 * Cases covered:
 *   (a) parseOccurredAt: empty string → value undefined (default-now)
 *   (b) parseOccurredAt: past timestamp → value matches
 *   (c) parseOccurredAt: future timestamp → clamped to `now`
 *   (d) parseOccurredAt: garbage → error
 *   (e) Prisma: createdAt override on create is persisted
 *   (f) Prisma: createdAt update is persisted
 */
import "dotenv/config";
import { db } from "../lib/db";
import { parseOccurredAt } from "../lib/crm/occurred-at";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

function isoLocal(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

async function main(): Promise<void> {
  console.log("[verify-comm-log-occurred-at] starting");

  const now = new Date("2026-05-19T12:00:00Z");

  // (a) empty → undefined
  const empty = parseOccurredAt("", now);
  assert(empty.ok && empty.value === undefined, "(a) empty should be ok, value undefined");
  console.log("  (a) empty → undefined ok");

  // (b) past timestamp preserved
  const past = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const pastResult = parseOccurredAt(isoLocal(past), now);
  assert(pastResult.ok, "(b) past should be ok");
  assert(pastResult.ok && pastResult.value, "(b) past value missing");
  const drift = Math.abs((pastResult.ok && pastResult.value ? pastResult.value.getTime() : 0) - past.getTime());
  assert(drift < 60_000, `(b) past drift ${drift}ms > 60s`);
  console.log("  (b) past preserved ok");

  // (c) future clamped
  const future = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const futResult = parseOccurredAt(isoLocal(future), now);
  assert(futResult.ok && futResult.value, "(c) future should be ok with value");
  assert(
    futResult.ok && futResult.value && futResult.value.getTime() <= now.getTime(),
    `(c) future not clamped: ${futResult.ok && futResult.value ? futResult.value.toISOString() : "none"}`,
  );
  console.log("  (c) future clamped ok");

  // (d) garbage rejected
  const garbage = parseOccurredAt("not-a-date", now);
  assert(!garbage.ok, "(d) expected error for garbage");
  console.log("  (d) garbage rejected ok");

  // (e) Prisma createdAt override on create
  const customer = (await db.user.findFirst({
    where: { email: "client@test.ru" },
    select: { id: true },
  })) as { id: string } | null;
  assert(customer, "seed client@test.ru missing");

  await db.communicationLog.deleteMany({
    where: { customerUserId: customer.id, body: { startsWith: "[verify-occurred-at]" } },
  });

  const explicitCreatedAt = new Date("2026-05-15T09:30:00Z");
  const created = (await db.communicationLog.create({
    data: {
      customerUserId: customer.id,
      authorUserId: null,
      channel: "PHONE_INBOUND",
      outcome: "ANSWERED",
      body: "[verify-occurred-at] case-e create with explicit createdAt",
      createdAt: explicitCreatedAt,
    },
    select: { id: true, createdAt: true },
  })) as { id: string; createdAt: Date };
  assert(
    created.createdAt.getTime() === explicitCreatedAt.getTime(),
    `(e) createdAt not persisted: got ${created.createdAt.toISOString()}, want ${explicitCreatedAt.toISOString()}`,
  );
  console.log("  (e) explicit createdAt persisted ok");

  // (f) Prisma update changes createdAt
  const newDate = new Date("2026-05-01T08:00:00Z");
  await db.communicationLog.update({
    where: { id: created.id },
    data: { createdAt: newDate },
  });
  const after = (await db.communicationLog.findUnique({
    where: { id: created.id },
    select: { createdAt: true },
  })) as { createdAt: Date };
  assert(
    after.createdAt.getTime() === newDate.getTime(),
    `(f) update failed: got ${after.createdAt.toISOString()}, want ${newDate.toISOString()}`,
  );
  console.log("  (f) update createdAt ok");

  // Cleanup.
  await db.communicationLog.deleteMany({
    where: { customerUserId: customer.id, body: { startsWith: "[verify-occurred-at]" } },
  });
  console.log("[verify-comm-log-occurred-at] PASS");
}

main().catch((err) => {
  console.error("[verify-comm-log-occurred-at] error", err);
  process.exit(1);
});
