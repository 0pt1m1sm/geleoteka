"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSupplier, deleteSupplier } from "@/app/actions/suppliers";
import { AdminFormShell } from "./AdminFormShell";
import { EMAIL_PATTERN, EMAIL_TITLE, PHONE_PATTERN, PHONE_TITLE } from "@/lib/utils";
import { confirm } from "@/lib/ui/confirm";

interface SupplierData {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  country: string;
  notes: string;
  isActive: boolean;
}

export function SupplierEditForm({ supplier }: { supplier: SupplierData }) {
  const router = useRouter();
  const boundAction = updateSupplier.bind(null, supplier.id);
  const [state, formAction, isPending] = useActionState(boundAction, null);

  const [isDeleting, startDelete] = useTransition();
  async function handleDelete() {
    if (!(await confirm({ message: `Деактивировать поставщика "${supplier.name}"?`, danger: true, confirmText: "Деактивировать" }))) return;
    startDelete(async () => {
      await deleteSupplier(supplier.id);
      router.push("/admin/suppliers");
    });
  }

  return (
    <form action={formAction} className="card space-y-4">
      <AdminFormShell error={state?.error}>

      <div>
        <label htmlFor="name" className="block text-sm font-medium mb-2">Название *</label>
        <input id="name" name="name" required defaultValue={supplier.name} className="input" />
      </div>

      <div>
        <label htmlFor="contactName" className="block text-sm font-medium mb-2">Контактное лицо</label>
        <input id="contactName" name="contactName" defaultValue={supplier.contactName} className="input" />
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
            defaultValue={supplier.email}
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
            defaultValue={supplier.phone}
            className="input"
          />
        </div>
      </div>

      <div>
        <label htmlFor="country" className="block text-sm font-medium mb-2">Страна</label>
        <input id="country" name="country" defaultValue={supplier.country} className="input" />
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium mb-2">Заметки</label>
        <textarea id="notes" name="notes" defaultValue={supplier.notes} className="input min-h-[80px] resize-y" />
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" name="isActive" defaultChecked={supplier.isActive} className="w-4 h-4 accent-[var(--color-accent)]" />
        <span className="text-sm">Активен</span>
      </label>

      <div className="flex gap-4 pt-4 border-t border-[var(--border)]">
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          data-loading={isDeleting || undefined}
          aria-busy={isDeleting || undefined}
          className="btn btn-secondary text-sm text-[var(--color-error)]"
        >
          {isDeleting ? "Деактивация…" : "Деактивировать"}
        </button>
        <div className="flex-1" />
        <button type="submit" disabled={isPending} className="btn btn-primary">
          {isPending ? "Сохранение..." : "Сохранить"}
        </button>
      </div>
      </AdminFormShell>
    </form>
  );
}
