"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { searchPartStockOptions, type PartStockOption } from "@/app/actions/crm/stock-options";
import { searchPartReferences, type PartReferenceOption } from "@/app/actions/part-references";
import { addEstimateLine } from "@/app/actions/crm/estimate-lines";
import { formatPrice } from "@/lib/utils";
import { toast } from "@/lib/ui/toast";

/**
 * Adds a catalog PART line to a DRAFT estimate via a searchable picker that
 * shows live available stock (on-hand − reserved). Selecting reserves the part
 * (one unit) through addEstimateLine. Changing which part a line points at is
 * delete + re-add (matches the rental edit precedent).
 *
 * Below the shop parts the picker also searches the nomenclature reference
 * (PartReference): positions that are not товары yet are added as a PART line
 * without partId (no reservation) with the OEM number in the description —
 * the manager fills in the price afterwards.
 */
export function EstimatePartPicker({ estimateId }: { estimateId: string }): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<PartStockOption[]>([]);
  const [refOptions, setRefOptions] = useState<PartReferenceOption[]>([]);
  const [searching, startSearch] = useTransition();
  const [adding, startAdd] = useTransition();

  function runSearch(q: string): void {
    setQuery(q);
    startSearch(async () => {
      const [parts, refs] = await Promise.all([
        searchPartStockOptions(q),
        searchPartReferences(q),
      ]);
      setOptions(parts);
      // Позиции, уже заведённые товаром, показывает верхняя секция — в
      // справочной оставляем только то, чего в магазине ещё нет.
      // Раздел «под заказ» — только номенклатура, у которой в магазине НЕТ
      // НИЧЕГО. Фильтр по shopPartId === null сюда затягивал бы позиции, у
      // которых есть б/у экземпляр: менеджер добавил бы строку без partId,
      // экземпляр остался бы без резерва и мог уехать вторым продажей.
      setRefOptions(refs.filter((r) => !r.hasAnyPart));
    });
  }

  function openPicker(): void {
    setOpen(true);
    if (options.length === 0) runSearch("");
  }

  function closePicker(): void {
    setOpen(false);
    setQuery("");
    setOptions([]);
    setRefOptions([]);
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
      closePicker();
      router.refresh();
    });
  }

  function pickReference(r: PartReferenceOption): void {
    startAdd(async () => {
      const fd = new FormData();
      fd.set("estimateId", estimateId);
      fd.set("type", "PART");
      fd.set("referenceId", r.id);
      fd.set("description", `${r.name} (${r.oem})`);
      fd.set("qty", "1");
      fd.set("unitPrice", "0");
      const result = await addEstimateLine(null, fd);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Позиция из справочника добавлена — укажите цену");
      closePicker();
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

  const empty = options.length === 0 && refOptions.length === 0;

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
          onClick={closePicker}
          className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] px-2"
        >
          Отмена
        </button>
      </div>

      {searching ? (
        <div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)] py-2">
          <Loader2 size={12} className="animate-spin" aria-hidden /> Поиск…
        </div>
      ) : empty ? (
        <p className="text-xs text-[var(--foreground-muted)] py-2">Ничего не найдено.</p>
      ) : (
        <>
          {options.length > 0 && (
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
                      <span className="flex items-center gap-2">
                        <span className="text-sm truncate">{o.name}</span>
                        {/* Состояние — не украшение. Артикул у нового товара и
                            у каждого б/у экземпляра ОДИН И ТОТ ЖЕ (так задумано
                            схемой), а поиск идёт в том числе по нему: без метки
                            механик видел несколько почти одинаковых строк и
                            выбирал наугад. */}
                        {o.condition !== "NEW" && (
                          <span className="badge text-[10px] shrink-0">
                            {o.condition === "USED" ? "Б/у" : "Восстановленная"}
                          </span>
                        )}
                      </span>
                      <span className="block text-xs font-mono text-[var(--foreground-muted)]">
                        {/* У двух б/у экземпляров совпадает всё, кроме sku. */}
                        {o.condition === "NEW" ? o.article : o.sku}
                      </span>
                      {o.conditionNote && (
                        <span className="block text-xs text-[var(--foreground-muted)] truncate">
                          {o.conditionNote}
                        </span>
                      )}
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

          {refOptions.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--foreground-muted)] pt-1 pb-0.5">
                Справочник — нет в товарах, под заказ
              </p>
              <ul className="max-h-48 overflow-auto divide-y divide-[var(--border)]">
                {refOptions.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      disabled={adding}
                      onClick={() => pickReference(r)}
                      className="w-full text-left py-2 px-1 flex items-center justify-between gap-3 hover:bg-[var(--background-secondary)] disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm truncate">{r.name}</span>
                        <span className="block text-xs font-mono text-[var(--foreground-muted)]">
                          {r.oem}
                          {r.groupName && ` · ${r.groupName}`}
                          {r.models.length > 0 && ` · ${r.models.join(", ")}`}
                        </span>
                      </span>
                      <span className="text-xs text-[var(--foreground-muted)] shrink-0">под заказ</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
