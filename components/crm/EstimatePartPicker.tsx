"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { searchPartStockOptions, type PartStockOption } from "@/app/actions/crm/stock-options";
import { addEstimateLine } from "@/app/actions/crm/estimate-lines";
import { formatPrice } from "@/lib/utils";
import { toast } from "@/lib/ui/toast";

/**
 * Adds a catalog PART line to a DRAFT estimate via a searchable picker that
 * shows live available stock (on-hand − reserved). Selecting reserves the part
 * (one unit) through addEstimateLine. Changing which part a line points at is
 * delete + re-add (matches the rental edit precedent).
 */
export function EstimatePartPicker({ estimateId }: { estimateId: string }): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<PartStockOption[]>([]);
  const [searching, startSearch] = useTransition();
  const [adding, startAdd] = useTransition();

  function runSearch(q: string): void {
    setQuery(q);
    startSearch(async () => {
      setOptions(await searchPartStockOptions(q));
    });
  }

  function openPicker(): void {
    setOpen(true);
    if (options.length === 0) runSearch("");
  }

  function pick(o: PartStockOption): void {
    startAdd(async () => {
      const fd = new FormData();
      fd.set("estimateId", estimateId);
      fd.set("type", "PART");
      fd.set("partId", o.id);
      fd.set("description", o.name);
      fd.set("qty", "1");
      fd.set("unitPrice", String(o.price));
      const result = await addEstimateLine(null, fd);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (o.available <= 0) {
        toast.error(`${o.name}: нет доступного остатка — позиция добавлена под заказ`);
      } else {
        toast.success("Запчасть добавлена");
      }
      setOpen(false);
      setQuery("");
      setOptions([]);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        leftIcon={<Plus size={14} />}
        onClick={openPicker}
      >
        Добавить запчасть
      </Button>
    );
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Search size={14} className="text-[var(--foreground-muted)] shrink-0" aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(e) => runSearch(e.target.value)}
          placeholder="Поиск по названию или артикулу"
          aria-label="Поиск запчасти"
          className="input flex-1 text-sm"
        />
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setQuery("");
          }}
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
        <p className="text-xs text-[var(--foreground-muted)] py-2">Ничего не найдено.</p>
      ) : (
        <ul className="max-h-64 overflow-auto divide-y divide-[var(--border)]">
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                disabled={adding}
                onClick={() => pick(o)}
                className="w-full text-left py-2 px-1 flex items-center justify-between gap-3 hover:bg-[var(--background-secondary)] disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block text-sm truncate">{o.name}</span>
                  <span className="block text-xs font-mono text-[var(--foreground-muted)]">{o.article}</span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block text-sm tabular-nums">{formatPrice(o.price)}</span>
                  <span
                    className={`block text-xs tabular-nums ${
                      o.available > 0 ? "text-[var(--color-success)]" : "text-[var(--color-error)]"
                    }`}
                  >
                    Доступно: {o.available}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
