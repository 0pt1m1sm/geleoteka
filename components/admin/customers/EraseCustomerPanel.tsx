"use client";

import { useState } from "react";

import { useProgressRouter } from "@/components/shared/NavigationProgressProvider";
import { eraseCustomer, exportCustomerSnapshot } from "@/app/actions/crm/customer-erase";
import { toast } from "@/lib/ui/toast";

interface Props {
  customerUserId: string;
  customerName: string;
  /** Email or phone — what the operator must retype to confirm. */
  confirmPhrase: string;
}

/**
 * Full erase: the customer and everything attached to them.
 *
 * Gated in three ways on purpose. The snapshot must be downloaded first (the
 * erase is refused without the token it returns), the operator retypes the
 * customer's email or phone, and the counts are shown before the button
 * unlocks. Archiving remains the normal action; this is for the cases where
 * data genuinely has to go.
 */
export function EraseCustomerPanel({
  customerUserId,
  customerName,
  confirmPhrase,
}: Props): React.ReactElement {
  const nav = useProgressRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | "export" | "erase">(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [typed, setTyped] = useState("");

  async function handleExport(): Promise<void> {
    setError(null);
    setBusy("export");
    try {
      const res = await exportCustomerSnapshot(customerUserId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Hand the file to the operator before anything is destroyed.
      const blob = new Blob([JSON.stringify(res.snapshot, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `customer-${customerUserId}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setToken(res.token);
      setCounts(res.snapshot.counts);
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
      const res = await eraseCustomer(customerUserId, typed, token);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Клиент и его данные удалены");
      nav.push("/admin/customers");
    } finally {
      setBusy(null);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-[var(--color-error)] hover:underline"
      >
        Удалить клиента и все его данные…
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--color-error)]/40 p-3 space-y-3">
      <p className="text-sm font-medium">Полное удаление «{customerName}»</p>
      <p className="text-xs text-[var(--foreground-muted)]">
        Удалит клиента вместе с заказ-нарядами, сделками, сметами, перепиской и автомобилями.
        Восстановить из системы будет нельзя — только из выгруженного файла. Обычный сценарий —
        «Скрыть из CRM», он обратим.
      </p>

      {counts ? (
        <p className="text-xs">
          Будет удалено: заказ-наряды — {counts.repairOrders}, сделки — {counts.deals},
          переписка — {counts.communications}, автомобили — {counts.vehicles}.
        </p>
      ) : null}

      <button
        type="button"
        onClick={handleExport}
        disabled={busy !== null}
        className="btn btn-secondary text-sm"
      >
        {busy === "export" ? "Готовим файл…" : "1. Выгрузить копию данных"}
      </button>

      {token ? (
        <div className="space-y-2">
          <label className="block text-xs text-[var(--foreground-muted)]">
            2. Для подтверждения введите <code className="select-all">{confirmPhrase}</code>
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
            disabled={busy !== null || typed.trim().toLowerCase() !== confirmPhrase.toLowerCase()}
            className="btn text-sm bg-[var(--color-error)] text-white disabled:opacity-40"
          >
            {busy === "erase" ? "Удаляем…" : "3. Удалить безвозвратно"}
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-3 py-2 rounded-lg text-xs">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-[var(--foreground-muted)] hover:underline"
      >
        Отмена
      </button>
    </div>
  );
}
