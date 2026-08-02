import { TELEGRAM_LINK_TOKEN_TTL_MS } from "@/lib/staff-notifications/channels/telegram/constants";
import type { TelegramLinkPurpose } from "@/lib/staff-notifications/types";

export interface TelegramLinkPanelCopy {
  buttonLabel: string;
  successMessage: string;
}

export function getTelegramLinkPanelCopy(
  purpose: TelegramLinkPurpose,
): TelegramLinkPanelCopy {
  const ttlMinutes = TELEGRAM_LINK_TOKEN_TTL_MS / 60_000;
  if (!Number.isInteger(ttlMinutes) || ttlMinutes <= 0) {
    throw new Error("Telegram link token TTL must be a positive whole number of minutes");
  }

  const ttlLabel = formatRussianMinutes(ttlMinutes);

  return {
    buttonLabel: `Создать ссылку на ${ttlLabel}`,
    successMessage:
      purpose === "PERSONAL"
        ? `Откройте ссылку в приватном чате с ботом. Она одноразовая и истечёт через ${ttlLabel}.`
        : `Откройте ссылку и выберите рабочую группу. Telegram добавит бота и отправит команду привязки; ссылка истечёт через ${ttlLabel}.`,
  };
}

function formatRussianMinutes(minutes: number): string {
  const lastTwoDigits = minutes % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return `${minutes} минут`;
  }

  switch (minutes % 10) {
    case 1:
      return `${minutes} минуту`;
    case 2:
    case 3:
    case 4:
      return `${minutes} минуты`;
    default:
      return `${minutes} минут`;
  }
}
