import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => requireRole(...args),
}));

const findUnique = vi.fn();
const updateMany = vi.fn();
const taskUpdate = vi.fn();
const taskCreate = vi.fn();
const userFindUnique = vi.fn();
const auditCreate = vi.fn();
const transaction = vi.fn(
  async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      crmTask: {
        create: (...args: unknown[]) => taskCreate(...args),
        update: (...args: unknown[]) => taskUpdate(...args),
        updateMany: (...args: unknown[]) => updateMany(...args),
      },
      auditLog: { create: (...args: unknown[]) => auditCreate(...args) },
    }),
);
vi.mock("@/lib/db", () => ({
  db: {
    crmTask: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      updateMany: (...args: unknown[]) => updateMany(...args),
      update: (...args: unknown[]) => taskUpdate(...args),
      create: (...args: unknown[]) => taskCreate(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
    },
    $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      transaction(callback),
  },
}));

const publishTaskAssigned = vi.fn();
const publishTaskCreated = vi.fn();
vi.mock("@/lib/staff-notifications/publish", () => ({
  publishTaskAssigned: (...args: unknown[]) => publishTaskAssigned(...args),
  publishTaskCreated: (...args: unknown[]) => publishTaskCreated(...args),
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

import {
  cancelCrmTask,
  claimCrmTask,
  completeCrmTask,
  createCrmTask,
  reassignCrmTask,
} from "@/app/actions/crm/tasks";

beforeEach(() => {
  requireRole.mockReset();
  findUnique.mockReset();
  updateMany.mockReset();
  taskUpdate.mockReset();
  taskCreate.mockReset();
  userFindUnique.mockReset();
  auditCreate.mockReset();
  auditCreate.mockResolvedValue({ id: "audit-task" });
  transaction.mockClear();
  publishTaskAssigned.mockReset();
  publishTaskAssigned.mockResolvedValue(null);
  publishTaskCreated.mockReset();
  publishTaskCreated.mockResolvedValue({ id: "event-created" });
  revalidatePath.mockReset();
  requireRole.mockResolvedValue({
    id: "manager-1",
    name: "Менеджер Один",
    permissionRole: "MANAGER",
  });
});

function taskFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("title", "Перезвонить");
  fd.set("dueAt", "2026-08-05T10:00");
  for (const [key, value] of Object.entries(overrides)) fd.set(key, value);
  return fd;
}

describe("createCrmTask: назначение ответственного", () => {
  it("пустой ownerUserId — задача на себя (текущее поведение)", async () => {
    taskCreate.mockResolvedValue({ id: "task-9" });

    const result = await createCrmTask(null, taskFormData());

    expect(result).toEqual({ error: null, id: "task-9" });
    expect(taskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerUserId: "manager-1" }),
      }),
    );
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("назначение другому сотруднику проходит после проверки, что он существует и staff", async () => {
    userFindUnique.mockResolvedValue({ id: "manager-2", permissionRole: "ADMIN" });
    taskCreate.mockResolvedValue({ id: "task-10" });

    const result = await createCrmTask(
      null,
      taskFormData({ ownerUserId: "manager-2" }),
    );

    expect(result).toEqual({ error: null, id: "task-10" });
    expect(userFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "manager-2" } }),
    );
    expect(taskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerUserId: "manager-2" }),
      }),
    );
  });

  it("битый или клиентский id исполнителя отклоняется понятной ошибкой", async () => {
    userFindUnique.mockResolvedValue(null);
    const missing = await createCrmTask(
      null,
      taskFormData({ ownerUserId: "nope" }),
    );
    expect(missing.error).toBe("Исполнитель не найден среди сотрудников");
    expect(taskCreate).not.toHaveBeenCalled();

    userFindUnique.mockResolvedValue({ id: "client-1", permissionRole: "CLIENT" });
    const client = await createCrmTask(
      null,
      taskFormData({ ownerUserId: "client-1" }),
    );
    expect(client.error).toBe("Исполнитель не найден среди сотрудников");
    expect(taskCreate).not.toHaveBeenCalled();
  });

  it("назначение другому публикует безопасное событие в той же транзакции", async () => {
    userFindUnique.mockResolvedValue({ id: "manager-2", permissionRole: "MANAGER" });
    taskCreate.mockResolvedValue({
      id: "task-11",
      customer: { name: "Иван Клиент" },
    });

    const result = await createCrmTask(
      null,
      taskFormData({
        ownerUserId: "manager-2",
        customerUserId: "customer-1",
        dealId: "deal-1",
        title: "SENSITIVE-TASK-TITLE",
        body: "SENSITIVE-TASK-BODY",
      }),
    );

    expect(result).toEqual({ error: null, id: "task-11" });
    expect(transaction).toHaveBeenCalledOnce();
    expect(publishTaskAssigned).toHaveBeenCalledWith(
      expect.any(Object),
      {
        taskId: "task-11",
        ownerUserId: "manager-2",
        assignedByUserId: "manager-1",
        assignmentAuditId: "audit-task",
        customerUserId: "customer-1",
        customerName: "Иван Клиент",
        dealId: "deal-1",
        dueAt: new Date("2026-08-05T10:00"),
        occurredAt: expect.any(Date),
      },
    );
    expect(JSON.stringify(publishTaskAssigned.mock.calls)).not.toContain(
      "SENSITIVE-TASK",
    );
  });

  it("назначение себе не публикует TASK_ASSIGNED", async () => {
    taskCreate.mockResolvedValue({ id: "task-12", customer: null });

    await createCrmTask(null, taskFormData());

    expect(publishTaskAssigned).not.toHaveBeenCalled();
  });

  it("каждое создание публикует TASK_CREATED без заголовка и тела", async () => {
    taskCreate.mockResolvedValue({
      id: "task-13",
      customer: { name: "Иван Клиент" },
      deal: { number: "D-1042" },
    });

    await createCrmTask(
      null,
      taskFormData({
        title: "SENSITIVE-CREATED-TITLE",
        body: "SENSITIVE-CREATED-BODY",
        customerUserId: "customer-1",
        dealId: "deal-1",
      }),
    );

    expect(publishTaskCreated).toHaveBeenCalledWith(expect.any(Object), {
      taskId: "task-13",
      customerUserId: "customer-1",
      customerName: "Иван Клиент",
      dealId: "deal-1",
      dealNumber: "D-1042",
      occurredAt: expect.any(Date),
    });
    expect(JSON.stringify(publishTaskCreated.mock.calls)).not.toContain(
      "SENSITIVE-CREATED",
    );
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "task.create",
        targetType: "CrmTask",
        targetId: "task-13",
        metadata: expect.objectContaining({
          ownerUserId: "manager-1",
          customerUserId: "customer-1",
          dealId: "deal-1",
        }),
      }),
      select: { id: true },
    });
    expect(JSON.stringify(auditCreate.mock.calls)).not.toContain(
      "SENSITIVE-CREATED",
    );
  });
});

describe("claimCrmTask", () => {
  it("uses the same ADMIN/MANAGER authorization as other task actions", async () => {
    findUnique.mockResolvedValue(null);

    await claimCrmTask("task-1");

    expect(requireRole).toHaveBeenCalledWith(["ADMIN", "MANAGER"]);
  });

  it("atomically assigns an open unassigned task to the current manager", async () => {
    findUnique.mockResolvedValue({
      status: "OPEN",
      ownerUserId: null,
      customerUserId: "customer-1",
      dealId: "deal-1",
    });
    updateMany.mockResolvedValue({ count: 1 });

    await expect(claimCrmTask("task-1")).resolves.toEqual({
      error: null,
      id: "task-1",
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "task-1", status: "OPEN", ownerUserId: null },
      data: { ownerUserId: "manager-1" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/customers/customer-1");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/crm/deals/deal-1");
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "task.claim",
        targetType: "CrmTask",
        targetId: "task-1",
      }),
      select: { id: true },
    });
  });

  it("reports a lost claim race instead of overwriting the winner", async () => {
    findUnique.mockResolvedValue({
      status: "OPEN",
      ownerUserId: null,
      customerUserId: null,
      dealId: null,
    });
    updateMany.mockResolvedValue({ count: 0 });

    const result = await claimCrmTask("task-1");

    expect(result.error).toBe("Задачу уже взял другой сотрудник или её статус изменился");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does not take a task already assigned to another employee", async () => {
    findUnique.mockResolvedValue({
      status: "OPEN",
      ownerUserId: "manager-2",
      customerUserId: null,
      dealId: null,
    });

    const result = await claimCrmTask("task-1");

    expect(result.error).toBe("Задача уже назначена другому сотруднику");
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("CRM task audit coverage", () => {
  it.each([
    ["complete", completeCrmTask, "task.complete", { status: "DONE", completedAt: expect.any(Date) }],
    ["cancel", cancelCrmTask, "task.cancel", { status: "CANCELLED" }],
  ])("audits %s in the mutation transaction", async (_label, action, auditAction, data) => {
    findUnique.mockResolvedValue({ customerUserId: "customer-1", dealId: "deal-1" });
    taskUpdate.mockResolvedValue({ id: "task-1" });

    await expect(action("task-1")).resolves.toEqual({ error: null, id: "task-1" });

    expect(taskUpdate).toHaveBeenCalledWith({ where: { id: "task-1" }, data });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: auditAction,
        targetType: "CrmTask",
        targetId: "task-1",
      }),
      select: { id: true },
    });
  });

  it("audits reassignment and publishes TASK_ASSIGNED for another employee", async () => {
    findUnique.mockResolvedValue({
      status: "OPEN",
      ownerUserId: "manager-1",
      customerUserId: "customer-1",
      dealId: "deal-1",
      dueAt: new Date("2026-08-05T10:00:00.000Z"),
      customer: { name: "Иван Клиент" },
    });
    userFindUnique.mockResolvedValue({
      id: "manager-2",
      permissionRole: "MANAGER",
      deletedAt: null,
    });
    updateMany.mockResolvedValue({ count: 1 });

    await expect(reassignCrmTask("task-1", "manager-2")).resolves.toEqual({
      error: null,
      id: "task-1",
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "task-1",
        status: "OPEN",
        ownerUserId: "manager-1",
      },
      data: { ownerUserId: "manager-2" },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "task.reassign",
        metadata: {
          previousOwnerUserId: "manager-1",
          ownerUserId: "manager-2",
        },
      }),
      select: { id: true },
    });
    expect(publishTaskAssigned).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        taskId: "task-1",
        ownerUserId: "manager-2",
        assignedByUserId: "manager-1",
        assignmentAuditId: "audit-task",
      }),
    );
  });
});
