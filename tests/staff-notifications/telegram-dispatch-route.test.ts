import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lease: vi.fn(),
  dispatch: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/staff-notifications/dispatcher", () => ({
  leaseStaffNotificationDeliveries: mocks.lease,
  dispatchLeasedStaffNotification: mocks.dispatch,
}));
vi.mock("@/lib/staff-notifications/channels/telegram/config", () => ({
  loadStaffNotificationDispatchSecret: vi.fn(async () => "D".repeat(32)),
  loadTelegramRuntimeConfig: vi.fn(async () => ({
    enabled: true,
    enabledEventTypes: new Set(["INBOUND_CUSTOMER_MESSAGE"]),
  })),
}));

import { POST } from "@/app/api/internal/staff-notifications/dispatch/route";

describe("staff notification dispatcher route", () => {
  beforeEach(() => {
    mocks.lease.mockReset();
    mocks.dispatch.mockReset();
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
  });
});

