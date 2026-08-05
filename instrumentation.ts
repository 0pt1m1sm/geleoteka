/**
 * Запускается ОДИН раз на старт серверного процесса (см.
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
 * Здесь стартует фоновый контур доставки: длинный опрос Telegram, dispatch
 * уведомлений и пул почты. Внешние планировщики ненадёжны (GitHub-cron
 * фактически раз в час) и остаются только страховкой.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [
    { startTelegramPollWorker },
    { drainTelegramUpdatesNow },
    { runStaffNotificationDispatchTick },
    { loadMailSyncRuntime },
    { runSyncOnce },
    { recordMailSyncRun },
  ] = await Promise.all([
    import("@/lib/staff-notifications/channels/telegram/poll-worker"),
    import("@/lib/staff-notifications/channels/telegram/updates-runtime"),
    import("@/lib/staff-notifications/dispatch-runtime"),
    import("@/lib/email/mail-sync-config"),
    import("@/lib/email/sync"),
    import("@/lib/email/sync-status"),
  ]);

  // Fire-and-forget: register обязан завершиться до готовности сервера,
  // цикл живёт дальше сам и переживает любые сбои итераций.
  startTelegramPollWorker({
    drain: drainTelegramUpdatesNow,
    dispatchTick: runStaffNotificationDispatchTick,
    mailSyncTick: async () => {
      const runtime = await loadMailSyncRuntime();
      if (!runtime.enabled || runtime.config.sources.length === 0) return;
      await runSyncOnce({ ...runtime.config, batchSize: 25 }, runtime.deps);
      await recordMailSyncRun();
    },
    seoSnapshotTick: async () => {
      const { runSeoSnapshotTick } = await import("@/lib/seo-snapshot");
      await runSeoSnapshotTick();
    },
  });
}
