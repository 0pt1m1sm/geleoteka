"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input } from "@/components/ui";
import { upsertSettings, SECRET_PLACEHOLDER } from "@/app/actions/settings";
import type { SettingDescriptor } from "@/lib/settings";

interface FieldState {
  descriptor: SettingDescriptor;
  /** Where the active value comes from right now: 'db' | 'env' | 'none'. */
  source: "db" | "env" | "none";
}

interface Props {
  groupName: string;
  fields: FieldState[];
}

/**
 * Single form for an entire integration group (e.g. all Resend settings).
 * One Save button per group, not per field. Each input's `name` IS the
 * setting key — the action reads form entries directly.
 *
 * Secret fields render with a placeholder when a value already exists.
 * Submitting the placeholder unchanged is a no-op (action skips it).
 */
export function SettingGroupForm({ groupName, fields }: Props): React.ReactElement {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(upsertSettings, null);

  useEffect(() => {
    if (state?.ok && !isPending) router.refresh();
  }, [state, isPending, router]);

  return (
    <form action={formAction} className="card space-y-4">
      <h2 className="text-base font-semibold">{groupName}</h2>

      <div className="space-y-4">
        {fields.map(({ descriptor: s, source }) => (
          <SettingField key={s.key} descriptor={s} source={source} />
        ))}
      </div>

      {state?.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state?.ok && state.savedKeys && state.savedKeys.length > 0 ? (
        <Alert variant="success">
          Сохранено ({state.savedKeys.length}). Перечитывается на всех инстансах в течение 60 сек.
        </Alert>
      ) : null}
      {state?.ok && state.savedKeys && state.savedKeys.length === 0 ? (
        <Alert variant="info">Нет изменений для сохранения.</Alert>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" isLoading={isPending} disabled={isPending}>
          Сохранить
        </Button>
      </div>
    </form>
  );
}

function SettingField({
  descriptor: s,
  source,
}: {
  descriptor: SettingDescriptor;
  source: "db" | "env" | "none";
}): React.ReactElement {
  const sourceLabel =
    source === "db" ? "из админки" : source === "env" ? "из env" : "не задано";
  const sourceClass =
    source === "db"
      ? "text-[var(--color-accent)]"
      : source === "env"
        ? "text-[var(--foreground-muted)]"
        : "text-[var(--color-error)]";

  // For secret fields with an existing value, show a placeholder so user
  // sees "set, but hidden" — and pre-fill so unchanged submit is a no-op.
  const isSet = source !== "none";
  const placeholder = s.secret && isSet
    ? SECRET_PLACEHOLDER
    : isSet
      ? "значение задано"
      : "(не задано)";
  const defaultValue = s.secret && isSet ? SECRET_PLACEHOLDER : "";

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={`setting-${s.key}`} className="text-sm font-medium">
          {s.label}
        </label>
        <span className={`text-xs shrink-0 ${sourceClass}`}>{sourceLabel}</span>
      </div>
      {s.description ? (
        <p className="text-xs text-[var(--foreground-muted)]">{s.description}</p>
      ) : null}
      <Input
        id={`setting-${s.key}`}
        name={s.key}
        type={s.secret ? "password" : "text"}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete="new-password"
      />
      <p className="text-xs font-mono text-[var(--foreground-muted)]">{s.key}</p>
    </div>
  );
}
