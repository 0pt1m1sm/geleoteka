import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  sendTest: vi.fn(),
  config: {
    enabled: true as const,
    enabledAt: new Date("2026-08-02T12:00:00.000Z"),
    botToken: `123456:${"A".repeat(32)}`,
    botUsername: "GeleotekaStaffBot",
    webhookSecret: "S".repeat(32),
    routingMode: "PERSONAL_ONLY" as const,
    applicationOrigin: "https://geleoteka.ru",
    enabledEventTypes: new Set(),
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/authz", () => ({
  requirePermission: mocks.requirePermission,
  rolePermissions: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/staff-notifications/channels/telegram/config", () => ({
  loadTelegramRuntimeConfig: vi.fn(async () => mocks.config),
}));
vi.mock("@/lib/staff-notifications/channels/telegram/linking", () => ({
  createTelegramLinkToken: vi.fn(),
}));
vi.mock("@/lib/staff-notifications/channels/telegram/test-send", () => ({
  sendTelegramTestNotification: mocks.sendTest,
}));
vi.mock("@/lib/staff-notifications/feed", () => ({
  markStaffNotificationReceiptsRead: vi.fn(),
}));
vi.mock("@/lib/staff-notifications/operations", () => ({
  requeueDeadStaffNotificationDelivery: vi.fn(),
}));
vi.mock("@/lib/staff-notifications/preferences", () => ({
  staffNotificationTypesForPermissions: vi.fn(() => []),
}));

import {
  sendPersonalTelegramTest,
  sendSharedTelegramTest,
} from "@/app/actions/staff-notifications";

describe("Telegram test server actions", () => {
  beforeEach(() => {
    mocks.requirePermission.mockReset();
    mocks.sendTest.mockReset().mockResolvedValue({
      outcome: "failed",
      durationMs: 0,
      errorCode: "TELEGRAM_DESTINATION_UNAVAILABLE",
    });
  });

  it("authenticates the personal action and derives the recipient from the session", async () => {
    mocks.requirePermission.mockResolvedValue({
      id: "manager_1",
      permissionRole: "MANAGER",
    });

    await expect(
      sendPersonalTelegramTest(null, new FormData()),
    ).resolves.toMatchObject({
      outcome: "failed",
      errorCode: "TELEGRAM_DESTINATION_UNAVAILABLE",
    });

    expect(mocks.requirePermission).toHaveBeenCalledWith("notifications.view");
    expect(mocks.sendTest).toHaveBeenCalledWith({
      client: expect.any(Object),
      fetchImpl: globalThis.fetch,
      config: mocks.config,
      actorUserId: "manager_1",
      target: "PERSONAL",
    });
  });

  it("requires notifications.manage and selects only the shared target", async () => {
    mocks.requirePermission.mockResolvedValue({
      id: "admin_1",
      permissionRole: "ADMIN",
    });

    await sendSharedTelegramTest(null, new FormData());

    expect(mocks.requirePermission).toHaveBeenCalledWith("notifications.manage");
    expect(mocks.sendTest).toHaveBeenCalledWith({
      client: expect.any(Object),
      fetchImpl: globalThis.fetch,
      config: mocks.config,
      actorUserId: "admin_1",
      target: "SHARED",
    });
  });
});
