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
const genFindMany = vi.fn();
const modelFindMany = vi.fn();
const emptyList = () => ({ findMany: vi.fn().mockResolvedValue([]) });

vi.mock("@/lib/db", () => ({
  db: {
    partReference: { findMany: (...a: unknown[]) => refFindMany(...a) },
    part: { findMany: (...a: unknown[]) => partFindMany(...a) },
    // Поколения появились вместе со страницами кузовов; без заглушки карта
    // падает целиком и тесты про запчасти краснеют не по делу.
    vehicleGeneration: { findMany: (...a: unknown[]) => genFindMany(...a) },
    // Модели теперь читаются напрямую (нужен счёт деталей), а не через
    // getActiveModels — без заглушки карта падает целиком.
    vehicleModel: { findMany: (...a: unknown[]) => modelFindMany(...a) },
    service: emptyList(),
    vehicle: emptyList(),
    blogPost: emptyList(),
  },
}));

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
    genFindMany.mockReset();
    genFindMany.mockResolvedValue([]);
    modelFindMany.mockReset();
    modelFindMany.mockResolvedValue([]);
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
      expect.objectContaining({
        where: { isActive: true, referenceId: null, condition: "NEW" },
      }),
    );
  });

  it("бесхозный Б/У в карту НЕ идёт — его страница сама себя закрывает", async () => {
    // Страница ставит noindex всему, что не новое: адрес экземпляра умрёт с
    // продажей. Без фильтра карта заявляла бы поисковику адреса, которые сами
    // себя закрывают. Проверяем условие запроса, потому что отбор делает БД.
    await urls();
    const where = (partFindMany.mock.calls[0]?.[0] ?? {}) as { where?: Record<string, unknown> };
    expect(where.where?.condition).toBe("NEW");
  });

  it("страница ПОКОЛЕНИЯ попадает в карту, когда ей есть что показать", async () => {
    genFindMany.mockResolvedValue([
      {
        code: "W463",
        updatedAt: NOW,
        description: "Самое массовое поколение",
        model: { slug: "g-class" },
        _count: { partReferenceFitments: 351 },
      },
      // Пустая: ни описания, ни деталей — сама отдаёт noindex, и заявлять её
      // значило бы противоречить собственной странице.
      {
        code: "W465",
        updatedAt: NOW,
        description: null,
        model: { slug: "g-class" },
        _count: { partReferenceFitments: 0 },
      },
    ]);
    const list = await urls();
    expect(list.some((u) => u.endsWith("/models/g-class/W463"))).toBe(true);
    expect(list.some((u) => u.endsWith("/models/g-class/W465"))).toBe(false);
  });

  it("ШАБЛОННАЯ модель в карту не идёт, а наполненная идёт", async () => {
    // У всех моделей описание в одну строку; отличается только G-Class своим
    // набором запчастей. Заявлять близнецов значит повторять ту же ошибку, за
    // которую Яндекс исключил 16 страниц моделей из 35.
    modelFindMany.mockResolvedValue([
      { slug: "g-class", description: "Коротко.", generations: [{ _count: { partReferenceFitments: 523 } }] },
      { slug: "b-class", description: "Компактвэн.", generations: [{ _count: { partReferenceFitments: 0 } }] },
    ]);
    const list = await urls();
    expect(list.some((u) => u.endsWith("/models/g-class"))).toBe(true);
    expect(list.some((u) => u.endsWith("/models/b-class"))).toBe(false);
  });
});
