"use client";

import { useActionState } from "react";

import { submitSitemapToIndexNow } from "@/app/actions/seo";
import { Alert } from "@/components/ui";

/**
 * Разовая отправка всех URL sitemap в IndexNow. Нужна после крупных изменений
 * (новые страницы, чистка каталога), а не как регулярная кнопка — Яндекс
 * игнорирует повторную подачу неизменных URL.
 */
export function IndexNowSubmitButton(): React.ReactElement {
  const [state, action, isPending] = useActionState(
    () => submitSitemapToIndexNow(),
    null,
  );

  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <button type="submit" disabled={isPending} className="btn btn-secondary shrink-0">
          {isPending ? "Отправляем…" : "Отправить все URL в IndexNow"}
        </button>
        <span className="text-xs text-[var(--foreground-muted)]">
          Толкает весь sitemap в обход Яндекса. Жать после крупных изменений.
        </span>
      </div>
      {state?.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state && !state.error ? (
        <Alert variant="success">Отправлено URL: {state.submitted}</Alert>
      ) : null}
    </form>
  );
}
