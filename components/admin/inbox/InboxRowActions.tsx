"use client";

import { useTransition } from "react";

import { ActionsMenu, type ActionsMenuItem } from "@/components/ui";
import {
  archiveInboxMessage,
  deleteInboxMessage,
  markInboxMessageSpam,
  restoreInboxMessage,
} from "@/app/actions/crm/inbox";
import { toast } from "@/lib/ui/toast";

/**
 * Действия над письмом прямо из списка, за меню «⋯».
 *
 * Иконки в ряд занимали место у темы и заставляли гадать, что делает каждая.
 * Меню называет действия словами и открывается по одному нажатию.
 *
 * Набор зависит от вкладки: в очереди письмо разбирают, в архиве и мусоре его
 * возвращают. Предлагать «в спам» тому, что уже в спаме, или «в архив» тому,
 * что уже в архиве, — значит заставлять оператора самому отсеивать бессмыслицу.
 *
 * Удаления как стирания здесь нет и не будет: ящик это переписка сервиса, а
 * «в корзину» — статус, из которого письмо возвращается.
 */
export function InboxRowActions({
  inboxMessageId,
  status,
}: {
  inboxMessageId: string;
  /** Активная вкладка — она и решает, что с письмом можно сделать. */
  status: string;
}): React.ReactElement | null {
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ error: string | null }>, done: string): void {
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(done);
    });
  }

  const toQueue: ActionsMenuItem = {
    label: "Вернуть в очередь",
    onSelect: () => run(() => restoreInboxMessage(inboxMessageId), "Вернули в очередь"),
  };
  const toArchive: ActionsMenuItem = {
    label: "В архив",
    onSelect: () => run(() => archiveInboxMessage(inboxMessageId), "В архиве"),
  };
  const toSpam: ActionsMenuItem = {
    label: "Отметить спамом",
    onSelect: () => run(() => markInboxMessageSpam(inboxMessageId), "Отмечено спамом"),
  };
  const toTrash: ActionsMenuItem = {
    label: "В корзину",
    danger: true,
    onSelect: () => run(() => deleteInboxMessage(inboxMessageId), "В корзине"),
  };

  const byTab: Record<string, ActionsMenuItem[]> = {
    // Очередь разбора: письмо нужно куда-то деть.
    PENDING: [toArchive, toSpam, toTrash],
    // Разобрано и сохранено: вернуть к разбору или всё-таки выбросить.
    ARCHIVED: [toQueue, toTrash],
    // Мусор: только пути назад.
    JUNK: [toQueue, toArchive],
  };

  // «Все письма» — это просмотр архива, включая чужую переписку, уже
  // привязанную к клиентам. Разбирать письмо надо в его собственной вкладке,
  // где видно, в каком оно состоянии.
  const items = byTab[status];
  if (!items) return null;

  // Блокируем контейнер, а не пункты: ActionsMenu отфильтровывает отключённые,
  // и при пустом списке исчезает целиком — меню пропадало бы прямо во время
  // действия, которое сам же оператор и запустил.
  return (
    <div className={`pr-3 pt-3 ${pending ? "opacity-50 pointer-events-none" : ""}`}>
      <ActionsMenu items={items} label="Действия" />
    </div>
  );
}
