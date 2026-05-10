"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  resetUserPassword,
  changeUserRole,
  setUserDisabled,
} from "@/app/actions/user-management";

interface Props {
  userId: string;
  userName: string;
  currentRole: string;
  /** Visible only to admins — disables role/disable controls when false. */
  viewerIsAdmin: boolean;
  /** True when this user IS the viewer — disables self-affecting controls. */
  isSelf: boolean;
}

const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "CLIENT", label: "Клиент" },
  { value: "MASTER", label: "Мастер" },
  { value: "MANAGER", label: "Менеджер" },
  { value: "ADMIN", label: "Администратор" },
  { value: "NONE", label: "Без доступа" },
];

/**
 * Admin/manager toolkit shown on a user-detail page (customer, team
 * member, etc.). Bundles password reset, role change, and disable
 * into one card. Role change + disable are ADMIN-only — managers
 * see the buttons disabled with a tooltip explaining why.
 */
export function UserAdminActions({
  userId,
  userName,
  currentRole,
  viewerIsAdmin,
  isSelf,
}: Props): React.ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState<null | "reset" | "role" | "disable">(null);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [role, setRole] = useState(currentRole);
  const isDisabled = currentRole === "NONE";

  async function handleReset(): Promise<void> {
    if (
      !confirm(
        `Сбросить пароль для «${userName}»? Будет сгенерирован новый временный пароль и отправлен по SMS.`,
      )
    ) {
      return;
    }
    setError(null);
    setTempPassword(null);
    setPending("reset");
    try {
      const res = await resetUserPassword(userId);
      if (!res.ok) {
        setError(res.error);
      } else {
        setTempPassword(res.tempPassword);
      }
    } finally {
      setPending(null);
    }
  }

  async function handleRoleChange(): Promise<void> {
    if (role === currentRole) return;
    if (
      !confirm(
        `Изменить роль «${userName}» на ${ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role}?`,
      )
    ) {
      setRole(currentRole);
      return;
    }
    setError(null);
    setPending("role");
    try {
      const res = await changeUserRole(userId, role);
      if (!res.ok) {
        setError(res.error);
        setRole(currentRole);
      } else {
        router.refresh();
      }
    } finally {
      setPending(null);
    }
  }

  async function handleDisableToggle(): Promise<void> {
    const next = !isDisabled;
    const verb = next ? "Заблокировать" : "Разблокировать";
    if (!confirm(`${verb} аккаунт «${userName}»?`)) return;
    setError(null);
    setPending("disable");
    try {
      const res = await setUserDisabled(userId, next);
      if (!res.ok) {
        setError(res.error);
      } else {
        router.refresh();
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="card space-y-4">
      <h2 className="text-lg font-semibold">Управление аккаунтом</h2>

      {error && (
        <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-3 py-2 rounded-lg text-xs">
          {error}
        </div>
      )}

      {tempPassword && (
        <div className="rounded-lg border border-[var(--color-warning,#f59e0b)]/40 bg-[var(--color-warning-bg,rgba(245,158,11,0.08))] p-3">
          <p className="text-sm font-medium mb-1">Временный пароль создан</p>
          <p className="text-xs text-[var(--foreground-muted)] mb-2">
            Сообщите пользователю — мы также отправили его по SMS:
          </p>
          <code className="block bg-[var(--background)] px-3 py-2 rounded text-base font-mono select-all">
            {tempPassword}
          </code>
        </div>
      )}

      <div>
        <p className="text-xs text-[var(--foreground-muted)] mb-2">Сброс пароля</p>
        <button
          type="button"
          onClick={handleReset}
          disabled={pending !== null || isDisabled}
          className="btn btn-secondary text-sm"
        >
          {pending === "reset" ? "Создаём…" : "Создать новый пароль"}
        </button>
        {isDisabled && (
          <p className="text-xs text-[var(--foreground-muted)] mt-1">
            Сначала разблокируйте аккаунт.
          </p>
        )}
      </div>

      <div>
        <p className="text-xs text-[var(--foreground-muted)] mb-2">
          Роль (доступ к разделам сайта)
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={!viewerIsAdmin || isSelf || pending !== null}
            className="input max-w-[220px]"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleRoleChange}
            disabled={!viewerIsAdmin || isSelf || pending !== null || role === currentRole}
            className="btn btn-secondary text-sm"
          >
            {pending === "role" ? "Сохраняем…" : "Применить"}
          </button>
        </div>
        {!viewerIsAdmin && (
          <p className="text-xs text-[var(--foreground-muted)] mt-1">
            Менять роли может только администратор.
          </p>
        )}
        {isSelf && viewerIsAdmin && (
          <p className="text-xs text-[var(--foreground-muted)] mt-1">
            Свою роль изменить нельзя — попросите другого администратора.
          </p>
        )}
      </div>

      <div>
        <p className="text-xs text-[var(--foreground-muted)] mb-2">Доступ ко входу</p>
        <button
          type="button"
          onClick={handleDisableToggle}
          disabled={!viewerIsAdmin || isSelf || pending !== null}
          className={`btn text-sm ${isDisabled ? "btn-primary" : "btn-secondary"}`}
        >
          {pending === "disable"
            ? isDisabled
              ? "Разблокируем…"
              : "Блокируем…"
            : isDisabled
            ? "Разблокировать аккаунт"
            : "Заблокировать аккаунт"}
        </button>
        {!viewerIsAdmin && (
          <p className="text-xs text-[var(--foreground-muted)] mt-1">
            Блокировать может только администратор.
          </p>
        )}
      </div>
    </div>
  );
}
