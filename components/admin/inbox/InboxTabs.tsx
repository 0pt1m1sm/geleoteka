"use client";

import Link from "next/link";
import { useProgressRouter } from "@/components/shared/NavigationProgressProvider";

export interface InboxTab {
  key: string;
  /** Подпись в полосе вкладок — там дорог каждый пиксель. */
  short: string;
  /** Подпись в списке — там есть место объяснить. */
  full: string;
  count: number;
}

/**
 * Переключатель вкладок почтового ящика.
 *
 * На широком экране — обычная полоса. На узком — выпадающий список, а не
 * прокручиваемая полоса: прокрутка прячет вкладки, о которых пользователь не
 * знает, и он их просто не находит. Список же всегда показывает, где он сейчас,
 * и содержит все варианты разом.
 *
 * Подписи короткие. «Спам и удалённые» не помещалось даже вчетвером, а длина
 * подписи ничего не добавляла: в списке для неё есть полная форма.
 */
export function InboxTabs({ tabs, active }: { tabs: InboxTab[]; active: string }): React.ReactElement {
  const nav = useProgressRouter();

  return (
    <div className="mb-6">
      {/* Узкий экран: список. Нативный select — он же и есть привычный способ
          выбрать одно из многого на телефоне. */}
      <div className="sm:hidden">
        <select
          className="input"
          value={active}
          onChange={(e) => nav.push(`/admin/crm/inbox?status=${e.target.value}`)}
          aria-label="Папка"
        >
          {tabs.map((t) => (
            <option key={t.key} value={t.key}>
              {t.full}
              {t.count > 0 ? ` (${t.count})` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Широкий экран: полоса. */}
      <div className="hidden sm:flex gap-1 border-b border-[var(--border)]" role="tablist">
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Link
              key={tab.key}
              href={`/admin/crm/inbox?status=${tab.key}`}
              className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap ${
                isActive
                  ? "border-[var(--color-accent)] text-[var(--foreground)]"
                  : "border-transparent text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              }`}
              role="tab"
              aria-selected={isActive}
              title={tab.full}
            >
              {tab.short}
              {tab.count > 0 ? (
                <span className="ml-2 inline-flex items-center px-1.5 text-xs rounded bg-[var(--background-secondary)] text-[var(--foreground)]">
                  {tab.count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
