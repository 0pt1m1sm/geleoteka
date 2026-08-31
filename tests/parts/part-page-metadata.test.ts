import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ИСПОЛНЯЕМЫЙ тест метаданных карточки товара.
 *
 * Заменяет подстрочный сторож, который был ЗЕЛЁНЫМ при живом блокере: он
 * требовал лишь наличия вызова `pickVariantHost(` в файле, а исполнение до
 * него не доходило — ранний выход по `condition !== "NEW"` стоял выше. Из-за
 * этого каждая б/у страница носила заголовок «Запчасть не найдена» и canonical
 * на себя, то есть главный смысл истории не работал ни для одной такой
 * страницы, при полностью зелёном гейте.
 *
 * Урок пятый по счёту в этой инициативе: проверять надо ПОВЕДЕНИЕ, а не
 * присутствие символа в файле.
 */

const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({ db: { part: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));

type Fixture = {
  id: string;
  slug: string;
  sku: string;
  article: string;
  name: string;
  description: string | null;
  price: number;
  photos: string[];
  isActive: boolean;
  condition: "NEW" | "USED" | "REFURBISHED";
  createdAt: Date;
};

const NEW_PART: Fixture = {
  id: "p-new",
  slug: "support-new",
  sku: "A4634210098",
  article: "A4634210098",
  name: "Суппорт тормозной",
  description: null,
  price: 4500000,
  photos: [],
  isActive: true,
  condition: "NEW",
  createdAt: new Date("2026-01-01"),
};
const USED_PART: Fixture = {
  ...NEW_PART,
  id: "p-u1",
  slug: "support-used-1",
  sku: "A4634210098-U1",
  name: "Суппорт тормозной б/у",
  condition: "USED",
  createdAt: new Date("2026-02-01"),
};

/** Оба варианта видят друг друга через номенклатуру — как в реальном запросе. */
function withReference(part: Fixture, siblings: Fixture[]) {
  return {
    ...part,
    category: null,
    stockItems: [{ quantity: 1 }],
    partTrims: [],
    reference: {
      id: "ref-1",
      parts: siblings.map((s) => ({ ...s, conditionNote: null, originNote: null, stockItems: [{ quantity: 1 }] })),
    },
  };
}

describe("generateMetadata карточки товара", () => {
  beforeEach(() => {
    findUnique.mockReset();
    vi.resetModules();
  });

  it("новый товар: свой заголовок и canonical на себя", async () => {
    findUnique.mockResolvedValue(withReference(NEW_PART, [NEW_PART, USED_PART]));
    const { generateMetadata } = await import("@/app/(public)/parts/[slug]/page");
    const meta = await generateMetadata({ params: Promise.resolve({ slug: "support-new" }) });
    expect(meta.title).toBe("Суппорт тормозной");
    expect(meta.alternates?.canonical).toBe("/parts/support-new");
  });

  it("б/у НЕ подписывается как «не найдена» — это был блокер PR #99", async () => {
    findUnique.mockResolvedValue(withReference(USED_PART, [NEW_PART, USED_PART]));
    const { generateMetadata } = await import("@/app/(public)/parts/[slug]/page");
    const meta = await generateMetadata({ params: Promise.resolve({ slug: "support-used-1" }) });
    // Раньше здесь было «Запчасть не найдена»: витрина вела покупателя на
    // страницу, у которой в табе и в превью для мессенджера написано, что
    // товара нет.
    expect(meta.title).not.toBe("Запчасть не найдена");
    expect(meta.title).toBe("Суппорт тормозной б/у");
  });

  it("б/у: canonical ведёт на ХОЗЯИНА, а не на себя", async () => {
    findUnique.mockResolvedValue(withReference(USED_PART, [NEW_PART, USED_PART]));
    const { generateMetadata } = await import("@/app/(public)/parts/[slug]/page");
    const meta = await generateMetadata({ params: Promise.resolve({ slug: "support-used-1" }) });
    expect(meta.alternates?.canonical).toBe("/parts/support-new");
  });

  it("несуществующий или снятый товар остаётся «не найден» и закрыт от индексации", async () => {
    findUnique.mockResolvedValue(null);
    const { generateMetadata } = await import("@/app/(public)/parts/[slug]/page");
    const meta = await generateMetadata({ params: Promise.resolve({ slug: "net-takogo" }) });
    expect(meta.title).toBe("Запчасть не найдена");
    expect(meta.robots).toBeTruthy();
  });

  it("деталь без номенклатуры сама себе хозяин", async () => {
    // Служебные артикулы «под заказ» не привязаны к справочнику.
    findUnique.mockResolvedValue({
      ...NEW_PART,
      slug: "podzakaz-01",
      category: null,
      stockItems: [{ quantity: 0 }],
      partTrims: [],
      reference: null,
    });
    const { generateMetadata } = await import("@/app/(public)/parts/[slug]/page");
    const meta = await generateMetadata({ params: Promise.resolve({ slug: "podzakaz-01" }) });
    expect(meta.alternates?.canonical).toBe("/parts/podzakaz-01");
  });
});
