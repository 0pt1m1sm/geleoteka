"use client";

import { useActionState } from "react";

import { Alert, Button, Input, Textarea } from "@/components/ui";
import { saveMasterProfile } from "@/app/actions/team";

interface Props {
  userId: string;
  initial: {
    specialty: string;
    bio: string;
    yearsExperience: string;
    certifications: string;
    sortOrder: string;
    isActive: boolean;
  };
}

/**
 * Edits the public-facing part of a team member. Deliberately has no name,
 * email or phone fields — those belong to the person's account and are edited
 * under «Доступы», so the same value cannot be changed in two places.
 */
export function MasterProfileForm({ userId, initial }: Props): React.ReactElement {
  const [state, formAction, isPending] = useActionState(saveMasterProfile, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="userId" value={userId} />

      <Input
        label="Специализация"
        name="specialty"
        defaultValue={initial.specialty}
        placeholder="Например: двигатель и трансмиссия"
      />

      <Textarea
        label="О мастере"
        name="bio"
        defaultValue={initial.bio}
        placeholder="Короткое описание для страницы «О нас»"
        rows={4}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Опыт, лет"
          name="yearsExperience"
          type="number"
          inputMode="numeric"
          defaultValue={initial.yearsExperience}
          placeholder="например, 12"
        />
        <Input
          label="Порядок в списке"
          name="sortOrder"
          type="number"
          inputMode="numeric"
          defaultValue={initial.sortOrder}
          helperText="Меньше — выше в списке на сайте"
        />
      </div>

      <Input
        label="Сертификаты"
        name="certifications"
        defaultValue={initial.certifications}
        placeholder="Mercedes-Benz Master, Диагностика XENTRY"
        helperText="Через запятую"
      />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={initial.isActive} />
        Показывать на сайте
      </label>

      {state?.error ? <Alert variant="error">{state.error}</Alert> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" isLoading={isPending} disabled={isPending}>
          {isPending ? "Сохранение..." : "Сохранить"}
        </Button>
        {state?.success && !state?.error && !isPending ? (
          <span className="text-xs text-[var(--color-success)]">Сохранено</span>
        ) : null}
      </div>
    </form>
  );
}
