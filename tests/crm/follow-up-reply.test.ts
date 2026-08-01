import { describe, expect, it } from "vitest";

import { completeFollowUpAfterReply } from "@/lib/crm/follow-up-reply";

interface TaskRow {
  id: string;
  customerUserId: string;
  dealId: string | null;
  kind: string;
  status: string;
  lastInboundCommLogId: string | null;
  completedAt: Date | null;
}

function fakeClient(task: TaskRow) {
  return {
    crmTask: {
      async updateMany(rawArgs: Record<string, unknown>) {
        const args = rawArgs as {
          where: Partial<TaskRow>;
          data: Partial<TaskRow>;
        };
        const matches = Object.entries(args.where).every(
          ([key, value]) => task[key as keyof TaskRow] === value,
        );
        if (!matches) return { count: 0 };
        Object.assign(task, args.data);
        return { count: 1 };
      },
    },
  };
}

function openTask(): TaskRow {
  return {
    id: "task-1",
    customerUserId: "customer-1",
    dealId: "deal-1",
    kind: "FOLLOW_UP",
    status: "OPEN",
    lastInboundCommLogId: "comm-1",
    completedAt: null,
  };
}

describe("FOLLOW_UP reply compare-and-set", () => {
  it("closes the task when the reply covers its latest inbound communication", async () => {
    const task = openTask();
    const completedAt = new Date("2026-08-01T12:00:00.000Z");

    const closed = await completeFollowUpAfterReply(fakeClient(task), {
      customerUserId: "customer-1",
      inboundCommunicationLogId: "comm-1",
      completedAt,
    });

    expect(closed).toBe(true);
    expect(task.status).toBe("DONE");
    expect(task.completedAt).toEqual(completedAt);
  });

  it("does not close when a newer inbound communication arrived during send", async () => {
    const task = openTask();
    task.lastInboundCommLogId = "comm-2";

    const closed = await completeFollowUpAfterReply(fakeClient(task), {
      customerUserId: "customer-1",
      inboundCommunicationLogId: "comm-1",
    });

    expect(closed).toBe(false);
    expect(task.status).toBe("OPEN");
    expect(task.completedAt).toBeNull();
  });
});
