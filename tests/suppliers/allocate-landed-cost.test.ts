import { describe, expect, it } from "vitest";
import { allocateLandedCost, type AllocatableLine } from "@/lib/suppliers/landed-cost";

/**
 * Разнесение доставки и таможни на позиции.
 *
 * До этого затраты на ввоз считались на уровне заказа и там оставались, а
 * себестоимость позиции равнялась голой цене закупки. Оценка запасов брала
 * именно её: склад числился дешевле, чем стоил, а наценка выглядела больше,
 * чем есть. При таможне 26% и карго по доллару за килограмм это десятки
 * процентов — для модели «купил за рубежом, продал с наценкой» самая дорогая
 * неточность.
 */
const HEAVY_CHEAP: AllocatableLine = { key: "heavy", quantity: 1, unitCost: 1_000, weightGrams: 30_000 };
const LIGHT_PRICEY: AllocatableLine = { key: "light", quantity: 1, unitCost: 100_000, weightGrams: 500 };

/** Считаем по ТОЧНЫМ итогам строк: цена единицы округлена и складывать её
 *  обратно нельзя — об этом прямо сказано в контракте функции. */
function sum(out: Array<{ landedTotalCost: number }>): number {
  return out.reduce((s, o) => s + o.landedTotalCost, 0);
}

describe("allocateLandedCost", () => {
  it("ДОСТАВКУ делит по весу — её и берут за килограмм", () => {
    // Тяжёлая дешёвая деталь оплачивает доставку, которую создала она.
    // Дели мы всё по стоимости, ей досталось бы почти ноль.
    const lines = [HEAVY_CHEAP, LIGHT_PRICEY];
    const out = allocateLandedCost({ lines, shippingCost: 30_500, customsCost: 0, customsMode: "PERCENT_CIF" });
    const heavyExtra = out[0].landedUnitCost - HEAVY_CHEAP.unitCost;
    const lightExtra = out[1].landedUnitCost - LIGHT_PRICEY.unitCost;
    expect(heavyExtra).toBeGreaterThan(lightExtra * 10);
  });

  it("ТАМОЖНЮ в режиме процента делит по стоимости — с неё её и берут", () => {
    const lines = [HEAVY_CHEAP, LIGHT_PRICEY];
    const out = allocateLandedCost({ lines, shippingCost: 0, customsCost: 26_260, customsMode: "PERCENT_CIF" });
    const heavyExtra = out[0].landedUnitCost - HEAVY_CHEAP.unitCost;
    const lightExtra = out[1].landedUnitCost - LIGHT_PRICEY.unitCost;
    expect(lightExtra).toBeGreaterThan(heavyExtra * 10);
  });

  it("таможню-КАРГО делит по весу — она тоже за килограмм", () => {
    const lines = [HEAVY_CHEAP, LIGHT_PRICEY];
    const out = allocateLandedCost({ lines, shippingCost: 0, customsCost: 30_500, customsMode: "CARGO_PER_KG" });
    expect(out[0].landedUnitCost - HEAVY_CHEAP.unitCost).toBeGreaterThan(
      out[1].landedUnitCost - LIGHT_PRICEY.unitCost,
    );
  });

  it("сумма разнесённого СОВПАДАЕТ с затратами до рубля", () => {
    // Иначе себестоимость склада разойдётся с суммой заказов, и разойдётся
    // молча. Числа взяты неудобные намеренно — чтобы округление не сошлось само.
    const lines = [
      { key: "a", quantity: 3, unitCost: 1_111, weightGrams: 777 },
      { key: "b", quantity: 7, unitCost: 333, weightGrams: 91 },
      { key: "c", quantity: 1, unitCost: 49_999, weightGrams: 12_345 },
    ];
    const out = allocateLandedCost({ lines, shippingCost: 12_345, customsCost: 7_777, customsMode: "PERCENT_CIF" });
    const goods = lines.reduce((s, l) => s + l.unitCost * l.quantity, 0);
    expect(sum(out)).toBe(goods + 12_345 + 7_777);
  });

  it("без веса переходит на стоимость, а не теряет доставку", () => {
    // Вес заполнен не у всех позиций каталога; потерять доставку целиком или
    // осадить её на одной случайной строке было бы хуже приблизительности.
    const lines = [
      { key: "a", quantity: 1, unitCost: 1_000, weightGrams: null },
      { key: "b", quantity: 1, unitCost: 9_000, weightGrams: null },
    ];
    const out = allocateLandedCost({ lines, shippingCost: 1_000, customsCost: 0, customsMode: "PERCENT_CIF" });
    expect(sum(out)).toBe(10_000 + 1_000);
    expect(out[1].landedUnitCost - 9_000).toBeGreaterThan(out[0].landedUnitCost - 1_000);
  });

  it("нулевые затраты не меняют себестоимость", () => {
    const lines = [HEAVY_CHEAP, LIGHT_PRICEY];
    const out = allocateLandedCost({ lines, shippingCost: 0, customsCost: 0, customsMode: "PERCENT_CIF" });
    expect(out.map((o) => o.landedUnitCost)).toEqual([1_000, 100_000]);
  });

  it("одна строка забирает всё", () => {
    const lines = [{ key: "only", quantity: 2, unitCost: 500, weightGrams: 100 }];
    const out = allocateLandedCost({ lines, shippingCost: 300, customsCost: 100, customsMode: "PERCENT_CIF" });
    expect(sum(out)).toBe(1_000 + 400);
  });

  it("пустой заказ — пустой результат, а не падение", () => {
    expect(allocateLandedCost({ lines: [], shippingCost: 100, customsCost: 50, customsMode: "PERCENT_CIF" })).toEqual([]);
  });

  it("цена единицы округлена, и это оговорено: складывать надо итоги", () => {
    // Итог 1000 на три единицы не делится нацело. Точность живёт в
    // landedTotalCost, а landedUnitCost — для оценки склада, где остаток и так
    // не равен заказанному количеству.
    const lines = [{ key: "a", quantity: 3, unitCost: 300, weightGrams: 10 }];
    const out = allocateLandedCost({ lines, shippingCost: 100, customsCost: 0, customsMode: "PERCENT_CIF" });
    expect(out[0].landedTotalCost).toBe(1_000);
    expect(out[0].landedUnitCost).toBe(333);
    expect(out[0].landedUnitCost * 3).not.toBe(out[0].landedTotalCost);
  });
});

describe("оценка запасов берёт себестоимость С ВВОЗОМ", () => {
  it("landedUnitCost перевешивает голую цену закупки", async () => {
    // Ради этого всё и делалось: склад оценивался по цене поставщика, без
    // доставки и таможни, и наценка выглядела больше, чем есть.
    const { latestUnitCostByPartIds } = await import("@/lib/warehouse/valuation");
    const db = {
      part: { findMany: async () => [] },
      supplierOrderItem: {
        findMany: async () => [
          { partId: "p1", unitCost: 1_000, landedUnitCost: 1_380, order: { orderDate: new Date("2026-01-01") } },
        ],
      },
    };
    const map = await latestUnitCostByPartIds(db as never, ["p1"]);
    expect(map.get("p1")).toBe(1_380);
  });

  it("у старых строк без разнесения остаётся цена закупки", async () => {
    // Пересчитать их нельзя: ставки и курс на момент той закупки уже не
    // восстановить. Молча занулить себестоимость было бы хуже неточности.
    const { latestUnitCostByPartIds } = await import("@/lib/warehouse/valuation");
    const db = {
      part: { findMany: async () => [] },
      supplierOrderItem: {
        findMany: async () => [
          { partId: "p1", unitCost: 1_000, landedUnitCost: null, order: { orderDate: new Date("2025-01-01") } },
        ],
      },
    };
    const map = await latestUnitCostByPartIds(db as never, ["p1"]);
    expect(map.get("p1")).toBe(1_000);
  });
});
