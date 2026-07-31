import { beforeEach, describe, expect, it, vi } from "vitest";

const dealFindUnique = vi.fn();
const taskCreate = vi.fn();
const taskFindFirst = vi.fn();
const taskUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    deal: {
      findUnique: (...args: unknown[]) => dealFindUnique(...args),
    },
    crmTask: {
      create: (...args: unknown[]) => taskCreate(...args),
      findFirst: (...args: unknown[]) => taskFindFirst(...args),
      update: (...args: unknown[]) => taskUpdate(...args),
    },
  },
}));

import { ensureFollowUpTask } from "@/lib/crm/auto-task";

const input = {
  customerUserId: "customer-1",
  customerName: "Клиент",
  dealId: "deal-1",
  channel: "EMAIL_INBOUND" as const,
  messageOccurredAt: new Date("2026-07-31T12:00:00.000Z"),
};

function p2002(): Error & { code: string } {
  return Object.assign(new Error("unique constraint"), { code: "P2002" });
}

beforeEach(() => {
  dealFindUnique.mockReset();
  taskCreate.mockReset();
  taskFindFirst.mockReset();
  taskUpdate.mockReset();
  taskCreate.mockRejectedValue(p2002());
  taskUpdate.mockResolvedValue({ id: "task-1" });
});

describe("ensureFollowUpTask owner recovery", () => {
  it("never clears a manager who claimed an unassigned task", async () => {
    dealFindUnique.mockResolvedValue({ ownerUserId: null });
    taskFindFirst.mockResolvedValue({
      id: "task-1",
      body: "Первое сообщение",
      ownerUserId: "manager-1",
    });

    await ensureFollowUpTask(input);

    const update = taskUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(update.data).not.toHaveProperty("ownerUserId");
  });

  it("never replaces one non-null task owner with another automatically", async () => {
    dealFindUnique.mockResolvedValue({ ownerUserId: "manager-2" });
    taskFindFirst.mockResolvedValue({
      id: "task-1",
      body: "Первое сообщение",
      ownerUserId: "manager-1",
    });

    await ensureFollowUpTask(input);

    const update = taskUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(update.data).not.toHaveProperty("ownerUserId");
  });

  it("may assign a deal owner when the task is still unassigned", async () => {
    dealFindUnique.mockResolvedValue({ ownerUserId: "manager-1" });
    taskFindFirst.mockResolvedValue({
      id: "task-1",
      body: "Первое сообщение",
      ownerUserId: null,
    });

    await ensureFollowUpTask(input);

    expect(taskUpdate).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: expect.objectContaining({ ownerUserId: "manager-1" }),
    });
  });
});
