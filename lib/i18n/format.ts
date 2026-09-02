/**
 * Форматирование денег и дат по настройкам арендатора.
 *
 * Раньше формат был зашит: `Intl.NumberFormat("ru-RU", { currency: "RUB" })` и
 * `Europe/Moscow` прямо в коде. Пока сервис один и он в России, разницы не
 * видно; со вторым арендатором в другой стране каждое такое место показывает
 * его клиентам рублёвую цену.
 *
 * Здесь функции ЧИСТЫЕ: настройки приходят аргументом. Это сделано ради
 * клиентских компонентов — они в базу не ходят, и настройки им спускают
 * сверху. Серверная обёртка, берущая настройки у арендатора, лежит рядом в
 * `server.ts`; разделение нужно, чтобы этот модуль оставался пригодным для
 * обеих сторон.
 */

/** Всё, что нужно знать о региональных настройках, чтобы что-то показать. */
export interface LocaleSettings {
  /** BCP 47, например `ru-RU` или `de-DE`. */
  locale: string;
  /** ISO 4217, например `RUB` или `EUR`. */
  currency: string;
  /** IANA, например `Europe/Moscow`. */
  timeZone: string;
}

/**
 * Сколько у валюты минорных единиц.
 *
 * Делить на сто «потому что копейки» — предположение, а не правило: у иены
 * минорных единиц нет вовсе, у кувейтского и бахрейнского динара их тысяча.
 * Ошибка тут не косметическая: цена в иенах, разделённая на сто, промахивается
 * в сто раз.
 *
 * Ответ спрашивается у самой платформы, а не у таблицы в коде: `Intl` знает
 * про валюты ровно то, что нужно, и знает актуально.
 */
export function minorUnitsPerMajor(currency: string): number {
  const digits = new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).resolvedOptions().maximumFractionDigits;
  // Тип допускает undefined, хотя для style: "currency" значение есть всегда.
  // Две минорные единицы — то, что верно для подавляющего большинства валют.
  return 10 ** (digits ?? 2);
}

/**
 * Показать сумму, хранящуюся в МИНОРНЫХ единицах.
 *
 * Именно так деньги и лежат в базе — целым числом, без плавающей точки. Делит
 * на минорные единицы этой валюты, а не на сто.
 */
export function formatMoneyMinor(minor: number, settings: LocaleSettings): string {
  return new Intl.NumberFormat(settings.locale, {
    style: "currency",
    currency: settings.currency,
  }).format(minor / minorUnitsPerMajor(settings.currency));
}

/**
 * Показать сумму, заданную в ОСНОВНЫХ единицах (рубли, евро).
 *
 * Существует потому, что часть кода считает в целых рублях и хранит их так же;
 * разбирать это здесь и сейчас — отдельная работа. Дробная часть скрывается,
 * если её нет: «45 000 ₽», а не «45 000,00 ₽».
 */
export function formatMoneyMajor(major: number, settings: LocaleSettings): string {
  const fraction = Number.isInteger(major) ? 0 : undefined;
  return new Intl.NumberFormat(settings.locale, {
    style: "currency",
    currency: settings.currency,
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  }).format(major);
}

/**
 * Показать дату в часовом поясе СЕРВИСА, а не читателя.
 *
 * Пояс закреплён намеренно. Сервер живёт в UTC, и без закрепления одна и та же
 * запись на 12:00 выглядела как 09:00 на серверной странице и как 12:00 в поле
 * ввода. Клиенту из другого пояса нужно знать, когда пригнать машину, а не что
 * покажут его собственные часы.
 */
export function formatDateTime(
  date: Date | string,
  settings: LocaleSettings,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  // dateStyle несовместим с покомпонентными настройками: Intl бросает
  // «Invalid option», а не игнорирует лишнее. Поэтому удобное умолчание
  // применяется, только если вызывающий не задал ни стиля, ни компонентов.
  const hasOwnShape =
    options !== undefined &&
    ("dateStyle" in options ||
      "timeStyle" in options ||
      "year" in options ||
      "month" in options ||
      "day" in options ||
      "hour" in options ||
      "minute" in options);
  return new Intl.DateTimeFormat(settings.locale, {
    ...(hasOwnShape ? {} : { dateStyle: "long" as const }),
    timeZone: settings.timeZone,
    ...options,
  }).format(d);
}

/**
 * Настройки для показа сумм КОНКРЕТНОГО документа.
 *
 * Документ выставлен в валюте на момент выставления, и она может отличаться от
 * текущей валюты сервиса. Локаль и часовой пояс при этом берутся у арендатора:
 * они про то, кто смотрит и где стоит сервис, а не про то, в чём выписан
 * документ — старую смету надо показывать в её валюте, но сегодняшними
 * разделителями разрядов.
 *
 * `null` в валюте документа значит «не записано»: так лежат строки, созданные
 * до появления колонки. Тогда берётся текущая валюта арендатора — для них это
 * и есть верный ответ.
 */
export function documentSettings(
  document: { currency?: string | null },
  tenant: LocaleSettings,
): LocaleSettings {
  return document.currency ? { ...tenant, currency: document.currency } : tenant;
}
