"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useProgressRouter } from "@/components/shared/NavigationProgressProvider";
import {
  eraseCustomer,
  exportCustomerSnapshot,
  getEraseImpact,
} from "@/app/actions/crm/customer-erase";
import { toast } from "@/lib/ui/toast";

interface Props {
  customerUserId: string;
  customerName: string;
  /** Email or phone — what the operator must retype to confirm. */
  confirmPhrase: string;
  /** Where to go once the person is gone. */
  redirectTo?: string;
  /**
   * Skip the panel's own trigger and load the impact straight away — for when
   * the decision to delete was already made outside, in the actions menu.
   */
  autoOpen?: boolean;
}

/** What actually happens to each kind of record — see customer-erase.ts. */
const OUTCOME: Record<string, { label: string; kept: boolean }> = {
  deals: { label: "сделки", kept: true },
  repairOrders: { label: "заказ-наряды", kept: true },
  communications: { label: "лента общения на карточке", kept: false },
  // Held as an employee: survives unassigned unless the box is ticked.
  tasks: { label: "задачи в работе", kept: true },
  vehicles: { label: "автомобили", kept: false },
};

/**
 * The single delete path: show what goes, confirm, delete.
 *
 * There used to be two — a one-click purge for empty records and a separate
 * guarded erase for everything else — which made the operator work out which
 * case they were in before they could act. Now there is one button. The
 * snapshot step appears only when there is something to lose; an abandoned
 * registration with nothing attached does not need a downloaded file to prove
 * it was worthless.
 */
export function EraseCustomerPanel({
  customerUserId,
  customerName,
  confirmPhrase,
  redirectTo = "/admin/customers",
  autoOpen = false,
}: Props): React.ReactElement {
  const nav = useProgressRouter();
  const [busy, setBusy] = useState<null | "impact" | "export" | "erase">(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsExport, setNeedsExport] = useState(false);
  const [exported, setExported] = useState(false);
  const [typed, setTyped] = useState("");
  // Default OFF: keeping the commercial record is the safe answer for a real
  // customer. Ticking it is for a mistake — a duplicate or a lead that went
  // nowhere — and the operator says so explicitly rather than the code guessing.
  const [deleteRelated, setDeleteRelated] = useState(false);

  const handleOpen = useCallback(async (): Promise<void> => {
    setError(null);
    setBusy("impact");
    try {
      const res = await getEraseImpact(customerUserId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCounts(res.counts);
      setToken(res.token);
      setNeedsExport(res.needsExport);
    } finally {
      setBusy(null);
    }
  }, [customerUserId]);

  // Fires once. The impact has to be fetched from the server, so there is no
  // way to have it at first render; the ref keeps a re-render from asking twice.
  const opened = useRef(false);
  useEffect(() => {
    if (!autoOpen || opened.current) return;
    opened.current = true;
    void handleOpen();
  }, [autoOpen, handleOpen]);

  async function handleExport(): Promise<void> {
    setError(null);
    setBusy("export");
    try {
      const res = await exportCustomerSnapshot(customerUserId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const blob = new Blob([JSON.stringify(res.snapshot, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${customerUserId}.json`;
      a.click();
      URL.revokeObjectURL(url);

      // The export token is the one the server will accept when data exists.
      setToken(res.token);
      setCounts(res.snapshot.counts);
      setExported(true);
      toast.success("Копия данных выгружена");
    } finally {
      setBusy(null);
    }
  }

  async function handleErase(): Promise<void> {
    if (!token) return;
    setError(null);
    setBusy("erase");
    try {
      const res = await eraseCustomer(customerUserId, typed, token, { deleteRelated });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Удалено");
      nav.push(redirectTo);
    } finally {
      setBusy(null);
    }
  }

  if (counts === null) {
    if (autoOpen) {
      return (
        <p className="text-sm text-[var(--foreground-muted)]">
          {error ?? "Проверяем связанные данные…"}
        </p>
      );
    }
    return (
      <div>
        <button
          type="button"
          onClick={handleOpen}
          disabled={busy !== null}
          className="btn btn-secondary text-sm"
        >
          {busy === "impact" ? "Проверяем…" : "Удалить безвозвратно"}
        </button>
        {error ? (
          <div className="mt-2 bg-[var(--color-error-bg)] text-[var(--color-error)] px-3 py-2 rounded-lg text-xs">
            {error}
          </div>
        ) : null}
      </div>
    );
  }

  const attached = Object.entries(counts).filter(([key, n]) => n > 0 && OUTCOME[key] !== undefined);
  const kept = attached.filter(([key]) => OUTCOME[key].kept);
  const removed = attached.filter(([key]) => !OUTCOME[key].kept);
  const canErase =
    typed.trim().toLowerCase() === confirmPhrase.toLowerCase() &&
    (!needsExport || exported) &&
    busy === null;

  return (
    <div className="rounded-lg border border-[var(--color-error)]/40 p-3 space-y-3">
      <p className="text-sm font-medium">Удалить «{customerName}» безвозвратно</p>

      {attached.length === 0 ? (
        <p className="text-xs text-[var(--foreground-muted)]">
          Связанных данных нет — будет удалена только сама запись.
        </p>
      ) : (
        <>
          {kept.length > 0 ? (
            <div>
              <p className="text-xs text-[var(--foreground-muted)]">
                {deleteRelated
                  ? "Будет удалено вместе с клиентом:"
                  : "Сохранится в базе, но открепится от клиента:"}
              </p>
              <ul className="text-xs list-disc pl-5 space-y-0.5 mt-0.5">
                {kept.map(([key, n]) => (
                  <li key={key}>
                    {OUTCOME[key].label}: <strong>{n}</strong>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                {deleteRelated
                  ? "Выручка по этим сделкам исчезнет из отчётов, а работы — из гарантийной истории."
                  : "Эти записи останутся для бухгалтерии и гарантии; при необходимости их можно привязать к другому клиенту вручную."}
              </p>

              {/* The one real decision on this screen, so it looks like one:
                  boxed, and tinted red once armed so the operator cannot tick
                  it without noticing that the answer changed. */}
              <label
                className={`flex items-start gap-2.5 text-xs mt-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  deleteRelated
                    ? "border-[var(--color-error)] bg-[var(--color-error-bg)]"
                    : "border-[var(--border)] bg-[var(--background-secondary)] hover:border-[var(--color-error)]/40"
                }`}
              >
                <input
                  type="checkbox"
                  checked={deleteRelated}
                  onChange={(e) => setDeleteRelated(e.target.checked)}
                  className="mt-0.5 w-4 h-4 shrink-0 accent-[var(--color-error)]"
                />
                <span>
                  <span
                    className={`block font-semibold ${
                      deleteRelated ? "text-[var(--color-error)]" : ""
                    }`}
                  >
                    Удалить и связанные записи
                  </span>
                  <span className="block text-[var(--foreground-muted)] mt-0.5">
                    Сделки, сметы, заказ-наряды, отгрузки, аренды и письма — у клиента; задачи —
                    у сотрудника. Для ошибочных и дублирующих записей. Для настоящего клиента или
                    работающего сотрудника оставьте выключенным.
                  </span>
                </span>
              </label>
            </div>
          ) : null}

          {removed.length > 0 ? (
            <div>
              <p className="text-xs text-[var(--foreground-muted)]">Удалится безвозвратно:</p>
              <ul className="text-xs list-disc pl-5 space-y-0.5 mt-0.5">
                {removed.map(([key, n]) => (
                  <li key={key}>
                    {OUTCOME[key].label}: <strong>{n}</strong>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                Вместе с самой карточкой, заметками и контактами. Вернуть можно будет только из
                выгруженного файла.
              </p>
              <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                {deleteRelated
                  ? "Письма этого клиента тоже будут удалены из почтового ящика CRM. Треды, где были другие адресаты, останутся."
                  : "Сами письма останутся в почтовом ящике CRM — это переписка сервиса."}
              </p>
            </div>
          ) : null}
        </>
      )}

      {needsExport ? (
        <button
          type="button"
          onClick={handleExport}
          disabled={busy !== null}
          className="btn btn-secondary text-sm"
        >
          {busy === "export"
            ? "Готовим файл…"
            : exported
              ? "Копия выгружена ✓"
              : "Выгрузить копию данных"}
        </button>
      ) : null}

      <div className="space-y-2">
        <label className="block text-xs text-[var(--foreground-muted)]">
          Для подтверждения введите <code className="select-all">{confirmPhrase}</code>
        </label>
        <input
          className="input"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={confirmPhrase}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={handleErase}
          disabled={!canErase}
          className="btn text-sm bg-[var(--color-error)] text-white disabled:opacity-40"
        >
          {busy === "erase" ? "Удаляем…" : "Удалить"}
        </button>
        {needsExport && !exported ? (
          <p className="text-xs text-[var(--foreground-muted)]">
            Сначала выгрузите копию — без неё удаление не выполнится.
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-3 py-2 rounded-lg text-xs">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          setCounts(null);
          setToken(null);
          setExported(false);
          setTyped("");
          setError(null);
        }}
        className="text-xs text-[var(--foreground-muted)] hover:underline"
      >
        Отмена
      </button>
    </div>
  );
}
