import { getSetting } from "@/lib/settings";

/**
 * Карточка сервиса в Яндекс Картах.
 *
 * Раньше здесь стоял идентификатор организации Гелеотеки — числом, в коде
 * платформы. Второй арендатор показал бы у себя на сайте чужие отзывы и вёл бы
 * посетителей на чужую карточку. Это не настройка не на месте, это подмена
 * данных, поэтому идентификатор теперь берётся у арендатора.
 *
 * Не настроено — блока отзывов на сайте нет. Пустой блок с чужими отзывами
 * хуже, чем отсутствие блока.
 */

/** Ссылка на карточку организации для кнопки «Все отзывы». `null` — не настроено. */
export async function yandexProfileUrl(): Promise<string | null> {
  const url = (await getSetting("YANDEX_MAPS_PROFILE_URL"))?.trim();
  return url ? url : null;
}

/**
 * Адрес виджета отзывов. Виджет живёт на yandex.ru независимо от языка
 * карточки. `null` — идентификатор организации не задан.
 */
export async function yandexReviewsIframeUrl(): Promise<string | null> {
  const orgId = (await getSetting("YANDEX_MAPS_ORG_ID"))?.trim();
  if (!orgId) return null;
  return `https://yandex.ru/maps-reviews-widget/${encodeURIComponent(orgId)}?comments`;
}
