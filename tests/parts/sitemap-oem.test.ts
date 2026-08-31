import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Карта сайта после решения Р1.
 *
 * Заменяет снятый подстрочный инвариант, который требовал от карты фильтра по
 * состоянию товара: она больше не перечисляет товары вовсе, поэтому проверять
 * там нечего. Новый предмет проверки — что в карту идут адреса номенклатуры,
 * что пустые номенклатуры туда не попадают (иначе карта заявляла бы адреса,
 * которые сами отдают noindex) и что товары без номенклатуры не теряются.
 */

const refFindMany = vi.fn();
const partFindMany = vi.fn();
const emptyList = () => ({ findMany: vi.fn().mockResolvedValue([]) });

vi.mock("@/lib/db", () => ({
  db: {
    partReference: { findMany: (...a: unknown[]) => refFindMany(...a) },
    part: { findMany: (...a: unknown[]) => partFindMany(...a) },
    service: emptyList(),
    vehicle: emptyList(),
    blogPost: emptyList(),
  },
}));
vi.mock("@/lib/vehicle-catalog", () => ({ getActiveModels: vi.fn().mockResolvedValue([]) }));

const NOW = new Date("2026-08-31");

async function urls(): Promise<string[]> {
  const mod = await import("@/app/sitemap");
  const entries = await mod.default();
  return entries.map((e) => e.url);
}

describe("карта сайта: адреса по номеру детали", () => {
  beforeEach(() => {
    refFindMany.mockReset();
    partFindMany.mockReset();
    refFindMany.mockResolvedValue([]);
    partFindMany.mockResolvedValue([]);
    vi.resetModules();
  });

  it("номенклатура попадает в карту адресом ПО НОМЕРУ, а не слагом товара", async () => {
    refFindMany.mockResolvedValue([{ oem: "A4634210098", updatedAt: NOW }]);
    const list = await urls();
    expect(list.some((u) => u.endsWith("/parts/oem/A4634210098"))).toBe(true);
    expect(list.some((u) => u.includes("/parts/support-"))).toBe(false);
  });

  it("запрос отбирает только номенклатуру с ЖИВЫМ товаром", async () => {
    // Пустая номенклатура сама отдаёт noindex; заявить её в карте значило бы
    // противоречить собственной странице. Фильтр стоит в запросе, поэтому и
    // проверяется он — на аргументе, а не на подстроке в файле.
    await urls();
    expect(refFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { parts: { some: { isActive: true } } } }),
    );
  });

  it("по ОСТАТКУ не фильтруем — «под заказ» это предложение, а не пустая страница", async () => {
    // Отсечение по остатку выбрасывало бы длинный хвост запросов по номеру,
    // ради которого история и затевалась.
    await urls();
    const arg = refFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(JSON.stringify(arg.where)).not.toMatch(/quantity|reserved/);
  });

  it("товары БЕЗ номенклатуры не теряются — у них своей страницы по номеру нет", async () => {
    partFindMany.mockResolvedValue([{ slug: "podzakaz-07", updatedAt: NOW }]);
    expect((await urls()).some((u) => u.endsWith("/parts/podzakaz-07"))).toBe(true);
    expect(partFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true, referenceId: null } }),
    );
  });
});
