import { describe, expect, it } from "vitest";

import { resolveModelSlug } from "@/lib/vehicle-catalog-types";
import { pageSeo, NOINDEX } from "@/lib/seo";

describe("resolveModelSlug — имя модели → реальный слаг каталога", () => {
  it("обычные имена слагифицируются как есть", () => {
    expect(resolveModelSlug("G-Class")).toBe("g-class");
    expect(resolveModelSlug("C-Class")).toBe("c-class");
    expect(resolveModelSlug("GLE")).toBe("gle");
    expect(resolveModelSlug("S-Class")).toBe("s-class");
  });

  it("AMG маппится на реальный слаг amg-gt (не битый /models/amg)", () => {
    expect(resolveModelSlug("AMG")).toBe("amg-gt");
  });

  it("EQ не имеет отдельной страницы → null (ссылку не строим)", () => {
    expect(resolveModelSlug("EQ")).toBeNull();
  });

  it("пустое имя → null", () => {
    expect(resolveModelSlug("")).toBeNull();
    expect(resolveModelSlug("   ")).toBeNull();
  });

  it("регистр и пробелы нормализуются", () => {
    expect(resolveModelSlug("  g-class ")).toBe("g-class");
    expect(resolveModelSlug("V Class")).toBe("v-class");
  });
});

describe("pageSeo noindex-флаг (общая возможность)", () => {
  it("по умолчанию robots не выставляется (страница индексируется)", () => {
    const meta = pageSeo({ title: "T", description: "D", path: "/models/g-class" });
    expect(meta.robots).toBeUndefined();
  });

  it("noindex:true выставляет robots как в NOINDEX, сохраняя canonical/title", () => {
    const meta = pageSeo({ title: "T", description: "D", path: "/x", noindex: true });
    expect(meta.robots).toEqual(NOINDEX.robots);
    expect(meta.alternates).toEqual({ canonical: "/x" });
    expect(meta.title).toBe("T");
  });
});
