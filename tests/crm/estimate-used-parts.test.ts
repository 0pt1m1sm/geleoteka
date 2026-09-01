import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Б/у в смете (Story 7).
 *
 * Прежнее условие приёмки истории выполнялось УЖЕ ТОГДА, когда её только
 * написали: пикер фильтрует по активности, б/у экземпляр активен до продажи,
 * значит он и так был виден, выбирался и резервировал остаток. Не выбиралось
 * ровно одно поле — состояние. Поэтому проверяем не «выбирается ли», а
 * «отличается ли»: смета с б/у обязана отличаться от сметы с новым.
 */

const partFindMany = vi.fn();
const partFindUnique = vi.fn();
const lineCreate = vi.fn();
const lineFindFirst = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    part: {
      findMany: (...a: unknown[]) => partFindMany(...a),
      findUnique: (...a: unknown[]) => partFindUnique(...a),
    },
    estimateLine: {
      create: (...a: unknown[]) => lineCreate(...a),
      findFirst: (...a: unknown[]) => lineFindFirst(...a),
    },
    // Смета в черновике: иначе действие отказывает до того, как дойдёт до
    // состояния, и тест проверял бы не то.
    estimate: { findUnique: async () => ({ id: "est-1", stage: "DRAFT" }) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ estimateLine: { create: (...a: unknown[]) => lineCreate(...a) } }),
  },
}));
vi.mock("@/lib/auth", () => ({ requireRole: async () => ({ id: "mgr" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/wms/public", () => ({ availableStock: (s: { quantity: number; reserved: number }) => s.quantity - s.reserved }));
vi.mock("@/lib/crm/public", () => ({
  recomputeEstimateTotals: async () => {},
  signedLineTotal: (_t: string, qty: number, unitPrice: number) => ({ unitPrice, total: qty * unitPrice }),
}));
vi.mock("@/lib/fulfillment/reservations", () => ({
  reserveForLine: async () => {},
  releaseForLine: async () => {},
}));
vi.mock("@/lib/wms-host", () => ({ actorId: () => "mgr" }));

const NEW_PART = {
  id: "p-new",
  name: "Суппорт тормозной",
  article: "A4634210098",
  sku: "A4634210098",
  price: 4500000,
  condition: "NEW" as const,
  conditionNote: null,
  stockItems: [{ quantity: 2, reserved: 0 }],
};
const USED_PART = {
  ...NEW_PART,
  id: "p-u1",
  sku: "A4634210098-U1",
  condition: "USED" as const,
  conditionNote: "следы эксплуатации, без задиров",
  stockItems: [{ quantity: 1, reserved: 0 }],
};

describe("пикер сметы: б/у отличается от нового", () => {
  beforeEach(() => {
    partFindMany.mockReset();
    vi.resetModules();
  });

  it("отдаёт состояние — иначе строки НЕОТЛИЧИМЫ", async () => {
    // Артикул у нового и у каждого экземпляра ОДИН И ТОТ ЖЕ (так задумано
    // схемой), а поиск идёт в том числе по нему.
    partFindMany.mockResolvedValue([NEW_PART, USED_PART]);
    const { searchPartStockOptions } = await import("@/app/actions/crm/stock-options");
    const opts = await searchPartStockOptions("A4634210098");
    expect(opts.map((o) => o.condition)).toEqual(["NEW", "USED"]);
  });

  it("отдаёт sku — им различаются ДВА б/у экземпляра одной детали", async () => {
    // У них совпадает всё: артикул, название, состояние.
    partFindMany.mockResolvedValue([USED_PART, { ...USED_PART, id: "p-u2", sku: "A4634210098-U2" }]);
    const { searchPartStockOptions } = await import("@/app/actions/crm/stock-options");
    const opts = await searchPartStockOptions("");
    expect(new Set(opts.map((o) => o.sku)).size).toBe(2);
  });

  it("две строки одной детали различимы ХОТЬ ЧЕМ-ТО", async () => {
    // Главная проверка истории: если вывод для б/у и для нового совпал —
    // механик выбирает наугад, и в смету уходит не та деталь и не та цена.
    partFindMany.mockResolvedValue([NEW_PART, USED_PART]);
    const { searchPartStockOptions } = await import("@/app/actions/crm/stock-options");
    const [a, b] = await searchPartStockOptions("");
    expect(JSON.stringify(a)).not.toBe(JSON.stringify({ ...b, id: a.id }));
    expect(a.condition === b.condition && a.sku === b.sku).toBe(false);
  });
});

describe("строка сметы хранит СНИМОК состояния", () => {
  beforeEach(() => {
    partFindUnique.mockReset();
    lineCreate.mockReset().mockResolvedValue({ id: "line-1" });
    lineFindFirst.mockReset().mockResolvedValue(null);
    vi.resetModules();
  });

  async function addLine(fields: Record<string, string>) {
    const { addEstimateLine } = await import("@/app/actions/crm/estimate-lines");
    const fd = new FormData();
    fd.set("estimateId", "est-1");
    fd.set("type", "OTHER");
    fd.set("description", "Суппорт");
    fd.set("qty", "1");
    fd.set("unitPrice", "4500000");
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return addEstimateLine(null, fd);
  }

  it("состояние берётся С СЕРВЕРА, а не из формы", async () => {
    // Строка сметы — исторический документ; принимать состояние от клиента
    // значит позволить подписать «новую» деталь ценой б/у.
    partFindUnique.mockResolvedValue({ referenceId: "ref-1", condition: "USED" });
    await addLine({ partId: "p-u1", conditionSnapshot: "NEW" });
    expect(lineCreate.mock.calls[0][0].data.conditionSnapshot).toBe("USED");
  });

  it("строка БЕЗ товара снимка не получает", async () => {
    // Работы и произвольные позиции состояния не имеют.
    await addLine({});
    expect(lineCreate.mock.calls[0][0].data.conditionSnapshot).toBeNull();
    expect(partFindUnique).not.toHaveBeenCalled();
  });

  it("снимок лежит В СТРОКЕ, а не берётся связью с товаром", async () => {
    // Товар, который ни разу не заказывали, удалить можно (SetNull), и join
    // молча потерял бы «б/у», сохранив цену, согласованную именно за б/у.
    partFindUnique.mockResolvedValue({ referenceId: null, condition: "REFURBISHED" });
    await addLine({ partId: "p-r1" });
    const data = lineCreate.mock.calls[0][0].data;
    expect(data.conditionSnapshot).toBe("REFURBISHED");
    expect(Object.keys(data)).toContain("conditionSnapshot");
  });
});
