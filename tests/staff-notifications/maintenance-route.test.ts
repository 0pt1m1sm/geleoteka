import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scan: vi.fn(),
  retain: vi.fn(),
  retentionDays: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/staff-notifications/channels/telegram/config", () => ({
  loadStaffNotificationDispatchSecret: vi.fn(async () => "D".repeat(32)),
}));
vi.mock("@/lib/staff-notifications/overdue", () => ({
  scanOverdueCrmTasks: mocks.scan,
}));
vi.mock("@/lib/staff-notifications/operations", () => ({
  retainStaffNotificationEvents: mocks.retain,
}));
vi.mock("@/lib/staff-notifications/operations-config", () => ({
  loadStaffNotificationRetentionDays: mocks.retentionDays,
}));

import { POST } from "@/app/api/internal/staff-notifications/maintenance/route";

describe("staff notification maintenance route", () => {
  beforeEach(() => {
    mocks.scan.mockReset();
    mocks.retain.mockReset();
    mocks.retentionDays.mockReset();
    mocks.scan.mockResolvedValue({ scanned: 1, eventsEnsured: 1 });
    mocks.retentionDays.mockResolvedValue(30);
    mocks.retain.mockResolvedValue({
      deletedEvents: 2,
      cutoff: new Date("2026-07-02T12:00:00.000Z"),
    });
  });

  it("rejects an incorrect constant-time Bearer secret before scanning", async () => {
    const response = await POST(
      new Request(
        "https://geleoteka.ru/api/internal/staff-notifications/maintenance",
        {
          method: "POST",
          headers: { authorization: "Bearer wrong-secret" },
        },
      ),
    );

    expect(response.status).toBe(401);
    expect(mocks.scan).not.toHaveBeenCalled();
    expect(mocks.retain).not.toHaveBeenCalled();
  });

  it("runs overdue scanning and configured retention in one bounded tick", async () => {
    const response = await POST(
      new Request(
        "https://geleoteka.ru/api/internal/staff-notifications/maintenance",
        {
          method: "POST",
          headers: { authorization: `Bearer ${"D".repeat(32)}` },
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      overdue: { scanned: 1, eventsEnsured: 1 },
      retention: { configured: true, days: 30, deletedEvents: 2 },
    });
    expect(mocks.scan).toHaveBeenCalledOnce();
    expect(mocks.retain).toHaveBeenCalledOnce();
  });
});
