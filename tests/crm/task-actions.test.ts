import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => requireRole(...args),
}));

const findUnique = vi.fn();
const updateMany = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    crmTask: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      updateMany: (...args: unknown[]) => updateMany(...args),
    },
  },
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

import { claimCrmTask } from "@/app/actions/crm/tasks";

beforeEach(() => {
  requireRole.mockReset();
  findUnique.mockReset();
  updateMany.mockReset();
  revalidatePath.mockReset();
  requireRole.mockResolvedValue({ id: "manager-1", permissionRole: "MANAGER" });
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
