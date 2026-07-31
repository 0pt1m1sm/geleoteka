"use client";

import { useTransition } from "react";
import { Archive, Ban, RotateCcw, Trash2 } from "lucide-react";

import {
  archiveInboxMessage,
  deleteInboxMessage,
  markInboxMessageSpam,
  restoreInboxMessage,
} from "@/app/actions/crm/inbox";
import { toast } from "@/lib/ui/toast";

/**
 * Разбор письма прямо из списка.
 *
 * Раньше убрать письмо из очереди можно было, только открыв его. Шесть тестовых
 * писем — это шесть заходов туда и обратно, поэтому очередь и не разгребалась.
 *
 * Кнопки живут РЯДОМ со ссылкой на письмо, а не внутри неё: вложенные
 * интерактивные элементы недопустимы, да и промахнуться по «в спам», целясь
 * открыть письмо, никто не должен.
 *
 * Удаления здесь нет намеренно — см. archiveInboxMessage: письмо остаётся в
 * ящике сервиса, из очереди уходит только его статус.
 */
export function InboxRowActions({
  inboxMessageId,
  status,
}: {
  inboxMessageId: string;
  /** Текущая вкладка: у разобранного письма другой набор действий. */
  status: string;
}): React.ReactElement {
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

  // Разобранному письму нужен один обратный ход, а не весь набор: предлагать
  // «в спам» тому, что уже в спаме, незачем.
  if (status !== "PENDING") {
    return (
      <div className="flex items-center gap-1 shrink-0 pr-3 pt-3">
        <button
          type="button"
          onClick={() => run(() => restoreInboxMessage(inboxMessageId), "Вернули в очередь")}
          disabled={pending}
          className="btn-icon"
          title="Вернуть в очередь разбора"
          aria-label="Вернуть в очередь"
        >
          <RotateCcw size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 shrink-0 pr-3 pt-3">
      <button
        type="button"
        onClick={() => run(() => archiveInboxMessage(inboxMessageId), "В архиве")}
        disabled={pending}
        className="btn-icon"
        title="В архив — письмо останется в ящике, но уйдёт из очереди"
        aria-label="В архив"
      >
        <Archive size={15} />
      </button>
      <button
        type="button"
        onClick={() => run(() => markInboxMessageSpam(inboxMessageId), "Отмечено спамом")}
        disabled={pending}
        className="btn-icon text-[var(--color-error)]"
        title="Спам"
        aria-label="Спам"
      >
        <Ban size={15} />
      </button>
      <button
        type="button"
        onClick={() => run(() => deleteInboxMessage(inboxMessageId), "В корзине")}
        disabled={pending}
        className="btn-icon"
        title="В корзину — письмо можно вернуть"
        aria-label="В корзину"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
