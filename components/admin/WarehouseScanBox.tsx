"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  adjustStock,
  getPlacement,
  placeIntoBin,
  transferBetweenBins,
  scanReceiveOrderLine,
  blindReceive,
  openOrderLinesForPartAction,
} from "@/app/actions/warehouse";
import type { ItemPlacement } from "@/lib/wms/public";
import { formatScanCode } from "@/lib/wms/public/qr";
import { QrScanner } from "@/components/warehouse/QrScanner";

/** Default staging cell shown in the receive form. Mirrors STAGING_LOCATION in
 *  lib/wms-host (not imported here — that module pulls in the db singleton; the
 *  server actions enforce the real default). */
const STAGING_CELL = "ПРИЁМКА";

interface ReceiveLine {
  orderId: string;
  lineId: string;
  orderNumber: string | null;
  supplierName: string;
  ordered: number;
  received: number;
  remaining: number;
}

interface ResolvedItem {
  itemId: string;
  name: string;
  article: string;
  barcode: string | null;
  quantity: number;
  available: number;
  isActive: boolean;
}

interface LocationCard {
  code: string;
  isActive: boolean;
  isBlocked: boolean;
  items: Array<{ itemId: string; name: string; article: string; quantity: number }>;
}

interface OrderCard {
  orderId: string;
  orderNumber: string | null;
  status: string;
  requiredCount: number;
  packedCount: number;
}

interface BoxCard {
  code: string;
}

type ScanData =
  | ({ kind: "part" } & ResolvedItem)
  | ({ kind: "location" } & LocationCard)
  | ({ kind: "order" } & OrderCard)
  | ({ kind: "box" } & BoxCard);

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
  const [orderCard, setOrderCard] = useState<OrderCard | null>(null);
  const [boxCard, setBoxCard] = useState<BoxCard | null>(null);
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
  // Receiving (Приёмка): open order lines for the resolved part + blind receipt.
  const [openLines, setOpenLines] = useState<ReceiveLine[]>([]);
  const [receiveCell, setReceiveCell] = useState(STAGING_CELL);
  const [lineQty, setLineQty] = useState<Record<string, string>>({});
  const [blindQty, setBlindQty] = useState("");
  const [receiveError, setReceiveError] = useState<string | null>(null);
  const [receiveWarning, setReceiveWarning] = useState<string | null>(null);
  const [showLabelLink, setShowLabelLink] = useState(false);
  const [isReceivePending, startReceiveTransition] = useTransition();
  // Putaway from a scanned location (e.g. ПРИЁМКА) to a shelf — per-item target.
  const [putawayTarget, setPutawayTarget] = useState<Record<string, string>>({});
  const [putawayQty, setPutawayQty] = useState<Record<string, string>>({});

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
  const receiveKeyRef = useRef<string | null>(null);

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
          setOrderCard(null);
          setBoxCard(null);
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
          receiveKeyRef.current = null;
          setReceiveCell(STAGING_CELL);
          setBlindQty("");
          setReceiveError(null);
          setReceiveWarning(null);
          setShowLabelLink(false);
          const p = await getPlacement(body.data.itemId);
          setPlacement(p.placement ?? null);
          const ol = await openOrderLinesForPartAction(body.data.itemId);
          setOpenLines(ol.lines);
          setLineQty(Object.fromEntries(ol.lines.map((l) => [l.lineId, String(l.remaining)])));
        } else if (body.data.kind === "location") {
          setItem(null);
          setPlacement(null);
          setOrderCard(null);
          setBoxCard(null);
          setLocationCard(body.data);
        } else if (body.data.kind === "order") {
          setItem(null);
          setPlacement(null);
          setLocationCard(null);
          setBoxCard(null);
          setOrderCard(body.data);
        } else {
          setItem(null);
          setPlacement(null);
          setLocationCard(null);
          setOrderCard(null);
          setBoxCard(body.data);
        }
      } else if (res.status === 404) {
        setItem(null);
        setPlacement(null);
        setLocationCard(null);
        setOrderCard(null);
        setBoxCard(null);
        setNotFound(true);
      } else {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setItem(null);
        setPlacement(null);
        setLocationCard(null);
        setOrderCard(null);
        setBoxCard(null);
        setLookupError(body?.error?.message ?? "Ошибка поиска");
      }
      setScanNonce((n) => n + 1); // signal "result ready" → scroll + flash + haptic
    } catch {
      setItem(null);
      setPlacement(null);
      setLocationCard(null);
      setOrderCard(null);
      setBoxCard(null);
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

  async function refreshAfterReceive(itemId: string): Promise<void> {
    const p = await getPlacement(itemId);
    setPlacement(p.placement ?? null);
    const ol = await openOrderLinesForPartAction(itemId);
    setOpenLines(ol.lines);
    setLineQty(Object.fromEntries(ol.lines.map((l) => [l.lineId, String(l.remaining)])));
  }

  function handleReceiveOrderLine(line: ReceiveLine): void {
    if (!item) return;
    const qty = parseInt(lineQty[line.lineId] ?? "", 10);
    if (!Number.isInteger(qty) || qty <= 0) {
      setReceiveError("Введите количество");
      return;
    }
    setReceiveError(null);
    setReceiveWarning(null);
    // Order-backed receipt is idempotent via applyReceive's CAS on
    // receivedQuantity (a replay fails closed) — no client key needed.
    startReceiveTransition(async () => {
      try {
        const result = await scanReceiveOrderLine(line.orderId, line.lineId, qty, line.received, receiveCell);
        if (result.error) {
          setReceiveError(result.error);
          if (result.stale) await refreshAfterReceive(item.itemId);
          return;
        }
        if (result.overReceived) {
          setReceiveWarning(`Принято больше заказанного — ${result.received} из ${result.ordered}`);
        }
        setItem({ ...item, quantity: item.quantity + qty, available: item.available + qty });
        setShowLabelLink(true);
        await refreshAfterReceive(item.itemId);
      } catch {
        setReceiveError("Ошибка сети — повторите");
      }
    });
  }

  function handleBlindReceive(): void {
    if (!item) return;
    const qty = parseInt(blindQty, 10);
    if (!Number.isInteger(qty) || qty <= 0) {
      setReceiveError("Введите количество");
      return;
    }
    setReceiveError(null);
    setReceiveWarning(null);
    const key = receiveKeyRef.current ?? (receiveKeyRef.current = crypto.randomUUID());
    startReceiveTransition(async () => {
      try {
        const result = await blindReceive(item.itemId, qty, key, receiveCell);
        if (result.error) {
          setReceiveError(result.error);
          receiveKeyRef.current = null; // server rejected definitively → fresh key next time
          return;
        }
        receiveKeyRef.current = null;
        setItem({ ...item, quantity: result.quantity ?? item.quantity + qty, available: item.available + qty });
        setBlindQty("");
        setShowLabelLink(true);
        await refreshAfterReceive(item.itemId);
      } catch {
        setReceiveError("Ошибка сети — повторите"); // keep key: outcome unknown, retry is idempotent
      }
    });
  }

  function handlePutaway(itemId: string, from: string): void {
    const to = (putawayTarget[itemId] ?? "").trim();
    const qty = parseInt(putawayQty[itemId] ?? "", 10);
    setBinError(null);
    if (!to) {
      setBinError("Укажите полку");
      return;
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      setBinError("Введите количество");
      return;
    }
    const key = transferKeyRef.current ?? (transferKeyRef.current = crypto.randomUUID());
    startBinTransition(async () => {
      try {
        const result = await transferBetweenBins(itemId, from, to, qty, key);
        if (result.error) {
          setBinError(result.error);
          transferKeyRef.current = null;
          return;
        }
        transferKeyRef.current = null;
        setPutawayTarget((m) => ({ ...m, [itemId]: "" }));
        setPutawayQty((m) => ({ ...m, [itemId]: "" }));
        // Re-scan the source cell to refresh the location card's quantities.
        // Use the typed LOC payload: the scanner resolves locations only via the
        // WMS:LOC: form (what printed cell labels encode); a bare code is treated
        // as a barcode/article and 404s, which would flash a misleading "Не найдено".
        await handleScan(formatScanCode("LOC", from));
      } catch {
        setBinError("Ошибка сети — повторите");
      }
    });
  }

  return (
    <section aria-label="Сканирование" className="card">
      <h2 className="text-lg font-semibold mb-3">Сканирование</h2>
      <QrScanner onScan={handleScan} busy={isPending || isBinPending || isReceivePending} />

      <div ref={resultRef} aria-live="polite" className="mt-4 scroll-mt-4 rounded-[var(--radius-md)]">
        {notFound && <p className="alert-error">Не найдено</p>}
        {lookupError && <p className="alert-error">{lookupError}</p>}

        {orderCard && (
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-4">
            <div className="flex items-center justify-between gap-4">
              <p className="font-medium">Заказ {orderCard.orderNumber ?? orderCard.orderId.slice(0, 8)}</p>
              <span className="badge">{orderCard.status}</span>
            </div>
            <p className="mt-2 text-sm text-[var(--foreground-muted)]">
              упаковано {orderCard.packedCount}/{orderCard.requiredCount}
            </p>
            <Link
              href={`/admin/warehouse/packing/${orderCard.orderId}`}
              className="btn btn-secondary btn-sm mt-3 inline-block"
            >
              Упаковка →
            </Link>
          </div>
        )}

        {boxCard && (
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-4">
            <p className="text-sm text-[var(--foreground-muted)]">Короб</p>
            <p className="font-mono font-medium">{boxCard.code}</p>
          </div>
        )}

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
              <ul className="mt-3 space-y-2 text-sm">
                {locationCard.items.map((it) => (
                  <li key={it.itemId} className="rounded-[var(--radius-sm)] border border-[var(--border)] p-2">
                    <div className="flex justify-between gap-2">
                      <span>
                        {it.name} <span className="font-mono text-xs text-[var(--foreground-muted)]">{it.article}</span>
                      </span>
                      <span className="font-medium">{it.quantity}</span>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        aria-label="Полка назначения"
                        placeholder="На полку"
                        value={putawayTarget[it.itemId] ?? ""}
                        onChange={(e) => setPutawayTarget({ ...putawayTarget, [it.itemId]: e.target.value })}
                        className="input flex-1 font-mono"
                      />
                      <input
                        type="number"
                        min={1}
                        aria-label="Количество для раскладки"
                        placeholder="Кол-во"
                        value={putawayQty[it.itemId] ?? ""}
                        onChange={(e) => setPutawayQty({ ...putawayQty, [it.itemId]: e.target.value })}
                        className="input w-24"
                      />
                      <button
                        type="button"
                        onClick={() => handlePutaway(it.itemId, locationCard.code)}
                        disabled={isBinPending}
                        className="btn btn-secondary btn-sm"
                      >
                        Переместить
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-[var(--foreground-muted)]">Ячейка пуста</p>
            )}
            {binError && <p className="alert-error mt-2">{binError}</p>}
          </div>
        )}

        {item && (
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">
                  {item.name}
                  {!item.isActive && (
                    <span className="badge ml-2 align-middle">Снят с продажи</span>
                  )}
                </p>
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
            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <h3 className="text-sm font-semibold mb-2">Приёмка</h3>
              <label className="block mb-3">
                <span className="block text-sm font-medium mb-1">Ячейка приёмки</span>
                <input
                  value={receiveCell}
                  onChange={(e) => {
                    setReceiveCell(e.target.value);
                    receiveKeyRef.current = null;
                  }}
                  aria-label="Ячейка приёмки"
                  className="input w-40 font-mono"
                />
              </label>

              {openLines.length > 0 && (
                <ul className="space-y-2 mb-3">
                  {openLines.map((l) => (
                    <li key={l.lineId} className="rounded-[var(--radius-sm)] border border-[var(--border)] p-3">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span>
                          Заказ {l.orderNumber ?? l.orderId.slice(0, 8)}
                          <span className="text-[var(--foreground-muted)]"> · {l.supplierName}</span>
                        </span>
                        <span className="text-[var(--foreground-muted)]">осталось {l.remaining}</span>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <input
                          type="number"
                          min={1}
                          value={lineQty[l.lineId] ?? ""}
                          onChange={(e) => setLineQty({ ...lineQty, [l.lineId]: e.target.value })}
                          aria-label="Количество к приёмке"
                          className="input w-24"
                        />
                        <button
                          type="button"
                          onClick={() => handleReceiveOrderLine(l)}
                          disabled={isReceivePending}
                          className="btn btn-primary btn-sm"
                        >
                          Принять
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="rounded-[var(--radius-sm)] border border-[var(--border)] p-3">
                <p className="text-xs font-medium mb-2">
                  {openLines.length > 0 ? "Слепой приход (без заказа)" : "Слепой приход — заказов не найдено"}
                </p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    placeholder="Кол-во"
                    value={blindQty}
                    onChange={(e) => {
                      setBlindQty(e.target.value);
                      // qty change clears the key intentionally — a different qty
                      // is a new operation, not a retry of the prior one.
                      receiveKeyRef.current = null;
                    }}
                    aria-label="Количество слепого прихода"
                    className="input w-24"
                  />
                  <button
                    type="button"
                    onClick={handleBlindReceive}
                    disabled={isReceivePending}
                    className="btn btn-secondary btn-sm"
                  >
                    Принять без заказа
                  </button>
                </div>
              </div>

              {receiveWarning && (
                <p className="mt-2 text-sm font-medium text-[var(--color-accent)]">{receiveWarning}</p>
              )}
              {receiveError && <p className="alert-error mt-2">{receiveError}</p>}
              {showLabelLink && (
                <a
                  href={`/admin/warehouse/labels?part=${item.itemId}`}
                  className="btn btn-secondary btn-sm mt-2 inline-block"
                >
                  Печать наклейки
                </a>
              )}
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
