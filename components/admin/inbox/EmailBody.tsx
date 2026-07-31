"use client";

import { useState } from "react";

import { EmailBodyFrame } from "@/components/admin/inbox/EmailBodyFrame";

/**
 * Тело письма: текстовая часть по умолчанию, оригинал — по требованию.
 *
 * Раньше побеждала HTML-версия, и письмо всегда читалось в изолированном
 * документе — со своим фоном, своими отступами и полосой прокрутки внутри
 * страницы.
 *
 * Почти всякое письмо приходит в двух частях, и текстовая содержит то же
 * самое. Она рисуется как обычный текст страницы: тема, шрифт и ширина — общие,
 * ничего не изолировано, потому что изолировать нечего.
 *
 * Оригинал остаётся под кнопкой и по-прежнему в песочнице. Отрисовать его
 * «просто вырезав активные элементы» нельзя по двум причинам: санитайзер это
 * гонка с автором письма, а цена промаха — сессия администратора; и даже
 * безопасный HTML несёт правила вида `body{}` и `*{}`, которые перекрасят всю
 * админку. Вырезав ещё и стили, получим тот же текст — то есть то, что здесь
 * и так показано.
 */
export function EmailBody({
  text,
  html,
}: {
  text: string | null;
  html: string | null;
}): React.ReactElement {
  const [showOriginal, setShowOriginal] = useState(false);

  if (!text && !html) {
    return <p className="text-sm text-[var(--foreground-muted)]">(пусто)</p>;
  }

  // Текста нет — показывать нечего, кроме оригинала.
  if (!text && html) return <EmailBodyFrame html={html} />;

  return (
    <div className="space-y-3">
      {showOriginal && html ? (
        <EmailBodyFrame html={html} />
      ) : (
        <pre className="text-sm whitespace-pre-wrap break-words font-sans">{text}</pre>
      )}

      {html ? (
        <button
          type="button"
          onClick={() => setShowOriginal((v) => !v)}
          className="text-xs text-[var(--foreground-muted)] hover:underline"
        >
          {showOriginal ? "Показать текстом" : "Показать оригинал с оформлением"}
        </button>
      ) : null}
    </div>
  );
}
