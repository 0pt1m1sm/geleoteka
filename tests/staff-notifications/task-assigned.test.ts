import { describe, expect, it, vi } from "vitest";

import { formatTelegramStaffNotification } from "@/lib/staff-notifications/channels/telegram/format";
import {
  publishTaskAssigned,
  taskAssignedDedupeKey,
  type StaffNotificationPublishTx,
} from "@/lib/staff-notifications/publish";
import type { StaffNotificationEventRecord } from "@/lib/staff-notifications/types";

const NOW = new Date("2026-08-02T20:00:00.000Z");
const DUE_AT = new Date("2026-08-05T10:00:00.000Z");

describe("TASK_ASSIGNED publisher", () => {
  it("uses task+owner dedupe and exposes only policy-safe content", async () => {
    const upsert = vi.fn(async (rawArgs: Record<string, unknown>) => {
      const args = rawArgs as {
        create: Omit<StaffNotificationEventRecord, "id" | "createdAt">;
      };
      return { id: "event-1", createdAt: NOW, ...args.create };
    });
    const client: StaffNotificationPublishTx = {
      staffNotificationEvent: { upsert },
    };

    const event = await publishTaskAssigned(client, {
      taskId: "task-1",
      ownerUserId: "manager-2",
      assignedByUserId: "manager-1",
      assignmentAuditId: "audit-assign-1",
      customerUserId: "customer-1",
      customerName: "Иван Клиент",
      dealId: "deal-1",
      dueAt: DUE_AT,
      occurredAt: NOW,
    });

    expect(taskAssignedDedupeKey("task-1", "manager-2", "audit-assign-1")).toBe(
      "task-assigned:task-1:manager-2:audit-assign-1",
    );
    expect(event).toMatchObject({
      type: "TASK_ASSIGNED",
      sourceType: "CrmTask",
      sourceId: "task-1",
      relatedTaskId: "task-1",
      targetUserId: "manager-2",
      dedupeKey: "task-assigned:task-1:manager-2:audit-assign-1",
    });
    expect(event?.summary).toContain("Вам назначена задача");
    expect(event?.summary).toContain("Иван Клиент");
    expect(event?.summary).toContain("Срок:");

    const telegram = formatTelegramStaffNotification(
      {
        eventId: event!.id,
        type: "TASK_ASSIGNED",
        priority: "P1",
        safeSummary: event!.summary,
        occurredAt: NOW,
        actionUrl: event!.actionPath,
      },
      "https://geleoteka.ru",
    );
    expect(telegram).toContain("Вам назначена задача");
    expect(telegram).toContain("Иван Клиент");
    expect(telegram).not.toContain("SENSITIVE-TASK-TITLE");
    expect(telegram).not.toContain("SENSITIVE-TASK-BODY");
  });

  it("does not create an event when the actor assigns the task to themself", async () => {
    const upsert = vi.fn();

    await expect(
      publishTaskAssigned(
        { staffNotificationEvent: { upsert } },
        {
          taskId: "task-1",
          ownerUserId: "manager-1",
          assignedByUserId: "manager-1",
          assignmentAuditId: "audit-self-1",
          customerUserId: null,
          customerName: null,
          dealId: null,
          dueAt: DUE_AT,
          occurredAt: NOW,
        },
      ),
    ).resolves.toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });
});
