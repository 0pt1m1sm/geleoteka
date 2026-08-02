import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scan: vi.fn(),
  retain: vi.fn(),
  retainTelegram: vi.fn(),
  retentionDays: vi.fn(),
  drainNow: vi.fn(),
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
vi.mock("@/lib/staff-notifications/channels/telegram/diagnostics", () => ({
  retainTelegramSendAttempts: mocks.retainTelegram,
}));
vi.mock("@/lib/staff-notifications/operations-config", () => ({
  loadStaffNotificationRetentionDays: mocks.retentionDays,
}));
vi.mock(
  "@/lib/staff-notifications/channels/telegram/updates-runtime",
  () => ({
    drainTelegramUpdatesNow: mocks.drainNow,
  }),
);

import { POST } from "@/app/api/internal/staff-notifications/maintenance/route";

describe("staff notification maintenance route", () => {
  beforeEach(() => {
    mocks.scan.mockReset();
    mocks.retain.mockReset();
    mocks.retainTelegram.mockReset();
    mocks.retentionDays.mockReset();
    mocks.drainNow.mockReset();
    mocks.drainNow.mockResolvedValue({
      status: "drained",
      processed: 0,
      batches: 1,
    });
    mocks.scan.mockResolvedValue({ scanned: 1, eventsEnsured: 1 });
    mocks.retentionDays.mockResolvedValue(30);
    mocks.retain.mockResolvedValue({
      deletedEvents: 2,
      cutoff: new Date("2026-07-02T12:00:00.000Z"),
    });
    mocks.retainTelegram.mockResolvedValue({
      deletedAttempts: 3,
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
    expect(mocks.retainTelegram).not.toHaveBeenCalled();
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
      retention: {
        configured: true,
        days: 30,
        deletedEvents: 2,
        deletedTelegramAttempts: 3,
      },
    });
    expect(mocks.scan).toHaveBeenCalledOnce();
    expect(mocks.retain).toHaveBeenCalledOnce();
    expect(mocks.retainTelegram).toHaveBeenCalledOnce();
    // Опрос — часть того же тика с параметрами cron-расписания.
    expect(mocks.drainNow).toHaveBeenCalledWith({
      force: true,
      budgetMs: 6_000,
      maxBatches: 3,
    });
  });

  it("провал опроса красит тик: 503, но overdue и retention всё равно выполнены", async () => {
    mocks.drainNow.mockResolvedValue({
      status: "failed",
      errorCode: "TELEGRAM_AUTH_REJECTED",
      processed: 0,
    });

    const response = await POST(
      new Request(
        "https://geleoteka.ru/api/internal/staff-notifications/maintenance",
        {
          method: "POST",
          headers: { authorization: `Bearer ${"D".repeat(32)}` },
        },
      ),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      updates: { status: "failed", errorCode: "TELEGRAM_AUTH_REJECTED" },
    });
    // Health-contract не отменяет остальную работу тика.
    expect(mocks.scan).toHaveBeenCalledOnce();
    expect(mocks.retain).toHaveBeenCalledOnce();
    expect(mocks.retainTelegram).toHaveBeenCalledOnce();
  });

  it("budget-exhausted без единого обработанного апдейта — тоже красный тик", async () => {
    // Сценарий: 409/таймауты съедают бюджет каждый тик, канал фактически
    // мёртв, но status не «failed» — health-contract обязан это видеть.
    mocks.drainNow.mockResolvedValue({
      status: "budget-exhausted",
      processed: 0,
      batches: 1,
    });

    const response = await POST(
      new Request(
        "https://geleoteka.ru/api/internal/staff-notifications/maintenance",
        {
          method: "POST",
          headers: { authorization: `Bearer ${"D".repeat(32)}` },
        },
      ),
    );

    expect(response.status).toBe(503);
    expect(mocks.scan).toHaveBeenCalledOnce();
  });

  it("budget-exhausted с прогрессом (большой backlog) остаётся зелёным", async () => {
    mocks.drainNow.mockResolvedValue({
      status: "budget-exhausted",
      processed: 42,
      batches: 3,
    });

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
  });

  it("выключенный канал и пропуски по lease/cooldown остаются зелёными", async () => {
    for (const status of [
      { status: "channel-disabled", processed: 0 },
      { status: "skipped-lease", processed: 0 },
      { status: "skipped-cooldown", processed: 0 },
    ]) {
      mocks.drainNow.mockResolvedValue(status);
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
    }
  });
});
