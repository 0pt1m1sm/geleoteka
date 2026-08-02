import { describe, expect, it, vi } from "vitest";

import {
  publishTaskCreated,
  publishUserLogin,
  type StaffNotificationPublishTx,
} from "@/lib/staff-notifications/publish";
import type { StaffNotificationEventRecord } from "@/lib/staff-notifications/types";

const NOW = new Date("2026-08-02T21:00:00.000Z");

function capturingClient(): {
  client: StaffNotificationPublishTx;
  upsert: ReturnType<typeof vi.fn>;
} {
  const upsert = vi.fn(async (rawArgs: Record<string, unknown>) => {
    const args = rawArgs as {
      create: Omit<StaffNotificationEventRecord, "id" | "createdAt">;
    };
    return { id: "event-1", createdAt: NOW, ...args.create };
  });
  return { client: { staffNotificationEvent: { upsert } }, upsert };
}

describe("Story 4 platform event producers", () => {
  it("publishes USER_LOGIN per audit occurrence with name and role only", async () => {
    const { client } = capturingClient();

    const event = await publishUserLogin(client, {
      userId: "client-1",
      userName: "Иван Клиент",
      permissionRole: "CLIENT",
      loginAuditId: "audit-login-1",
      occurredAt: NOW,
    });

    expect(event).toMatchObject({
      type: "USER_LOGIN",
      sourceType: "User",
      sourceId: "client-1",
      dedupeKey: "user-login:client-1:audit-login-1",
      targetUserId: null,
      fallbackPermission: "users.manage",
    });
    expect(event.summary).toContain("Иван Клиент");
    expect(event.summary).toContain("Клиент");
  });

  it("publishes TASK_CREATED by task id without accepting title or body", async () => {
    const { client } = capturingClient();

    const event = await publishTaskCreated(client, {
      taskId: "task-1",
      customerUserId: "customer-1",
      customerName: "Иван Клиент",
      dealId: "deal-1",
      dealNumber: "D-1042",
      occurredAt: NOW,
    });

    expect(event).toMatchObject({
      type: "TASK_CREATED",
      sourceType: "CrmTask",
      sourceId: "task-1",
      dedupeKey: "task-created:task-1",
      relatedTaskId: "task-1",
      targetUserId: null,
      fallbackPermission: "crm.manage",
    });
    expect(event.summary).toContain("Новая задача");
    expect(event.summary).toContain("Иван Клиент");
    expect(event.summary).toContain("D-1042");
    expect(JSON.stringify(event)).not.toContain("SENSITIVE-TASK-CONTENT");
  });
});
