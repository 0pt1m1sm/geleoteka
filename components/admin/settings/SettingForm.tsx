"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input } from "@/components/ui";
import { upsertSetting } from "@/app/actions/settings";

interface Props {
  settingKey: string;
  label: string;
  description?: string;
  secret?: boolean;
  /** Where the active value lives right now: 'db' | 'env' | 'none'. */
  source: "db" | "env" | "none";
}

export function SettingForm({
  settingKey,
  label,
  description,
  secret,
  source,
}: Props): React.ReactElement {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(upsertSetting, null);
  const [value, setValue] = useState("");

  // Refresh server data once the action returns ok. We do NOT clear the
  // input — that would be a setState in an effect (React 19 lint). User
  // sees what they entered; they can clear manually if needed.
  useEffect(() => {
    if (state?.ok && !isPending) router.refresh();
  }, [state, isPending, router]);

  const sourceLabel =
    source === "db"
      ? "Установлено в админке"
      : source === "env"
        ? "Используется переменная окружения"
        : "Не задано";
  const sourceClass =
    source === "db"
      ? "text-[var(--color-accent)]"
      : source === "env"
        ? "text-[var(--foreground-muted)]"
        : "text-[var(--color-error)]";

  return (
    <form action={formAction} className="card space-y-3">
      <input type="hidden" name="key" value={settingKey} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{label}</h3>
          <p className="text-xs font-mono text-[var(--foreground-muted)]">{settingKey}</p>
        </div>
        <span className={`text-xs shrink-0 ${sourceClass}`}>{sourceLabel}</span>
      </div>

      {description ? (
        <p className="text-sm text-[var(--foreground-muted)]">{description}</p>
      ) : null}

      <Input
        label={secret ? "Новое значение (не отображается)" : "Значение"}
        name="value"
        type={secret ? "password" : "text"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={source === "db" ? "Оставьте пустым чтобы вернуть env" : "Введите значение"}
        autoComplete="new-password"
      />

      {state?.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state?.ok ? (
        <Alert variant="success">Сохранено. Перечитывается на всех инстансах в течение 60 сек.</Alert>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" isLoading={isPending} disabled={isPending}>
          {value.trim() ? "Сохранить" : "Сбросить на env"}
        </Button>
      </div>
    </form>
  );
}
