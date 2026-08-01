import { describe, expect, it } from "vitest";

import { markStaffNotificationReceiptsRead } from "@/lib/staff-notifications/feed";

describe("staff notification feed read state", () => {
  it("marks only the employee receipt and never changes the FOLLOW_UP task", async () => {
    const receipt = {
      tenantKey: "geleoteka",
      eventId: "event-1",
      userId: "manager-1",
      readAt: null as Date | null,
    };
    const task = { id: "task-1", status: "OPEN" };
    const readAt = new Date("2026-08-01T12:00:00.000Z");
    const client = {
      staffNotificationReceipt: {
        async updateMany(rawArgs: Record<string, unknown>) {
          const args = rawArgs as {
            where: {
              tenantKey: string;
              userId: string;
              readAt: null;
              eventId?: { in: string[] };
            };
            data: { readAt: Date };
          };
          const matches =
            receipt.tenantKey === args.where.tenantKey &&
            receipt.userId === args.where.userId &&
            receipt.readAt === null &&
            (!args.where.eventId || args.where.eventId.in.includes(receipt.eventId));
          if (!matches) return { count: 0 };
          receipt.readAt = args.data.readAt;
          return { count: 1 };
        },
      },
    };

    await expect(
      markStaffNotificationReceiptsRead(client, "manager-1", ["event-1"], readAt),
    ).resolves.toBe(1);
    expect(receipt.readAt).toEqual(readAt);
    expect(task.status).toBe("OPEN");
  });
});
