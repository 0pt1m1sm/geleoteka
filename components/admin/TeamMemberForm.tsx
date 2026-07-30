"use client";

import { useActionState } from "react";

import { createTeamMember, updateTeamMember } from "@/app/actions/team-members";
import { AdminFormShell } from "./AdminFormShell";

interface InitialMember {
  id: string;
  name: string;
  role: string | null;
  bio: string | null;
  photoUrl: string | null;
  yearsExperience: number | null;
  certifications: string[];
  isActive: boolean;
  sortOrder: number;
}

interface Props {
  initial?: InitialMember;
}

export function TeamMemberForm({ initial }: Props): React.ReactElement {
  const action = initial ? updateTeamMember.bind(null, initial.id) : createTeamMember;
  const [state, formAction, isPending] = useActionState(action, null);
  const isEditing = !!initial;

  return (
    <form action={formAction} className="card space-y-4">
      <AdminFormShell error={state?.error}>
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-2">
            Имя *
          </label>
          <input
            id="name"
            name="name"
            required
            maxLength={120}
            className="input"
            placeholder="Алексей Петров"
            defaultValue={initial?.name ?? ""}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="role" className="block text-sm font-medium mb-2">
              Должность / специализация
            </label>
            <input
              id="role"
              name="role"
              maxLength={160}
              className="input"
              placeholder="Главный механик — двигатели"
              defaultValue={initial?.role ?? ""}
            />
          </div>
          <div>
            <label htmlFor="yearsExperience" className="block text-sm font-medium mb-2">
              Опыт, лет
            </label>
            <input
              id="yearsExperience"
              name="yearsExperience"
              type="number"
              min={0}
              max={80}
              className="input"
              placeholder="12"
              defaultValue={initial?.yearsExperience ?? ""}
            />
          </div>
        </div>

        <div>
          <label htmlFor="bio" className="block text-sm font-medium mb-2">
            О мастере
          </label>
          <textarea
            id="bio"
            name="bio"
            rows={4}
            className="input"
            placeholder="Короткое описание для страницы «О нас»"
            defaultValue={initial?.bio ?? ""}
          />
        </div>

        <div>
          <label htmlFor="certifications" className="block text-sm font-medium mb-2">
            Сертификаты
          </label>
          <textarea
            id="certifications"
            name="certifications"
            rows={3}
            className="input"
            placeholder={"Mercedes-Benz Master\nДиагностика XENTRY"}
            defaultValue={(initial?.certifications ?? []).join("\n")}
          />
          <p className="text-xs text-[var(--foreground-muted)] mt-1">По одному в строке</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="photoUrl" className="block text-sm font-medium mb-2">
              Ссылка на фото
            </label>
            <input
              id="photoUrl"
              name="photoUrl"
              className="input"
              placeholder="/images/team/petrov.jpg"
              defaultValue={initial?.photoUrl ?? ""}
            />
          </div>
          <div>
            <label htmlFor="sortOrder" className="block text-sm font-medium mb-2">
              Порядок (меньше = выше)
            </label>
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

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            value="on"
            defaultChecked={initial?.isActive ?? true}
          />
          Показывать на сайте
        </label>

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" className="btn btn-primary" disabled={isPending}>
            {isPending ? "Сохранение..." : isEditing ? "Сохранить" : "Добавить"}
          </button>
        </div>
      </AdminFormShell>
    </form>
  );
}
