"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { updateFounder, deleteFounder } from "@/app/actions/founders";

interface FounderData {
  id: string;
  name: string;
  email: string;
  phone: string;
  sharePercent: number;
  sortOrder: number;
  isActive: boolean;
}

export function FounderEditForm({ founder }: { founder: FounderData }) {
  const router = useRouter();
  const boundAction = updateFounder.bind(null, founder.id);
  const [state, formAction, isPending] = useActionState(boundAction, null);

  async function handleDelete() {
    if (!confirm(`Деактивировать учредителя "${founder.name}"? История взносов сохранится.`)) return;
    await deleteFounder(founder.id);
    router.push("/admin/founders");
  }

  return (
    <form action={formAction} className="card space-y-4">
      {state?.error && (
        <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm">
          {state.error}
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium mb-2">Имя *</label>
        <input id="name" name="name" required defaultValue={founder.name} className="input" />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-2">Email</label>
        <input id="email" name="email" type="email" defaultValue={founder.email} className="input" />
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium mb-2">Телефон</label>
        <input id="phone" name="phone" type="tel" defaultValue={founder.phone} className="input" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="sharePercent" className="block text-sm font-medium mb-2">Доля (%) *</label>
          <input id="sharePercent" name="sharePercent" type="number" min={0} max={100} required defaultValue={founder.sharePercent} className="input" />
        </div>
        <div>
          <label htmlFor="sortOrder" className="block text-sm font-medium mb-2">Порядок</label>
          <input id="sortOrder" name="sortOrder" type="number" defaultValue={founder.sortOrder} className="input" />
        </div>
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" name="isActive" defaultChecked={founder.isActive} className="w-4 h-4 accent-[var(--color-accent)]" />
        <span className="text-sm">Активен</span>
      </label>

      <div className="flex gap-4 pt-4 border-t border-[var(--border)]">
        <button type="button" onClick={handleDelete} className="btn btn-secondary text-sm text-[var(--color-error)]">
          Деактивировать
        </button>
        <div className="flex-1" />
        <button type="submit" disabled={isPending} className="btn btn-primary">
          {isPending ? "Сохранение..." : "Сохранить"}
        </button>
      </div>
    </form>
  );
}
