import { TELEGRAM_SEND_TIMEOUT_MS } from "@/lib/staff-notifications/channels/telegram/constants";
import type { TelegramTestNotificationResult } from "@/lib/staff-notifications/channels/telegram/test-send";

export interface TelegramTestResultCopy {
  variant: "success" | "error" | "warning";
  title: string;
  message: string;
}

export function getTelegramTestResultCopy(
  state: TelegramTestNotificationResult,
): TelegramTestResultCopy {
  if (state.outcome === "sent") {
    return {
      variant: "success",
      title: "Тест доставлен",
      message: `Telegram подтвердил отправку тестового уведомления за ${state.durationMs} мс.`,
    };
  }

  if (state.outcome === "rate-limited") {
    const retryAfterSeconds = Math.max(1, Math.ceil(state.retryAfterMs / 1_000));
    return {
      variant: "warning",
      title: "Слишком частая проверка",
      message: `Повторите через ${retryAfterSeconds} сек. Код: ${state.errorCode}.`,
    };
  }

  if (state.errorCode === "TELEGRAM_TIMEOUT") {
    return {
      variant: "error",
      title: "Доставка не подтверждена",
      message: `Не дождались ответа Telegram за ${TELEGRAM_SEND_TIMEOUT_MS / 1_000} секунд. Сообщение могло дойти, но Telegram этого не подтвердил. Код ошибки: ${state.errorCode}.`,
    };
  }

  if (state.errorCode === "TELEGRAM_DESTINATION_UNAVAILABLE") {
    return {
      variant: "error",
      title: "Тест недоступен",
      message: `Активная привязка не найдена. Код ошибки: ${state.errorCode}.`,
    };
  }

  if (state.errorCode === "TELEGRAM_DISABLED") {
    return {
      variant: "error",
      title: "Тест недоступен",
      message: `Telegram выключен или настроен некорректно. Код ошибки: ${state.errorCode}.`,
    };
  }

  return {
    variant: "error",
    title: "Тест не доставлен",
    message: `Telegram не подтвердил отправку за ${state.durationMs} мс. Код ошибки: ${state.errorCode}.`,
  };
}
