import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requirePermission = vi.fn();
vi.mock("@/lib/authz", () => ({
  requirePermission: (...args: unknown[]) => requirePermission(...args),
}));

const userFindUnique = vi.fn();
const userUpdate = vi.fn();
const auditCreate = vi.fn();
const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
  callback({
    user: { update: (...args: unknown[]) => userUpdate(...args) },
    auditLog: { create: (...args: unknown[]) => auditCreate(...args) },
  }),
);
vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
    },
    $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      transaction(callback),
  },
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

import { setCustomerManager } from "@/app/actions/crm/customers";

function managerFormData(managerUserId = "manager-2"): FormData {
  const formData = new FormData();
  formData.set("customerUserId", "customer-1");
  formData.set("managerUserId", managerUserId);
  return formData;
}

beforeEach(() => {
  requirePermission.mockReset();
  userFindUnique.mockReset();
  userUpdate.mockReset();
  auditCreate.mockReset();
  transaction.mockClear();
  revalidatePath.mockReset();
  requirePermission.mockResolvedValue({
    id: "admin-1",
    name: "Администратор",
    permissionRole: "ADMIN",
  });
  userUpdate.mockResolvedValue({ id: "customer-1" });
  auditCreate.mockResolvedValue({ id: "audit-1" });
});

describe("setCustomerManager", () => {
  it("назначает активного сотрудника и пишет безопасный аудит", async () => {
    userFindUnique
      .mockResolvedValueOnce({
        id: "customer-1",
        name: "Клиент",
        isCustomer: true,
        deletedAt: null,
        managerUserId: null,
      })
      .mockResolvedValueOnce({
        id: "manager-2",
        name: "Менеджер",
        permissionRole: "MANAGER",
        deletedAt: null,
      });

    await expect(setCustomerManager(null, managerFormData())).resolves.toEqual({
      error: null,
    });

    expect(requirePermission).toHaveBeenCalledWith("crm.manage");
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "customer-1" },
      data: { managerUserId: "manager-2" },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "admin-1",
        action: "customer.manager_assign",
        targetType: "User",
        targetId: "customer-1",
        targetLabel: "Клиент",
        metadata: {
          previousManagerUserId: null,
          managerUserId: "manager-2",
        },
      }),
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/customers/customer-1");
  });

  it("снимает менеджера и фиксирует отдельное действие аудита", async () => {
    userFindUnique.mockResolvedValueOnce({
      id: "customer-1",
      name: "Клиент",
      isCustomer: true,
      deletedAt: null,
      managerUserId: "manager-2",
    });

    await expect(setCustomerManager(null, managerFormData(""))).resolves.toEqual({
      error: null,
    });

    expect(userFindUnique).toHaveBeenCalledTimes(1);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "customer-1" },
      data: { managerUserId: null },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "customer.manager_unassign" }),
    });
  });

  it("не позволяет назначить клиента или удалённого сотрудника", async () => {
    userFindUnique
      .mockResolvedValueOnce({
        id: "customer-1",
        name: "Клиент",
        isCustomer: true,
        deletedAt: null,
        managerUserId: null,
      })
      .mockResolvedValueOnce({
        id: "client-2",
        name: "Другой клиент",
        permissionRole: "CLIENT",
        deletedAt: null,
      });

    const result = await setCustomerManager(null, managerFormData("client-2"));

    expect(result.error).toBe("Менеджер не найден среди сотрудников");
    expect(transaction).not.toHaveBeenCalled();
  });
});
