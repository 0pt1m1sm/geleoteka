import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Две защиты, в которых и жили дефекты ревью PR #110.
 *
 * Обе оказались непокрытыми ровно потому, что прошлый тест их МОКАЛ: он
 * подменял адрес клиента напрямую, поэтому настоящий разбор заголовка в него не
 * попадал, а действие «отметить обработанной» не проверялось вовсе. Здесь
 * проверяется то, что там подменялось.
 */

vi.mock("server-only", () => ({}));

let headerValues: Record<string, string> = {};
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => headerValues[k.toLowerCase()] ?? null }),
}));

const update = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { partRequest: { update: (...a: unknown[]) => update(...a) } },
}));

const requireRole = vi.fn();
vi.mock("@/lib/auth", () => ({ requireRole: (...a: unknown[]) => requireRole(...a) }));

describe("clientIp: чей адрес считается адресом клиента", () => {
  beforeEach(() => {
    headerValues = {};
    vi.resetModules();
  });

  async function ip(): Promise<string | null> {
    const { clientIp } = await import("@/lib/audit");
    return clientIp();
  }

  it("берётся ПОСЛЕДНИЙ элемент цепочки, а не первый", async () => {
    // Первый элемент присылает сам клиент: прокси свой адрес дописывает справа.
    // Пока брался первый, ключ троттлера был полностью подконтролен тому, кого
    // он должен ограничивать, — тридцать заявок при лимите пять.
    headerValues["x-forwarded-for"] = "1.2.3.4, 10.0.0.1, 172.16.0.1";
    expect(await ip()).toBe("172.16.0.1");
  });

  it("подделанный первый элемент НЕ становится ключом", async () => {
    headerValues["x-forwarded-for"] = "8.8.8.8, 203.0.113.7";
    expect(await ip()).not.toBe("8.8.8.8");
  });

  it("единственный элемент — он же и есть адрес", async () => {
    // Так выглядит цепочка, если платформа перезаписывает заголовок целиком:
    // первый и последний совпадают, и правило ничего не ломает.
    headerValues["x-forwarded-for"] = "203.0.113.7";
    expect(await ip()).toBe("203.0.113.7");
  });

  it("пробелы и пустые элементы не сдвигают выбор", async () => {
    headerValues["x-forwarded-for"] = " 1.2.3.4 ,  , 203.0.113.7 ,";
    expect(await ip()).toBe("203.0.113.7");
  });

  it("без цепочки берётся x-real-ip", async () => {
    headerValues["x-real-ip"] = "198.51.100.9";
    expect(await ip()).toBe("198.51.100.9");
  });

  it("адреса нет вовсе — null, а не падение", async () => {
    expect(await ip()).toBeNull();
  });
});

describe("markPartRequestHandled: права", () => {
  beforeEach(() => {
    update.mockReset();
    requireRole.mockReset();
    vi.resetModules();
  });

  it("БЕЗ прав ничего не меняет", async () => {
    // Файл объявлен «use server» — значит каждый экспорт это сетевая точка
    // входа. Закрытая страница-список не спасает: страница и действие разные
    // входы. Раньше отметить заявку мог кто угодно, зная id.
    requireRole.mockRejectedValue(new Error("FORBIDDEN"));
    const { markPartRequestHandled } = await import("@/app/actions/part-requests");
    await expect(markPartRequestHandled("req-1")).rejects.toThrow("FORBIDDEN");
    expect(update).not.toHaveBeenCalled();
  });

  it("спрашивает именно роли админа и менеджера", async () => {
    requireRole.mockResolvedValue({ id: "user-7" });
    const { markPartRequestHandled } = await import("@/app/actions/part-requests");
    await markPartRequestHandled("req-1");
    expect(requireRole).toHaveBeenCalledWith(["ADMIN", "MANAGER"]);
  });

  it("автор берётся ИЗ СЕССИИ — параметром его подделывали", async () => {
    // Раньше userId приходил аргументом от клиента: в handledById можно было
    // записать любого сотрудника.
    requireRole.mockResolvedValue({ id: "user-7" });
    const { markPartRequestHandled } = await import("@/app/actions/part-requests");
    await markPartRequestHandled("req-1");
    expect(update.mock.calls[0][0].data.handledById).toBe("user-7");
  });

  it("подпись действия НЕ принимает автора снаружи", async () => {
    // Один аргумент: id. Если появится второй, авторство снова станет
    // подделываемым, и этот тест обязан на это упасть.
    const { markPartRequestHandled } = await import("@/app/actions/part-requests");
    expect(markPartRequestHandled.length).toBe(1);
  });
});
