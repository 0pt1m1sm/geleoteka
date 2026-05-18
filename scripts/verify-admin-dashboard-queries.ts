/**
 * Reproduces every query the /admin dashboard runs, in isolation, to surface
 * Prisma validation errors that the production Server-Components render
 * swallows. Used during /spec verify of the DealStage collapse to locate
 * residual references to removed enum values.
 */

import "dotenv/config";
import { db } from "../lib/db";
import { startOfDay, endOfDay, addDays } from "date-fns";

async function run(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message.split("\n").slice(0, 3).join(" | ") : String(err)}`);
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  console.log("[verify-admin-dashboard-queries] starting");

  const today = new Date();
  const dayStart = startOfDay(today);
  const dayEnd = endOfDay(today);
  const weekEnd = endOfDay(addDays(today, 7));
  const thirtyDaysAgo = addDays(today, -30);
  const OPEN_DEAL_STAGES = ["NEW", "IN_PROGRESS"] as const;

  await run("repairOrder.count today", () =>
    db.repairOrder.count({ where: { dateTime: { gte: dayStart, lte: dayEnd } } }),
  );
  await run("repairOrder.count active", () =>
    db.repairOrder.count({ where: { status: { in: ["SCHEDULED", "IN_PROGRESS"] } } }),
  );
  await run("repairOrder.findMany completedToday", () =>
    db.repairOrder.findMany({
      where: { status: "COMPLETED", completedAt: { gte: dayStart, lte: dayEnd } },
      select: { total: true },
    }),
  );
  await run("repairOrder.findMany upcoming", () =>
    db.repairOrder.findMany({
      where: {
        dateTime: { gte: dayStart, lte: weekEnd },
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
      include: {
        user: { select: { name: true, phone: true } },
        vehicle: { select: { model: true } },
        jobLines: { select: { description: true }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { dateTime: "asc" },
      take: 20,
    }),
  );
  await run("deal.count OPEN", () =>
    db.deal.count({ where: { stage: { in: OPEN_DEAL_STAGES as unknown as never[] } } }),
  );
  await run("deal.aggregate WON 30d", () =>
    db.deal.aggregate({
      where: { stage: "WON", closedAt: { gte: thirtyDaysAgo } },
      _sum: { total: true },
      _count: true,
    }),
  );
  await run("crmTask.count overdue", () =>
    db.crmTask.count({ where: { status: "OPEN", dueAt: { lt: dayStart } } }),
  );
  await run("crmTask.findMany recent", () =>
    db.crmTask.findMany({
      where: { status: "OPEN" },
      orderBy: { dueAt: "asc" },
      take: 5,
      select: {
        id: true, title: true, body: true, kind: true, status: true,
        dueAt: true, completedAt: true,
        owner: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        deal: { select: { id: true, number: true } },
      },
    }),
  );
  await run("deal.findMany OPEN", () =>
    db.deal.findMany({
      where: { stage: { in: OPEN_DEAL_STAGES as unknown as never[] } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true, number: true, total: true, stage: true, channel: true,
        updatedAt: true,
        customer: { select: { id: true, name: true } },
      },
    }),
  );

  console.log("[verify-admin-dashboard-queries] done");
}

main()
  .catch((err) => { console.error("[verify-admin-dashboard-queries] FATAL", err); process.exit(1); })
  .finally(async () => { await db.$disconnect(); });
