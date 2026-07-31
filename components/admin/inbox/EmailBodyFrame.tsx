"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { cssVar, getEffectiveTheme, subscribe } from "@/lib/theme";

/**
 * Тело письма в изолированном документе.
 *
 * Раньше у рамки был жёстко прописан белый фон, и в тёмной теме письмо
 * выглядело как прожектор посреди страницы.
 *
 * Просто подставить переменную оформления нельзя по двум причинам. Во-первых,
 * iframe — отдельный документ, переменных родителя он не видит вовсе, поэтому
 * значения приходится читать и передавать явно. Во-вторых, письма свёрстаны под
 * белый фон: перекрасить фон, не тронув текст, значит получить чёрное на
 * чёрном.
 *
 * Поэтому цвета задаются ТОЛЬКО на html и body. Письмо, у которого есть
 * собственное оформление, перебьёт их своими правилами и сохранит вид,
 * задуманный отправителем; письмо без оформления — а таких большинство —
 * возьмёт цвета темы.
 */
export function EmailBodyFrame({ html }: { html: string }): React.ReactElement {
  const theme = useSyncExternalStore(subscribe, getEffectiveTheme, () => "dark" as const);
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);

  /**
   * Высота меряется СНАРУЖИ.
   *
   * Изнутри нельзя: скрипты в песочнице запрещены, и снимать этот запрет ради
   * измерения — плохая сделка. Поэтому даём allow-same-origin и НЕ даём
   * allow-scripts: опасна именно пара вместе (документ получил бы и наш
   * origin, и право исполняться). По отдельности same-origin лишь позволяет
   * родителю прочитать высоту у документа, который всё равно ничего не
   * исполняет.
   */
  const measure = useCallback(() => {
    const doc = ref.current?.contentDocument;
    if (!doc) return;
    const next = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0);
    if (next > 0) setHeight(next);
  }, []);

  // Картинки в письме подгружаются позже и меняют высоту: одного замера по
  // load не хватает, иначе снизу останется пустота или обрежется хвост.
  useEffect(() => {
    const doc = ref.current?.contentDocument;
    if (!doc?.body) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(doc.body);
    return () => observer.disconnect();
  }, [measure, html, theme]);

  // Цвета берём из самой темы, а не константами: так рамка не разъедется с
  // остальным интерфейсом, когда палитру поправят.
  const background = cssVar("--card") || (theme === "light" ? "#ffffff" : "#1a1a1a");
  const foreground = cssVar("--foreground") || (theme === "light" ? "#1a1a1a" : "#e8e8e8");
  const accent = cssVar("--color-accent") || "#d4af37";

  const doc = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: ${theme}; }
  html, body {
    margin: 0;
    padding: 0;
    background: ${background};
    color: ${foreground};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    word-break: break-word;
    /* Своей прокрутки у письма быть не должно: высоту задаёт родитель. */
    overflow: hidden;
  }
  a { color: ${accent}; }
  img { max-width: 100%; height: auto; }
</style>
</head><body>${html}</body></html>`;

  return (
    <iframe
      ref={ref}
      // allow-same-origin БЕЗ allow-scripts: письмо по-прежнему не исполняет
      // ничего, но родитель может прочитать его высоту. Добавлять
      // allow-scripts нельзя ни при каких обстоятельствах — вместе эти два
      // разрешения отдают чужому HTML наш origin.
      sandbox="allow-same-origin"
      srcDoc={doc}
      onLoad={measure}
      style={height > 0 ? { height } : undefined}
      className={`w-full block ${height > 0 ? "" : "min-h-[200px]"}`}
      scrolling="no"
      title="Содержимое письма"
    />
  );
}
