/** Russian labels for CRM Phase 3 / 4 enums. */

import { isInboundCommChannel } from "@/lib/crm/inbound-communications";

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
  return isInboundCommChannel(channel);
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
  EMAIL: "Письмо на info@",
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
  "EMAIL",
  "OTHER",
];

export const COMM_OUTCOME_LABELS: Record<string, string> = {
  ANSWERED: "Поднял трубку",
  VOICEMAIL: "Голосовая почта",
  NO_ANSWER: "Не ответил",
  REPLIED: "Ответил",
  DELIVERED: "Доставлено",
  ACCEPTED: "Принято к отправке",
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


/**
 * Какие результаты вообще осмысленны для канала.
 *
 * Раньше список был один на всё, и для личного визита предлагалось «не
 * ответил», «голосовая почта», «не доставлено». Это не косметика: менеджер
 * выбирает из того, что видит, и в истории клиента оседает бессмыслица,
 * по которой потом считают статистику.
 *
 * Правило простое — результат описывает СУДЬБУ ПОПЫТКИ, а судьба зависит от
 * способа связи:
 *  • звонок: подняли трубку, не ответили, попали на голосовую почту;
 *  • отправленное сообщение: принято к отправке, доставлено, не доставлено,
 *    получен ответ;
 *  • ВХОДЯЩЕЕ сообщение: оно уже пришло — судьбы доставки у него нет, есть
 *    только «мы ответили»;
 *  • личный визит: человек пришёл, и единственное содержательное значение —
 *    «состоялось». Ни доставки, ни дозвона тут не бывает.
 *
 * `N_A` доступен везде: это «не отмечено», а не результат.
 */
const CALL_OUTCOMES = ["ANSWERED", "NO_ANSWER", "VOICEMAIL", "N_A"] as const;
const SENT_OUTCOMES = ["ACCEPTED", "DELIVERED", "FAILED", "REPLIED", "N_A"] as const;
const RECEIVED_OUTCOMES = ["REPLIED", "N_A"] as const;
const VISIT_OUTCOMES = ["N_A"] as const;

const OUTCOMES_BY_CHANNEL: Record<string, readonly string[]> = {
  PHONE_INBOUND: CALL_OUTCOMES,
  PHONE_OUTBOUND: CALL_OUTCOMES,
  SMS_OUTBOUND: SENT_OUTCOMES,
  EMAIL_OUTBOUND: SENT_OUTCOMES,
  WHATSAPP_OUTBOUND: SENT_OUTCOMES,
  TELEGRAM_OUTBOUND: SENT_OUTCOMES,
  MAX_OUTBOUND: SENT_OUTCOMES,
  SMS_INBOUND: RECEIVED_OUTCOMES,
  EMAIL_INBOUND: RECEIVED_OUTCOMES,
  WHATSAPP_INBOUND: RECEIVED_OUTCOMES,
  TELEGRAM_INBOUND: RECEIVED_OUTCOMES,
  MAX_INBOUND: RECEIVED_OUTCOMES,
  IN_PERSON: VISIT_OUTCOMES,
};

/**
 * Допустимые результаты для канала. Неизвестный канал (в том числе устаревшие
 * значения enum и «Другое») не ограничиваем: запретить больше, чем знаем, —
 * значит потерять запись, которую человек хотел сохранить.
 */
export function outcomesForChannel(channel: string): readonly string[] {
  return OUTCOMES_BY_CHANNEL[channel] ?? Object.keys(COMM_OUTCOME_LABELS);
}

/** Сочетаются ли канал и результат. Проверяется и на сервере: список в форме
 *  — подсказка, а не защита. */
export function isOutcomeAllowed(channel: string, outcome: string): boolean {
  return outcomesForChannel(channel).includes(outcome);
}

const PHONE_CHANNELS = new Set(["PHONE_INBOUND", "PHONE_OUTBOUND"]);
export function isPhoneChannel(channel: string): boolean {
  return PHONE_CHANNELS.has(channel);
}
