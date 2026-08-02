import "server-only";

import { db } from "@/lib/db";

/**
 * Отметка последнего УСПЕШНОГО пула почты — для строки «почта проверялась…»
 * на странице входящих. Пишется всеми тремя триггерами синка: фоновым
 * воркером, ручной кнопкой и cron-роутом. Хранится в Setting напрямую (ключ
 * не входит в KNOWN_SETTINGS и в форму настроек не попадает).
 */
const MAIL_SYNC_LAST_RUN_KEY = "MAIL_SYNC_LAST_RUN_AT";

export async function recordMailSyncRun(now = new Date()): Promise<void> {
  try {
    await db.setting.upsert({
      where: { key: MAIL_SYNC_LAST_RUN_KEY },
      create: { key: MAIL_SYNC_LAST_RUN_KEY, value: now.toISOString() },
      update: { value: now.toISOString() },
    });
  } catch {
    // Отметка — только индикация; сам синк от неё не зависит.
    console.error("mail_sync.last_run_stamp_failed");
  }
}

export async function readMailSyncLastRunAt(): Promise<Date | null> {
  const row = (await db.setting.findUnique({
    where: { key: MAIL_SYNC_LAST_RUN_KEY },
    select: { value: true },
  })) as { value: string } | null;
  if (!row) return null;
  const parsed = new Date(row.value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}
