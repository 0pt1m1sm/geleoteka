import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Перелинковка статей и страниц кузовов.
 *
 * Статьи Яндекс тоже пометил маловостребованными (6 из 17), но лечится это не
 * индексацией: тексты содержательные, им не хватало связей. Статья «слабые
 * места W463» и страница кузова W463 с тремя сотнями деталей — про одно и то
 * же, а ссылок друг на друга не было ни одной.
 */

const postFindMany = vi.fn();
const genFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    blogPost: { findMany: (...a: unknown[]) => postFindMany(...a) },
    vehicleGeneration: { findMany: (...a: unknown[]) => genFindMany(...a) },
  },
}));

const ARTICLE = {
  title: "Слабые места W463 — чек-лист владельца",
  content: "Раздатка и рулевой редуктор на w463 требуют внимания. У W461 иначе.",
  tags: ["W463", "слабые места"],
};

describe("generationsForPost", () => {
  beforeEach(() => {
    genFindMany.mockReset();
    genFindMany.mockResolvedValue([]);
    vi.resetModules();
  });

  it("коды кузовов берутся из заголовка, тегов и текста", async () => {
    const { generationsForPost } = await import("@/lib/models/related-content");
    await generationsForPost(ARTICLE);
    const codes = genFindMany.mock.calls[0][0].where.code.in as string[];
    expect(codes).toContain("W463");
    expect(codes).toContain("W461");
  });

  it("регистр не важен: «w463» в тексте это тот же кузов", async () => {
    const { generationsForPost } = await import("@/lib/models/related-content");
    await generationsForPost({ title: "", content: "проблемы w463", tags: [] });
    expect(genFindMany.mock.calls[0][0].where.code.in).toContain("W463");
  });

  it("без кодов в тексте запрос НЕ делается вовсе", async () => {
    // Статья про аренду кузовов не упоминает — незачем ходить в базу.
    const { generationsForPost } = await import("@/lib/models/related-content");
    const res = await generationsForPost({
      title: "Аренда Гелендвагена с водителем",
      content: "Свадьбы и съёмки.",
      tags: ["аренда"],
    });
    expect(res).toEqual([]);
    expect(genFindMany).not.toHaveBeenCalled();
  });

  it("отбираются только ЖИВЫЕ кузова живых моделей", async () => {
    // В тексте может встретиться кузов, которого у нас нет: вести на
    // несуществующую страницу нельзя.
    const { generationsForPost } = await import("@/lib/models/related-content");
    await generationsForPost(ARTICLE);
    const where = genFindMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    expect(where.model).toEqual({ isActive: true });
  });
});

describe("postsForGeneration", () => {
  beforeEach(() => {
    postFindMany.mockReset();
    postFindMany.mockResolvedValue([]);
    vi.resetModules();
  });

  it("ищет по тегам, заголовку и тексту — и только опубликованное", async () => {
    const { postsForGeneration } = await import("@/lib/models/related-content");
    await postsForGeneration("W463");
    const where = postFindMany.mock.calls[0][0].where;
    expect(where.published).toBe(true);
    const asText = JSON.stringify(where.OR);
    expect(asText).toContain("tags");
    expect(asText).toContain("title");
    expect(asText).toContain("content");
  });

  it("тег может быть записан строчными — ищем оба написания", async () => {
    const { postsForGeneration } = await import("@/lib/models/related-content");
    await postsForGeneration("W463");
    const asText = JSON.stringify(postFindMany.mock.calls[0][0].where.OR);
    expect(asText).toContain("W463");
    expect(asText).toContain("w463");
  });
});
