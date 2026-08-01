import { describe, expect, it } from "vitest";

import { upsertInboundFollowUpTask } from "@/lib/crm/inbound-follow-up";

interface Row {
  id: string;
  [key: string]: unknown;
}

function harness() {
  const tasks: Row[] = [];
  const communications: Row[] = [
    { id: "comm-1", createdAt: new Date("2026-08-01T08:00:00.000Z") },
    { id: "comm-2", createdAt: new Date("2026-08-01T09:00:00.000Z") },
  ];
  const client = {
    crmTask: {
      async createMany(rawArgs: Record<string, unknown>) {
        const data = (rawArgs.data as Array<Record<string, unknown>>)[0];
        const duplicate = tasks.some(
          (task) =>
            task.customerUserId === data.customerUserId &&
            task.dealId === data.dealId &&
            task.kind === "FOLLOW_UP" &&
            task.status === "OPEN",
        );
        if (duplicate) return { count: 0 };
        tasks.push({ id: `task-${tasks.length + 1}`, ...data });
        return { count: 1 };
      },
      async findFirst(rawArgs: Record<string, unknown>) {
        const where = rawArgs.where as Record<string, unknown>;
        return tasks.find((task) => matches(task, where)) ?? null;
      },
      async findUnique(rawArgs: Record<string, unknown>) {
        const id = (rawArgs.where as { id: string }).id;
        return tasks.find((task) => task.id === id) ?? null;
      },
      async updateMany(rawArgs: Record<string, unknown>) {
        const where = rawArgs.where as Record<string, unknown>;
        const task = tasks.find((row) => matches(row, where));
        if (!task) return { count: 0 };
        Object.assign(task, rawArgs.data as Record<string, unknown>);
        return { count: 1 };
      },
    },
    communicationLog: {
      async findUnique(rawArgs: Record<string, unknown>) {
        const id = (rawArgs.where as { id: string }).id;
        return communications.find((row) => row.id === id) ?? null;
      },
    },
  };
  return { client, tasks, communications };
}

const baseInput = {
  communicationLogId: "comm-1",
  communicationCreatedAt: new Date("2026-08-01T08:00:00.000Z"),
  customerUserId: "customer-1",
  customerName: "Иван",
  dealId: "deal-1",
  ownerUserId: "manager-1",
  channel: "EMAIL_INBOUND" as const,
  messageOccurredAt: new Date("2026-08-01T08:00:00.000Z"),
  eventCreatedAt: new Date("2026-08-01T08:05:00.000Z"),
};

describe("inbound FOLLOW_UP projection", () => {
  it("keeps one open task and advances its message id for a second message", async () => {
    const { client, tasks } = harness();

    const first = await upsertInboundFollowUpTask(client, baseInput);
    const second = await upsertInboundFollowUpTask(client, {
      ...baseInput,
      communicationLogId: "comm-2",
      communicationCreatedAt: new Date("2026-08-01T09:00:00.000Z"),
      messageOccurredAt: new Date("2026-08-01T09:00:00.000Z"),
      eventCreatedAt: new Date("2026-08-01T09:05:00.000Z"),
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].lastInboundCommLogId).toBe("comm-2");
    expect(tasks[0].body).toContain("+ ещё 1 письмо");
  });

  it("uses channel copy for a non-email inbound task", async () => {
    const { client, tasks, communications } = harness();
    communications.push({ id: "wa-1", createdAt: new Date("2026-08-01T10:00:00.000Z") });

    await upsertInboundFollowUpTask(client, {
      ...baseInput,
      communicationLogId: "wa-1",
      communicationCreatedAt: new Date("2026-08-01T10:00:00.000Z"),
      channel: "WHATSAPP_INBOUND",
    });

    expect(tasks[0].body).toContain("Клиент написал в WhatsApp");
    expect(tasks[0].body).toContain("Открыть сообщение в WhatsApp");
    expect(tasks[0].body).not.toContain("письмо");
  });
});

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}
