import { addHours } from "date-fns";

import { db } from "@/lib/db";
import {
  inboundCommunicationCopy,
  type InboundCommChannel,
} from "@/lib/crm/inbound-communications";
import { formatDateTime } from "@/lib/utils";

export interface EnsureFollowUpTaskInput {
  customerUserId: string;
  customerName: string;
  dealId: string | null;
  channel: InboundCommChannel;
  /**
   * The message's own date. The SLA `dueAt` is deliberately computed from the
   * moment of ingestion (see below), so after a long downtime the task is
   * immediately overdue rather than dated weeks into the past — but the body
   * still shows when the mail actually arrived. Optional for older callers.
   */
  messageOccurredAt?: Date;
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
 *   - Otherwise leave it unassigned for the shared customer-replies queue.
 */
async function pickTaskOwner(dealId: string | null): Promise<string | null> {
  if (dealId) {
    const deal = (await db.deal.findUnique({
      where: { id: dealId },
      select: { ownerUserId: true },
    })) as { ownerUserId: string | null } | null;
    if (deal?.ownerUserId) return deal.ownerUserId;
  }
  return null;
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
  // dueAt runs from ingestion, NOT from the message date: a backlog imported
  // after downtime should surface as "act now", not carry a due date already
  // weeks past. The factual message date lives in the body instead.
  const dueAt = addHours(new Date(), FOLLOW_UP_SLA_HOURS);
  const messageWhen = formatDateTime(input.messageOccurredAt ?? new Date());
  const channelCopy = inboundCommunicationCopy(input.channel);

  try {
    const created = (await db.crmTask.create({
      data: {
        title: `Ответить клиенту: ${input.customerName}`,
        body: `${channelCopy.taskLead} (${channelCopy.eventNoun} от ${messageWhen}). Откройте запись в истории общения и ответьте клиенту.`,
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
  })) as { id: string; body: string | null; ownerUserId: string | null } | null;
  if (!existing) {
    throw new Error(
      "ensureFollowUpTask: P2002 raised but no matching OPEN FOLLOW_UP row found — index/query mismatch",
    );
  }

  const appendedBody = `${existing.body ?? ""}\n+ ещё 1 ${channelCopy.eventNoun} (от ${messageWhen})`
    .slice(-BODY_MAX_CHARS);

  // Ingestion may fill an empty assignment when the deal has since gained an
  // owner. It must never clear or replace a non-null task owner: that value may
  // be a manager's explicit claim and only a human action may remove it.
  const data: Record<string, unknown> = { dueAt, body: appendedBody };
  if (existing.ownerUserId === null && ownerUserId !== null) {
    data.ownerUserId = ownerUserId;
  }

  await db.crmTask.update({ where: { id: existing.id }, data });

  return { taskId: existing.id, created: false };
}
