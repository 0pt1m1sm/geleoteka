"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus } from "lucide-react";
import { Button, Input } from "@/components/ui";
import {
  addCustomerContact,
  deleteCustomerContact,
} from "@/app/actions/crm/customers";
import { confirm } from "@/lib/ui/confirm";
import { toast } from "@/lib/ui/toast";

export interface ContactAlias {
  id: string;
  type: "EMAIL" | "PHONE";
  value: string;
}

interface Props {
  customerUserId: string;
  contacts: ContactAlias[];
}

/**
 * Manage a customer's secondary email/phone aliases. Primary email/phone
 * live on the customer record and are edited in CustomerEditForm; this is
 * only for the extras (so inbound from a new address auto-matches).
 */
export function CustomerContactsManager({ customerUserId, contacts }: Props): React.ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<"EMAIL" | "PHONE">("EMAIL");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const emails = contacts.filter((c) => c.type === "EMAIL");
  const phones = contacts.filter((c) => c.type === "PHONE");

  function handleAdd(): void {
    const trimmed = value.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const res = await addCustomerContact(customerUserId, type, trimmed);
      if (res.error) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success(type === "EMAIL" ? "Email добавлен" : "Телефон добавлен");
      setValue("");
      router.refresh();
    });
  }

  async function handleDelete(c: ContactAlias): Promise<void> {
    const ok = await confirm({
      message: `Удалить ${c.type === "EMAIL" ? "email" : "телефон"} ${c.value}?`,
      danger: true,
      confirmText: "Удалить",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteCustomerContact(c.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Контакт удалён");
      router.refresh();
    });
  }

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Доп. контакты</h2>
        <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
          Дополнительные email/телефоны. Письма с этих адресов
          автоматически привязываются к клиенту.
        </p>
      </div>

      {contacts.length > 0 ? (
        <ul className="space-y-1.5">
          {[...emails, ...phones].map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 text-sm border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2"
            >
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <span className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mr-2">
                  {c.type === "EMAIL" ? "email" : "тел"}
                </span>
                {c.value}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(c)}
                disabled={pending}
                className="btn-icon shrink-0"
                aria-label="Удалить контакт"
                title="Удалить"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--foreground-muted)]">
          Доп. контактов нет.
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="contact-type">
            Тип
          </label>
          <select
            id="contact-type"
            value={type}
            onChange={(e) => setType(e.target.value as "EMAIL" | "PHONE")}
            className="input text-sm sm:w-32"
          >
            <option value="EMAIL">Email</option>
            <option value="PHONE">Телефон</option>
          </select>
        </div>
        <div className="flex-1 min-w-0">
          <Input
            label="Значение"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={type === "EMAIL" ? "name@example.com" : "+79991234567"}
            type={type === "EMAIL" ? "email" : "tel"}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          leftIcon={<Plus size={14} />}
          onClick={handleAdd}
          isLoading={pending}
          disabled={pending || !value.trim()}
        >
          Добавить
        </Button>
      </div>
      {error ? <p className="alert-error text-sm">{error}</p> : null}
    </div>
  );
}
