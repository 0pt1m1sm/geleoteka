import { TENANT_KEY } from "@/lib/tenant";

type QueryArgs = Record<string, unknown>;

export const TELEGRAM_SLOW_SEND_THRESHOLD_MS = 5_000;

export const TELEGRAM_SEND_OPERATIONS = [
  "NOTIFICATION_DELIVERY",
  "WEBHOOK_REPLY",
] as const;

export type TelegramSendOperation = (typeof TELEGRAM_SEND_OPERATIONS)[number];
export type TelegramSendOutcome = "SUCCESS" | "FAILURE";

export interface TelegramSendDiagnosticsWriteDb {
  telegramSendAttempt: {
    create(args: QueryArgs): Promise<unknown>;
  };
}

export interface TelegramSendDiagnosticsRetentionDb {
  telegramSendAttempt: {
    deleteMany(args: QueryArgs): Promise<{ count: number }>;
  };
}

export interface TelegramSendDiagnostic {
  operation: TelegramSendOperation;
  outcome: TelegramSendOutcome;
  durationMs: number;
  errorCode: string | null;
}

/**
 * Persist only the closed, secret-free diagnostic projection. Failure here is
 * intentionally non-fatal: the provider call has already completed and its
 * delivery outcome must not be changed by observability storage.
 */
export async function recordTelegramSendDiagnostic(
  client: TelegramSendDiagnosticsWriteDb,
  diagnostic: TelegramSendDiagnostic,
): Promise<void> {
  const durationMs = normalizeDurationMs(diagnostic.durationMs);
  const data = {
    tenantKey: TENANT_KEY,
    operation: diagnostic.operation,
    outcome: diagnostic.outcome,
    durationMs,
    isSlow: durationMs > TELEGRAM_SLOW_SEND_THRESHOLD_MS,
    errorCode: diagnostic.outcome === "FAILURE" ? diagnostic.errorCode : null,
  };

  try {
    await client.telegramSendAttempt.create({ data });
  } catch {
    // Never attach the DB error: an ORM/provider exception may contain a URL.
    console.error("telegram.send_diagnostic_write_failed", data);
  }
}

export async function retainTelegramSendAttempts(
  client: TelegramSendDiagnosticsRetentionDb,
  options: { retentionDays: number; now?: Date },
): Promise<{ deletedAttempts: number; cutoff: Date }> {
  const retentionDays = options.retentionDays;
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
    throw new Error("retentionDays must be an integer between 1 and 3650");
  }

  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await client.telegramSendAttempt.deleteMany({
    where: { tenantKey: TENANT_KEY, createdAt: { lt: cutoff } },
  });
  return { deletedAttempts: result.count, cutoff };
}

function normalizeDurationMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value);
}
