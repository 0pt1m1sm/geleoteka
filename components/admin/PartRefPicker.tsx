"use client";

import { useState, useTransition } from "react";
import { BookOpen, Search, Loader2 } from "lucide-react";
import {
  searchPartReferences,
  type PartReferenceOption,
} from "@/app/actions/part-references";

/**
 * Inline-поиск по номенклатурному справочнику для формы товара: вместо ручного
 * ввода артикула менеджер выбирает позицию, и родитель получает oem + название
 * через onPick.
 *
 * `blockWhenNewExists` — позиции, у которых уже есть НОВЫЙ товар, помечаются и
 * не выбираются. Так надо при заведении нового товара (артикул у новых
 * уникален), но НЕ при заведении б/у экземпляра: там наличие нового — норма.
 */
export function PartRefPicker({
  onPick,
  blockWhenNewExists = true,
}: {
  onPick: (ref: { oem: string; name: string }) => void;
  blockWhenNewExists?: boolean;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<PartReferenceOption[]>([]);
  const [searching, startSearch] = useTransition();

  function runSearch(q: string): void {
    setQuery(q);
    startSearch(async () => {
      setOptions(await searchPartReferences(q));
    });
  }

  function close(): void {
    setOpen(false);
    setQuery("");
    setOptions([]);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          runSearch("");
        }}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--color-accent)] hover:underline"
      >
        <BookOpen size={14} aria-hidden />
        Выбрать из справочника
      </button>
    );
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--background-secondary)] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Search size={14} className="text-[var(--foreground-muted)] shrink-0" aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(e) => runSearch(e.target.value)}
          placeholder="Номер или название из справочника"
          aria-label="Поиск по справочнику"
          className="input flex-1 text-sm"
        />
        <button
          type="button"
          onClick={close}
          className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] px-2"
        >
          Отмена
        </button>
      </div>

      {searching ? (
        <div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)] py-2">
          <Loader2 size={12} className="animate-spin" aria-hidden /> Поиск…
        </div>
      ) : options.length === 0 ? (
        <p className="text-xs text-[var(--foreground-muted)] py-2">
          Ничего не найдено. Пополнить справочник: Запчасти → Справочник.
        </p>
      ) : (
        <ul className="max-h-56 overflow-auto divide-y divide-[var(--border)]">
          {options.map((r) => {
            // Занятой считаем позицию только когда заводим НОВЫЙ товар:
            // при заведении б/у экземпляра наличие нового — норма, ради этого
            // всё и делается. Без этого менеджер вынужден набирать артикул
            // руками, а расхождение записи номера ломает серию суффиксов.
            const taken = blockWhenNewExists && r.shopPartId !== null;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  disabled={taken}
                  onClick={() => {
                    onPick({ oem: r.oem, name: r.name });
                    close();
                  }}
                  className="w-full text-left py-2 px-1 flex items-center justify-between gap-3 hover:bg-[var(--card)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="min-w-0">
                    <span className="block text-sm truncate">{r.name}</span>
                    <span className="block text-xs font-mono text-[var(--foreground-muted)]">
                      {r.oem}
                      {r.models.length > 0 && ` · ${r.models.join(", ")}`}
                    </span>
                  </span>
                  {taken && (
                    <span className="badge text-[10px] shrink-0">уже в магазине</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
