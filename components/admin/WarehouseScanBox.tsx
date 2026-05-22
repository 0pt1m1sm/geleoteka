"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  adjustStock,
  getPlacement,
  placeIntoBin,
  transferBetweenBins,
} from "@/app/actions/warehouse";
import type { ItemPlacement } from "@/lib/wms/public";

interface ResolvedItem {
  itemId: string;
  name: string;
  article: string;
  barcode: string | null;
  quantity: number;
  available: number;
}

/**
 * Barcode-HID scan box. The scanner acts as a keyboard wedge: it "types" the
 * code and presses Enter. On submit we resolve the code via /api/stock/lookup
 * and show the item with an inline on-hand adjust. The input auto-focuses and
 * re-focuses after every scan so an operator can scan continuously.
 */
export function WarehouseScanBox(): React.ReactElement {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [item, setItem] = useState<ResolvedItem | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [adjustValue, setAdjustValue] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [placement, setPlacement] = useState<ItemPlacement | null>(null);
  const [placeLoc, setPlaceLoc] = useState("");
  const [placeQty, setPlaceQty] = useState("");
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferQty, setTransferQty] = useState("");
  const [binError, setBinError] = useState<string | null>(null);
  const [isBinPending, startBinTransition] = useTransition();

  const refocus = (): void => {
    inputRef.current?.focus();
    inputRef.current?.select();
  };

  async function handleLookup(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const code = (inputRef.current?.value ?? "").trim();
    setAdjustError(null);
    setBinError(null);
    if (!code) return;
    setNotFound(false);
    setLookupError(null);
    try {
      const res = await fetch(`/api/stock/lookup?code=${encodeURIComponent(code)}`);
      if (res.status === 404) {
        setItem(null);
        setPlacement(null);
        setNotFound(true);
      } else if (res.ok) {
        const body = (await res.json()) as { data: ResolvedItem };
        setItem(body.data);
        setAdjustValue(String(body.data.quantity));
        setPlaceLoc("");
        setPlaceQty("");
        setTransferFrom("");
        setTransferTo("");
        setTransferQty("");
        const p = await getPlacement(body.data.itemId);
        setPlacement(p.placement ?? null);
      } else {
        setItem(null);
        setPlacement(null);
        setLookupError("Ошибка поиска");
      }
    } catch {
      setItem(null);
      setPlacement(null);
      setLookupError("Ошибка сети");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
      refocus();
    }
  }

  function handleAdjust(): void {
    if (!item) return;
    const next = parseInt(adjustValue, 10);
    if (!Number.isInteger(next) || next < 0) {
      setAdjustError("Введите целое неотрицательное число");
      return;
    }
    setAdjustError(null);
    startTransition(async () => {
      const result = await adjustStock(item.itemId, next);
      if (result.error) {
        setAdjustError(result.error);
        return;
      }
      setItem({ ...item, quantity: result.quantity ?? next, available: result.available ?? item.available });
      const p = await getPlacement(item.itemId);
      setPlacement(p.placement ?? null);
      router.refresh();
    });
  }

  function handlePlace(): void {
    if (!item) return;
    const qty = parseInt(placeQty, 10);
    setBinError(null);
    startBinTransition(async () => {
      const result = await placeIntoBin(item.itemId, placeLoc, qty);
      if (result.error) {
        setBinError(result.error);
        return;
      }
      if (result.placement) setPlacement(result.placement);
      setPlaceLoc("");
      setPlaceQty("");
      router.refresh();
    });
  }

  function handleTransfer(): void {
    if (!item) return;
    const qty = parseInt(transferQty, 10);
    setBinError(null);
    startBinTransition(async () => {
      const result = await transferBetweenBins(item.itemId, transferFrom, transferTo, qty);
      if (result.error) {
        setBinError(result.error);
        return;
      }
      if (result.placement) setPlacement(result.placement);
      setTransferFrom("");
      setTransferTo("");
      setTransferQty("");
      router.refresh();
    });
  }

  return (
    <section aria-label="Сканирование" className="card">
      <h2 className="text-lg font-semibold mb-3">Сканирование</h2>
      <form onSubmit={handleLookup} className="flex gap-2">
        <input
          ref={inputRef}
          autoFocus
          type="text"
          inputMode="text"
          aria-label="Штрихкод или артикул"
          placeholder="Отсканируйте штрихкод или введите артикул"
          className="input flex-1"
        />
        <button type="submit" className="btn btn-secondary">Найти</button>
      </form>

      <div aria-live="polite" className="mt-4">
        {notFound && <p className="alert-error">Не найдено</p>}
        {lookupError && <p className="alert-error">{lookupError}</p>}
        {item && (
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-xs font-mono text-[var(--foreground-muted)]">
                  {item.article}
                  {item.barcode ? ` · ${item.barcode}` : ""}
                </p>
              </div>
              <div className="text-right text-sm">
                <p>На складе: <span className="font-medium">{item.quantity}</span></p>
                <p>Доступно: <span className="font-medium">{item.available}</span></p>
              </div>
            </div>
            <div className="mt-4 flex items-end gap-2">
              <label className="flex-1">
                <span className="block text-sm font-medium mb-1">Новый остаток</span>
                <input
                  type="number"
                  min={0}
                  value={adjustValue}
                  onChange={(e) => setAdjustValue(e.target.value)}
                  className="input"
                />
              </label>
              <button
                type="button"
                onClick={handleAdjust}
                disabled={isPending}
                aria-busy={isPending || undefined}
                className="btn btn-primary"
              >
                {isPending ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
            {adjustError && <p className="alert-error mt-2">{adjustError}</p>}

            {placement && (
              <div className="mt-5 border-t border-[var(--border)] pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Размещение по ячейкам</h3>
                  <span className="text-xs text-[var(--foreground-muted)]">
                    Без места: <span className="font-medium">{placement.unplaced}</span>
                    {placement.reconcileNeeded && (
                      <span className="ml-2 badge bg-[var(--color-error-bg)] text-[var(--color-error)]">
                        требуется сверка
                      </span>
                    )}
                  </span>
                </div>

                {placement.bins.length > 0 ? (
                  <ul className="mb-3 flex flex-wrap gap-2">
                    {placement.bins.map((b) => (
                      <li key={b.location} className="badge font-mono">
                        {b.location}: {b.quantity}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-[var(--foreground-muted)] mb-3">Нет размещений</p>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[var(--radius-sm)] border border-[var(--border)] p-3">
                    <p className="text-xs font-medium mb-2">Разместить в ячейку</p>
                    <div className="flex gap-2">
                      <input
                        aria-label="Ячейка для размещения"
                        placeholder="Ячейка"
                        value={placeLoc}
                        onChange={(e) => setPlaceLoc(e.target.value)}
                        className="input flex-1 font-mono"
                      />
                      <input
                        aria-label="Количество для размещения"
                        type="number"
                        min={1}
                        placeholder="Кол-во"
                        value={placeQty}
                        onChange={(e) => setPlaceQty(e.target.value)}
                        className="input w-24"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handlePlace}
                      disabled={isBinPending}
                      className="btn btn-secondary btn-sm mt-2 w-full"
                    >
                      Разместить
                    </button>
                  </div>

                  <div className="rounded-[var(--radius-sm)] border border-[var(--border)] p-3">
                    <p className="text-xs font-medium mb-2">Переместить между ячейками</p>
                    <div className="flex gap-2">
                      <input
                        aria-label="Из ячейки"
                        placeholder="Из"
                        value={transferFrom}
                        onChange={(e) => setTransferFrom(e.target.value)}
                        className="input flex-1 font-mono"
                      />
                      <input
                        aria-label="В ячейку"
                        placeholder="В"
                        value={transferTo}
                        onChange={(e) => setTransferTo(e.target.value)}
                        className="input flex-1 font-mono"
                      />
                      <input
                        aria-label="Количество для перемещения"
                        type="number"
                        min={1}
                        placeholder="Кол-во"
                        value={transferQty}
                        onChange={(e) => setTransferQty(e.target.value)}
                        className="input w-24"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleTransfer}
                      disabled={isBinPending}
                      className="btn btn-secondary btn-sm mt-2 w-full"
                    >
                      Переместить
                    </button>
                  </div>
                </div>
                {binError && <p className="alert-error mt-2">{binError}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
