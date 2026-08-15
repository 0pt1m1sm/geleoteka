"use client";

// Границы ошибок в админке не было вовсе: упавший server action или рендер
// оставляли пользователя наедине с «ничего не произошло» или голым
// «Internal Server Error». Частный болезненный случай — вкладка, открытая до
// деплоя: её action-id сервер уже не знает («Failed to find Server Action»),
// и любое сохранение молча умирает, пока страницу не перезагрузят.

export default function AdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}): React.ReactElement {
  const staleDeploy = /Failed to find Server Action/i.test(error.message);

  return (
    <div className="mx-auto max-w-lg p-6">
      <div className="card space-y-4">
        <h1 className="text-lg font-semibold">
          {staleDeploy ? "Страница устарела" : "Что-то пошло не так"}
        </h1>
        <p className="text-sm text-[var(--foreground-muted)]">
          {staleDeploy
            ? "Сайт обновился, пока эта вкладка была открыта. Перезагрузите страницу — данные не потеряются."
            : "Действие не выполнено. Попробуйте ещё раз; если повторяется — перезагрузите страницу."}
        </p>
        {error.digest ? (
          <p className="text-xs text-[var(--foreground-muted)]">Код: {error.digest}</p>
        ) : null}
        <div className="flex gap-3">
          <button
            type="button"
            className="btn btn-primary text-sm"
            onClick={() => window.location.reload()}
          >
            Перезагрузить страницу
          </button>
          {!staleDeploy ? (
            <button
              type="button"
              className="btn btn-secondary text-sm"
              onClick={() => unstable_retry()}
            >
              Повторить
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
