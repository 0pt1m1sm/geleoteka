"use client";

import { useState } from "react";
import { updateUserContacts } from "@/app/actions/user-management";

interface Props {
  userId: string;
  initial: { name: string; email: string; phone: string };
}

/**
 * Inline edit of name/email/phone for any user. Wraps
 * updateUserContacts which validates and handles unique-violation
 * collisions across the User table.
 */
export function UserContactsForm({ userId, initial }: Props): React.ReactElement {
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty =
    name !== initial.name || email !== initial.email || phone !== initial.phone;

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await updateUserContacts(userId, { name, email, phone });
      if (!res.ok) {
        setError(res.error);
      } else {
        setSavedAt(Date.now());
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <h2 className="text-lg font-semibold">Контактные данные</h2>

      <div>
        <label htmlFor="user-name" className="block text-sm font-medium mb-2">Имя</label>
        <input
          id="user-name"
          type="text"
          required
          maxLength={120}
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="user-email" className="block text-sm font-medium mb-2">Email</label>
        <input
          id="user-email"
          type="email"
          required
          autoComplete="off"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="user-phone" className="block text-sm font-medium mb-2">Телефон</label>
        <input
          id="user-phone"
          type="tel"
          required
          autoComplete="off"
          className="input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>

      {error && (
        <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-3 py-2 rounded-lg text-xs">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !dirty}
          className="btn btn-primary text-sm"
        >
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
        {savedAt && !dirty && !error && (
          <span className="text-xs text-[var(--color-success,#16a34a)]">Сохранено</span>
        )}
      </div>
    </form>
  );
}
