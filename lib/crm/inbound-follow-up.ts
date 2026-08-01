import { addHours } from "date-fns";

import {
  inboundCommunicationCopy,
  type InboundCommChannel,
} from "@/lib/crm/inbound-communications";
import { formatDateTime } from "@/lib/utils";

type QueryArgs = Record<string, unknown>;

export interface InboundFollowUpTx {
  crmTask: {
    createMany(args: QueryArgs): Promise<{ count: number }>;
    findFirst(args: QueryArgs): Promise<unknown>;
    findUnique(args: QueryArgs): Promise<unknown>;
    updateMany(args: QueryArgs): Promise<{ count: number }>;
  };
  communicationLog: {
    findUnique(args: QueryArgs): Promise<unknown>;
  };
}

export interface UpsertInboundFollowUpInput {
  communicationLogId: string;
  communicationCreatedAt: Date;
  customerUserId: string;
  customerName: string;
  dealId: string | null;
  ownerUserId: string | null;
  channel: InboundCommChannel;
  messageOccurredAt: Date;
  eventCreatedAt: Date;
}

export interface UpsertInboundFollowUpResult {
  taskId: string;
  ownerUserId: string | null;
  created: boolean;
}

const FOLLOW_UP_SLA_HOURS = 4;
const BODY_MAX_CHARS = 4000;

/**
 * Create or advance the single OPEN FOLLOW_UP for an exact customer/deal pair.
 * The caller serializes projectors for that pair with a transaction-scoped
 * advisory lock. createMany(skipDuplicates) cooperates with the existing
 * partial unique index without aborting the surrounding transaction.
 */
export async function upsertInboundFollowUpTask(
  client: InboundFollowUpTx,
  input: UpsertInboundFollowUpInput,
): Promise<UpsertInboundFollowUpResult> {
  return upsertAttempt(client, input, 0);
}

async function upsertAttempt(
  client: InboundFollowUpTx,
  input: UpsertInboundFollowUpInput,
  attempt: number,
): Promise<UpsertInboundFollowUpResult> {
  const copy = inboundCommunicationCopy(input.channel);
  const messageWhen = formatDateTime(input.messageOccurredAt);
  const dueAt = addHours(input.eventCreatedAt, FOLLOW_UP_SLA_HOURS);
  const initialBody = `${copy.taskLead} (${copy.eventNoun} от ${messageWhen}). ${copy.openAction}, затем ответьте клиенту.`;

  const inserted = await client.crmTask.createMany({
    data: [
      {
        title: `Ответить клиенту: ${input.customerName}`,
        body: initialBody,
        kind: "FOLLOW_UP",
        status: "OPEN",
        dueAt,
        customerUserId: input.customerUserId,
        dealId: input.dealId,
        ownerUserId: input.ownerUserId,
        lastInboundCommLogId: input.communicationLogId,
      },
    ],
    skipDuplicates: true,
  });

  const task = (await client.crmTask.findFirst({
    where: {
      customerUserId: input.customerUserId,
      dealId: input.dealId,
      kind: "FOLLOW_UP",
      status: "OPEN",
    },
    select: {
      id: true,
      body: true,
      ownerUserId: true,
      lastInboundCommLogId: true,
    },
  })) as {
    id: string;
    body: string | null;
    ownerUserId: string | null;
    lastInboundCommLogId: string | null;
  } | null;

  if (!task) {
    if (attempt < 1) return upsertAttempt(client, input, attempt + 1);
    throw new Error("Inbound FOLLOW_UP disappeared while it was being projected");
  }

  if (inserted.count === 0 && task.lastInboundCommLogId !== input.communicationLogId) {
    const currentSource = task.lastInboundCommLogId
      ? ((await client.communicationLog.findUnique({
          where: { id: task.lastInboundCommLogId },
          select: { id: true, createdAt: true },
        })) as { id: string; createdAt: Date } | null)
      : null;
    const incomingIsNewest =
      currentSource === null ||
      compareCommunicationOrder(
        input.communicationCreatedAt,
        input.communicationLogId,
        currentSource.createdAt,
        currentSource.id,
      ) >= 0;
    const appendedBody = `${task.body ?? ""}\n+ ещё 1 ${copy.eventNoun} (от ${messageWhen})`.slice(
      -BODY_MAX_CHARS,
    );
    const data: Record<string, unknown> = { body: appendedBody };
    if (incomingIsNewest) {
      data.dueAt = dueAt;
      data.lastInboundCommLogId = input.communicationLogId;
    }

    const updated = await client.crmTask.updateMany({
      where: { id: task.id, status: "OPEN", kind: "FOLLOW_UP" },
      data,
    });
    if (updated.count !== 1) {
      if (attempt < 1) return upsertAttempt(client, input, attempt + 1);
      throw new Error("Inbound FOLLOW_UP changed while it was being projected");
    }
  }

  // Fill an empty assignment, but never overwrite a manager's explicit claim.
  if (task.ownerUserId === null && input.ownerUserId !== null) {
    await client.crmTask.updateMany({
      where: { id: task.id, status: "OPEN", ownerUserId: null },
      data: { ownerUserId: input.ownerUserId },
    });
  }

  const current = (await client.crmTask.findUnique({
    where: { id: task.id },
    select: { id: true, ownerUserId: true },
  })) as { id: string; ownerUserId: string | null } | null;
  if (!current) throw new Error("Projected inbound FOLLOW_UP no longer exists");

  return {
    taskId: current.id,
    ownerUserId: current.ownerUserId,
    created: inserted.count === 1,
  };
}

function compareCommunicationOrder(
  leftAt: Date,
  leftId: string,
  rightAt: Date,
  rightId: string,
): number {
  const time = leftAt.getTime() - rightAt.getTime();
  return time === 0 ? leftId.localeCompare(rightId) : time;
}
