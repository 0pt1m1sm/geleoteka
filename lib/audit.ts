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
  | "customer.erase"
  | "customer.archive"
  | "customer.restore"
  | "user.role_change"
  | "user.password_reset"
  | "user.block"
  | "role.permissions_set"
  | "role.permissions_reset"
  | "telegram.destination_link"
  | "telegram.destination_unlink"
  | "deal.delete"
  | "estimate.delete"
  | "vehicle.delete"
  | "repairOrder.create";

export const AUDIT_ACTION_LABELS: Readonly<Record<AuditAction, string>> = {
  "user.create": "Создание пользователя",
  "customer.erase": "Удаление клиента",
  "customer.archive": "Скрытие клиента из CRM",
  "customer.restore": "Восстановление клиента",
  "user.role_change": "Смена роли",
  "user.password_reset": "Сброс пароля",
  "user.block": "Блокировка доступа",
  "role.permissions_set": "Изменение прав роли",
  "role.permissions_reset": "Сброс прав роли к умолчанию",
  "telegram.destination_link": "Привязка Telegram",
  "telegram.destination_unlink": "Отвязка Telegram",
  "deal.delete": "Удаление сделки",
  "estimate.delete": "Удаление сметы",
  "vehicle.delete": "Удаление автомобиля",
  "repairOrder.create": "Создание заказ-наряда",
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
    | "Vehicle"
    | "Role"
    | "RepairOrder"
    | "TelegramDestination";
  targetId?: string | null;
  /** How the target was known at the time — a name, a number, a role label. */
  targetLabel?: string | null;
  /** What actually changed. Keep it small and answerable, not a row dump. */
  metadata?: Record<string, unknown>;
}

/**
 * Best effort on the address only. Behind the platform proxy the client address
 * arrives in `x-forwarded-for`; its absence is not worth failing an operation
 * over, so it degrades to null rather than throwing.
 */
async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]?.trim() || null;
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
