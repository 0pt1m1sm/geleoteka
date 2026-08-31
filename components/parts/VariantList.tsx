import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { LinkPending } from "@/components/shared/LinkPending";

/** Вариант детали в том виде, в каком его показывает список. */
export interface VariantForList {
  id: string;
  sku: string;
  price: number;
  condition: "NEW" | "USED" | "REFURBISHED";
  conditionNote: string | null;
  originNote: string | null;
  stockItems: Array<{ quantity: number; reserved?: number }>;
}

export const CONDITION_LABEL: Record<VariantForList["condition"], string> = {
  NEW: "Новая",
  USED: "Б/у",
  REFURBISHED: "Восстановленная",
};

/**
 * Доступное к покупке количество.
 *
 * Для НЕ-НОВОЙ детали вычитается резерв: экземпляр в одном лице, удержанный
 * открытой сметой, купить нельзя, и показывать его как «в наличии» — значит
 * рекламировать недоступное всё время жизни сметы (решение Р8). Для нового
 * товара показ остаётся по остатку: он пополняем, и вычитать резерв там
 * означало бы пугать покупателя дефицитом, которого нет.
 */
export function availableQty(v: VariantForList): number {
  const si = v.stockItems[0];
  if (!si) return 0;
  const onHand = si.quantity;
  if (v.condition === "NEW") return onHand;
  return Math.max(0, onHand - (si.reserved ?? 0));
}

/**
 * Список вариантов одной детали — новый товар и б/у экземпляры вместе.
 *
 * Общий для карточки товара и страницы по номеру: показывать одну и ту же
 * деталь двумя разными способами значит гарантированно их рассинхронизировать,
 * а состояние и остаток здесь — то, ради чего покупатель и пришёл.
 *
 * `hrefFor` возвращает адрес варианта; `null` — для того, который открыт
 * сейчас (у него кнопки нет).
 */
export function VariantList({
  variants,
  hrefFor,
  currentSku,
  heading = "Варианты этой детали",
}: {
  variants: VariantForList[];
  hrefFor: (v: VariantForList) => string | null;
  currentSku?: string | null;
  heading?: string;
}): React.ReactElement | null {
  if (variants.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold mb-3">{heading}</h2>
      <div className="flex flex-col gap-3">
        {variants.map((v) => {
          const qty = availableQty(v);
          const current = currentSku != null && v.sku === currentSku;
          const href = current ? null : hrefFor(v);
          return (
            <div
              key={v.id}
              className={`card p-4 ${current ? "border-[var(--color-accent)]" : ""}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="badge text-xs">{CONDITION_LABEL[v.condition]}</span>
                    {current && (
                      <span className="text-xs text-[var(--foreground-muted)]">
                        вы смотрите этот
                      </span>
                    )}
                  </div>
                  {v.conditionNote && <p className="mt-2 text-sm">{v.conditionNote}</p>}
                  {v.originNote && (
                    <p className="mt-1 text-xs text-[var(--foreground-muted)]">{v.originNote}</p>
                  )}
                  <p className="mt-2 text-xs text-[var(--foreground-muted)]">
                    {qty > 0
                      ? `В наличии — ${qty} шт.`
                      : v.condition === "NEW"
                        ? "Под заказ"
                        : "Продан"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-[var(--color-accent)]">{formatPrice(v.price)}</p>
                  {href && (
                    <Link href={href} className="btn btn-secondary btn-sm mt-2 inline-block">
                      Открыть
                      <LinkPending />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
