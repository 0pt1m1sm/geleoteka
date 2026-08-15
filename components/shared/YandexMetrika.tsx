import "server-only";

import { getSetting } from "@/lib/settings";
import { MetrikaTracker } from "@/components/shared/MetrikaTracker";

/**
 * Счётчик Яндекс.Метрики — вставляется только на публичном layout и только
 * когда ID задан в настройках (Интеграции → SEO и аналитика). Кроме
 * аналитики счётчик нужен Вебмастеру для «обхода по счётчикам» — Яндекс
 * находит новые страницы по визитам, а не только по sitemap.
 *
 * Хиты отправляются вручную (MetrikaTracker, defer:true — официальный режим
 * для SPA): считаются только публичные pathname'ы. Раньше init шёл инлайном
 * с авто-хитами — tag.js переживал SPA-переход в админку и сливал внутренние
 * URL в статистику; аудит 2026-08-15 закрыл это.
 *
 * ID прогоняется через строгий числовой фильтр: в разметку попадает только
 * `Number`, произвольная строка из БД — нет. Вебвизор выключен намеренно.
 */
export async function YandexMetrika(): Promise<React.ReactElement | null> {
  const raw = (await getSetting("YANDEX_METRIKA_ID"))?.trim();
  if (!raw || !/^\d{1,12}$/.test(raw)) return null;
  const id = Number(raw);

  return (
    <>
      <MetrikaTracker id={id} />
      <noscript>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://mc.yandex.ru/watch/${id}`}
            style={{ position: "absolute", left: "-9999px" }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}
