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
  /** Состояние письма: PENDING/ARCHIVED/SPAM/DELETED или JUNK из вкладки. */
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

  const byState: Record<string, ActionsMenuItem[]> = {
    // Очередь разбора: письмо нужно куда-то деть.
    PENDING: [toArchive, toSpam, toTrash],
    // Разобрано и сохранено: вернуть к разбору или всё-таки выбросить.
    ARCHIVED: [toQueue, toTrash],
    // Мусор: только пути назад.
    JUNK: [toQueue, toArchive],
  };

  // Набор следует СОСТОЯНИЮ письма, а не вкладке. Во «Всех письмах» лежит всё
  // вперемешку, и увидев там спам, который спамом не является, исправить его
  // надо на месте, а не искать в другой вкладке.
  //
  // Спам и корзина ведут себя одинаково — это два способа сказать «не нужно», и
  // пути назад у них общие.
  const state = status === "SPAM" || status === "DELETED" ? "JUNK" : status;

  // ASSIGNED — письмо уже привязано к клиенту и лежит в его переписке.
  // Разбирать нечего, поэтому меню нет вовсе.
  const items = byState[state];
  if (!items) return null;

  // Блокируем контейнер, а не пункты: ActionsMenu отфильтровывает отключённые,
  // и при пустом списке исчезает целиком — меню пропадало бы прямо во время
  // действия, которое сам же оператор и запустил.
  return (
    <div className={`pr-3 pb-3 ${pending ? "opacity-50 pointer-events-none" : ""}`}>
      <ActionsMenu items={items} label="Действия" />
    </div>
  );
}
