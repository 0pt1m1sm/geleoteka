"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button } from "@/components/ui";
import { resetRolePermissions, setRolePermissions } from "@/app/actions/roles";
import {
  PERMISSION_GROUPS,
  PERMISSION_META,
  PERMISSIONS,
  type Permission,
} from "@/lib/permissions";
import { confirm } from "@/lib/ui/confirm";
import { toast } from "@/lib/ui/toast";

/**
 * The checkboxes that decide what a role opens.
 *
 * Save is deliberately explicit rather than per-checkbox: revoking access one
 * click at a time would take effect halfway through a change of mind, and an
 * admin editing a role usually has a shape in mind, not a single toggle.
 */
export function RolePermissionsEditor({
  role,
  roleLabel,
  initial,
  usingDefaults,
}: {
  role: string;
  roleLabel: string;
  initial: Permission[];
  /** Never edited — running on the code defaults shown here. */
  usingDefaults: boolean;
}): React.ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [granted, setGranted] = useState<Set<string>>(new Set(initial));
  const [saved, setSaved] = useState<Set<string>>(new Set(initial));

  const dirty =
    granted.size !== saved.size || [...granted].some((p) => !saved.has(p));

  function toggle(permission: Permission): void {
    setGranted((prev) => {
      const next = new Set(prev);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  }

  function save(): void {
    startTransition(async () => {
      setError(null);
      const result = await setRolePermissions(role, [...granted]);
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      setSaved(new Set(granted));
      toast.success(`Права роли «${roleLabel}» сохранены`);
      router.refresh();
    });
  }

  async function reset(): Promise<void> {
    const ok = await confirm({
      title: "Вернуть значения по умолчанию",
      message: `Права роли «${roleLabel}» вернутся к тем, что заданы в коде.`,
      confirmText: "Вернуть",
    });
    if (!ok) return;
    startTransition(async () => {
      setError(null);
      const result = await resetRolePermissions(role);
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Права возвращены к умолчанию");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {PERMISSION_GROUPS.map((group) => {
        const inGroup = PERMISSIONS.filter((p) => PERMISSION_META[p].group === group);
        if (inGroup.length === 0) return null;
        return (
          <div key={group}>
            <p className="text-xs uppercase tracking-wider text-[var(--foreground-muted)] mb-1.5">
              {group}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
              {inGroup.map((permission) => (
                <label
                  key={permission}
                  className="flex items-start gap-2.5 text-sm cursor-pointer py-1"
                >
                  <input
                    type="checkbox"
                    checked={granted.has(permission)}
                    onChange={() => toggle(permission)}
                    disabled={pending}
                    className="mt-0.5 w-4 h-4 shrink-0 accent-[var(--color-accent)]"
                  />
                  <span>
                    <span className="block">{PERMISSION_META[permission].label}</span>
                    <span className="block text-xs text-[var(--foreground-muted)]">
                      {PERMISSION_META[permission].detail}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="flex items-center gap-3 pt-1">
        <Button type="button" onClick={save} disabled={!dirty || pending} size="sm">
          {pending ? "Сохраняем…" : "Сохранить"}
        </Button>
        {!usingDefaults ? (
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className="text-xs text-[var(--foreground-muted)] hover:underline"
          >
            Вернуть значения по умолчанию
          </button>
        ) : null}
        {dirty ? (
          <span className="text-xs text-[var(--foreground-muted)]">Есть несохранённые изменения</span>
        ) : null}
      </div>
    </div>
  );
}
