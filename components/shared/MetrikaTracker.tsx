"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Клиентская часть счётчика Метрики: загрузка tag.js + ручные хиты.
 *
 * Официальный рецепт Яндекса для SPA (support/metrica/code/counter-spa-setup):
 * init с defer:true отключает автоматический просмотр, и каждый показ страницы
 * отправляется вручную через ym('hit'). Мы шлём хит на каждую смену pathname —
 * но компонент смонтирован ТОЛЬКО в (public)/layout, поэтому учитываются
 * исключительно публичные страницы. Переходы в админку/кабинет идут обычной
 * ссылкой <a> (полная загрузка) — tag.js умирает вместе с документом и не
 * может утащить внутренние URL в статистику, как это было при SPA-переходе.
 */

type YmFn = ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number };

declare global {
  interface Window {
    ym?: YmFn;
    __metrikaLoaded?: boolean;
  }
}

export function MetrikaTracker({ id }: { id: number }): null {
  const pathname = usePathname();

  useEffect(() => {
    if (window.__metrikaLoaded) return;
    window.__metrikaLoaded = true;
    if (!window.ym) {
      const queue: YmFn = (...args: unknown[]) => {
        queue.a = queue.a || [];
        queue.a.push(args);
      };
      queue.l = Date.now();
      window.ym = queue;
    }
    if (!document.querySelector('script[src="https://mc.yandex.ru/metrika/tag.js"]')) {
      const script = document.createElement("script");
      script.async = true;
      script.src = "https://mc.yandex.ru/metrika/tag.js";
      document.head.appendChild(script);
    }
    window.ym(id, "init", {
      defer: true,
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
    });
  }, [id]);

  useEffect(() => {
    window.ym?.(id, "hit", window.location.href);
  }, [id, pathname]);

  return null;
}
