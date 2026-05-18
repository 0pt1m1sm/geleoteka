/** Russian labels for CRM Phase 3 / 4 enums. */

// Visible channels in dropdown — listed in pairs by medium. Legacy values
// (WHATSAPP / TELEGRAM / EMAIL без направления) остаются в enum для аудита
// старых строк, но не показываются в выборе нового сообщения.
export const COMM_CHANNEL_LABELS: Record<string, string> = {
  PHONE_INBOUND: "Входящий звонок",
  PHONE_OUTBOUND: "Исходящий звонок",
  SMS_INBOUND: "SMS (входящее)",
  SMS_OUTBOUND: "SMS (отправлено)",
  EMAIL_INBOUND: "Email (входящий)",
  EMAIL_OUTBOUND: "Email (исходящий)",
  WHATSAPP_INBOUND: "WhatsApp (входящее)",
  WHATSAPP_OUTBOUND: "WhatsApp (отправлено)",
  TELEGRAM_INBOUND: "Telegram (входящее)",
  TELEGRAM_OUTBOUND: "Telegram (отправлено)",
  MAX_INBOUND: "MAX (входящее)",
  MAX_OUTBOUND: "MAX (отправлено)",
  IN_PERSON: "Лично",
  OTHER: "Другое",
  // Legacy labels — used only when a stored row has these values; never
  // shown in the new-entry dropdown (see DROPDOWN_CHANNELS below).
  WHATSAPP: "WhatsApp (legacy)",
  TELEGRAM: "Telegram (legacy)",
  EMAIL: "Email (legacy)",
};

/** Channels offered in the manual-entry dropdown (legacy values omitted). */
export const DROPDOWN_CHANNELS: ReadonlyArray<string> = [
  "PHONE_INBOUND",
  "PHONE_OUTBOUND",
  "SMS_INBOUND",
  "SMS_OUTBOUND",
  "EMAIL_INBOUND",
  "EMAIL_OUTBOUND",
  "WHATSAPP_INBOUND",
  "WHATSAPP_OUTBOUND",
  "TELEGRAM_INBOUND",
  "TELEGRAM_OUTBOUND",
  "MAX_INBOUND",
  "MAX_OUTBOUND",
  "IN_PERSON",
  "OTHER",
];

const EMAIL_CHANNELS = new Set(["EMAIL", "EMAIL_INBOUND", "EMAIL_OUTBOUND"]);
export function isEmailChannel(channel: string): boolean {
  return EMAIL_CHANNELS.has(channel);
}
const INBOUND_CHANNELS = new Set([
  "PHONE_INBOUND",
  "SMS_INBOUND",
  "EMAIL_INBOUND",
  "WHATSAPP_INBOUND",
  "TELEGRAM_INBOUND",
  "MAX_INBOUND",
]);
const OUTBOUND_CHANNELS = new Set([
  "PHONE_OUTBOUND",
  "SMS_OUTBOUND",
  "EMAIL_OUTBOUND",
  "WHATSAPP_OUTBOUND",
  "TELEGRAM_OUTBOUND",
  "MAX_OUTBOUND",
]);
export function isInboundEmailChannel(channel: string): boolean {
  return channel === "EMAIL_INBOUND";
}
export function isOutboundEmailChannel(channel: string): boolean {
  return channel === "EMAIL_OUTBOUND";
}
export function isInboundChannel(channel: string): boolean {
  return INBOUND_CHANNELS.has(channel);
}
export function isOutboundChannel(channel: string): boolean {
  return OUTBOUND_CHANNELS.has(channel);
}

/** Marketing source — где клиент узнал. */
export const REFERRAL_SOURCE_LABELS: Record<string, string> = {
  YANDEX: "Яндекс",
  GOOGLE: "Google",
  AVITO: "Авито",
  INSTAGRAM: "Instagram",
  TELEGRAM_CHAN: "Telegram-канал",
  FRIEND: "По рекомендации",
  REPEAT: "Постоянный клиент",
  WALK_IN: "Зашёл в сервис",
  OTHER: "Другое",
};

export const REFERRAL_SOURCE_KEYS: ReadonlyArray<string> = [
  "YANDEX",
  "GOOGLE",
  "AVITO",
  "INSTAGRAM",
  "TELEGRAM_CHAN",
  "FRIEND",
  "REPEAT",
  "WALK_IN",
  "OTHER",
];

export const COMM_OUTCOME_LABELS: Record<string, string> = {
  ANSWERED: "Поднял трубку",
  VOICEMAIL: "Голосовая почта",
  NO_ANSWER: "Не ответил",
  REPLIED: "Ответил",
  DELIVERED: "Доставлено",
  FAILED: "Не доставлено",
  N_A: "—",
};

export const CRM_TASK_STATUS_LABELS: Record<string, string> = {
  OPEN: "Открыта",
  DONE: "Выполнена",
  CANCELLED: "Отменена",
};

export const CRM_TASK_KIND_LABELS: Record<string, string> = {
  CALLBACK: "Перезвонить",
  FOLLOW_UP: "Связаться",
  PAYMENT_REMINDER: "Напоминание об оплате",
  SCHEDULED_CHECK_IN: "Плановый контакт",
  GENERIC: "Задача",
};

const PHONE_CHANNELS = new Set(["PHONE_INBOUND", "PHONE_OUTBOUND"]);
export function isPhoneChannel(channel: string): boolean {
  return PHONE_CHANNELS.has(channel);
}
