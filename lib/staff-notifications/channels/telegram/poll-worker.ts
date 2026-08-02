import "server-only";

import { TELEGRAM_POLL_LONG_POLL_SECONDS } from "@/lib/staff-notifications/channels/telegram/constants";
import type { DrainTelegramUpdatesResult } from "@/lib/staff-notifications/channels/telegram/updates";

/**
 * Фоновый контур доставки — основной «пульс» всей конвейерной части.
 *
 * Внешних планировщиков с надёжной каденцией у проекта нет: GitHub-cron
 * фактически тикает раз в час (throttling расписаний), панель опрашивает
 * только пока открыта страница профиля. Этот цикл живёт в самом серверном
 * процессе (запускается из instrumentation.ts) и несёт три обязанности:
 *
 * 1. Приём Telegram — long poll на стороне Telegram, апдейты приходят
 *    практически мгновенно; lease в TelegramPollState исключает перекрытие
 *    с панельными и cron-дрейнами.
 * 2. Dispatch уведомлений (каждые ~20с) — проекция pending-событий и
 *    отправка ограниченного батча.
 * 3. Пул почты по IMAP (каждые ~60с) — тот же runSyncOnce, что у cron-роута
 *    и ручной кнопки на странице входящих.
 *
 * Cron-workflow'ы остаются страховкой на случай смерти процесса.
 */

type WorkerDrain = (options: {
  force?: boolean;
  budgetMs?: number;
  maxBatches?: number;
  longPollSeconds?: number;
  quietDiagnostics?: boolean;
  suppressFailureDiagnostic?: boolean;
}) => Promise<
  DrainTelegramUpdatesResult | { status: "channel-disabled"; processed: 0 }
>;

export interface BackgroundWorkerJobs {
  drain: WorkerDrain;
  /** Один dispatch-тик конвейера уведомлений. */
  dispatchTick: () => Promise<unknown>;
  /** Один ограниченный пул почты (внутри сам решает, включён ли синк). */
  mailSyncTick: () => Promise<unknown>;
}

export interface BackgroundWorkerState {
  lastFailureCode: string | null;
  lastFailureDiagnosticAt: number;
  lastDispatchAt: number;
  lastMailSyncAt: number;
}

/** Канал выключен или конфигурация невалидна — заглядываем нечасто. */
const DISABLED_BACKOFF_MS = 30_000;
/** Сбой сети/API: не молотить впустую, но и не засыпать надолго. */
const FAILURE_BACKOFF_MS = 15_000;
/** Lease у панели или cron — освободится за секунды. */
const BUSY_BACKOFF_MS = 5_000;
/** Повторный провал с тем же кодом пишет диагностику не чаще этого окна. */
const FAILURE_DIAGNOSTIC_WINDOW_MS = 5 * 60_000;
/** Каденция dispatch-тика: заметно чаще любого SLA уведомлений. */
const DISPATCH_EVERY_MS = 20_000;
/** Каденция пула почты. */
const MAIL_SYNC_EVERY_MS = 60_000;

let started = false;

/**
 * Heartbeat для диагностики: живёт в памяти процесса, наружу уходит только
 * безопасная проекция (времена, статус, класс ошибки — никаких данных).
 */
const heartbeat = {
  startedAt: null as Date | null,
  lastIterationAt: null as Date | null,
  lastStatus: null as string | null,
  lastErrorName: null as string | null,
  iterations: 0,
};

export function readBackgroundWorkerHeartbeat(): {
  startedAt: string | null;
  lastIterationAt: string | null;
  lastStatus: string | null;
  lastErrorName: string | null;
  iterations: number;
} {
  return {
    startedAt: heartbeat.startedAt?.toISOString() ?? null,
    lastIterationAt: heartbeat.lastIterationAt?.toISOString() ?? null,
    lastStatus: heartbeat.lastStatus,
    lastErrorName: heartbeat.lastErrorName,
    iterations: heartbeat.iterations,
  };
}

export function freshBackgroundWorkerState(): BackgroundWorkerState {
  return {
    lastFailureCode: null,
    lastFailureDiagnosticAt: 0,
    lastDispatchAt: 0,
    lastMailSyncAt: 0,
  };
}

export function startTelegramPollWorker(jobs: BackgroundWorkerJobs): void {
  // Однократный запуск на процесс (dev-перезагрузки зовут register повторно).
  if (started) return;
  started = true;
  heartbeat.startedAt = new Date();
  const state = freshBackgroundWorkerState();
  void (async () => {
    for (;;) {
      let delayMs = FAILURE_BACKOFF_MS;
      try {
        delayMs = await runBackgroundWorkerIteration(jobs, state, Date.now());
        heartbeat.lastStatus = state.lastFailureCode ?? "ok";
        heartbeat.lastErrorName = null;
      } catch (error) {
        // Итерация сама ловит всё известное; это последний рубеж — цикл
        // не имеет права умереть молча (уже случалось: воркер замирал, и
        // доставки стояли без единого следа в диагностике).
        heartbeat.lastStatus = "loop-exception";
        heartbeat.lastErrorName =
          error instanceof Error ? error.constructor.name : typeof error;
        console.error("background_worker.loop_exception", {
          name: heartbeat.lastErrorName,
        });
      }
      heartbeat.lastIterationAt = new Date();
      heartbeat.iterations += 1;
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  })();
}

/**
 * Одна итерация цикла; возвращает паузу до следующей. Вынесена отдельно,
 * чтобы политика пауз, интервалы побочных задач и дедуп диагностики были
 * тестируемыми без вечного цикла.
 */
export async function runBackgroundWorkerIteration(
  jobs: BackgroundWorkerJobs,
  state: BackgroundWorkerState,
  nowMs: number,
): Promise<number> {
  // Побочные задачи идут первыми и изолированно: их сбой не имеет права
  // трогать приёмный контур (и наоборот — долгий long poll не сдвигает их
  // сильнее собственной длительности, интервалы проверяются каждый круг).
  if (nowMs - state.lastDispatchAt >= DISPATCH_EVERY_MS) {
    state.lastDispatchAt = nowMs;
    try {
      await jobs.dispatchTick();
    } catch {
      console.error("staff_notifications.dispatch_tick_failed");
    }
  }
  if (nowMs - state.lastMailSyncAt >= MAIL_SYNC_EVERY_MS) {
    state.lastMailSyncAt = nowMs;
    try {
      await jobs.mailSyncTick();
    } catch {
      console.error("mail_sync.tick_failed");
    }
  }

  let result:
    | DrainTelegramUpdatesResult
    | { status: "channel-disabled"; processed: 0 };
  try {
    const suppressFailureDiagnostic =
      state.lastFailureCode !== null &&
      nowMs - state.lastFailureDiagnosticAt < FAILURE_DIAGNOSTIC_WINDOW_MS;
    result = await jobs.drain({
      force: true,
      longPollSeconds: TELEGRAM_POLL_LONG_POLL_SECONDS,
      budgetMs: (TELEGRAM_POLL_LONG_POLL_SECONDS + 20) * 1000,
      maxBatches: 3,
      quietDiagnostics: true,
      suppressFailureDiagnostic,
    });
  } catch {
    // Drain сам никогда не бросает; это страховка от неожиданных сбоев
    // обвязки (например, недоступна БД) — цикл обязан пережить всё.
    state.lastFailureCode = "WORKER_EXCEPTION";
    state.lastFailureDiagnosticAt = nowMs;
    return FAILURE_BACKOFF_MS;
  }

  if (result.status === "failed") {
    const repeat = state.lastFailureCode === result.errorCode;
    if (
      !repeat ||
      nowMs - state.lastFailureDiagnosticAt >= FAILURE_DIAGNOSTIC_WINDOW_MS
    ) {
      state.lastFailureDiagnosticAt = nowMs;
    }
    state.lastFailureCode = result.errorCode;
    return FAILURE_BACKOFF_MS;
  }

  state.lastFailureCode = null;
  if (result.status === "channel-disabled") return DISABLED_BACKOFF_MS;
  if (
    result.status === "skipped-lease" ||
    result.status === "skipped-cooldown"
  ) {
    return BUSY_BACKOFF_MS;
  }
  // drained / budget-exhausted: сразу следующий long poll — ожидание живёт
  // на стороне Telegram, а не у нас.
  return 0;
}
