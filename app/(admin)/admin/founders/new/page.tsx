"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createFounder } from "@/app/actions/founders";

export default function NewFounderPage() {
  const [state, formAction, isPending] = useActionState(createFounder, null);

  return (
    <div className="max-w-lg">
      <h1 className="text-display text-2xl font-bold mb-6">Добавить учредителя</h1>

      <form action={formAction} className="card space-y-4">
        {state?.error && (
          <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm">
            {state.error}
          </div>
        )}

        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-2">Имя *</label>
          <input id="name" name="name" required className="input" placeholder="Иван Иванов" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">Email</label>
            <input id="email" name="email" type="email" className="input" />
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium mb-2">Телефон</label>
            <input id="phone" name="phone" type="tel" className="input" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="sharePercent" className="block text-sm font-medium mb-2">Доля (%) *</label>
            <input id="sharePercent" name="sharePercent" type="number" min={0} max={100} required defaultValue="25" className="input" />
          </div>
          <div>
            <label htmlFor="sortOrder" className="block text-sm font-medium mb-2">Порядок</label>
            <input id="sortOrder" name="sortOrder" type="number" defaultValue="0" className="input" />
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" name="isActive" defaultChecked className="w-4 h-4 accent-[var(--color-accent)]" />
          <span className="text-sm">Активен</span>
        </label>

        <div className="flex gap-4 pt-2">
          <Link href="/admin/founders" className="btn btn-secondary">Отмена</Link>
          <button type="submit" disabled={isPending} className="btn btn-primary">
            {isPending ? "Сохранение..." : "Добавить"}
          </button>
        </div>
      </form>
    </div>
  );
}
