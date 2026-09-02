import { describe, expect, it } from "vitest";

import {
  documentSettings,
  formatDateTime,
  formatMoneyMajor,
  formatMoneyMinor,
  minorUnitsPerMajor,
  type LocaleSettings,
} from "@/lib/i18n/format";

const RU: LocaleSettings = { locale: "ru-RU", currency: "RUB", timeZone: "Europe/Moscow" };
const DE: LocaleSettings = { locale: "de-DE", currency: "EUR", timeZone: "Europe/Berlin" };
const JP: LocaleSettings = { locale: "ja-JP", currency: "JPY", timeZone: "Asia/Tokyo" };
// Локаль намеренно английская: арабская пишет цифры восточными знаками, и
// проверка превратилась бы в проверку начертания вместо деления на тысячу.
const KW: LocaleSettings = { locale: "en-US", currency: "KWD", timeZone: "Asia/Kuwait" };

/** Пробелы у Intl неразрывные и разных сортов — сравнивать по ним бессмысленно. */
const flat = (s: string): string => s.replace(/[\s  ]/g, "");

describe("минорные единицы валюты", () => {
  it("сотая доля у обычных валют", () => {
    expect(minorUnitsPerMajor("RUB")).toBe(100);
    expect(minorUnitsPerMajor("EUR")).toBe(100);
    expect(minorUnitsPerMajor("USD")).toBe(100);
  });

  it("у иены минорных единиц нет", () => {
    // Ровно тот случай, ради которого функция и существует: разделив на сто,
    // мы показали бы японскому клиенту цену в сто раз меньше настоящей.
    expect(minorUnitsPerMajor("JPY")).toBe(1);
  });

  it("у кувейтского динара их тысяча", () => {
    expect(minorUnitsPerMajor("KWD")).toBe(1000);
  });
});

describe("деньги из минорных единиц", () => {
  it("рубли: 4 500 000 копеек — это 45 000 ₽", () => {
    expect(flat(formatMoneyMinor(4_500_000, RU))).toBe("45000,00₽");
  });

  it("евро в немецкой локали", () => {
    expect(flat(formatMoneyMinor(4_500_000, DE))).toBe("45.000,00€");
  });

  it("иена не делится на сто", () => {
    // 45 000 в базе — это 45 000 иен, а не 450.
    expect(formatMoneyMinor(45_000, JP)).toContain("45,000");
  });

  it("кувейтский динар делится на тысячу", () => {
    // 45 000 филсов — это 45 динаров, и у динара три знака после запятой.
    expect(formatMoneyMinor(45_000, KW)).toContain("45.000");
  });
});

describe("деньги из основных единиц", () => {
  it("целое показывается без дробной части", () => {
    expect(flat(formatMoneyMajor(45_000, RU))).toBe("45000₽");
  });

  it("дробное показывается с ней", () => {
    expect(flat(formatMoneyMajor(45_000.5, RU))).toBe("45000,50₽");
  });

  it("валюта берётся из настроек, а не зашита", () => {
    expect(formatMoneyMajor(45_000, DE)).toContain("€");
    expect(formatMoneyMajor(45_000, DE)).not.toContain("₽");
  });
});

describe("дата в поясе сервиса", () => {
  const instant = new Date("2026-09-02T09:00:00.000Z");

  it("московский сервис показывает полдень", () => {
    expect(formatDateTime(instant, RU, { hour: "2-digit", minute: "2-digit" })).toContain("12:00");
  });

  it("берлинский сервис показывает одиннадцать", () => {
    expect(formatDateTime(instant, DE, { hour: "2-digit", minute: "2-digit" })).toContain("11:00");
  });

  it("покомпонентные настройки не ломают формат", () => {
    // dateStyle несовместим с покомпонентными опциями: Intl бросает, а не
    // игнорирует. Умолчание обязано отступать, иначе роняет страницу целиком.
    expect(() => formatDateTime(instant, RU, { year: "numeric" })).not.toThrow();
  });
});

describe("валюта документа", () => {
  it("документ в своей валюте показывается в ней, а не в текущей", () => {
    // Сервис перешёл на евро, старая смета выписана в рублях.
    const settings = documentSettings({ currency: "RUB" }, DE);
    const shown = formatMoneyMinor(4_500_000, settings);
    // В немецкой локали рубль пишется кодом, а не знаком — и это правильно:
    // знак ₽ немецкому читателю ничего не говорит. Важно, что не евро.
    expect(shown).toContain("RUB");
    expect(shown).not.toContain("€");
  });

  it("локаль и пояс остаются арендаторскими", () => {
    // Валюта — свойство документа, разделители разрядов — свойство читателя.
    const settings = documentSettings({ currency: "RUB" }, DE);
    expect(settings.locale).toBe("de-DE");
    expect(settings.timeZone).toBe("Europe/Berlin");
    expect(flat(formatMoneyMinor(4_500_000, settings))).toBe("45.000,00RUB");
  });

  it("не записанная валюта означает текущую валюту арендатора", () => {
    expect(documentSettings({ currency: null }, DE).currency).toBe("EUR");
    expect(documentSettings({}, DE).currency).toBe("EUR");
  });
});
