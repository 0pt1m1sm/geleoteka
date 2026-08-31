import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Действие записи общения — проверка канала и результата НА СЕРВЕРЕ.
 *
 * Отдельный тест понадобился потому, что тесты чистого правила его не
 * закрывают: я снял проверку из действия мутантом, и все девять тестов
 * `outcomesForChannel` остались зелёными. Ровно тот пробел, который уже
 * дважды находили за эту инициативу, — дефект живёт там, куда тест не доходит.
 */

const create = vi.fn();
const bump = vi.fn();

vi.mock("@/lib/db", () => ({
  db: { communicationLog: { create: (...a: unknown[]) => create(...a) } },
}));
vi.mock("@/lib/auth", () => ({ requireRole: async () => ({ id: "user-1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/crm/public", () => ({ bumpLastTouch: (...a: unknown[]) => bump(...a) }));

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function log(fields: Record<string, string>) {
  const { logCommunication } = await import("@/app/actions/crm/communications");
  return logCommunication(null, form({ customerUserId: "cust-1", ...fields }));
}

describe("logCommunication: результат обязан подходить каналу", () => {
  beforeEach(() => {
    create.mockReset();
    bump.mockReset();
    create.mockResolvedValue({ id: "log-1" });
    vi.resetModules();
  });

  it("ЛИЧНЫЙ ВИЗИТ с «не доставлено» — отказ, и в базу ничего не идёт", async () => {
    // Форма клиентская: прислать можно что угодно мимо неё. Такая строка
    // осела бы в истории клиента навсегда и попала бы в статистику.
    const res = await log({ channel: "IN_PERSON", outcome: "FAILED" });
    expect(res.error).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it("звонок с «доставлено» — тоже отказ", async () => {
    const res = await log({ channel: "PHONE_OUTBOUND", outcome: "DELIVERED" });
    expect(res.error).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it("осмысленное сочетание записывается", async () => {
    const res = await log({ channel: "PHONE_OUTBOUND", outcome: "NO_ANSWER" });
    expect(res.error).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.outcome).toBe("NO_ANSWER");
  });

  it("личный визит без отметки результата — нормальный случай", async () => {
    const res = await log({ channel: "IN_PERSON", outcome: "N_A" });
    expect(res.error).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });
});
