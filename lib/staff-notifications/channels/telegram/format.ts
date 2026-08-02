import { makeAdminActionUrl } from "@/lib/staff-notifications/safe-action-url";
import type { SafeChannelPayload } from "@/lib/staff-notifications/types";
import { formatDateTime } from "@/lib/utils";

/** Format plain text only; no Telegram parse mode means user data cannot become markup. */
export function formatTelegramStaffNotification(
  payload: SafeChannelPayload,
  applicationOrigin: string,
): string {
  const actionPath = makeAdminActionUrl(payload.actionUrl);
  const actionUrl = new URL(actionPath, `${applicationOrigin}/`).toString();
  const summary = normalizeSafeSummary(payload.safeSummary);
  const icon =
    payload.type === "TASK_ASSIGNED"
      ? "📋"
      : payload.type === "TASK_CREATED"
        ? "📝"
        : payload.type === "USER_LOGIN"
          ? "🔐"
          : "📬";

  return [
    `${icon} ${summary}`,
    `Получено: ${formatDateTime(payload.occurredAt)}`,
    "Требуется действие",
    "",
    actionUrl,
  ].join("\n");
}

function normalizeSafeSummary(value: string): string {
  const normalized = value.trim().replace(/\r\n?/g, "\n");
  if (!normalized || normalized.length > 500) {
    throw new Error("Invalid safe notification summary");
  }
  return normalized;
}
