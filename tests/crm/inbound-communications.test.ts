import { describe, expect, it } from "vitest";

import { CommChannel } from "@/app/generated/prisma/client";

import {
  inboundCommunicationCopy,
  INBOUND_COMM_CHANNELS,
  isInboundCommChannel,
} from "@/lib/crm/inbound-communications";

describe("inbound CRM communication catalogue", () => {
  it("contains every directional inbound channel and no outbound channel", () => {
    const generatedInboundChannels = Object.values(CommChannel)
      .filter((channel) => channel.endsWith("_INBOUND"))
      .sort();

    expect([...INBOUND_COMM_CHANNELS].sort()).toEqual(generatedInboundChannels);
    expect(isInboundCommChannel("EMAIL_OUTBOUND")).toBe(false);
  });

  it("uses copy specific to the concrete inbound channel", () => {
    expect(inboundCommunicationCopy("EMAIL_INBOUND").openAction).toBe("Открыть письмо");
    expect(inboundCommunicationCopy("WHATSAPP_INBOUND").openAction).toBe(
      "Открыть сообщение в WhatsApp",
    );
    expect(inboundCommunicationCopy("TELEGRAM_INBOUND").openAction).toBe(
      "Открыть сообщение в Telegram",
    );
    expect(inboundCommunicationCopy("PHONE_INBOUND").openAction).toBe("Открыть звонок");
  });

  it("falls back to neutral message copy for an unknown future value", () => {
    expect(inboundCommunicationCopy("FUTURE_INBOUND")).toEqual({
      taskLead: "Клиент связался с нами",
      eventNoun: "сообщение",
      openAction: "Открыть сообщение",
    });
  });
});
