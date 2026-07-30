"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProgressRouter } from "@/components/shared/NavigationProgressProvider";
import { confirm } from "@/lib/ui/confirm";
import {
  resetUserPassword,
  changeUserRole,
  setUserDisabled,
  getPurgeBlockers,
  purgeEmptyUser,
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
  const nav = useProgressRouter();
  const [pending, setPending] = useState<null | "reset" | "role" | "disable" | "purge">(null);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [role, setRole] = useState(currentRole);
  const isDisabled = currentRole === "NONE";

  /**
   * Permanently remove a person who has nothing attached — the cleanup path for
   * duplicates and abandoned registrations, which archiving alone would leave
   * piling up forever. Anyone with history is refused by the server (and, if
   * that check ever misses a relation, by the database's RESTRICT constraints).
   */
  async function handlePurge(): Promise<void> {
    setError(null);
    setPending("purge");
    try {
      const check = await getPurgeBlockers(userId);
      if (!check.ok) {
        setError(check.error);
        return;
      }
      if (check.blockers.length > 0) {
        const detail = check.blockers.map((b) => `${b.label}: ${b.count}`).join(", ");
        setError(
          `Нельзя удалить — есть связанные записи (${detail}). Такого пользователя можно только заблокировать или архивировать.`,
        );
        return;
      }
      const ok = await confirm({
        message: `Удалить «${userName}» безвозвратно? У пользователя нет связанных записей. Действие необратимо.`,
      });
      if (!ok) return;

      const res = await purgeEmptyUser(userId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      nav.push("/admin/users");
    } finally {
      setPending(null);
    }
  }

  async function handleReset(): Promise<void> {
    if (
      !(await confirm({ message: `Сбросить пароль для «${userName}»? Будет сгенерирован новый временный пароль и отправлен по SMS.` }))
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
    const nextLabel = ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
    const ok = await confirm({
      message: `Изменить роль «${userName}» на ${nextLabel}?`,
    });
    if (!ok) {
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
    if (!(await confirm({ message: `${verb} аккаунт «${userName}»?` }))) return;
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
          data-loading={pending === "reset" || undefined}
          aria-busy={pending === "reset" || undefined}
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
            data-loading={pending === "role" || undefined}
            aria-busy={pending === "role" || undefined}
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
          data-loading={pending === "disable" || undefined}
          aria-busy={pending === "disable" || undefined}
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

      <div className="border-t border-[var(--border)] pt-4">
        <p className="text-xs text-[var(--foreground-muted)] mb-2">Очистка</p>
        <button
          type="button"
          onClick={handlePurge}
          disabled={!viewerIsAdmin || isSelf || pending !== null}
          data-loading={pending === "purge" || undefined}
          aria-busy={pending === "purge" || undefined}
          className="btn btn-secondary text-sm"
        >
          {pending === "purge" ? "Проверяем…" : "Удалить безвозвратно"}
        </button>
        <p className="text-xs text-[var(--foreground-muted)] mt-1">
          Только для пустых записей — дублей и брошенных регистраций. Если у пользователя есть
          заказы, сделки или переписка, удаление будет отклонено: историю не стираем.
        </p>
      </div>
    </div>
  );
}
