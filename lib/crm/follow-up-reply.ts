type QueryArgs = Record<string, unknown>;

export interface FollowUpReplyTx {
  crmTask: {
    updateMany(args: QueryArgs): Promise<{ count: number }>;
  };
}

export interface CompleteFollowUpAfterReplyInput {
  customerUserId: string;
  inboundCommunicationLogId: string;
  completedAt?: Date;
}

/**
 * Close only the obligation still anchored to the message being answered.
 * If another inbound communication advanced the task while the reply was in
 * flight, the compare-and-set matches zero rows and the task stays OPEN.
 */
export async function completeFollowUpAfterReply(
  client: FollowUpReplyTx,
  input: CompleteFollowUpAfterReplyInput,
): Promise<boolean> {
  const result = await client.crmTask.updateMany({
    where: {
      customerUserId: input.customerUserId,
      kind: "FOLLOW_UP",
      status: "OPEN",
      lastInboundCommLogId: input.inboundCommunicationLogId,
    },
    data: {
      status: "DONE",
      completedAt: input.completedAt ?? new Date(),
    },
  });
  return result.count === 1;
}
