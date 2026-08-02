"use server";

import { requireRole } from "@/lib/auth";
import { replayDeadLetter } from "@/lib/email/sync";

/**
 * Manual replay of a dead-lettered IMAP message, driven from the mail-sync
 * diagnostics page.
 *
 * ADMIN-only, and idempotent by construction: `replayDeadLetter` deletes the
 * DEAD placeholder and re-drives the message through the same `ingestEmail`
 * everything else uses, which dedupes on the RFC Message-Id and the source
 * tuple. Replaying the same DEAD row a second time finds it already gone and
 * returns null — it can never mint a second CommunicationLog / InboxMessage, nor
 * a second FOLLOW_UP task.
 *
 * The runtime (IMAP port + settings) is imported lazily AFTER the auth check so
 * an unauthorized call never touches `server-only` config or opens a socket.
 */
export interface ReplayResult {
  ok: boolean;
  error: string | null;
  /** Ingest status on success: "created" | "unresolved" | "duplicate". */
  status?: string;
}

export interface ManualMailSyncResult {
  ok: boolean;
  error: string | null;
  /** Сколько писем обработано/создано этим пулом (по всем источникам). */
  processed?: number;
  created?: number;
}

/**
 * Ручной пул почты с кнопки на странице «Входящие письма». Тот же
 * runSyncOnce, что у фонового воркера и cron-роута; один ограниченный батч.
 */
export async function runMailSyncNow(): Promise<ManualMailSyncResult> {
  try {
    await requireRole(["ADMIN", "MANAGER"]);
  } catch {
    return { ok: false, error: "Недостаточно прав" };
  }

  const { loadMailSyncRuntime } = await import("@/lib/email/mail-sync-config");
  const { runSyncOnce } = await import("@/lib/email/sync");
  const { recordMailSyncRun } = await import("@/lib/email/sync-status");
  const { revalidatePath } = await import("next/cache");

  try {
    const runtime = await loadMailSyncRuntime();
    if (!runtime.enabled) {
      return { ok: false, error: "Синхронизация почты выключена в настройках" };
    }
    if (runtime.config.sources.length === 0) {
      return { ok: false, error: "Источники почты не настроены" };
    }
    const results = await runSyncOnce(
      { ...runtime.config, batchSize: 25 },
      runtime.deps,
    );
    await recordMailSyncRun();
    revalidatePath("/admin/crm/inbox");
    return {
      ok: true,
      error: null,
      processed: results.reduce((sum, r) => sum + r.processed, 0),
      created: results.reduce((sum, r) => sum + r.created, 0),
    };
  } catch (err) {
    console.error("[MAIL SYNC] runMailSyncNow", err);
    return { ok: false, error: "Проверка почты не удалась. Попробуйте ещё раз." };
  }
}

export async function replayMailSyncDeadLetter(emailMessageId: string): Promise<ReplayResult> {
  try {
    await requireRole(["ADMIN"]);
  } catch {
    return { ok: false, error: "Недостаточно прав" };
  }

  if (typeof emailMessageId !== "string" || emailMessageId.trim().length === 0) {
    return { ok: false, error: "Не передан идентификатор письма" };
  }

  const { loadMailSyncRuntime } = await import("@/lib/email/mail-sync-config");
  const { revalidatePath } = await import("next/cache");

  try {
    const { config, deps } = await loadMailSyncRuntime();
    const result = await replayDeadLetter(emailMessageId.trim(), config, deps);
    if (result === null) {
      return {
        ok: false,
        error: "Не воспроизведено — письмо всё ещё нечитаемо, уже обработано или недоступно.",
      };
    }
    revalidatePath("/admin/settings/mail-sync");
    return { ok: true, error: null, status: result.status };
  } catch (err) {
    console.error("[MAIL SYNC] replayMailSyncDeadLetter", err);
    return { ok: false, error: "Ошибка при воспроизведении. Попробуйте ещё раз." };
  }
}
