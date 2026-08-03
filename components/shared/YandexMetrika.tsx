import "server-only";

import { getSetting } from "@/lib/settings";

/**
 * Счётчик Яндекс.Метрики — вставляется только на публичном layout и только
 * когда ID задан в настройках (Интеграции → SEO и аналитика). Кроме
 * аналитики счётчик нужен Вебмастеру для «обхода по счётчикам» — Яндекс
 * находит новые страницы по визитам, а не только по sitemap.
 *
 * ID прогоняется через строгий числовой фильтр: в инлайновый скрипт попадает
 * только `Number`, произвольная строка из БД в разметку попасть не может.
 * Вебвизор выключен намеренно — записи сессий не нужны и тяжелы.
 */
export async function YandexMetrika(): Promise<React.ReactElement | null> {
  const raw = (await getSetting("YANDEX_METRIKA_ID"))?.trim();
  if (!raw || !/^\d{1,12}$/.test(raw)) return null;
  const id = Number(raw);

  const script = `(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym(${id},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true});`;

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: script }} />
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
