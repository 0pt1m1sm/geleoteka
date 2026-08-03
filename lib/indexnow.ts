import "server-only";

import { getSetting } from "@/lib/settings";

/**
 * IndexNow ping — мгновенное уведомление Яндекса об изменившихся страницах
 * вместо ожидания планового обхода. Протокол: POST со списком URL и ключом,
 * подлинность которого поисковик проверяет по файлу keyLocation на сайте
 * (роут /indexnow-key.txt отдаёт тот же Setting).
 *
 * Пинг — строго best-effort: без ключа молча выходим, сетевая ошибка или
 * таймаут не должны ронять админский экшен, из которого нас позвали.
 */

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://geleoteka.ru";
const INDEXNOW_ENDPOINT = "https://yandex.com/indexnow";

export async function pingIndexNow(paths: string[]): Promise<void> {
  try {
    const key = (await getSetting("INDEXNOW_KEY"))?.trim();
    if (!key || paths.length === 0) return;
    const base = new URL(SITE_URL);
    await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: base.host,
        key,
        keyLocation: `${base.origin}/indexnow-key.txt`,
        urlList: paths.map((p) => new URL(p, base).toString()),
      }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // Индексация — не причина ломать сохранение сущности.
  }
}
