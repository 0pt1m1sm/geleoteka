import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Арендатор в асинхронном контексте.
 *
 * Главное свойство — независимость параллельных запросов друг от друга.
 * Глобальная переменная вместо хранилища выглядела бы работающей на одном
 * запросе и молча перепутала бы арендаторов под нагрузкой: чужой запрос
 * переписал бы значение между двумя await, и один сервис увидел бы данные
 * другого.
 */
describe("контекст арендатора", () => {
  it("вне запроса контекст пуст", async () => {
    const { currentTenantId } = await import("@/lib/tenant/context");
    expect(currentTenantId()).toBeNull();
  });

  it("внутри работы виден свой арендатор", async () => {
    const { runWithTenant, currentTenantId } = await import("@/lib/tenant/context");
    expect(runWithTenant("t1", () => currentTenantId())).toBe("t1");
  });

  it("ПАРАЛЛЕЛЬНЫЕ ЗАПРОСЫ НЕ ПУТАЮТ АРЕНДАТОРОВ", async () => {
    const { runWithTenant, currentTenantId } = await import("@/lib/tenant/context");
    const slow = async (id: string, delay: number) =>
      runWithTenant(id, async () => {
        await new Promise((r) => setTimeout(r, delay));
        return currentTenantId();
      });
    // Первый «запрос» дольше второго: если бы хранилище было общим, он
    // проснулся бы с чужим арендатором.
    const [first, second] = await Promise.all([slow("t1", 30), slow("t2", 5)]);
    expect(first).toBe("t1");
    expect(second).toBe("t2");
  });

  it("вложенный контекст перекрывает внешний и возвращает его обратно", async () => {
    const { runWithTenant, currentTenantId } = await import("@/lib/tenant/context");
    const seen = runWithTenant("t1", () => [currentTenantId(), runWithTenant("t2", () => currentTenantId()), currentTenantId()]);
    expect(seen).toEqual(["t1", "t2", "t1"]);
  });

  it("пустой арендатор отвергается", async () => {
    const { runWithTenant } = await import("@/lib/tenant/context");
    expect(() => runWithTenant("", () => null)).toThrow(/без арендатора/);
  });
});
