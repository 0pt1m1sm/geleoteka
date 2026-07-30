"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Card } from "@/components/ui";
import { confirm } from "@/lib/ui/confirm";
import { changeUserRole } from "@/app/actions/user-management";

export interface RoleRow {
  id: string;
  name: string;
  /** Email, else phone — whatever identifies the person at a glance. */
  contact: string;
  permissionRole: string;
  isSelf: boolean;
}

const ROLE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "ADMIN", label: "Администратор" },
  { value: "MANAGER", label: "Менеджер" },
  { value: "MASTER", label: "Мастер" },
  { value: "WAREHOUSE_WORKER", label: "Кладовщик" },
  { value: "CLIENT", label: "Клиент" },
  { value: "NONE", label: "Без доступа" },
];

/**
 * Staff roster with an inline role selector.
 *
 * Demoting yourself and removing the last admin are refused by the server
 * action; the self row is disabled here as well so the failure is visible
 * before the click rather than after it.
 */
export function RolesTable({ rows }: { rows: RoleRow[] }): React.ReactElement {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(row: RoleRow, next: string): Promise<void> {
    if (next === row.permissionRole) return;
    const label = ROLE_OPTIONS.find((o) => o.value === next)?.label ?? next;
    if (!(await confirm({ message: `Изменить роль «${row.name}» на ${label}?` }))) {
      router.refresh();
      return;
    }
    setError(null);
    setPendingId(row.id);
    try {
      const res = await changeUserRole(row.id, next);
      if (!res.ok) setError(res.error);
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <Card>
        <p className="text-sm text-[var(--foreground-muted)]">
          Сотрудников с доступом пока нет. Роль назначается зарегистрированному пользователю —
          человек регистрируется сам, затем администратор повышает его здесь.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-0">
      {error ? (
        <div className="m-4 bg-[var(--color-error-bg)] text-[var(--color-error)] px-3 py-2 rounded-lg text-xs">
          {error}
        </div>
      ) : null}
      <ul className="divide-y divide-[var(--border)]">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <Link href={`/admin/users/${row.id}`} className="font-medium hover:underline">
                {row.name}
              </Link>
              <div className="text-xs text-[var(--foreground-muted)] truncate">{row.contact}</div>
            </div>
            <div className="flex items-center gap-2">
              {row.isSelf ? (
                <span className="text-xs text-[var(--foreground-muted)]">
                  это вы — роль меняет другой администратор
                </span>
              ) : null}
              <select
                className="input max-w-[200px]"
                defaultValue={row.permissionRole}
                disabled={row.isSelf || pendingId !== null}
                onChange={(e) => void handleChange(row, e.target.value)}
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
