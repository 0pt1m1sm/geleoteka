/** Russian labels for CRM Phase 3 / 4 enums. */

export const COMM_CHANNEL_LABELS: Record<string, string> = {
  PHONE_INBOUND: "Входящий звонок",
  PHONE_OUTBOUND: "Исходящий звонок",
  SMS_OUTBOUND: "SMS (отправлено)",
  SMS_INBOUND: "SMS (входящее)",
  WHATSAPP: "WhatsApp",
  TELEGRAM: "Telegram",
  EMAIL: "Email",
  IN_PERSON: "Лично",
  OTHER: "Другое",
};

export const COMM_OUTCOME_LABELS: Record<string, string> = {
  ANSWERED: "Ответил",
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
