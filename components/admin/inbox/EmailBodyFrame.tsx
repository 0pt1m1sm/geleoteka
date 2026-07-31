"use client";

import { useSyncExternalStore } from "react";

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
    padding: 12px;
    background: ${background};
    color: ${foreground};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    word-break: break-word;
  }
  a { color: ${accent}; }
  img { max-width: 100%; height: auto; }
</style>
</head><body>${html}</body></html>`;

  return (
    <iframe
      // Песочница пустая: содержимое письма не должно исполнять скрипты и
      // ходить в сеть. Это не про тему, но снимать её при правке оформления
      // нельзя ни при каких обстоятельствах.
      sandbox=""
      srcDoc={doc}
      className="w-full min-h-[400px] border border-[var(--border)] rounded"
      title="Содержимое письма"
    />
  );
}
