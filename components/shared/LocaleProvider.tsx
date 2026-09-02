"use client";

import { createContext, useContext } from "react";

import {
  DEFAULT_LOCALE_SETTINGS,
  documentSettings,
  formatDateTime,
  formatMoneyMajor,
  formatMoneyMinor,
  type LocaleSettings,
} from "@/lib/i18n/format";

/**
 * Региональные настройки для клиентских компонентов.
 *
 * Серверный компонент берёт их у арендатора (`lib/i18n/server.ts`), клиентский
 * в базу не ходит — значит настройки надо спустить. Спускаются один раз в
 * корневой разметке; дальше любой клиентский компонент берёт их отсюда, вместо
 * того чтобы вписывать локаль и знак валюты литералами.
 *
 * Значение по умолчанию — не «на всякий случай», а честный ответ на вопрос
 * «что показывать, если провайдера в дереве нет». Компонент, отрисованный вне
 * разметки (тест, изолированный сторибук), не должен падать из-за формата
 * цены. Совпадает с тем, что было зашито до появления этого модуля.
 */
const LocaleContext = createContext<LocaleSettings>(DEFAULT_LOCALE_SETTINGS);

export function LocaleProvider({
  settings,
  children,
}: {
  settings: LocaleSettings;
  children: React.ReactNode;
}): React.ReactElement {
  return <LocaleContext.Provider value={settings}>{children}</LocaleContext.Provider>;
}

/** Настройки арендатора: язык, валюта, часовой пояс. */
export function useLocale(): LocaleSettings {
  return useContext(LocaleContext);
}

/**
 * Готовые форматировщики, уже знающие настройки.
 *
 * Существует потому, что вызов `formatMoneyMinor(x, useLocale())` в каждой
 * строке разметки читается хуже, чем `money(x)`, а забыть передать настройки
 * легче, чем кажется — и тогда цена молча становится рублёвой.
 */
export function useFormat(): {
  money: (minor: number, currency?: string | null) => string;
  moneyMajor: (major: number, currency?: string | null) => string;
  dateTime: (date: Date | string, options?: Intl.DateTimeFormatOptions) => string;
} {
  const settings = useLocale();
  return {
    money: (minor, currency) => formatMoneyMinor(minor, documentSettings({ currency }, settings)),
    moneyMajor: (major, currency) =>
      formatMoneyMajor(major, documentSettings({ currency }, settings)),
    dateTime: (date, options) => formatDateTime(date, settings, options),
  };
}
