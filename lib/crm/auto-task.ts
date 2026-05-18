import { addHours } from "date-fns";

import { db } from "@/lib/db";

export interface EnsureFollowUpTaskInput {
  customerUserId: string;
  customerName: string;
  dealId: string | null;
}

export interface EnsureFollowUpTaskResult {
  taskId: string;
  created: boolean;
}

const FOLLOW_UP_SLA_HOURS = 4;
const BODY_MAX_CHARS = 4000;

/**
 * Pick the owner for an auto-generated follow-up task:
 *   - If `dealId` is set and the deal has an owner → use it.
 *   - Otherwise fall back to the first ADMIN by createdAt (deterministic).
 *
 * Throws when there is no ADMIN at all — that is a deployment misconfiguration,
 * not a runtime case to silently swallow.
 */
async function pickTaskOwner(dealId: string | null): Promise<string> {
  if (dealId) {
    const deal = (await db.deal.findUnique({
      where: { id: dealId },
      select: { ownerUserId: true },
    })) as { ownerUserId: string | null } | null;
    if (deal?.ownerUserId) return deal.ownerUserId;
  }
  const admin = (await db.user.findFirst({
    where: { permissionRole: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  })) as { id: string } | null;
  if (!admin) {
    throw new Error("ensureFollowUpTask: no ADMIN user available for fallback owner");
  }
  return admin.id;
}

/**
 * Idempotent upsert of a single OPEN FOLLOW_UP CrmTask per
 * `(customerUserId, dealId)`. Concurrency-safe via the partial unique index
 * `CrmTask_open_followup_unique` (see migration
 * 20260518231504_inbound_reply_task_and_badge) — two simultaneous calls
 * cannot both create a task; the loser falls back to the update branch.
 *
 * Called from `lib/email/resolve.ts` after a known-customer inbound reply
 * is persisted, wrapped in try/catch so a task-side failure never breaks
 * inbound delivery.
 */
export async function ensureFollowUpTask(
  input: EnsureFollowUpTaskInput,
): Promise<EnsureFollowUpTaskResult> {
  const ownerUserId = await pickTaskOwner(input.dealId);
  const dueAt = addHours(new Date(), FOLLOW_UP_SLA_HOURS);

  try {
    const created = (await db.crmTask.create({
      data: {
        title: `Ответить клиенту: ${input.customerName}`,
        body: "Клиент ответил по email. Откройте сделку и ответьте.",
        kind: "FOLLOW_UP",
        status: "OPEN",
        dueAt,
        customerUserId: input.customerUserId,
        dealId: input.dealId,
        ownerUserId,
      },
      select: { id: true },
    })) as { id: string };
    return { taskId: created.id, created: true };
  } catch (err) {
    if ((err as { code?: string }).code !== "P2002") throw err;
    // Fall through to the recovery branch below. P2002 means an OPEN FOLLOW_UP
    // already exists for this (customerUserId, dealId) per the partial unique
    // index `CrmTask_open_followup_unique`.
  }

  // The dedup query MUST include customerUserId; without it, a no-deal
  // task from a different customer could match.
  const existing = (await db.crmTask.findFirst({
    where: {
      customerUserId: input.customerUserId,
      dealId: input.dealId,
      kind: "FOLLOW_UP",
      status: "OPEN",
    },
    select: { id: true, body: true, ownerUserId: true },
  })) as { id: string; body: string | null; ownerUserId: string } | null;
  if (!existing) {
    throw new Error(
      "ensureFollowUpTask: P2002 raised but no matching OPEN FOLLOW_UP row found — index/query mismatch",
    );
  }

  const appendedBody = `${existing.body ?? ""}\n+ ещё 1 ответ ${new Date().toLocaleString("ru-RU")}`
    .slice(-BODY_MAX_CHARS);

  // Reassign owner when it changed (e.g. a manager claimed an unowned deal
  // between the first and second inbound reply — the stale fallback-ADMIN
  // owner would otherwise miss the follow-up).
  const data: Record<string, unknown> = { dueAt, body: appendedBody };
  if (existing.ownerUserId !== ownerUserId) data.ownerUserId = ownerUserId;

  await db.crmTask.update({ where: { id: existing.id }, data });

  return { taskId: existing.id, created: false };
}
