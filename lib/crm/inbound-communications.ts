import type { CommChannel } from "@/app/generated/prisma/client";

interface InboundCommunicationCopy {
  /** Sentence start used in an auto-created FOLLOW_UP task. */
  taskLead: string;
  /** Noun phrase used after a timestamp and for repeated messages. */
  eventNoun: string;
  /** Visible action in the task list. */
  openAction: string;
  /** Safe, channel-specific heading for staff notifications. */
  notificationLead: string;
}

/**
 * The single catalogue of inbound CRM channels.
 *
 * Queries, direction checks and channel-specific task copy all derive from
 * this object. Adding another inbound CommChannel therefore requires one edit,
 * rather than separate changes in the task query, timeline and UI wording.
 */
const INBOUND_COMMUNICATION_COPY = {
  PHONE_INBOUND: {
    taskLead: "Клиент позвонил",
    eventNoun: "звонок",
    openAction: "Открыть звонок",
    notificationLead: "Новый звонок от клиента",
  },
  SMS_INBOUND: {
    taskLead: "Клиент отправил SMS",
    eventNoun: "SMS",
    openAction: "Открыть SMS",
    notificationLead: "Новое SMS от клиента",
  },
  EMAIL_INBOUND: {
    taskLead: "Клиент ответил по email",
    eventNoun: "письмо",
    openAction: "Открыть письмо",
    notificationLead: "Новое письмо от клиента",
  },
  WHATSAPP_INBOUND: {
    taskLead: "Клиент написал в WhatsApp",
    eventNoun: "сообщение в WhatsApp",
    openAction: "Открыть сообщение в WhatsApp",
    notificationLead: "Новое сообщение в WhatsApp от клиента",
  },
  TELEGRAM_INBOUND: {
    taskLead: "Клиент написал в Telegram",
    eventNoun: "сообщение в Telegram",
    openAction: "Открыть сообщение в Telegram",
    notificationLead: "Новое сообщение в Telegram от клиента",
  },
  MAX_INBOUND: {
    taskLead: "Клиент написал в MAX",
    eventNoun: "сообщение в MAX",
    openAction: "Открыть сообщение в MAX",
    notificationLead: "Новое сообщение в MAX от клиента",
  },
} satisfies Partial<Record<CommChannel, InboundCommunicationCopy>>;

export type InboundCommChannel = keyof typeof INBOUND_COMMUNICATION_COPY;

export const INBOUND_COMM_CHANNELS = Object.freeze(
  Object.keys(INBOUND_COMMUNICATION_COPY) as InboundCommChannel[],
);

const INBOUND_COMM_CHANNEL_SET = new Set<string>(INBOUND_COMM_CHANNELS);

export function isInboundCommChannel(
  channel: string,
): channel is InboundCommChannel {
  return INBOUND_COMM_CHANNEL_SET.has(channel);
}

const GENERIC_INBOUND_COPY: InboundCommunicationCopy = {
  taskLead: "Клиент связался с нами",
  eventNoun: "сообщение",
  openAction: "Открыть сообщение",
  notificationLead: "Новое сообщение от клиента",
};

export function inboundCommunicationCopy(channel: string): InboundCommunicationCopy {
  return isInboundCommChannel(channel)
    ? INBOUND_COMMUNICATION_COPY[channel]
    : GENERIC_INBOUND_COPY;
}
