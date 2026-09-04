"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Клиентская часть счётчика Метрики: загрузка tag.js + ручные хиты.
 *
 * Официальный рецепт Яндекса для SPA (support/metrica/code/counter-spa-setup):
 * init с defer:true отключает автоматический просмотр, и каждый показ страницы
 * отправляется вручную через ym('hit').
 *
 * Компонент смонтирован только в (public)/layout — но «публичный» не значит
 * «можно отправлять наружу». В публичной группе лежат страницы входа и
 * страница сметы по ссылке, и обе несут в адресе то, чему в чужой аналитике
 * не место:
 *
 *   /login?from=/admin/crm/...  — внутренние маршруты админки;
 *   /estimate/<токен>           — КЛЮЧ ДОСТУПА к смете клиента: у кого ссылка,
 *                                 тот видит смету, а токен уходил в отчёт
 *                                 «Просмотры URL» целиком.
 *
 * Поэтому: со служебных страниц хит не шлётся вовсе, а с остальных адрес
 * очищается от параметров, кроме рекламных меток — они и есть то, ради чего
 * счётчик ставят.
 */

type YmFn = ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number };

declare global {
  interface Window {
    ym?: YmFn;
    __metrikaLoaded?: boolean;
  }
}

/**
 * Страницы, с которых хит не отправляется. Это не маркетинговый трафик:
 * человек уже пришёл и что-то делает, а адрес несёт лишнее.
 */
const PRIVATE_PREFIXES = [
  "/login",
  "/register",
  "/reset-password",
  "/verify-email",
  "/estimate",
];

/** Метки, ради которых счётчик и ставят, — их сохраняем. */
const KEEP_PARAMS = /^(utm_|yclid$|gclid$|_ym|from_site$|roistat)/;

/**
 * Адрес для отправки в счётчик — или `null`, если страницу считать не надо.
 * Экспортируется ради тестов: правило важнее реализации, и проверяться должно
 * оно, а не то, что мы дёрнули `ym`.
 */
export function trackableUrl(pathname: string, search: string): string | null {
  if (PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return null;
  const params = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const [key, value] of params) if (KEEP_PARAMS.test(key)) kept.set(key, value);
  const query = kept.toString();
  return pathname + (query ? `?${query}` : "");
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
    const url = trackableUrl(pathname, window.location.search);
    if (url) window.ym?.(id, "hit", url);
  }, [id, pathname]);

  return null;
}
