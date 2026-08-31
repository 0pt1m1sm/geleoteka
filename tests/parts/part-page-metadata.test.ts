import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Карточка товара после решения Р1: канонический адрес номенклатуры — ВСЕГДА
 * страница по номеру детали.
 *
 * Здесь проверяется поведение, а не наличие вызовов в файле. Подстрочный
 * сторож в этой же инициативе трижды был зелёным при живом дефекте.
 *
 * Два кода редиректа различаются НАМЕРЕННО и проверяются раздельно: постоянный
 * говорит «адрес переехал навсегда», и отозвать его нельзя — браузер кэширует,
 * поисковик переиндексирует. Спутать их значит соврать необратимо.
 */

const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({ db: { part: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));

const calls: string[] = [];
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOTFOUND");
  },
  redirect: (to: string) => {
    calls.push(`307:${to}`);
    throw new Error("REDIRECT");
  },
  permanentRedirect: (to: string) => {
    calls.push(`308:${to}`);
    throw new Error("REDIRECT");
  },
}));

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

const OEM = "A4634210098";

const NEW_PART: Fixture = {
  id: "p-new",
  slug: "support-new",
  sku: OEM,
  article: OEM,
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
  sku: `${OEM}-U1`,
  name: "Суппорт тормозной б/у",
  condition: "USED",
  createdAt: new Date("2026-02-01"),
};

/** Варианты видят друг друга через номенклатуру — как в реальном запросе. */
function withReference(part: Fixture, siblings: Fixture[]) {
  return {
    ...part,
    category: null,
    stockItems: [{ quantity: 1, reserved: 0 }],
    partTrims: [],
    reference: {
      id: "ref-1",
      oem: OEM,
      parts: siblings.map((s) => ({
        ...s,
        conditionNote: null,
        originNote: null,
        stockItems: [{ quantity: 1, reserved: 0 }],
      })),
    },
  };
}

/** Служебный артикул «под заказ»: номенклатуры нет, страницы по номеру тоже. */
function withoutReference(part: Fixture) {
  return {
    ...part,
    category: null,
    stockItems: [{ quantity: 0, reserved: 0 }],
    partTrims: [],
    reference: null,
  };
}

async function meta(slug: string, v?: string) {
  const { generateMetadata } = await import("@/app/(public)/parts/[slug]/page");
  return generateMetadata({
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve(v === undefined ? {} : { v }),
  });
}

describe("canonical карточки товара (Р1)", () => {
  beforeEach(() => {
    findUnique.mockReset();
    vi.resetModules();
  });

  it("НОВЫЙ товар: canonical на страницу по номеру, а НЕ на себя", async () => {
    findUnique.mockResolvedValue(withReference(NEW_PART, [NEW_PART, USED_PART]));
    expect((await meta("support-new")).alternates?.canonical).toBe(`/parts/oem/${OEM}`);
  });

  it("НОВЫЙ товар остаётся ИНДЕКСИРУЕМЫМ — canonical и noindex вместе недопустимы", async () => {
    // Главная ловушка Р1. Прежняя формула выводила noindex из «canonical не на
    // себя», а после Р1 это верно для КАЖДОГО товара с номенклатурой — весь
    // каталог закрылся бы от индексации разом. И даже будь это намеренно,
    // сочетание противоречиво: поисковик вправе проигнорировать canonical, и
    // склейки не произойдёт.
    findUnique.mockResolvedValue(withReference(NEW_PART, [NEW_PART, USED_PART]));
    expect((await meta("support-new")).robots).toBeFalsy();
  });

  it("товар без номенклатуры сам себе канон", async () => {
    findUnique.mockResolvedValue(withoutReference({ ...NEW_PART, slug: "podzakaz-01" }));
    const m = await meta("podzakaz-01");
    expect(m.alternates?.canonical).toBe("/parts/podzakaz-01");
    expect(m.robots).toBeFalsy();
  });

  it("адрес с ?v= закрыт от индексации — он показывает экземпляр, а не деталь", async () => {
    findUnique.mockResolvedValue(withReference(NEW_PART, [NEW_PART, USED_PART]));
    expect((await meta("support-new", `${OEM}-U1`)).robots).toBeTruthy();
  });

  it("ПУСТОЙ ?v= — отсутствие выбора, а не выбор пустого sku", async () => {
    // Обрезанная при пересылке ссылка — это голый адрес, его надо индексировать.
    findUnique.mockResolvedValue(withReference(NEW_PART, [NEW_PART, USED_PART]));
    expect((await meta("support-new", "")).robots).toBeFalsy();
  });

  it("несуществующий товар — «не найден» и закрыт от индексации", async () => {
    findUnique.mockResolvedValue(null);
    const m = await meta("net-takogo");
    expect(m.title).toBe("Запчасть не найдена");
    expect(m.robots).toBeTruthy();
  });
});

describe("поведение страницы: редиректы (Р1, Р2)", () => {
  beforeEach(() => {
    findUnique.mockReset();
    calls.length = 0;
    vi.resetModules();
  });

  /** "RENDER" | "307:<куда>" | "308:<куда>" | "NOTFOUND". */
  async function visit(slug: string, v?: string): Promise<string> {
    const { default: Page } = await import("@/app/(public)/parts/[slug]/page");
    try {
      await Page({
        params: Promise.resolve({ slug }),
        searchParams: Promise.resolve(v ? { v } : {}),
      });
      return "RENDER";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "REDIRECT") return calls[0];
      if (msg === "NOTFOUND") return "NOTFOUND";
      // Рендер JSX в узле может упасть по другой причине — значит до рендера
      // дошли, то есть ни редиректа, ни 404.
      return "RENDER";
    }
  }

  it("живой б/у уходит на страницу по номеру ПОСТОЯННЫМ редиректом", async () => {
    // Постоянный тут честен: своей страницы у экземпляра нет и не будет, а
    // цель — адрес по номеру — больше не переезжает (в отличие от «хозяина»
    // среди товаров, из-за чего в Story 5 пришлось вернуть временный).
    findUnique.mockResolvedValue(withReference(USED_PART, [NEW_PART, USED_PART]));
    expect(await visit("support-used-1")).toBe(`308:/parts/oem/${OEM}?v=${OEM}-U1`);
  });

  it("ПРОДАННЫЙ экземпляр доводит до страницы по номеру, и БЕЗ параметра", async () => {
    // Ссылка переживает продажу, упираться ей в 404 нельзя. Но параметр
    // развернул бы карточку, которой уже нет.
    const sold = { ...USED_PART, isActive: false };
    findUnique.mockResolvedValue(withReference(sold, [NEW_PART]));
    expect(await visit("support-used-1")).toBe(`308:/parts/oem/${OEM}`);
  });

  it("ВОССТАНОВЛЕННАЯ ведёт себя как б/у, а не как новый товар", async () => {
    const refurb = { ...USED_PART, condition: "REFURBISHED" as const };
    findUnique.mockResolvedValue(withReference(refurb, [NEW_PART, refurb]));
    expect(await visit("support-used-1")).toBe(`308:/parts/oem/${OEM}?v=${OEM}-U1`);
  });

  it("СНЯТЫЙ С ВИТРИНЫ новый товар — ВРЕМЕННЫЙ редирект, не постоянный", async () => {
    // Его включают обратно той же галкой в админке. Постоянный редирект был бы
    // ложью, которую уже не отозвать: он кэшируется браузером.
    const hidden = { ...NEW_PART, isActive: false };
    findUnique.mockResolvedValue(withReference(hidden, [USED_PART]));
    expect(await visit("support-new")).toBe(`307:/parts/oem/${OEM}`);
  });

  it("АКТИВНЫЙ новый товар РЕНДЕРИТСЯ — его не подменяют редиректом", async () => {
    // Это полноценная карточка с описанием и фотографиями; склейку с адресом
    // по номеру делает canonical. Редирект выкинул бы контент.
    findUnique.mockResolvedValue(withReference(NEW_PART, [NEW_PART, USED_PART]));
    expect(await visit("support-new")).toBe("RENDER");
  });

  it("товар без номенклатуры не редиректит никуда", async () => {
    findUnique.mockResolvedValue(withoutReference({ ...NEW_PART, slug: "podzakaz-01" }));
    expect(await visit("podzakaz-01")).toBe("RENDER");
  });

  it("снятый товар без номенклатуры — «не найден»: уводить некуда", async () => {
    findUnique.mockResolvedValue(
      withoutReference({ ...NEW_PART, slug: "podzakaz-01", isActive: false }),
    );
    expect(await visit("podzakaz-01")).toBe("NOTFOUND");
  });
});
