import { describe, expect, it } from "vitest";
import {
  COMM_OUTCOME_LABELS,
  isOutcomeAllowed,
  outcomesForChannel,
} from "@/lib/crm-labels";

/**
 * Результат общения обязан подходить каналу.
 *
 * Раньше список был один на всё, и для личного визита предлагалось «не
 * ответил», «голосовая почта», «не доставлено». Менеджер выбирает из того, что
 * видит, поэтому в истории клиента оседала бессмыслица — а по ней потом
 * считают статистику.
 */
describe("outcomesForChannel", () => {
  it("ЛИЧНЫЙ ВИЗИТ: ни дозвона, ни доставки — человек пришёл", () => {
    const allowed = outcomesForChannel("IN_PERSON");
    for (const nonsense of ["NO_ANSWER", "VOICEMAIL", "DELIVERED", "FAILED", "ACCEPTED"]) {
      expect(allowed, nonsense).not.toContain(nonsense);
    }
  });

  it("звонок: судьба дозвона, но не доставки", () => {
    for (const ch of ["PHONE_INBOUND", "PHONE_OUTBOUND"]) {
      const allowed = outcomesForChannel(ch);
      expect(allowed, ch).toContain("ANSWERED");
      expect(allowed, ch).toContain("NO_ANSWER");
      expect(allowed, ch).toContain("VOICEMAIL");
      expect(allowed, ch).not.toContain("DELIVERED");
      expect(allowed, ch).not.toContain("FAILED");
    }
  });

  it("ОТПРАВЛЕННОЕ сообщение: судьба доставки, но не дозвона", () => {
    for (const ch of ["SMS_OUTBOUND", "EMAIL_OUTBOUND", "TELEGRAM_OUTBOUND", "WHATSAPP_OUTBOUND"]) {
      const allowed = outcomesForChannel(ch);
      expect(allowed, ch).toContain("DELIVERED");
      expect(allowed, ch).toContain("FAILED");
      expect(allowed, ch).not.toContain("ANSWERED");
      expect(allowed, ch).not.toContain("VOICEMAIL");
    }
  });

  it("ВХОДЯЩЕЕ сообщение: оно уже пришло, судьбы доставки у него нет", () => {
    for (const ch of ["SMS_INBOUND", "EMAIL_INBOUND", "TELEGRAM_INBOUND"]) {
      const allowed = outcomesForChannel(ch);
      expect(allowed, ch).not.toContain("DELIVERED");
      expect(allowed, ch).not.toContain("FAILED");
      expect(allowed, ch).not.toContain("NO_ANSWER");
    }
  });

  it("«не отмечено» доступно везде — это отсутствие результата, а не результат", () => {
    for (const ch of ["IN_PERSON", "PHONE_INBOUND", "SMS_OUTBOUND", "EMAIL_INBOUND", "OTHER"]) {
      expect(outcomesForChannel(ch), ch).toContain("N_A");
    }
  });

  it("неизвестный канал НЕ ограничиваем", () => {
    // Запретить больше, чем знаем, — значит потерять запись, которую человек
    // хотел сохранить. Сюда попадают «Другое» и устаревшие значения enum,
    // оставленные ради читаемости старых строк.
    for (const ch of ["OTHER", "TELEGRAM", "EMAIL", "ЧТО-ТО-НОВОЕ"]) {
      expect(outcomesForChannel(ch).length, ch).toBe(Object.keys(COMM_OUTCOME_LABELS).length);
    }
  });

  it("каждый допустимый результат имеет подпись — иначе в списке пусто", () => {
    for (const ch of ["IN_PERSON", "PHONE_OUTBOUND", "SMS_OUTBOUND", "EMAIL_INBOUND"]) {
      for (const o of outcomesForChannel(ch)) {
        expect(COMM_OUTCOME_LABELS[o], `${ch}/${o}`).toBeTruthy();
      }
    }
  });
});

describe("isOutcomeAllowed — проверка на сервере", () => {
  it("отвергает бессмыслицу, которую можно прислать мимо формы", () => {
    // Форма клиентская: список в ней подсказка, а не защита.
    expect(isOutcomeAllowed("IN_PERSON", "FAILED")).toBe(false);
    expect(isOutcomeAllowed("PHONE_OUTBOUND", "DELIVERED")).toBe(false);
    expect(isOutcomeAllowed("EMAIL_INBOUND", "VOICEMAIL")).toBe(false);
  });

  it("пропускает осмысленное", () => {
    expect(isOutcomeAllowed("IN_PERSON", "N_A")).toBe(true);
    expect(isOutcomeAllowed("PHONE_OUTBOUND", "NO_ANSWER")).toBe(true);
    expect(isOutcomeAllowed("SMS_OUTBOUND", "DELIVERED")).toBe(true);
  });
});
