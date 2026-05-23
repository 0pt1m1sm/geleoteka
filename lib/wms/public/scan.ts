import { insertScanEvent, type DbClientPort } from "../internal/repository";

const DEFAULT_TENANT = "default";

export type ScanResult = "SUCCESS" | "REJECTED" | "ERROR";

export interface ScanEventInput {
  userId?: string | null;
  deviceId?: string | null;
  sessionId?: string | null;
  /** Operation context, e.g. "scan", "putaway", "move". */
  action: string;
  rawCode: string;
  parsedObjectType?: string | null;
  parsedObjectId?: string | null;
  result: ScanResult;
  errorCode?: string | null;
  tenantKey?: string;
}

/**
 * Append a scan-audit row. Every scan is recorded — successes AND failures
 * (rejected/error) — so the audit captures the full attempt history (PRD §16).
 */
export async function recordScanEvent(client: DbClientPort, input: ScanEventInput): Promise<void> {
  await insertScanEvent(client, {
    userId: input.userId ?? null,
    deviceId: input.deviceId ?? null,
    sessionId: input.sessionId ?? null,
    action: input.action,
    rawCode: input.rawCode,
    parsedObjectType: input.parsedObjectType ?? null,
    parsedObjectId: input.parsedObjectId ?? null,
    result: input.result,
    errorCode: input.errorCode ?? null,
    tenantKey: input.tenantKey ?? DEFAULT_TENANT,
  });
}
