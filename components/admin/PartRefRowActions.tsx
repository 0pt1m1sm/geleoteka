"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionsMenu, type ActionsMenuItem } from "@/components/ui";
import { useProgressRouter } from "@/components/shared/NavigationProgressProvider";
import { deletePartReference } from "@/app/actions/part-references";
import { confirm } from "@/lib/ui/confirm";
import { toast } from "@/lib/ui/toast";

/** Переход из меню строки: подпись и адрес. */
export interface PartRefRowLink {
  label: string;
  href: string;
}

/**
 * Переходы, которые предлагает строка справочника.
 *
 * Вынесено из компонента отдельной функцией, чтобы состав меню можно было
 * проверить тестом: главное здесь не оформление, а то, что завести б/у
 * экземпляр можно из ЛЮБОЙ строки. Раньше у позиции с уже заведённым новым
 * товаром строка предлагала только его открыть, и путь к б/у существовал
 * лишь через карточку позиции — мимо главного сценария разбора.
 */
export function partRefRowLinks(id: string, shopPartId: string | null): PartRefRowLink[] {
  return [
    shopPartId
      ? { label: "Открыть товар", href: `/admin/parts/${shopPartId}` }
      : { label: "Создать товар", href: `/admin/parts/new?ref=${id}` },
    { label: "Добавить б/у экземпляр", href: `/admin/parts/new?ref=${id}&condition=USED` },
  ];
}

/**
 * Действия строки справочника, собранные в одно меню «⋯».
 *
 * До этого строка несла три отдельных элемента управления — «Б/у», «Создать
 * товар» и корзину. На телефоне они забирали больше половины ширины, и
 * название приходилось обрезать до «Глушитель задни…»: у списка, где ищут
 * позицию глазами по названию, обрезалось ровно то, ради чего в него смотрят.
 * Меню оставляет строке одну кнопку и отдаёт названию всю ширину.
 *
 * Заодно набор действий стал одинаковым для любой строки. Раньше у позиции,
 * где новый товар уже заведён, из списка не было пути завести б/у экземпляр —
 * только через карточку позиции, хотя это главный сценарий разбора.
 */
export function PartRefRowActions({
  id,
  name,
  shopPartId,
}: {
  id: string;
  name: string;
  /** Новый товар этой номенклатуры, если он уже есть в магазине. */
  shopPartId: string | null;
}): React.ReactElement {
  const router = useRouter();
  const nav = useProgressRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete(): void {
    // Подтверждение спрашивается ДО перехода, а не внутри него: иначе
    // «занято» висит всё время, пока диалог ждёт ответа человека.
    void (async () => {
      if (!(await confirm({ message: `Удалить «${name}» из справочника?` }))) return;
      startTransition(async () => {
        const res = await deletePartReference(id);
        if (res.error) {
          toast.error(res.error);
          return;
        }
        router.refresh();
      });
    })();
  }

  const items: ActionsMenuItem[] = [
    ...partRefRowLinks(id, shopPartId).map((l) => ({
      label: l.label,
      onSelect: () => nav.push(l.href),
    })),
    { label: "Удалить из справочника", onSelect: handleDelete, danger: true },
  ];

  return (
    // Гасим меню целиком на время удаления, а не каждый пункт по отдельности:
    // так же, как в InboxRowActions.
    <div className={pending ? "pointer-events-none opacity-50" : undefined}>
      <ActionsMenu items={items} label={`Действия: ${name}`} />
    </div>
  );
}
