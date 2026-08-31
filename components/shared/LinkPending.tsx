"use client";

import { useLinkStatus } from "next/link";

/**
 * Индикатор ожидания внутри `<Link>`.
 *
 * Зачем. Отклик на клик по ссылке в каталоге раньше давал `loading.tsx`, но его
 * пришлось удалить: он заставлял Next стримить ответ, из-за чего статус
 * фиксировался ДО того, как страница успевала сказать «не найдено» или
 * «перенаправить». Несуществующий товар отдавал 200 вместо 404, а редирект
 * варианта превращался в meta refresh с секундной задержкой.
 *
 * Вместе со скелетоном ушёл и отклик: глобальный NavigationProgress по
 * собственной документации обслуживает только программную навигацию и клики по
 * `<Link>` не покрывает. На двух самых посещаемых публичных страницах переход
 * стал беззвучным.
 *
 * `useLinkStatus` закрывает ровно этот случай — документация Next называет его
 * подходящим, когда маршрут динамический И у него нет `loading.js`. Компонент
 * рендерится ВНУТРИ `<Link>` и знает про ожидание именно своей ссылки.
 */
export function LinkPending(): React.ReactElement | null {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <span
      role="status"
      aria-label="Загрузка"
      className="inline-block w-3 h-3 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin align-middle"
    />
  );
}
