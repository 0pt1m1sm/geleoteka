import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Занесение визита ЗАДНИМ ЧИСЛОМ.
 *
 * Сценарий владельца: клиент не оформлял запись через систему, просто приехал,
 * и менеджер заносит визит потом. Дата и так была произвольной — мешало другое:
 * распределение постов отказывало, если в то прошедшее время все посты были
 * заняты. То есть записать историю нельзя было из-за конфликта расписания,
 * которого давно нет.
 *
 * Граница намеренная: для БУДУЩЕЙ записи конфликт остаётся отказом — иначе мы
 * пообещали бы клиенту время, которого нет.
 */

const CONFLICT = Object.assign(new Error("bay conflict"), { __bayConflict: true });

const roCreate = vi.fn();
const reserve = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: async () => ({ id: "cust-1", name: "Клиент" }) },
    vehicle: { findUnique: async () => null },
    deal: { findUnique: async () => null },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        repairOrder: { create: (...a: unknown[]) => roCreate(...a) },
        slot: { create: async () => ({ id: "slot-1" }) },
      }),
  },
}));
vi.mock("@/lib/auth", () => ({ requireRole: async () => ({ id: "mgr-1", permissionRole: "MANAGER" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("@/lib/audit", () => ({ recordAudit: async () => {} }));
vi.mock("@/lib/crm/public", () => ({
  createDeal: async () => ({ id: "deal-1" }),
  nextRepairOrderNumber: async () => "RO-1",
}));
vi.mock("@/lib/scheduling/service-bays", () => ({
  reserveServiceBaySlot: (...a: unknown[]) => reserve(...a),
  isServiceBayAllocationConflict: (e: unknown) =>
    typeof e === "object" && e !== null && "__bayConflict" in e,
  SERVICE_BAY_CONFLICT_MESSAGE: "Нет свободного поста",
}));

function form(dateTime: string): FormData {
  const fd = new FormData();
  fd.set("customerUserId", "cust-1");
  fd.set("dateTime", dateTime);
  return fd;
}

/** Локальная строка datetime-local со сдвигом в днях от текущего момента. */
function localInput(daysFromNow: number): string {
  const d = new Date(Date.now() + daysFromNow * 24 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function create(dateTime: string) {
  const { createRepairOrderManually } = await import("@/app/actions/repair-orders");
  try {
    return await createRepairOrderManually(null, form(dateTime));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("REDIRECT:")) return { error: null, redirected: true };
    throw e;
  }
}

describe("визит задним числом", () => {
  beforeEach(() => {
    roCreate.mockReset();
    reserve.mockReset();
    roCreate.mockResolvedValue({ id: "ro-1", roNumber: "RO-1" });
    vi.resetModules();
  });

  it("ПРОШЕДШИЙ визит записывается, даже если пост был занят", async () => {
    // Главный случай: клиент приехал без записи, менеджер оформляет позже.
    reserve.mockRejectedValue(CONFLICT);
    const res = await create(localInput(-7));
    expect(res.error).toBeNull();
    expect(roCreate).toHaveBeenCalledTimes(1);
  });

  it("БУДУЩАЯ запись при занятом посте по-прежнему отклоняется", async () => {
    // Иначе клиенту пообещали бы время, которого нет.
    reserve.mockRejectedValue(CONFLICT);
    const res = await create(localInput(7));
    expect(res.error).toBe("Нет свободного поста");
  });

  it("прошедший визит со свободным постом слот всё же занимает", async () => {
    // Расписание задним числом остаётся связным: если пост был свободен,
    // запись о нём полезна.
    reserve.mockResolvedValue({ bayId: "bay-1" });
    const res = await create(localInput(-1));
    expect(res.error).toBeNull();
    expect(reserve).toHaveBeenCalledTimes(1);
  });

  it("НЕ бронирующая ошибка пробрасывается и в прошлом", async () => {
    // Послабление касается только конфликта постов. Упавшая база — это сбой,
    // и молча создавать наряд при ней нельзя.
    reserve.mockRejectedValue(new Error("база недоступна"));
    await expect(create(localInput(-3))).rejects.toThrow("база недоступна");
  });
});
