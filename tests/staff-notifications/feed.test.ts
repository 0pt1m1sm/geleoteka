import { describe, expect, it, vi } from "vitest";

import {
  loadStaffNotificationFeedPage,
  markStaffNotificationReceiptsRead,
  type StaffNotificationFeedReader,
} from "@/lib/staff-notifications/feed";

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

  it("shows an event without a personal receipt in all mode while keeping unread personal", async () => {
    const receiptFindMany = vi.fn(async () => []);
    const receiptCount = vi.fn(async (rawArgs: Record<string, unknown>) => {
      const args = rawArgs as {
        where: { tenantKey: string; userId?: string; readAt: null };
      };
      return args.where.userId === "manager-1" ? 1 : 99;
    });
    const eventFindMany = vi.fn(async () => [
      {
        id: "event-without-receipt",
        type: "PARTS_ORDER_CREATED",
        channel: null,
        summary: "Новый заказ запчастей",
        actionPath: "/admin/orders/order-1",
        occurredAt: new Date("2026-08-01T11:00:00.000Z"),
        createdAt: new Date("2026-08-01T11:00:01.000Z"),
        receipts: [],
      },
      {
        id: "event-personal-unread",
        type: "INBOUND_CUSTOMER_MESSAGE",
        channel: "EMAIL_INBOUND",
        summary: "Новое письмо от клиента",
        actionPath: "/admin/crm/deals/deal-1",
        occurredAt: new Date("2026-08-01T10:00:00.000Z"),
        createdAt: new Date("2026-08-01T10:00:01.000Z"),
        receipts: [{ readAt: null }],
      },
    ]);
    const client: StaffNotificationFeedReader = {
      staffNotificationReceipt: {
        findMany: receiptFindMany,
        count: receiptCount,
      },
      staffNotificationEvent: { findMany: eventFindMany },
    };

    const result = await loadStaffNotificationFeedPage(client, {
      userId: "manager-1",
      scope: "all",
      canManage: true,
    });

    expect(result.items.map((item) => item.eventId)).toEqual([
      "event-without-receipt",
      "event-personal-unread",
    ]);
    expect(result.items[0]).toMatchObject({
      hasPersonalReceipt: false,
      readAt: null,
    });
    expect(result.unreadCount).toBe(1);
    expect(receiptCount).toHaveBeenCalledWith({
      where: {
        tenantKey: "geleoteka",
        userId: "manager-1",
        readAt: null,
      },
    });
    expect(receiptFindMany).not.toHaveBeenCalled();
    expect(eventFindMany).toHaveBeenCalledOnce();
  });

  it("rejects all mode without notifications.manage before reading events", async () => {
    const eventFindMany = vi.fn(async () => []);
    const receiptCount = vi.fn(async () => 0);
    const client: StaffNotificationFeedReader = {
      staffNotificationReceipt: {
        findMany: vi.fn(async () => []),
        count: receiptCount,
      },
      staffNotificationEvent: { findMany: eventFindMany },
    };

    await expect(
      loadStaffNotificationFeedPage(client, {
        userId: "manager-1",
        scope: "all",
        canManage: false,
      }),
    ).rejects.toThrow("notifications.manage");
    expect(eventFindMany).not.toHaveBeenCalled();
    expect(receiptCount).not.toHaveBeenCalled();
  });
});
