import { normalizeOem } from "@/lib/part-reference";

/**
 * Торговый SKU товара. Отделён от `Part.article` намеренно: артикул — это
 * OEM-номер детали, и он ОБЩИЙ у нового товара и у каждого б/у экземпляра той
 * же детали. Уникален именно SKU.
 *
 * Новый товар: SKU равен нормализованному артикулу.
 * Б/у экземпляр: артикул + суффикс `-U<N>`, где N — следующий свободный номер.
 */

/** SKU б/у экземпляра: артикул плюс `-U` и номер. */
export const USED_SKU_SUFFIX_RE = /-U\d+$/;

/**
 * Следующий свободный SKU для б/у экземпляра детали.
 *
 * Нумерация ТОЛЬКО растёт: номер проданного экземпляра не переиспользуется.
 * Строки проданных товаров остаются в базе (на них ссылается `PartOrderItem`
 * с `Restrict`), их SKU занят навсегда, и выдача «дырки» упёрлась бы в
 * уникальный индекс. Поэтому берётся максимум существующих номеров плюс один,
 * а не первый пропуск.
 *
 * @param article артикул детали в любом виде — нормализуется так же, как ключ
 *   справочника (`normalizeOem`), поэтому «A 463 421 00 98» и «A463-421-0098»
 *   дают одну и ту же серию.
 * @param existingSkus SKU, уже занятые в базе. Чужие и мусорные значения
 *   игнорируются; регистр не важен.
 *
 * ВНИМАНИЕ вызывающему: функция чистая, «прочитал → посчитал → вставил» НЕ
 * атомарно. Два менеджера, заводящие б/у одной детали одновременно, получат
 * один и тот же номер, и вторая вставка упадёт на уникальном индексе
 * Part_sku_key (P2002). Вставку обязательно оборачивать в retry: перечитать
 * занятые sku и позвать эту функцию заново.
 */
export function nextUsedSku(article: string, existingSkus: readonly string[]): string {
  const base = normalizeOem(article);
  if (!base) {
    throw new Error("nextUsedSku: пустой артикул");
  }

  const prefix = `${base}-U`;
  let maxSeen = 0;

  for (const raw of existingSkus) {
    if (typeof raw !== "string") continue;
    const sku = raw.trim().toUpperCase();
    if (!sku.startsWith(prefix)) continue;

    // Хвост после `-U` обязан быть целиком числом: «A463…-U12» считаем,
    // «A463…-UX» и «A463…-U» — мусор. Проверка на startsWith одна не спасает:
    // у артикула-соседа «A46342100981» тот же префикс не возникает, потому что
    // между базой и номером всегда стоит «-U».
    const tail = sku.slice(prefix.length);
    if (!/^\d+$/.test(tail)) continue;

    const n = Number.parseInt(tail, 10);
    if (Number.isSafeInteger(n) && n > maxSeen) maxSeen = n;
  }

  return `${prefix}${maxSeen + 1}`;
}

/** SKU нового товара — нормализованный артикул. */
export function newPartSku(article: string): string {
  const base = normalizeOem(article);
  if (!base) {
    throw new Error("newPartSku: пустой артикул");
  }
  return base;
}

/**
 * Условие поиска существующего товара при заведении НОВОГО.
 *
 * Проверяются ОБА ключа, и это не перестраховка — на ревью PR #96 дважды
 * ловили дефект от проверки одного:
 *  - только по `sku`: миграция залила его дословно, поэтому для артикулов с
 *    пунктуацией (15 из 70 позиций боевого каталога) ключ не совпадает с
 *    сохранённым — защита молча выключается, повторный импорт плодит дубли;
 *  - только по `article`: уникальный индекс стоит на нормализованном `sku`,
 *    поэтому «A463-421-0098» после «A4634210098» проходит проверку по тексту
 *    и падает на индексе.
 *
 * Обе колонки проиндексированы (`Part_article_idx`, `Part_sku_key`).
 * Последний рубеж — частичный уникальный индекс `Part_article_new_uq`.
 */
export function duplicateNewPartWhere(
  article: string,
  sku: string,
): { OR: Array<{ article: string; condition: "NEW" } | { sku: string }> } {
  return { OR: [{ article, condition: "NEW" }, { sku }] };
}
