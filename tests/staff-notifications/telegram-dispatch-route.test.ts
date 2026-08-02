import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lease: vi.fn(),
  dispatch: vi.fn(),
  project: vi.fn(),
  cancelActive: vi.fn(),
  cancelBefore: vi.fn(),
  loadConfig: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/staff-notifications/dispatcher", () => ({
  leaseStaffNotificationDeliveries: mocks.lease,
  dispatchLeasedStaffNotification: mocks.dispatch,
}));
vi.mock("@/lib/staff-notifications/projectors/inbound-customer-message", () => ({
  projectPendingStaffNotificationEvents: mocks.project,
}));
vi.mock("@/lib/staff-notifications/operations", () => ({
  cancelActiveStaffNotificationDeliveries: mocks.cancelActive,
  cancelStaffNotificationDeliveriesBefore: mocks.cancelBefore,
}));
vi.mock("@/lib/staff-notifications/channels/telegram/config", () => ({
  loadStaffNotificationDispatchSecret: vi.fn(async () => "D".repeat(32)),
  loadTelegramRuntimeConfig: mocks.loadConfig,
}));

import { POST } from "@/app/api/internal/staff-notifications/dispatch/route";

describe("staff notification dispatcher route", () => {
  beforeEach(() => {
    mocks.lease.mockReset();
    mocks.dispatch.mockReset();
    mocks.project.mockReset();
    mocks.cancelActive.mockReset();
    mocks.cancelBefore.mockReset();
    mocks.loadConfig.mockReset();
    mocks.project.mockResolvedValue(0);
    mocks.cancelActive.mockResolvedValue(0);
    mocks.cancelBefore.mockResolvedValue(0);
    mocks.loadConfig.mockResolvedValue({
      enabled: true,
      enabledAt: new Date("2026-08-01T00:00:00.000Z"),
      enabledEventTypes: new Set(["INBOUND_CUSTOMER_MESSAGE"]),
    });
  });

  it("rejects an incorrect Bearer secret before leasing work", async () => {
    const response = await POST(
      new Request("https://geleoteka.ru/api/internal/staff-notifications/dispatch", {
        method: "POST",
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.lease).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(mocks.project).not.toHaveBeenCalled();
  });

  it("projects durable events before leasing Telegram deliveries", async () => {
    mocks.project.mockResolvedValue(2);
    mocks.lease.mockResolvedValue([]);

    const response = await POST(
      new Request("https://geleoteka.ru/api/internal/staff-notifications/dispatch", {
        method: "POST",
        headers: { authorization: `Bearer ${"D".repeat(32)}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, projected: 2, leased: 0 });
    expect(mocks.project).toHaveBeenCalledOnce();
    expect(mocks.lease).toHaveBeenCalledOnce();
  });

  it("fails visibly on invalid Telegram configuration without cancelling work", async () => {
    mocks.loadConfig.mockResolvedValue({
      enabled: false,
      reason: "invalid-config",
      enabledEventTypes: new Set(["INBOUND_CUSTOMER_MESSAGE"]),
    });

    const response = await POST(
      new Request("https://geleoteka.ru/api/internal/staff-notifications/dispatch", {
        method: "POST",
        headers: { authorization: `Bearer ${"D".repeat(32)}` },
      }),
    );

    expect(response.status).toBe(503);
    expect(mocks.cancelActive).not.toHaveBeenCalled();
    expect(mocks.lease).not.toHaveBeenCalled();
  });
});
