"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input } from "@/components/ui";
import { upsertSettings } from "@/app/actions/settings";
import { SECRET_PLACEHOLDER } from "@/lib/settings-shared";
import type { SettingDescriptor } from "@/lib/settings";

interface FieldState {
  descriptor: SettingDescriptor;
  /** Where the active value comes from right now: 'db' | 'env' | 'none'. */
  source: "db" | "env" | "none";
}

interface Props {
  groupName: string;
  fields: FieldState[];
  /** Optional read-only info row rendered above the fields (e.g. webhook URL). */
  infoRows?: Array<{ label: string; value: string; copyable?: boolean }>;
}

/**
 * Single form for an entire integration group (e.g. all Resend settings).
 * One Save button per group, pinned to the bottom of the card.
 *
 * Each input's `name` IS the setting key — the action reads form entries
 * directly. Secret fields render with a •••••• placeholder when a value
 * exists; submitting the placeholder unchanged is a no-op.
 */
export function SettingGroupForm({ groupName, fields, infoRows }: Props): React.ReactElement {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(upsertSettings, null);

  useEffect(() => {
    if (state?.ok && !isPending) router.refresh();
  }, [state, isPending, router]);

  return (
    <form action={formAction} className="card space-y-5">
      <h2 className="text-base font-semibold">{groupName}</h2>

      {infoRows && infoRows.length > 0 ? (
        <div className="space-y-2 rounded border border-[var(--border)] bg-[var(--background-secondary)] p-3 text-xs">
          {infoRows.map((row) => (
            <InfoRow key={row.label} {...row} />
          ))}
        </div>
      ) : null}

      <div className="space-y-5">
        {fields.map(({ descriptor: s, source }) => (
          <SettingField key={s.key} descriptor={s} source={source} />
        ))}
      </div>

      {state?.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state?.ok && state.savedKeys && state.savedKeys.length > 0 ? (
        <Alert variant="success">
          Сохранено ({state.savedKeys.length}). Перечитывается всеми инстансами в течение 60 сек.
        </Alert>
      ) : null}
      {state?.ok && state.savedKeys && state.savedKeys.length === 0 ? (
        <Alert variant="info">Нет изменений для сохранения.</Alert>
      ) : null}

      <div className="sticky bottom-0 -mx-4 -mb-4 px-4 py-3 border-t border-[var(--border)] bg-[var(--card)] flex justify-end rounded-b-[var(--radius-lg)]">
        <Button type="submit" isLoading={isPending} disabled={isPending}>
          Сохранить
        </Button>
      </div>
    </form>
  );
}

function InfoRow({
  label,
  value,
  copyable,
}: {
  label: string;
  value: string;
  copyable?: boolean;
}): React.ReactElement {
  const [copied, setCopied] = useState(false);

  function handleCopy(): void {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[var(--foreground-muted)]">{label}</div>
        <div className="font-mono text-xs truncate select-all">{value}</div>
      </div>
      {copyable ? (
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 text-xs text-[var(--color-accent)] hover:underline"
        >
          {copied ? "✓ Скопировано" : "Копировать"}
        </button>
      ) : null}
    </div>
  );
}

function SettingField({
  descriptor: s,
  source,
}: {
  descriptor: SettingDescriptor;
  source: "db" | "env" | "none";
}): React.ReactElement {
  // Neutral source labels — "none" is informational, not an error state.
  const sourceLabel =
    source === "db" ? "✓ задано в админке" : source === "env" ? "из переменной окружения" : "не задано";
  const sourceClass =
    source === "db"
      ? "text-[var(--color-accent)]"
      : "text-[var(--foreground-muted)]";

  // For secret fields with an existing value, show placeholder so user
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
    </div>
  );
}
