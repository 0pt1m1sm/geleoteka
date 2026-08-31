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

/** notFound/redirect бросают — так их и различаем в тестах поведения. */
const redirects: string[] = [];
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOTFOUND");
  },
  redirect: (to: string) => {
    redirects.push(to);
    throw new Error("REDIRECT");
  },
  // Постоянный редирект здесь — ошибка: хозяин выбирается динамически, и
  // «навсегда» разворачивается, когда новый товар снимают с витрины.
  // Станет допустим в Story 6, когда хозяином будет страница по номеру детали.
  permanentRedirect: () => {
    throw new Error("ПОСТОЯННЫЙ РЕДИРЕКТ ВАРИАНТА: хозяин меняется, 308 будет ложью");
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

  it("ПУСТОЙ ?v= — это отсутствие выбора, а не выбор пустого sku", async () => {
    // Обрезанная при пересылке ссылка вида /parts/xxx?v= — голый адрес
    // хозяина. Раньше проверка «это строка» считала "" выбором, и такой адрес
    // получал noindex, хотя индексировать надо именно его.
    findUnique.mockResolvedValue(withReference(NEW_PART, [NEW_PART, USED_PART]));
    const { generateMetadata } = await import("@/app/(public)/parts/[slug]/page");
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: "support-new" }),
      searchParams: Promise.resolve({ v: "" }),
    });
    expect(meta.robots).toBeFalsy();
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

describe("поведение страницы: редирект вариантов", () => {
  beforeEach(() => {
    findUnique.mockReset();
    redirects.length = 0;
    vi.resetModules();
  });

  /** Возвращает "RENDER" | "REDIRECT:<куда>" | "NOTFOUND". */
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
      if (msg === "REDIRECT") return `REDIRECT:${redirects[0]}`;
      if (msg === "NOTFOUND") return "NOTFOUND";
      // Сообщения сторожей пробрасываем: иначе регресс к постоянному редиректу
      // упал бы с бесполезным «ожидал REDIRECT, получил RENDER», а написанный
      // текст про причину проглотился бы.
      if (msg.startsWith("ПОСТОЯННЫЙ РЕДИРЕКТ")) throw e;
      // Рендер JSX в узле может упасть по другой причине — для нас это
      // означает, что до рендера дошли, то есть ни редиректа, ни 404.
      return "RENDER";
    }
  }

  it("прямой заход на б/у уводит на хозяина с ?v=", async () => {
    findUnique.mockResolvedValue(withReference(USED_PART, [NEW_PART, USED_PART]));
    expect(await visit("support-used-1")).toBe("REDIRECT:/parts/support-new?v=A4634210098-U1");
  });

  it("ЖИВОЙ вариант уводит на хозяина С параметром — иначе выбор потеряется", async () => {
    findUnique.mockResolvedValue(withReference(USED_PART, [NEW_PART, USED_PART]));
    expect(await visit("support-used-1")).toBe("REDIRECT:/parts/support-new?v=A4634210098-U1");
  });

  it("цель редиректа рендерится — цикла нет", async () => {
    findUnique.mockResolvedValue(withReference(NEW_PART, [NEW_PART, USED_PART]));
    expect(await visit("support-new", "A4634210098-U1")).toBe("RENDER");
  });

  it("ПРОДАННЫЙ экземпляр доводит до хозяина С параметром — чтобы прочитать «продан»", async () => {
    // Б/у одноразовый: расшаренная ссылка переживает продажу, и упираться ей
    // в 404 нельзя. Параметр здесь НУЖЕН — экземпляр действительно кончился,
    // и пришедший по ссылке должен это прочитать, а не гадать, почему видит
    // другой товар.
    const sold = { ...USED_PART, isActive: false };
    findUnique.mockResolvedValue(withReference(sold, [NEW_PART, sold]));
    expect(await visit("support-used-1")).toBe("REDIRECT:/parts/support-new?v=A4634210098-U1");
  });

  it("когда новый снят, хозяином становится б/у", async () => {
    const soldNew = { ...NEW_PART, isActive: false };
    findUnique.mockResolvedValue(withReference(soldNew, [soldNew, USED_PART]));
    // Снятый НОВЫЙ товар — без параметра: он не «продан», он спрятан, и
    // сообщение «экземпляр продан» было бы про него ложью.
    expect(await visit("support-new")).toBe("REDIRECT:/parts/support-used-1");
  });

  it("ВОССТАНОВЛЕННАЯ ведёт себя как б/у, а не как новый товар", async () => {
    // Она тоже экземпляр в одном лице: кончилась — значит кончилась.
    const sold = { ...USED_PART, condition: "REFURBISHED" as const, isActive: false };
    findUnique.mockResolvedValue(withReference(sold, [NEW_PART, sold]));
    expect(await visit("support-used-1")).toBe("REDIRECT:/parts/support-new?v=A4634210098-U1");
  });

  it("деталь без активных вариантов вовсе — «не найдена»", async () => {
    const soldNew = { ...NEW_PART, isActive: false };
    findUnique.mockResolvedValue(withReference(soldNew, [soldNew]));
    expect(await visit("support-new")).toBe("NOTFOUND");
  });
});
