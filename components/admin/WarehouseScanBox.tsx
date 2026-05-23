"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adjustStock,
  getPlacement,
  placeIntoBin,
  transferBetweenBins,
} from "@/app/actions/warehouse";
import type { ItemPlacement } from "@/lib/wms/public";
import { QrScanner } from "@/components/warehouse/QrScanner";

interface ResolvedItem {
  itemId: string;
  name: string;
  article: string;
  barcode: string | null;
  quantity: number;
  available: number;
}

interface LocationCard {
  code: string;
  isActive: boolean;
  isBlocked: boolean;
  items: Array<{ itemId: string; name: string; article: string; quantity: number }>;
}

type ScanData =
  | ({ kind: "part" } & ResolvedItem)
  | ({ kind: "location" } & LocationCard);

/**
 * Warehouse scan box. A scan (camera or manual entry) is parsed and resolved by
 * POST /api/warehouse/scan, which logs a ScanEvent and returns a part or
 * location card. Part results expose the inline on-hand adjust + bin placement;
 * location results show the cell's state and contents. Write ops carry a
 * client idempotency key (regenerated per operation, reused only on a network
 * retry where the server outcome is unknown).
 */
export function WarehouseScanBox(): React.ReactElement {
  const router = useRouter();
  const [item, setItem] = useState<ResolvedItem | null>(null);
  const [locationCard, setLocationCard] = useState<LocationCard | null>(null);
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

  // Scan-result feedback: scroll the result into view + flash + haptic so a
  // resolved scan is obvious on mobile (the card otherwise just appears below).
  // The flash is a DOM animation (not React state) — restarted each scan.
  const resultRef = useRef<HTMLDivElement>(null);
  const [scanNonce, setScanNonce] = useState(0);

  useEffect(() => {
    if (scanNonce === 0) return;
    const el = resultRef.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    navigator.vibrate?.(60);
    if (!reduce) {
      el.classList.remove("scan-flash");
      void el.offsetWidth; // force reflow so the animation restarts on repeat scans
      el.classList.add("scan-flash");
    }
  }, [scanNonce]);

  // Per-operation idempotency keys. Lifecycle: generated on submit; KEPT on a
  // network error so the immediate retry reuses it (idempotent — server outcome
  // unknown); CLEARED on a confirmed server outcome (success or rejection) and
  // on any input change (a different value/location = a different intended
  // operation, not a retry — so it must get a fresh key, never the prior one).
  const adjustKeyRef = useRef<string | null>(null);
  const placeKeyRef = useRef<string | null>(null);
  const transferKeyRef = useRef<string | null>(null);

  async function handleScan(raw: string): Promise<void> {
    setAdjustError(null);
    setBinError(null);
    setNotFound(false);
    setLookupError(null);
    try {
      const res = await fetch("/api/warehouse/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawCode: raw }),
      });
      if (res.ok) {
        const body = (await res.json()) as { data: ScanData };
        if (body.data.kind === "part") {
          setLocationCard(null);
          setItem(body.data);
          setAdjustValue(String(body.data.quantity));
          setPlaceLoc("");
          setPlaceQty("");
          setTransferFrom("");
          setTransferTo("");
          setTransferQty("");
          adjustKeyRef.current = null;
          placeKeyRef.current = null;
          transferKeyRef.current = null;
          const p = await getPlacement(body.data.itemId);
          setPlacement(p.placement ?? null);
        } else {
          setItem(null);
          setPlacement(null);
          setLocationCard(body.data);
        }
      } else if (res.status === 404) {
        setItem(null);
        setPlacement(null);
        setLocationCard(null);
        setNotFound(true);
      } else {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setItem(null);
        setPlacement(null);
        setLocationCard(null);
        setLookupError(body?.error?.message ?? "Ошибка поиска");
      }
      setScanNonce((n) => n + 1); // signal "result ready" → scroll + flash + haptic
    } catch {
      setItem(null);
      setPlacement(null);
      setLocationCard(null);
      setLookupError("Ошибка сети");
      setScanNonce((n) => n + 1);
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
    const key = adjustKeyRef.current ?? (adjustKeyRef.current = crypto.randomUUID());
    startTransition(async () => {
      try {
        const result = await adjustStock(item.itemId, next, undefined, key);
        if (result.error) {
          setAdjustError(result.error);
          adjustKeyRef.current = null; // server rejected definitively → fresh key next time
          return;
        }
        adjustKeyRef.current = null;
        setItem({ ...item, quantity: result.quantity ?? next, available: result.available ?? item.available });
        const p = await getPlacement(item.itemId);
        setPlacement(p.placement ?? null);
        router.refresh();
      } catch {
        setAdjustError("Ошибка сети — повторите"); // keep key: outcome unknown, retry is idempotent
      }
    });
  }

  function handlePlace(): void {
    if (!item) return;
    const qty = parseInt(placeQty, 10);
    setBinError(null);
    const key = placeKeyRef.current ?? (placeKeyRef.current = crypto.randomUUID());
    startBinTransition(async () => {
      try {
        const result = await placeIntoBin(item.itemId, placeLoc, qty, key);
        if (result.error) {
          setBinError(result.error);
          placeKeyRef.current = null;
          return;
        }
        placeKeyRef.current = null;
        if (result.placement) setPlacement(result.placement);
        setPlaceLoc("");
        setPlaceQty("");
        router.refresh();
      } catch {
        setBinError("Ошибка сети — повторите");
      }
    });
  }

  function handleTransfer(): void {
    if (!item) return;
    const qty = parseInt(transferQty, 10);
    setBinError(null);
    const key = transferKeyRef.current ?? (transferKeyRef.current = crypto.randomUUID());
    startBinTransition(async () => {
      try {
        const result = await transferBetweenBins(item.itemId, transferFrom, transferTo, qty, key);
        if (result.error) {
          setBinError(result.error);
          transferKeyRef.current = null;
          return;
        }
        transferKeyRef.current = null;
        if (result.placement) setPlacement(result.placement);
        setTransferFrom("");
        setTransferTo("");
        setTransferQty("");
        router.refresh();
      } catch {
        setBinError("Ошибка сети — повторите");
      }
    });
  }

  return (
    <section aria-label="Сканирование" className="card">
      <h2 className="text-lg font-semibold mb-3">Сканирование</h2>
      <QrScanner onScan={handleScan} busy={isPending || isBinPending} />

      <div ref={resultRef} aria-live="polite" className="mt-4 scroll-mt-4 rounded-[var(--radius-md)]">
        {notFound && <p className="alert-error">Не найдено</p>}
        {lookupError && <p className="alert-error">{lookupError}</p>}

        {locationCard && (
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-4">
            <div className="flex items-center justify-between gap-4">
              <p className="font-mono font-medium">{locationCard.code}</p>
              {locationCard.isBlocked ? (
                <span className="badge bg-[var(--color-error-bg)] text-[var(--color-error)]">Заблокирована</span>
              ) : !locationCard.isActive ? (
                <span className="badge">Неактивна</span>
              ) : (
                <span className="badge">Активна</span>
              )}
            </div>
            {locationCard.items.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm">
                {locationCard.items.map((it) => (
                  <li key={it.itemId} className="flex justify-between gap-2">
                    <span>
                      {it.name} <span className="font-mono text-xs text-[var(--foreground-muted)]">{it.article}</span>
                    </span>
                    <span className="font-medium">{it.quantity}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-[var(--foreground-muted)]">Ячейка пуста</p>
            )}
          </div>
        )}

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
                  onChange={(e) => {
                    setAdjustValue(e.target.value);
                    adjustKeyRef.current = null;
                  }}
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
                        onChange={(e) => {
                          setPlaceLoc(e.target.value);
                          placeKeyRef.current = null;
                        }}
                        className="input flex-1 font-mono"
                      />
                      <input
                        aria-label="Количество для размещения"
                        type="number"
                        min={1}
                        placeholder="Кол-во"
                        value={placeQty}
                        onChange={(e) => {
                          setPlaceQty(e.target.value);
                          placeKeyRef.current = null;
                        }}
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
                        onChange={(e) => {
                          setTransferFrom(e.target.value);
                          transferKeyRef.current = null;
                        }}
                        className="input flex-1 font-mono"
                      />
                      <input
                        aria-label="В ячейку"
                        placeholder="В"
                        value={transferTo}
                        onChange={(e) => {
                          setTransferTo(e.target.value);
                          transferKeyRef.current = null;
                        }}
                        className="input flex-1 font-mono"
                      />
                      <input
                        aria-label="Количество для перемещения"
                        type="number"
                        min={1}
                        placeholder="Кол-во"
                        value={transferQty}
                        onChange={(e) => {
                          setTransferQty(e.target.value);
                          transferKeyRef.current = null;
                        }}
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
