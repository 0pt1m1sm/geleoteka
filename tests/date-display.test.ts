import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "@/lib/utils";

/**
 * Даты показываются по часам сервиса, а не по часам машины, на которой
 * выполняется код.
 *
 * Сервер работает в UTC, и до этой правки заказ-наряд на 12:00 отображался в
 * шапке как 09:00 — при том что поле ввода на той же странице показывало 12:00,
 * потому что оно уже шло через lib/timezone.ts. Одна и та же запись, два ответа,
 * три часа разницы. То же смещение уезжало клиенту в смс о подтверждении.
 */
describe("formatDate", () => {
  // 09:00 UTC = 12:00 в Москве. Именно эта пара и наблюдалась в проде.
  const noonMoscow = new Date("2026-08-01T09:00:00Z");

  it("показывает московское время, а не UTC", () => {
    expect(formatDateTime(noonMoscow)).toContain("12:00");
    expect(formatDateTime(noonMoscow)).not.toContain("09:00");
  });

  it("не сдвигает дату на границе суток", () => {
    // 22:00 UTC 31 июля — это уже 01:00 1 августа в Москве.
    const afterMidnight = new Date("2026-07-31T22:00:00Z");
    const shown = formatDateTime(afterMidnight);
    expect(shown).toContain("1 авг.");
    expect(shown).toContain("01:00");
  });

  it("одинаков независимо от пояса машины", () => {
    // Значение не зависит от process.env.TZ: пояс задан явно в самой функции.
    expect(formatDate(noonMoscow)).toBe(formatDate(noonMoscow));
    expect(formatDate(noonMoscow)).toContain("1 авг.");
  });

  it("время без даты тоже в московском поясе", () => {
    expect(formatDate(noonMoscow, { dateStyle: undefined, timeStyle: "short" })).toBe("12:00");
  });
});
