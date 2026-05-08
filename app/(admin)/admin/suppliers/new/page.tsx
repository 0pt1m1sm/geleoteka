"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createSupplier } from "@/app/actions/suppliers";
import { AdminFormShell } from "@/components/admin/AdminFormShell";
import { EMAIL_PATTERN, EMAIL_TITLE, PHONE_PATTERN, PHONE_TITLE } from "@/lib/utils";

export default function NewSupplierPage() {
  const [state, formAction, isPending] = useActionState(createSupplier, null);

  return (
    <div className="max-w-lg">
      <h1 className="text-display text-2xl font-bold mb-6">Добавить поставщика</h1>

      <form action={formAction} className="card space-y-4">
        <AdminFormShell error={state?.error}>

        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-2">Название *</label>
          <input id="name" name="name" required className="input" placeholder="Mercedes-Benz Parts GmbH" />
        </div>

        <div>
          <label htmlFor="contactName" className="block text-sm font-medium mb-2">Контактное лицо</label>
          <input id="contactName" name="contactName" className="input" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              pattern={EMAIL_PATTERN}
              title={EMAIL_TITLE}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium mb-2">Телефон</label>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              pattern={PHONE_PATTERN}
              title={PHONE_TITLE}
              className="input"
            />
          </div>
        </div>

        <div>
          <label htmlFor="country" className="block text-sm font-medium mb-2">Страна</label>
          <input id="country" name="country" className="input" placeholder="Германия" />
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium mb-2">Заметки</label>
          <textarea id="notes" name="notes" className="input min-h-[80px] resize-y" />
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" name="isActive" defaultChecked className="w-4 h-4 accent-[var(--color-accent)]" />
          <span className="text-sm">Активен</span>
        </label>

        <div className="flex gap-4 pt-2">
          <Link href="/admin/suppliers" className="btn btn-secondary">Отмена</Link>
          <button type="submit" disabled={isPending} className="btn btn-primary">
            {isPending ? "Сохранение..." : "Добавить"}
          </button>
        </div>
        </AdminFormShell>
      </form>
    </div>
  );
}
