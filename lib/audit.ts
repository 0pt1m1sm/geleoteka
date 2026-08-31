/**
 * Recording who did what.
 *
 * Written at the MUTATION, never at the permission check: "may this person
 * delete a customer" and "this person deleted this customer" are different
 * facts, and only the second is worth keeping. A check that passed and then
 * failed on a guard would otherwise appear in the log as a deletion that never
 * happened.
 *
 * Pass the surrounding transaction whenever the mutation has one. Then the log
 * row and the change it describes commit together — a deletion can never end up
 * unrecorded, and a record can never describe a deletion that rolled back.
 */
import { headers } from "next/headers";

import { db } from "@/lib/db";
import { TENANT_KEY } from "@/lib/tenant";
import { roleLabel } from "@/lib/roles";

type DbLike = Pick<typeof db, "auditLog">;

/**
 * The verbs worth a permanent record: everything that removes data, moves
 * money's paperwork, or changes who can do what. Deliberately a closed union —
 * a free-form string would drift into six spellings of the same event and make
 * the log unfilterable.
 */
export type AuditAction =
  | "user.create"
  | "user.login"
  | "customer.erase"
  | "customer.archive"
  | "customer.restore"
  | "user.role_change"
  | "user.password_reset"
  | "user.password_change"
  | "user.sessions_revoke"
  | "user.self_delete"
  | "user.block"
  | "role.permissions_set"
  | "role.permissions_reset"
  | "telegram.destination_link"
  | "telegram.destination_unlink"
  | "telegram.destination_scope_change"
  | "telegram.webhook_reply_failed"
  | "telegram.update_quarantined"
  | "staff_notification.delivery_retry"
  | "deal.delete"
  | "deal.create"
  | "estimate.delete"
  | "estimate.create"
  | "task.create"
  | "task.complete"
  | "task.cancel"
  | "task.claim"
  | "task.reassign"
  | "task.reopen"
  | "task.reschedule"
  | "inbox.link"
  | "inbox.spam"
  | "inbox.archive"
  | "customer.manager_assign"
  | "customer.manager_unassign"
  | "mail.sync_manual"
  | "vehicle.delete"
  | "repairOrder.create"
  | "blog.create"
  | "blog.update"
  | "blog.publish"
  | "blog.unpublish"
  | "blog.delete";

export const AUDIT_ACTION_LABELS: Readonly<Record<AuditAction, string>> = {
  "user.create": "Создание пользователя",
  "user.login": "Вход в платформу",
  "customer.erase": "Удаление клиента",
  "customer.archive": "Скрытие клиента из CRM",
  "customer.restore": "Восстановление клиента",
  "user.role_change": "Смена роли",
  "user.password_reset": "Сброс пароля",
  "user.password_change": "Смена пароля",
  "user.sessions_revoke": "Выход на всех устройствах",
  "user.self_delete": "Самостоятельное удаление аккаунта",
  "user.block": "Блокировка доступа",
  "role.permissions_set": "Изменение прав роли",
  "role.permissions_reset": "Сброс прав роли к умолчанию",
  "telegram.destination_link": "Привязка Telegram",
  "telegram.destination_unlink": "Отвязка Telegram",
  "telegram.destination_scope_change": "Изменение потока Telegram",
  "telegram.webhook_reply_failed": "Сбой ответа Telegram-бота",
  "telegram.update_quarantined": "Карантин Telegram update",
  "staff_notification.delivery_retry": "Повтор доставки уведомления",
  "deal.delete": "Удаление сделки",
  "deal.create": "Создание сделки",
  "estimate.delete": "Удаление сметы",
  "estimate.create": "Создание сметы",
  "task.create": "Создание задачи",
  "task.complete": "Выполнение задачи",
  "task.cancel": "Отмена задачи",
  "task.claim": "Взятие задачи",
  "task.reassign": "Переназначение задачи",
  "task.reopen": "Повторное открытие задачи",
  "task.reschedule": "Перенос срока задачи",
  "inbox.link": "Привязка письма к клиенту",
  "inbox.spam": "Пометка письма как спам",
  "inbox.archive": "Архивация письма",
  "customer.manager_assign": "Назначение менеджера клиента",
  "customer.manager_unassign": "Снятие менеджера клиента",
  "mail.sync_manual": "Ручная проверка почты",
  "vehicle.delete": "Удаление автомобиля",
  "repairOrder.create": "Создание заказ-наряда",
  "blog.create": "Создание статьи",
  "blog.update": "Правка статьи",
  "blog.publish": "Публикация статьи",
  "blog.unpublish": "Снятие статьи с публикации",
  "blog.delete": "Удаление статьи",
};

export interface AuditActor {
  id: string;
  name: string;
  permissionRole: string;
}

export interface AuditInput {
  actor: AuditActor;
  action: AuditAction;
  targetType:
    | "User"
    | "Deal"
    | "Estimate"
    | "CrmTask"
    | "InboxMessage"
    | "MailSync"
    | "Vehicle"
    | "Role"
    | "RepairOrder"
    | "TelegramDestination"
    | "TelegramUpdate"
    | "StaffNotificationDelivery"
    | "BlogPost";
  targetId?: string | null;
  /** How the target was known at the time — a name, a number, a role label. */
  targetLabel?: string | null;
  /** What actually changed. Keep it small and answerable, not a row dump. */
  metadata?: Record<string, unknown>;
}

/**
 * Адрес клиента за платформенным прокси.
 *
 * Берётся ПОСЛЕДНИЙ элемент `X-Forwarded-For`, а не первый. Это не стилистика,
 * а разница между работающим ограничением и его видимостью: прокси свой адрес
 * ДОПИСЫВАЕТ справа, поэтому первый элемент — это то, что прислал сам клиент,
 * то есть значение, которым он управляет. Пока брался первый, троттлер заявок
 * снимался одним заголовком: тридцать заявок с одной машины при лимите пять
 * (доказано прогоном на ревью PR #110).
 *
 * Последний элемент верен при обоих поведениях платформы: если ingress
 * дописывает — это единственная запись, которой можно верить; если
 * перезаписывает строку целиком — первый и последний совпадают. Допущение о
 * ровно одном доверенном прокси здесь ЕСТЬ: при двух и более последним окажется
 * адрес ближнего прокси. Появится второй слой (CDN) — сюда придётся вернуться.
 *
 * Отдельно стоит помнить, откуда функция взялась: она была приватным помощником
 * журнала аудита, где подделанный адрес — всего лишь неточность записи. С
 * появлением троттлинга ею подпёрли контроль безопасности, и свойства,
 * достаточного для журнала, стало недостаточно. Заодно это чинит и подделку
 * `AuditLog.ip`.
 *
 * Отсутствие адреса не повод ронять операцию — возвращается null.
 */
export async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    if (forwarded) {
      const hops = forwarded
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      if (hops.length > 0) return hops[hops.length - 1];
    }
    return h.get("x-real-ip");
  } catch {
    return null;
  }
}

export async function recordAudit(input: AuditInput, client: DbLike = db): Promise<void> {
  await client.auditLog.create({
    data: {
      tenantKey: TENANT_KEY,
      actorUserId: input.actor.id,
      // Denormalised: the log has to still name the actor after the actor is
      // gone, and roles change — this is who they were when they acted.
      actorName: input.actor.name,
      actorRole: roleLabel(input.actor.permissionRole),
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      targetLabel: input.targetLabel ?? null,
      metadata: (input.metadata ?? {}) as never,
      ip: await clientIp(),
    },
  });
}
