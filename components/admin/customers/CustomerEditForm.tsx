"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCustomer } from "@/app/actions/customers";
import { useFormAction } from "@/lib/use-form-action";

interface InitialValues {
  name: string;
  phone: string;
  email: string;
  notes: string;
  blacklisted: boolean;
}

interface Props {
  customerUserId: string;
  initial: InitialValues;
}

export function CustomerEditForm({ customerUserId, initial }: Props): React.ReactElement {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [email, setEmail] = useState(initial.email);
  const [notes, setNotes] = useState(initial.notes);
  const [blacklisted, setBlacklisted] = useState(initial.blacklisted);
  const { pending, error, runAction, setError } = useFormAction();

  function reset(): void {
    setName(initial.name);
    setPhone(initial.phone);
    setEmail(initial.email);
    setNotes(initial.notes);
    setBlacklisted(initial.blacklisted);
    setError(null);
    setMode("view");
  }

  function save(): void {
    runAction(async () => {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("phone", phone);
      fd.set("email", email);
      fd.set("notes", notes);
      if (blacklisted) fd.set("blacklisted", "on");
      const res = await updateCustomer(customerUserId, null, fd);
      if (!res.ok) {
        throw new Error(res.error);
      }
      setMode("view");
      router.refresh();
    });
  }

  if (mode === "view") {
    return (
      <div className="card space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">Контакты</h2>
          <button
            type="button"
            onClick={() => setMode("edit")}
            className="btn btn-secondary text-sm"
          >
            Редактировать
          </button>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-[var(--foreground-muted)] text-xs uppercase tracking-wider">Телефон</dt>
            <dd>{initial.phone}</dd>
          </div>
          <div>
            <dt className="text-[var(--foreground-muted)] text-xs uppercase tracking-wider">Email</dt>
            <dd>{initial.email}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[var(--foreground-muted)] text-xs uppercase tracking-wider">Заметки о клиенте</dt>
            <dd className="whitespace-pre-wrap">{initial.notes || <span className="text-[var(--foreground-muted)]">— нет —</span>}</dd>
          </div>
          <div>
            <dt className="text-[var(--foreground-muted)] text-xs uppercase tracking-wider">Чёрный список</dt>
            <dd>{initial.blacklisted ? "Да" : "Нет"}</dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <h2 className="text-lg font-semibold">Контакты</h2>
      {error ? (
        <div className="alert alert-error">{error}</div>
      ) : null}

      <div>
        <label htmlFor="edit-name" className="block text-sm font-medium mb-2">Имя *</label>
        <input
          id="edit-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
          className="input"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="edit-phone" className="block text-sm font-medium mb-2">Телефон *</label>
          <input
            id="edit-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            className="input"
          />
        </div>
        <div>
          <label htmlFor="edit-email" className="block text-sm font-medium mb-2">Email *</label>
          <input
            id="edit-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="input"
          />
        </div>
      </div>

      <div>
        <label htmlFor="edit-notes" className="block text-sm font-medium mb-2">Заметки о клиенте</label>
        <textarea
          id="edit-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="input min-h-[80px] resize-y"
          placeholder="Свободные заметки менеджера"
        />
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={blacklisted}
          onChange={(e) => setBlacklisted(e.target.checked)}
          className="w-4 h-4 accent-[var(--color-accent)]"
        />
        <span className="text-sm">Чёрный список</span>
      </label>

      <div className="flex gap-3 pt-2 border-t border-[var(--border)]">
        <button type="button" onClick={reset} className="btn btn-secondary text-sm" disabled={pending}>
          Отмена
        </button>
        <div className="flex-1" />
        <button type="button" onClick={save} className="btn btn-primary text-sm" disabled={pending}>
          {pending ? "Сохранение..." : "Сохранить"}
        </button>
      </div>
    </div>
  );
}
