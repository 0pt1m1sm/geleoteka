import { describe, expect, it } from "vitest";

import { isIndexableModel, INDEXABLE_MODEL_SLUGS } from "@/lib/vehicle-catalog-types";
import { pageSeo, NOINDEX } from "@/lib/seo";

describe("isIndexableModel — фокус на G-Class", () => {
  it("g-class индексируется", () => {
    expect(isIndexableModel("g-class")).toBe(true);
  });

  it("прочие модели Mercedes — нет", () => {
    for (const slug of ["a-class", "c-class", "cla", "cls", "gle", "gls", "eqa", "eqs", "amg-gt", "v-class"]) {
      expect(isIndexableModel(slug)).toBe(false);
    }
  });

  it("неизвестный слаг — не индексируется", () => {
    expect(isIndexableModel("")).toBe(false);
    expect(isIndexableModel("amg")).toBe(false);
    expect(isIndexableModel("eq")).toBe(false);
  });

  it("множество содержит только g-class", () => {
    expect([...INDEXABLE_MODEL_SLUGS]).toEqual(["g-class"]);
  });
});

describe("pageSeo noindex-флаг", () => {
  it("по умолчанию robots не выставляется (страница индексируется)", () => {
    const meta = pageSeo({ title: "T", description: "D", path: "/models/g-class" });
    expect(meta.robots).toBeUndefined();
  });

  it("noindex:true выставляет robots как в NOINDEX, сохраняя canonical/title", () => {
    const meta = pageSeo({ title: "T", description: "D", path: "/models/c-class", noindex: true });
    expect(meta.robots).toEqual(NOINDEX.robots);
    expect(meta.alternates).toEqual({ canonical: "/models/c-class" });
    expect(meta.title).toBe("T");
  });
});
