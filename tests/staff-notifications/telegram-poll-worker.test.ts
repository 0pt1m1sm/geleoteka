import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  freshBackgroundWorkerState,
  runBackgroundWorkerIteration,
  type BackgroundWorkerJobs,
} from "@/lib/staff-notifications/channels/telegram/poll-worker";

function jobsWith(overrides: Partial<BackgroundWorkerJobs>): BackgroundWorkerJobs {
  return {
    drain: vi
      .fn()
      .mockResolvedValue({ status: "drained", processed: 0, batches: 1 }),
    dispatchTick: vi.fn().mockResolvedValue({ status: "ok" }),
    mailSyncTick: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("фоновый контур: политика пауз, интервалы задач, дедуп диагностики", () => {
  it("drained → без паузы; drain получает long-poll и тихую диагностику", async () => {
    const jobs = jobsWith({});
    const delay = await runBackgroundWorkerIteration(
      jobs,
      freshBackgroundWorkerState(),
      100_000,
    );
    expect(delay).toBe(0);
    expect(jobs.drain).toHaveBeenCalledWith(
      expect.objectContaining({
        force: true,
        longPollSeconds: 25,
        quietDiagnostics: true,
        suppressFailureDiagnostic: false,
      }),
    );
  });

  it("выключенный канал → редкие заглядывания; занятый lease → короткая пауза", async () => {
    const disabled = jobsWith({
      drain: vi
        .fn()
        .mockResolvedValue({ status: "channel-disabled", processed: 0 }),
    });
    expect(
      await runBackgroundWorkerIteration(
        disabled,
        freshBackgroundWorkerState(),
        100_000,
      ),
    ).toBe(30_000);

    const busy = jobsWith({
      drain: vi
        .fn()
        .mockResolvedValue({ status: "skipped-lease", processed: 0 }),
    });
    expect(
      await runBackgroundWorkerIteration(
        busy,
        freshBackgroundWorkerState(),
        100_000,
      ),
    ).toBe(5_000);
  });

  it("dispatch каждые 20с, почта каждые 60с — не чаще", async () => {
    const jobs = jobsWith({});
    const state = freshBackgroundWorkerState();

    await runBackgroundWorkerIteration(jobs, state, 100_000);
    expect(jobs.dispatchTick).toHaveBeenCalledTimes(1);
    expect(jobs.mailSyncTick).toHaveBeenCalledTimes(1);

    // Спустя 5 секунд — рано для обеих задач.
    await runBackgroundWorkerIteration(jobs, state, 105_000);
    expect(jobs.dispatchTick).toHaveBeenCalledTimes(1);
    expect(jobs.mailSyncTick).toHaveBeenCalledTimes(1);

    // 21 секунда: dispatch пора, почте рано.
    await runBackgroundWorkerIteration(jobs, state, 121_000);
    expect(jobs.dispatchTick).toHaveBeenCalledTimes(2);
    expect(jobs.mailSyncTick).toHaveBeenCalledTimes(1);

    // 61 секунда: почте пора.
    await runBackgroundWorkerIteration(jobs, state, 161_000);
    expect(jobs.mailSyncTick).toHaveBeenCalledTimes(2);
  });

  it("сбои побочных задач изолированы: drain всё равно выполняется", async () => {
    const jobs = jobsWith({
      dispatchTick: vi.fn().mockRejectedValue(new Error("db down")),
      mailSyncTick: vi.fn().mockRejectedValue(new Error("imap down")),
    });
    const delay = await runBackgroundWorkerIteration(
      jobs,
      freshBackgroundWorkerState(),
      100_000,
    );
    expect(delay).toBe(0);
    expect(jobs.drain).toHaveBeenCalledTimes(1);
  });

  it("повторный провал drain с тем же кодом подавляет диагностику на 5 минут", async () => {
    const failedDrain = vi.fn().mockResolvedValue({
      status: "failed",
      errorCode: "TELEGRAM_TIMEOUT",
      processed: 0,
    });
    const jobs = jobsWith({ drain: failedDrain });
    const state = freshBackgroundWorkerState();

    expect(await runBackgroundWorkerIteration(jobs, state, 0)).toBe(15_000);
    expect(failedDrain).toHaveBeenLastCalledWith(
      expect.objectContaining({ suppressFailureDiagnostic: false }),
    );

    await runBackgroundWorkerIteration(jobs, state, 15_000);
    expect(failedDrain).toHaveBeenLastCalledWith(
      expect.objectContaining({ suppressFailureDiagnostic: true }),
    );

    await runBackgroundWorkerIteration(jobs, state, 6 * 60_000);
    expect(failedDrain).toHaveBeenLastCalledWith(
      expect.objectContaining({ suppressFailureDiagnostic: false }),
    );

    // Успех сбрасывает дедуп: следующий провал снова виден сразу.
    const okDrain = vi
      .fn()
      .mockResolvedValue({ status: "drained", processed: 0, batches: 1 });
    await runBackgroundWorkerIteration(
      jobsWith({ drain: okDrain, dispatchTick: jobs.dispatchTick, mailSyncTick: jobs.mailSyncTick }),
      state,
      6 * 60_000 + 1_000,
    );
    await runBackgroundWorkerIteration(jobs, state, 6 * 60_000 + 2_000);
    expect(failedDrain).toHaveBeenLastCalledWith(
      expect.objectContaining({ suppressFailureDiagnostic: false }),
    );
  });

  it("исключение drain не убивает цикл — пауза сбоя", async () => {
    const jobs = jobsWith({
      drain: vi.fn().mockRejectedValue(new Error("db down")),
    });
    const delay = await runBackgroundWorkerIteration(
      jobs,
      freshBackgroundWorkerState(),
      100_000,
    );
    expect(delay).toBe(15_000);
  });
});
