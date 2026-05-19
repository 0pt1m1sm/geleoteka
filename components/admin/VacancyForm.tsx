"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createVacancy, updateVacancy } from "@/app/actions/vacancies";
import { AdminFormShell } from "./AdminFormShell";

interface InitialVacancy {
  id: string;
  title: string;
  type: string;
  description: string;
  requirements: string[];
  isActive: boolean;
  sortOrder: number;
}

interface Props {
  initial?: InitialVacancy;
}

const TYPE_OPTIONS = ["Полная занятость", "Частичная занятость", "Стажировка", "Удалённо", "Подработка"];

export function VacancyForm({ initial }: Props): React.ReactElement {
  const action = initial
    ? updateVacancy.bind(null, initial.id)
    : createVacancy;
  const [state, formAction, isPending] = useActionState(action, null);
  const isEditing = !!initial;

  return (
    <form action={formAction} className="card space-y-4">
      <AdminFormShell error={state?.error}>
        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-2">Название должности *</label>
          <input
            id="title"
            name="title"
            required
            maxLength={120}
            className="input"
            placeholder="Автомеханик"
            defaultValue={initial?.title ?? ""}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="type" className="block text-sm font-medium mb-2">Тип занятости</label>
            <select
              id="type"
              name="type"
              className="input"
              defaultValue={initial?.type ?? "Полная занятость"}
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sortOrder" className="block text-sm font-medium mb-2">Порядок (меньше = выше)</label>
            <input
              id="sortOrder"
              name="sortOrder"
              type="number"
              className="input"
              placeholder="0"
              defaultValue={initial?.sortOrder ?? 0}
            />
          </div>
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium mb-2">Описание *</label>
          <textarea
            id="description"
            name="description"
            required
            className="input min-h-[140px] resize-y"
            placeholder="Чем будет заниматься, в команду какого направления ищем..."
            defaultValue={initial?.description ?? ""}
          />
        </div>

        <div>
          <label htmlFor="requirements" className="block text-sm font-medium mb-2">
            Требования <span className="text-[var(--foreground-muted)]">(каждое с новой строки)</span>
          </label>
          <textarea
            id="requirements"
            name="requirements"
            className="input min-h-[120px] resize-y"
            placeholder={`Опыт работы с G-Class от 2 лет\nУмение работать с диагностическим оборудованием\nЗнание DAS/Xentry`}
            defaultValue={(initial?.requirements ?? []).join("\n")}
          />
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={initial?.isActive ?? true}
            className="w-4 h-4 accent-[var(--color-accent)]"
          />
          <span className="text-sm">Активна (показывается на /vacancies)</span>
        </label>

        <div className="flex gap-4 pt-2">
          <Link href="/admin/vacancies" className="btn btn-secondary">Отмена</Link>
          <button type="submit" disabled={isPending} data-loading={isPending || undefined} aria-busy={isPending || undefined} className="btn btn-primary">
            {isPending ? "Сохранение..." : isEditing ? "Сохранить" : "Добавить"}
          </button>
        </div>
      </AdminFormShell>
    </form>
  );
}
