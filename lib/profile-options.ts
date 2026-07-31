/**
 * Варианты для профиля: часовой пояс и язык.
 *
 * Живёт здесь, а не рядом с действием: модуль с `"use server"` умеет
 * экспортировать только async-функции, поэтому общая константа обязана лежать
 * в обычном файле — та же причина, что у lib/roles.ts.
 */

/** Языки, между которыми есть смысл выбирать. Список закрытый — свободная
 *  строка означала бы «ru-RU», «русский» и «ru» в одной колонке. */
export const LOCALES = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
] as const;

/**
 * Часовые пояса, в которых реально бывают клиенты сервиса. Полный список IANA
 * (600+ зон) в выпадающем списке — это не выбор, а поиск иголки.
 */
export const TIME_ZONES = [
  { value: "Europe/Kaliningrad", label: "Калининград (UTC+2)" },
  { value: "Europe/Moscow", label: "Москва (UTC+3)" },
  { value: "Europe/Samara", label: "Самара (UTC+4)" },
  { value: "Asia/Yekaterinburg", label: "Екатеринбург (UTC+5)" },
  { value: "Asia/Omsk", label: "Омск (UTC+6)" },
  { value: "Asia/Krasnoyarsk", label: "Красноярск (UTC+7)" },
  { value: "Asia/Irkutsk", label: "Иркутск (UTC+8)" },
  { value: "Asia/Yakutsk", label: "Якутск (UTC+9)" },
  { value: "Asia/Vladivostok", label: "Владивосток (UTC+10)" },
  { value: "Asia/Magadan", label: "Магадан (UTC+11)" },
  { value: "Asia/Kamchatka", label: "Камчатка (UTC+12)" },
] as const;
