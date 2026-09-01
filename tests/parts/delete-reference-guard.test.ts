import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Удаление позиции справочника.
 *
 * Раньше удаляло безусловно. База не возражала — `Part.referenceId`,
 * `EstimateLine.referenceId` и заявки объявлены SetNull, то есть связь просто
 * обнулялась. Одним кликом товары теряли страницу по номеру (canonical вёл в
 * никуда), строки смет — привязку к каталогу, а входящие заявки — позицию, ради
 * которой человек оставлял контакт. Видно это становилось не сразу и не тому,
 * кто нажимал.
 */

const partCount = vi.fn();
const lineCount = vi.fn();
const requestCount = vi.fn();
const del = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    part: { count: (...a: unknown[]) => partCount(...a) },
    estimateLine: { count: (...a: unknown[]) => lineCount(...a) },
    partRequest: { count: (...a: unknown[]) => requestCount(...a) },
    partReference: { delete: (...a: unknown[]) => del(...a) },
  },
}));
vi.mock("@/lib/auth", () => ({ requireRole: async () => ({ id: "u1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

async function remove() {
  const { deletePartReference } = await import("@/app/actions/part-references");
  return deletePartReference("ref-1");
}

describe("deletePartReference", () => {
  beforeEach(() => {
    partCount.mockReset().mockResolvedValue(0);
    lineCount.mockReset().mockResolvedValue(0);
    requestCount.mockReset().mockResolvedValue(0);
    del.mockReset().mockResolvedValue({});
    vi.resetModules();
  });

  it("свободную позицию удаляет", async () => {
    const res = await remove();
    expect(res.error).toBeNull();
    expect(del).toHaveBeenCalledTimes(1);
  });

  it("с ТОВАРАМИ не удаляет — иначе они теряют страницу по номеру", async () => {
    partCount.mockResolvedValue(3);
    const res = await remove();
    expect(res.error).toContain("товаров: 3");
    expect(del).not.toHaveBeenCalled();
  });

  it("со строками СМЕТ не удаляет — история потеряла бы привязку к каталогу", async () => {
    lineCount.mockResolvedValue(2);
    const res = await remove();
    expect(res.error).toContain("строк смет: 2");
    expect(del).not.toHaveBeenCalled();
  });

  it("с ЗАЯВКАМИ не удаляет — человек оставлял контакт ради этой позиции", async () => {
    requestCount.mockResolvedValue(1);
    const res = await remove();
    expect(res.error).toContain("заявок: 1");
    expect(del).not.toHaveBeenCalled();
  });

  it("перечисляет ВСЁ, что мешает, а не первое найденное", async () => {
    // Иначе человек убирает одну связь, жмёт снова и упирается в следующую.
    partCount.mockResolvedValue(1);
    lineCount.mockResolvedValue(2);
    requestCount.mockResolvedValue(3);
    const res = await remove();
    expect(res.error).toContain("товаров: 1");
    expect(res.error).toContain("строк смет: 2");
    expect(res.error).toContain("заявок: 3");
  });
});
