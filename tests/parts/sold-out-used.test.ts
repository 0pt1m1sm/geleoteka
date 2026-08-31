import { describe, expect, it } from "vitest";
import { shouldDeactivateSoldOut, syncSoldOutUsedPart } from "@/lib/parts/sold-out";

describe("shouldDeactivateSoldOut", () => {
  it("б/у с нулевым остатком гасится", () => {
    // Экземпляр физически один: ноль означает «продан», а не «под заказ».
    expect(shouldDeactivateSoldOut({ condition: "USED", isActive: true, onHand: 0 })).toBe(true);
  });

  it("восстановленный ведёт себя так же", () => {
    expect(
      shouldDeactivateSoldOut({ condition: "REFURBISHED", isActive: true, onHand: 0 }),
    ).toBe(true);
  });

  it("НОВЫЙ товар с нулевым остатком НЕ гасится — он пополняемый", () => {
    // Главная граница правила: новый товар с нулём это «под заказ», и убирать
    // его с витрины значит терять заказы.
    expect(shouldDeactivateSoldOut({ condition: "NEW", isActive: true, onHand: 0 })).toBe(false);
  });

  it("б/у с остатком не трогаем", () => {
    expect(shouldDeactivateSoldOut({ condition: "USED", isActive: true, onHand: 1 })).toBe(false);
  });

  it("уже погашенный не гасим повторно — иначе лишняя запись при каждом движении", () => {
    expect(shouldDeactivateSoldOut({ condition: "USED", isActive: false, onHand: 0 })).toBe(false);
  });

  it("отрицательный остаток тоже считается продажей", () => {
    // Рассинхрон возможен при ручной корректировке; прятать позицию правильнее,
    // чем показывать покупателю то, чего нет.
    expect(shouldDeactivateSoldOut({ condition: "USED", isActive: true, onHand: -1 })).toBe(true);
  });
});

/** Фейк порта: минимум, который читает обёртка. */
function client(part: {
  condition: "NEW" | "USED" | "REFURBISHED";
  isActive: boolean;
  quantities: number[];
} | null) {
  const updates: Array<{ isActive: boolean }> = [];
  return {
    updates,
    port: {
      part: {
        findUnique: async () =>
          part && {
            condition: part.condition,
            isActive: part.isActive,
            stockItems: part.quantities.map((quantity) => ({ quantity })),
          },
        update: async (args: { data: { isActive: boolean } }) => {
          updates.push(args.data);
          return {};
        },
      },
    },
  };
}

describe("syncSoldOutUsedPart — обёртка над БД", () => {
  it("суммирует остаток по ВСЕМ складам, а не по одному", async () => {
    // Экземпляр может лежать не на складе по умолчанию: ноль на первом складе
    // при единице на втором не означает продажу.
    const c = client({ condition: "USED", isActive: true, quantities: [0, 1] });
    expect(await syncSoldOutUsedPart(c.port as never, "p1")).toBe(false);
    expect(c.updates).toHaveLength(0);
  });

  it("гасит, когда сумма по всем складам ноль", async () => {
    const c = client({ condition: "USED", isActive: true, quantities: [0, 0] });
    expect(await syncSoldOutUsedPart(c.port as never, "p1")).toBe(true);
    expect(c.updates).toEqual([{ isActive: false }]);
  });

  it("не трогает новый товар с нулём", async () => {
    const c = client({ condition: "NEW", isActive: true, quantities: [0] });
    expect(await syncSoldOutUsedPart(c.port as never, "p1")).toBe(false);
    expect(c.updates).toHaveLength(0);
  });

  it("повторный вызов не пишет второй раз", async () => {
    const c = client({ condition: "USED", isActive: false, quantities: [0] });
    expect(await syncSoldOutUsedPart(c.port as never, "p1")).toBe(false);
    expect(c.updates).toHaveLength(0);
  });

  it("исчезнувшая позиция не роняет вызов", async () => {
    const c = client(null);
    expect(await syncSoldOutUsedPart(c.port as never, "нет-такого")).toBe(false);
  });
});
