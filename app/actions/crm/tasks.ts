"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { roleLabel } from "@/lib/roles";
import {
  publishTaskAssigned,
  publishTaskCreated,
  type StaffNotificationPublishTx,
} from "@/lib/staff-notifications/publish";
import { TENANT_KEY } from "@/lib/tenant";

interface TaskResult {
  error: string | null;
  id?: string;
}

interface CrmTaskMutationTx extends StaffNotificationPublishTx {
  crmTask: {
    create(args: Record<string, unknown>): Promise<unknown>;
    update(args: Record<string, unknown>): Promise<unknown>;
    updateMany(args: Record<string, unknown>): Promise<unknown>;
    delete(args: Record<string, unknown>): Promise<unknown>;
  };
  auditLog: {
    create(args: Record<string, unknown>): Promise<unknown>;
  };
}

interface TaskActor {
  id: string;
  name: string;
  permissionRole: string;
}

async function writeTaskAudit(
  tx: CrmTaskMutationTx,
  actor: TaskActor,
  action: string,
  taskId: string,
  metadata: Record<string, unknown> = {},
): Promise<string> {
  const audit = (await tx.auditLog.create({
    data: {
      tenantKey: TENANT_KEY,
      actorUserId: actor.id,
      actorName: actor.name,
      actorRole: roleLabel(actor.permissionRole),
      action,
      targetType: "CrmTask",
      targetId: taskId,
      targetLabel: "CRM-задача",
      metadata,
      ip: null,
    },
    select: { id: true },
  })) as { id: string };
  return audit.id;
}

function revalidateTaskPaths(opts: {
  customerUserId?: string | null;
  dealId?: string | null;
}): void {
  // /admin/crm/tasks and /admin/crm are force-dynamic (no RSC payload cache to
  // evict). Skipping them — the client's router.refresh() after the action
  // already re-renders whatever the manager is currently viewing.
  if (opts.customerUserId) revalidatePath(`/admin/customers/${opts.customerUserId}`);
  if (opts.dealId) revalidatePath(`/admin/crm/deals/${opts.dealId}`);
}

export async function createCrmTask(
  _prev: TaskResult | null,
  formData: FormData,
): Promise<TaskResult> {
  const session = await requireRole(["ADMIN", "MANAGER"]);

  const title = ((formData.get("title") as string | null) ?? "").trim();
  if (!title) return { error: "Укажите заголовок" };

  const dueAtRaw = ((formData.get("dueAt") as string | null) ?? "").trim();
  if (!dueAtRaw) return { error: "Укажите срок" };
  const dueAt = new Date(dueAtRaw);
  if (Number.isNaN(dueAt.getTime())) return { error: "Некорректная дата" };

  const ownerUserIdRaw = ((formData.get("ownerUserId") as string | null) ?? "").trim();
  const ownerUserId = ownerUserIdRaw || session.id;

  if (ownerUserId !== session.id) {
    const owner = (await db.user.findUnique({
      where: { id: ownerUserId },
      select: { id: true, permissionRole: true, deletedAt: true },
    })) as {
      id: string;
      permissionRole: string;
      deletedAt?: Date | null;
    } | null;
    if (
      !owner ||
      owner.deletedAt != null ||
      (owner.permissionRole !== "ADMIN" && owner.permissionRole !== "MANAGER")
    ) {
      return { error: "Исполнитель не найден среди сотрудников" };
    }
  }

  const kind = ((formData.get("kind") as string | null) ?? "GENERIC").trim();
  const body = ((formData.get("body") as string | null) ?? "").trim() || null;
  const customerUserId =
    ((formData.get("customerUserId") as string | null) ?? "").trim() || null;
  const dealId = ((formData.get("dealId") as string | null) ?? "").trim() || null;

  const occurredAt = new Date();
  const transactionalDb = db as unknown as {
    $transaction<T>(callback: (tx: CrmTaskMutationTx) => Promise<T>): Promise<T>;
  };
  const task = await transactionalDb.$transaction(async (tx) => {
    const created = (await tx.crmTask.create({
      data: {
        title,
        body,
        kind: kind as never,
        dueAt,
        ownerUserId,
        customerUserId,
        dealId,
      },
      select: {
        id: true,
        customer: { select: { name: true } },
        deal: { select: { number: true } },
      },
    })) as {
      id: string;
      customer?: { name: string } | null;
      deal?: { number: string | null } | null;
    };

    const assignmentAuditId = await writeTaskAudit(
      tx,
      session,
      "task.create",
      created.id,
      {
        ownerUserId,
        customerUserId,
        dealId,
        dueAt: dueAt.toISOString(),
      },
    );

    await publishTaskCreated(tx, {
      taskId: created.id,
      customerUserId,
      customerName: created.customer?.name ?? null,
      dealId,
      dealNumber: created.deal?.number ?? null,
      occurredAt,
    });

    if (ownerUserId !== session.id) {
      await publishTaskAssigned(tx, {
        taskId: created.id,
        ownerUserId,
        assignedByUserId: session.id,
        assignmentAuditId,
        customerUserId,
        customerName: created.customer?.name ?? null,
        dealId,
        dueAt,
        occurredAt,
      });
    }
    return created;
  });

  revalidateTaskPaths({ customerUserId, dealId });
  return { error: null, id: task.id };
}

export async function completeCrmTask(id: string): Promise<TaskResult> {
  const session = await requireRole(["ADMIN", "MANAGER"]);
  const existing = (await db.crmTask.findUnique({
    where: { id },
    select: { customerUserId: true, dealId: true },
  })) as { customerUserId: string | null; dealId: string | null } | null;
  if (!existing) return { error: "Задача не найдена" };

  const transactionalDb = db as unknown as {
    $transaction<T>(callback: (tx: CrmTaskMutationTx) => Promise<T>): Promise<T>;
  };
  await transactionalDb.$transaction(async (tx) => {
    await tx.crmTask.update({
      where: { id },
      data: { status: "DONE", completedAt: new Date() },
    });
    await writeTaskAudit(tx, session, "task.complete", id);
  });
  revalidateTaskPaths(existing);
  return { error: null, id };
}

export async function claimCrmTask(id: string): Promise<TaskResult> {
  const session = await requireRole(["ADMIN", "MANAGER"]);
  const existing = (await db.crmTask.findUnique({
    where: { id },
    select: {
      status: true,
      ownerUserId: true,
      customerUserId: true,
      dealId: true,
    },
  })) as {
    status: string;
    ownerUserId: string | null;
    customerUserId: string | null;
    dealId: string | null;
  } | null;

  if (!existing) return { error: "Задача не найдена" };
  if (existing.status !== "OPEN") {
    return { error: "Взять можно только открытую задачу" };
  }
  if (existing.ownerUserId === session.id) return { error: null, id };
  if (existing.ownerUserId !== null) {
    return { error: "Задача уже назначена другому сотруднику" };
  }

  // The owner predicate is the concurrency guard: if two managers claim the
  // same row, only the first update can match ownerUserId=null.
  const transactionalDb = db as unknown as {
    $transaction<T>(callback: (tx: CrmTaskMutationTx) => Promise<T>): Promise<T>;
  };
  const claimed = await transactionalDb.$transaction(async (tx) => {
    const result = (await tx.crmTask.updateMany({
      where: { id, status: "OPEN", ownerUserId: null },
      data: { ownerUserId: session.id },
    })) as { count: number };
    if (result.count === 1) {
      await writeTaskAudit(tx, session, "task.claim", id, {
        previousOwnerUserId: null,
        ownerUserId: session.id,
      });
    }
    return result;
  });
  if (claimed.count !== 1) {
    return { error: "Задачу уже взял другой сотрудник или её статус изменился" };
  }

  revalidateTaskPaths(existing);
  return { error: null, id };
}

export async function reopenCrmTask(id: string): Promise<TaskResult> {
  const session = await requireRole(["ADMIN", "MANAGER"]);
  const existing = (await db.crmTask.findUnique({
    where: { id },
    select: { customerUserId: true, dealId: true },
  })) as { customerUserId: string | null; dealId: string | null } | null;
  if (!existing) return { error: "Задача не найдена" };

  const transactionalDb = db as unknown as {
    $transaction<T>(callback: (tx: CrmTaskMutationTx) => Promise<T>): Promise<T>;
  };
  await transactionalDb.$transaction(async (tx) => {
    await tx.crmTask.update({
      where: { id },
      data: { status: "OPEN", completedAt: null },
    });
    await writeTaskAudit(tx, session, "task.reopen", id);
  });
  revalidateTaskPaths(existing);
  return { error: null, id };
}

export async function cancelCrmTask(id: string): Promise<TaskResult> {
  const session = await requireRole(["ADMIN", "MANAGER"]);
  const existing = (await db.crmTask.findUnique({
    where: { id },
    select: { customerUserId: true, dealId: true },
  })) as { customerUserId: string | null; dealId: string | null } | null;
  if (!existing) return { error: "Задача не найдена" };

  const transactionalDb = db as unknown as {
    $transaction<T>(callback: (tx: CrmTaskMutationTx) => Promise<T>): Promise<T>;
  };
  await transactionalDb.$transaction(async (tx) => {
    await tx.crmTask.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    await writeTaskAudit(tx, session, "task.cancel", id);
  });
  revalidateTaskPaths(existing);
  return { error: null, id };
}

/**
 * Удалить задачу насовсем.
 *
 * Отмена (`cancelCrmTask`) оставляет строку в списке — это правильно для
 * рабочей задачи, которую передумали делать: видно, что её заводили. Но
 * тестовый мусор и задачи, созданные по ошибке, отменой не убрать, и список
 * зарастает. Удаление — ADMIN: строка несёт след действий менеджера, и стирать
 * его должен тот, кто отвечает за данные, а не любой сотрудник.
 *
 * На задачу ничем не ссылаются, поэтому удаление простое.
 */
export async function deleteCrmTask(id: string): Promise<TaskResult> {
  const session = await requireRole(["ADMIN"]);
  const existing = (await db.crmTask.findUnique({
    where: { id },
    select: { customerUserId: true, dealId: true },
  })) as { customerUserId: string | null; dealId: string | null } | null;
  if (!existing) return { error: "Задача не найдена" };

  const transactionalDb = db as unknown as {
    $transaction<T>(callback: (tx: CrmTaskMutationTx) => Promise<T>): Promise<T>;
  };
  await transactionalDb.$transaction(async (tx) => {
    // Журнал пишем ДО удаления: после него строки уже нет, а след действия
    // остаться должен.
    await writeTaskAudit(tx, session, "task.delete", id);
    await tx.crmTask.delete({ where: { id } });
  });
  revalidateTaskPaths(existing);
  return { error: null, id };
}

export async function rescheduleCrmTask(
  id: string,
  dueAtIso: string,
): Promise<TaskResult> {
  const session = await requireRole(["ADMIN", "MANAGER"]);
  const dueAt = new Date(dueAtIso);
  if (Number.isNaN(dueAt.getTime())) return { error: "Некорректная дата" };

  const existing = (await db.crmTask.findUnique({
    where: { id },
    select: { customerUserId: true, dealId: true },
  })) as { customerUserId: string | null; dealId: string | null } | null;
  if (!existing) return { error: "Задача не найдена" };

  const transactionalDb = db as unknown as {
    $transaction<T>(callback: (tx: CrmTaskMutationTx) => Promise<T>): Promise<T>;
  };
  await transactionalDb.$transaction(async (tx) => {
    await tx.crmTask.update({ where: { id }, data: { dueAt } });
    await writeTaskAudit(tx, session, "task.reschedule", id, {
      dueAt: dueAt.toISOString(),
    });
  });
  revalidateTaskPaths(existing);
  return { error: null, id };
}

/** Reassign an OPEN task; null/blank leaves it in the shared queue. */
export async function reassignCrmTask(
  id: string,
  nextOwnerUserId: string | null,
): Promise<TaskResult> {
  const session = await requireRole(["ADMIN", "MANAGER"]);
  const ownerUserId = nextOwnerUserId?.trim() || null;

  if (ownerUserId) {
    const owner = (await db.user.findUnique({
      where: { id: ownerUserId },
      select: { id: true, permissionRole: true, deletedAt: true },
    })) as {
      id: string;
      permissionRole: string;
      deletedAt: Date | null;
    } | null;
    if (
      !owner ||
      owner.deletedAt !== null ||
      (owner.permissionRole !== "ADMIN" && owner.permissionRole !== "MANAGER")
    ) {
      return { error: "Исполнитель не найден среди сотрудников" };
    }
  }

  const existing = (await db.crmTask.findUnique({
    where: { id },
    select: {
      status: true,
      ownerUserId: true,
      customerUserId: true,
      dealId: true,
      dueAt: true,
      customer: { select: { name: true } },
    },
  })) as {
    status: string;
    ownerUserId: string | null;
    customerUserId: string | null;
    dealId: string | null;
    dueAt: Date;
    customer: { name: string } | null;
  } | null;
  if (!existing) return { error: "Задача не найдена" };
  if (existing.status !== "OPEN") {
    return { error: "Переназначить можно только открытую задачу" };
  }
  if (existing.ownerUserId === ownerUserId) return { error: null, id };

  const transactionalDb = db as unknown as {
    $transaction<T>(callback: (tx: CrmTaskMutationTx) => Promise<T>): Promise<T>;
  };
  const updated = await transactionalDb.$transaction(async (tx) => {
    const result = (await tx.crmTask.updateMany({
      where: {
        id,
        status: "OPEN",
        ownerUserId: existing.ownerUserId,
      },
      data: { ownerUserId },
    })) as { count: number };
    if (result.count !== 1) return false;

    const assignmentAuditId = await writeTaskAudit(tx, session, "task.reassign", id, {
      previousOwnerUserId: existing.ownerUserId,
      ownerUserId,
    });
    if (ownerUserId && ownerUserId !== session.id) {
      await publishTaskAssigned(tx, {
        taskId: id,
        ownerUserId,
        assignedByUserId: session.id,
        assignmentAuditId,
        customerUserId: existing.customerUserId,
        customerName: existing.customer?.name ?? null,
        dealId: existing.dealId,
        dueAt: existing.dueAt,
        occurredAt: new Date(),
      });
    }
    return true;
  });
  if (!updated) {
    return { error: "Задача уже изменена другим сотрудником — обновите страницу" };
  }

  revalidateTaskPaths(existing);
  return { error: null, id };
}
