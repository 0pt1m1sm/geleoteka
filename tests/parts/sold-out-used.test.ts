import { describe, expect, it } from "vitest";
import { shouldDeactivateSoldOut } from "@/lib/parts/sold-out";

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
