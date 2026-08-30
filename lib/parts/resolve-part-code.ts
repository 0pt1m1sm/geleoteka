/**
 * Разрешение отсканированного или введённого кода в конкретный товар.
 *
 * Зачем отдельный модуль. До вариантов товара `Part.article` был уникален, и
 * весь складской контур обходился `findFirst({ where: { article } })` — он был
 * детерминирован по построению. Story 1 сняла эту уникальность (у детали
 * появились новый товар и б/у экземпляры с одним номером), и восемь мест
 * молча стали недетерминированными: Postgres возвращает произвольную строку,
 * а порядок меняется после любого UPDATE. Последствие на складе — списание
 * остатка с чужой позиции: клиент получает б/у деталь по цене новой либо
 * наоборот.
 *
 * Правило зависит от ИСТОЧНИКА кода, и это не формальность:
 *
 *  - `label` — код с НАШЕЙ этикетки (`WMS:PART:<sku>`). Он указывает на
 *    конкретный экземпляр, поэтому точный `sku` разрешается без оговорок.
 *
 *  - `raw` — человек ввёл или отсканировал что-то другое, чаще всего номер,
 *    прочитанный С САМОЙ ДЕТАЛИ. Производитель штампует один и тот же номер и
 *    на новой детали, и на б/у, поэтому такой код физически не различает
 *    варианты. Если номер принадлежит нескольким позициям — это
 *    неоднозначность, даже когда он совпал с чьим-то `sku`. Молча выбрать
 *    новую позицию значит списать остаток не с той строки.
 *
 * В обоих случаях «нашлось несколько» — не повод взять первую.
 */

export interface PartCodeLookupPort {
  /** Точное совпадение по уникальному торговому идентификатору. */
  findBySku(sku: string): Promise<{ id: string } | null>;
  /** ВСЕ позиции с таким номером детали — и новые, и б/у. */
  findByArticle(article: string): Promise<Array<{ id: string }>>;
}

export type PartCodeResolution =
  | { status: "found"; partId: string }
  | { status: "ambiguous"; article: string; count: number }
  | { status: "not_found" };

/** Текст для оператора, когда номер детали не определяет позицию однозначно. */
export function ambiguousCodeMessage(article: string, count: number): string {
  return (
    `Номер ${article} есть у ${count} позиций (новая и б/у) — ` +
    `отсканируйте этикетку нужного экземпляра, на ней код с суффиксом`
  );
}

/** Откуда пришёл код. См. правило в шапке модуля — оно разное. */
export type PartCodeSource = "label" | "raw";

export async function resolvePartIdByCode(
  port: PartCodeLookupPort,
  rawCode: string,
  source: PartCodeSource = "raw",
): Promise<PartCodeResolution> {
  const code = rawCode.trim();
  if (!code) return { status: "not_found" };

  if (source === "label") {
    const bySku = await port.findBySku(code);
    if (bySku) return { status: "found", partId: bySku.id };
  }

  const byArticle = await port.findByArticle(code);
  if (byArticle.length > 1) {
    return { status: "ambiguous", article: code, count: byArticle.length };
  }
  if (byArticle.length === 1) return { status: "found", partId: byArticle[0].id };

  // Для raw sku проверяем последним: номер детали важнее, а до сюда доходят
  // только коды, которые ни одному артикулу не принадлежат (например, sku
  // б/у экземпляра, введённый вручную).
  const bySku = await port.findBySku(code);
  if (bySku) return { status: "found", partId: bySku.id };

  return { status: "not_found" };
}

/**
 * Порт поверх Prisma. Отдельная функция, потому что резолвер вызывается из
 * восьми мест и все они обязаны разрешать код одинаково — иначе один забытый
 * `findFirst({ where: { article } })` вернёт недетерминизм обратно.
 */
// Клиент Prisma генерируется с @ts-nocheck, поэтому точный тип делегата сюда
// не подтягивается — принимаем минимальную структуру и приводим на месте, как
// это делается в остальном коде проекта (см. .claude/rules/geleoteka-conventions.md).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function prismaPartCodePort(client: any): PartCodeLookupPort {
  return {
    findBySku: async (sku) =>
      (await client.part.findUnique({ where: { sku }, select: { id: true } })) as
        | { id: string }
        | null,
    // Без фильтра по isActive: снятый с витрины товар физически на складе
    // остаётся и обязан сканироваться (размещение, перемещение, пересчёт).
    findByArticle: async (article) =>
      (await client.part.findMany({ where: { article }, select: { id: true } })) as Array<{
        id: string;
      }>,
  };
}
