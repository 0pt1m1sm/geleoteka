import { describe, expect, it } from "vitest";
import { pickVariantHost, type VariantForHost } from "@/lib/parts/variant-host";

const NEW_ACTIVE: VariantForHost = {
  slug: "sup-novyy",
  condition: "NEW",
  isActive: true,
  createdAt: new Date("2026-01-01"),
};
const USED_OLD: VariantForHost = {
  slug: "sup-bu-1",
  condition: "USED",
  isActive: true,
  createdAt: new Date("2026-02-01"),
};
const USED_NEWER: VariantForHost = {
  slug: "sup-bu-2",
  condition: "USED",
  isActive: true,
  createdAt: new Date("2026-03-01"),
};

describe("pickVariantHost", () => {
  it("хозяин — активный новый товар, если он есть", () => {
    expect(pickVariantHost([USED_NEWER, NEW_ACTIVE, USED_OLD])?.slug).toBe("sup-novyy");
  });

  it("без нового хозяином становится самый ранний активный вариант", () => {
    // Детерминированно: иначе канонический адрес детали менялся бы от запроса
    // к запросу, а это худшее, что можно сделать с индексацией.
    expect(pickVariantHost([USED_NEWER, USED_OLD])?.slug).toBe("sup-bu-1");
  });

  it("неактивные не могут быть хозяином", () => {
    const soldNew = { ...NEW_ACTIVE, isActive: false };
    expect(pickVariantHost([soldNew, USED_OLD])?.slug).toBe("sup-bu-1");
  });

  it("восстановленная считается не новой и хозяином становится только без нового", () => {
    const refurb: VariantForHost = {
      slug: "sup-vosst",
      condition: "REFURBISHED",
      isActive: true,
      createdAt: new Date("2026-01-15"),
    };
    expect(pickVariantHost([refurb, NEW_ACTIVE])?.slug).toBe("sup-novyy");
    expect(pickVariantHost([USED_NEWER, refurb])?.slug).toBe("sup-vosst");
  });

  it("пусто, когда активных вариантов нет вовсе", () => {
    expect(pickVariantHost([{ ...NEW_ACTIVE, isActive: false }])).toBeNull();
    expect(pickVariantHost([])).toBeNull();
  });

  it("два новых с одинаковой датой — берётся первый по slug, не произвольный", () => {
    // Партийный индекс запрещает два активных NEW на артикул, но номенклатура
    // может собрать варианты разных артикулов; порядок обязан быть устойчивым.
    const a: VariantForHost = { ...NEW_ACTIVE, slug: "b-part" };
    const b: VariantForHost = { ...NEW_ACTIVE, slug: "a-part" };
    expect(pickVariantHost([a, b])?.slug).toBe("a-part");
    expect(pickVariantHost([b, a])?.slug).toBe("a-part");
  });
});
