import "server-only";

import { tenantDb } from "@/lib/tenant/scoped-db";
import { roleLabel } from "@/lib/roles";
import { publishUserLogin } from "@/lib/staff-notifications/publish";
import { TENANT_KEY } from "@/lib/tenant";

/**
 * Единая точка «пользователь вошёл в платформу» для ВСЕХ способов входа:
 * пароль, вход по ссылке сброса, регистрация, OAuth. Пишет AuditLog и
 * публикует событие USER_LOGIN одной транзакцией.
 *
 * Сбой записи не имеет права ломать сам вход: наблюдаемость — не ворота.
 * Ошибка глотается с безопасной проекцией (только класс исключения).
 */
export type LoginMethod =
  | "PASSWORD"
  | "PASSWORD_RESET"
  | "REGISTRATION"
  | "OAUTH_YANDEX"
  | "OAUTH_VK";

export interface LoginEventUser {
  id: string;
  name: string;
  permissionRole: string;
}

interface LoginEventTx {
  auditLog: {
    create(args: Record<string, unknown>): Promise<unknown>;
  };
  staffNotificationEvent: {
    upsert(args: Record<string, unknown>): Promise<unknown>;
  };
}

export async function recordSuccessfulLogin(
  user: LoginEventUser,
  method: LoginMethod,
): Promise<void> {
  const db = await tenantDb();
  const occurredAt = new Date();
  const transactionalDb = db as unknown as {
    $transaction<T>(callback: (tx: LoginEventTx) => Promise<T>): Promise<T>;
  };
  try {
    await transactionalDb.$transaction(async (tx) => {
      const audit = (await tx.auditLog.create({
        data: {
          tenantKey: TENANT_KEY,
          actorUserId: user.id,
          actorName: user.name,
          actorRole: roleLabel(user.permissionRole),
          action: "user.login",
          targetType: "User",
          targetId: user.id,
          targetLabel: user.name,
          metadata: { method },
          ip: null,
        },
        select: { id: true },
      })) as { id: string };
      await publishUserLogin(tx as never, {
        userId: user.id,
        userName: user.name,
        permissionRole: user.permissionRole,
        loginAuditId: audit.id,
        occurredAt,
      });
    });
  } catch (error) {
    console.error("login.audit_failed", {
      name: error instanceof Error ? error.constructor.name : typeof error,
    });
  }
}
