"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createCustomer } from "@/app/actions/customers";
import { AdminFormShell } from "@/components/admin/AdminFormShell";

function CreateForm(): React.ReactElement {
  const [state, formAction, isPending] = useActionState(createCustomer, null);

  return (
    <form action={formAction} className="card space-y-4">
      <AdminFormShell error={state && !state.ok ? state.error : null}>
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-2">
            Имя *
          </label>
          <input id="name" name="name" required maxLength={120} className="input" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="phone" className="block text-sm font-medium mb-2">
              Телефон *
            </label>
            <input id="phone" name="phone" type="tel" required className="input" />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">
              Email *
            </label>
            <input id="email" name="email" type="email" required className="input" />
          </div>
        </div>

        <div>
          <label htmlFor="note" className="block text-sm font-medium mb-2">
            Стартовая заметка
          </label>
          <textarea
            id="note"
            name="note"
            maxLength={4000}
            className="input min-h-[100px] resize-y"
            placeholder="Опционально — например, повод обращения"
          />
        </div>

        <div className="flex justify-end pt-2 border-t border-[var(--border)]">
          <button type="submit" disabled={isPending} className="btn btn-primary">
            {isPending ? "Создание..." : "Создать"}
          </button>
        </div>
      </AdminFormShell>
      <SuccessPanelGate state={state} />
    </form>
  );
}

function SuccessPanelGate({
  state,
}: {
  state: Awaited<ReturnType<typeof createCustomer>> | null;
}): React.ReactElement | null {
  // The success panel renders BELOW the form so the form clears and the
  // password is visible until the manager navigates away or resets.
  if (!state || !state.ok) return null;
  return <SuccessPanel tempPassword={state.tempPassword} customerId={state.customerId} />;
}

function SuccessPanel({
  tempPassword,
  customerId,
}: {
  tempPassword: string;
  customerId: string;
}): React.ReactElement {
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure origin) — silent; user can copy manually.
    }
  }

  return (
    <div className="alert alert-success space-y-3">
      <p className="font-medium">Клиент создан</p>
      <p className="text-sm">
        Временный пароль (запишите — больше не покажем):
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <code
          aria-label="Временный пароль"
          className="px-3 py-2 rounded-[var(--radius-md)] bg-[var(--background-secondary)] font-mono text-sm select-all"
        >
          {tempPassword}
        </code>
        <button
          type="button"
          aria-label="Скопировать временный пароль"
          onClick={handleCopy}
          className="btn btn-secondary text-sm"
        >
          {copied ? "Скопировано" : "Скопировать"}
        </button>
      </div>
      <div className="flex gap-3 flex-wrap">
        <Link href={`/admin/customers/${customerId}`} className="btn btn-primary text-sm">
          Перейти к карточке
        </Link>
        <Link href="/admin/customers/new" className="btn btn-secondary text-sm">
          Создать ещё одного
        </Link>
      </div>
    </div>
  );
}

export function CustomerCreateForm(): React.ReactElement {
  return <CreateForm />;
}
