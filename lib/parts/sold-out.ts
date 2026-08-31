/**
 * Снятие проданного б/у экземпляра с витрины.
 *
 * Б/у деталь физически одна: когда её остаток дошёл до нуля, это «продана», а
 * не «под заказ». Оставлять её в каталоге значит обещать покупателю то, чего
 * не существует. Новый товар ведёт себя ровно наоборот — он пополняемый, и
 * ноль у него законен.
 *
 * Строку товара при этом НЕ удаляем: на неё ссылается строка заказа со связью
 * Restrict, и удаление стёрло бы факт продажи. Гасим `isActive`.
 */

export interface SoldOutInput {
  condition: "NEW" | "USED" | "REFURBISHED";
  isActive: boolean;
  onHand: number;
}

export function shouldDeactivateSoldOut({
  condition,
  isActive,
  onHand,
}: SoldOutInput): boolean {
  if (!isActive) return false; // уже снят — повторная запись ни к чему
  if (condition === "NEW") return false; // пополняемый: ноль это «под заказ»
  return onHand <= 0;
}

/** Минимум, который нужен от клиента Prisma (клиент генерируется с @ts-nocheck). */
interface SoldOutClient {
  part: {
    findUnique(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
}

/**
 * Пересчитывает доступность позиции после движения остатка и гасит проданный
 * б/у экземпляр.
 *
 * Зовётся ПОСЛЕ фиксации движения и в той же транзакции: иначе между списанием
 * и снятием с витрины остаётся окно, в котором второй покупатель видит уже
 * проданную деталь. Идемпотентна — повторный вызов на погашенной позиции
 * ничего не делает.
 *
 * Сознательно НЕ живёт в ядре WMS: `Part.isActive` — это витрина, а ядро
 * оперирует только количествами и ничего не знает о состоянии товара.
 */
export async function syncSoldOutUsedPart(
  client: SoldOutClient,
  partId: string,
): Promise<boolean> {
  const part = (await client.part.findUnique({
    where: { id: partId },
    select: {
      condition: true,
      isActive: true,
      stockItems: { select: { quantity: true } },
    },
  })) as {
    condition: "NEW" | "USED" | "REFURBISHED";
    isActive: boolean;
    stockItems: Array<{ quantity: number }>;
  } | null;
  if (!part) return false;

  // Суммируем по всем складам: экземпляр может лежать не на складе по умолчанию.
  const onHand = part.stockItems.reduce((sum, s) => sum + s.quantity, 0);
  if (!shouldDeactivateSoldOut({ condition: part.condition, isActive: part.isActive, onHand })) {
    return false;
  }

  await client.part.update({ where: { id: partId }, data: { isActive: false } });
  return true;
}
