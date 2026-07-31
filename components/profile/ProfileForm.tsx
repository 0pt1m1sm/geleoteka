"use client";

import { useActionState } from "react";

import { Alert, Button, Input, Select } from "@/components/ui";
import { updateOwnProfile } from "@/app/actions/profile";
import type { LOCALES, TIME_ZONES } from "@/lib/profile-options";

interface Props {
  initial: {
    name: string;
    email: string;
    phone: string;
    timeZone: string | null;
    locale: string | null;
  };
  timeZones: typeof TIME_ZONES;
  locales: typeof LOCALES;
}

export function ProfileForm({ initial, timeZones, locales }: Props): React.ReactElement {
  const [state, formAction, isPending] = useActionState(updateOwnProfile, null);

  return (
    <form action={formAction} className="card space-y-4">
      <Input label="Имя" name="name" defaultValue={initial.name} required maxLength={120} />
      <Input label="Email" name="email" type="email" defaultValue={initial.email} required />
      <Input label="Телефон" name="phone" defaultValue={initial.phone} required />

      <Select
        label="Часовой пояс"
        name="timeZone"
        defaultValue={initial.timeZone ?? ""}
        helperText="Время записи всегда показывается по часам сервиса — когда привозить машину, не зависит от того, где сейчас вы."
      >
        <option value="">Как у сервиса (Москва)</option>
        {timeZones.map((z) => (
          <option key={z.value} value={z.value}>
            {z.label}
          </option>
        ))}
      </Select>

      <Select label="Язык" name="locale" defaultValue={initial.locale ?? ""}>
        <option value="">По умолчанию</option>
        {locales.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </Select>

      {state?.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state?.success ? <Alert variant="success">Сохранено</Alert> : null}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Сохраняем…" : "Сохранить"}
      </Button>
    </form>
  );
}
