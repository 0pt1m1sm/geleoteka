import { describe, expect, it } from "vitest";
import {
  expandGenerationCodes,
  extractModelCodes,
  normalizeOem,
  parseReferenceCsv,
  SERVICE_ARTICLE_RE,
} from "@/lib/part-reference";

describe("extractModelCodes", () => {
  it("pulls unique body codes out of free text, case-insensitive", () => {
    expect(extractModelCodes("Бампер передний G63 AMG (W463)")).toEqual(["W463"]);
    expect(extractModelCodes("Петля двери (W460/W461/w463)")).toEqual([
      "W460",
      "W461",
      "W463",
    ]);
    expect(extractModelCodes("Ступица GLE (W166), GL (X166)")).toEqual(["W166", "X166"]);
  });

  it("supports letter-suffixed and H/N-prefixed codes", () => {
    expect(extractModelCodes("Новый G-Class (W463A)")).toEqual(["W463A"]);
    expect(extractModelCodes("GLA (H247), EQC (N293)")).toEqual(["H247", "N293"]);
  });

  it("ignores OEM numbers, oil grades, engine codes and model designations", () => {
    expect(extractModelCodes("A4637200346 масло 5W-40 0W-40 OM642 VG150 S500")).toEqual([]);
  });
});

describe("expandGenerationCodes", () => {
  it("adds known synonyms and keeps everything else as-is", () => {
    expect(expandGenerationCodes(["W464"])).toEqual(["W464", "W463A"]);
    expect(expandGenerationCodes(["W463A"])).toEqual(["W463A", "W464"]);
    expect(expandGenerationCodes(["W463", "X166"])).toEqual(["W463", "X166"]);
  });
});

describe("normalizeOem", () => {
  it("collapses spacing/punctuation variants to one key", () => {
    expect(normalizeOem("A 463 720 03 46")).toBe("A4637200346");
    expect(normalizeOem("a463-720.03/46")).toBe("A4637200346");
    expect(normalizeOem("A4637200346")).toBe("A4637200346");
  });

  it("keeps cyrillic letters and drops everything else", () => {
    expect(normalizeOem("подзаказ-01")).toBe("ПОДЗАКАЗ01");
    expect(normalizeOem("  ")).toBe("");
  });
});

describe("SERVICE_ARTICLE_RE", () => {
  it("matches service codes but not real OEM numbers", () => {
    expect(SERVICE_ARTICLE_RE.test("ПОДЗАКАЗ-07")).toBe(true);
    expect(SERVICE_ARTICLE_RE.test("VERIFY-QR-123")).toBe(true);
    expect(SERVICE_ARTICLE_RE.test("A4637200346")).toBe(false);
  });
});

describe("parseReferenceCsv", () => {
  it("parses semicolon rows with optional group and models", () => {
    const { rows, errors } = parseReferenceCsv(
      "A4637200346;Диск тормозной передний;Тормозная система;W463, W461\n" +
        "A0004209904;Колодки тормозные передние",
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        oem: "A4637200346",
        name: "Диск тормозной передний",
        groupName: "Тормозная система",
        models: ["W463", "W461"],
      },
      {
        oem: "A0004209904",
        name: "Колодки тормозные передние",
        groupName: null,
        models: [],
      },
    ]);
  });

  it("prefers tab as delimiter when present (Excel paste)", () => {
    const { rows } = parseReferenceCsv("A463 720 03 46\tДиск; тормозной\tТормоза\tW463");
    expect(rows).toEqual([
      {
        oem: "A4637200346",
        name: "Диск; тормозной",
        groupName: "Тормоза",
        models: ["W463"],
      },
    ]);
  });

  it("skips a digit-free header row but not a data row", () => {
    const { rows, errors } = parseReferenceCsv(
      "номер;название;группа;модели\nA4637200346;Диск тормозной",
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].oem).toBe("A4637200346");
  });

  it("rejects service codes and incomplete rows with line numbers", () => {
    const { rows, errors } = parseReferenceCsv(
      "ПОДЗАКАЗ-01;Что-то под заказ\nA4637200346\n\nA0004209904;Колодки",
    );
    expect(rows).toEqual([
      { oem: "A0004209904", name: "Колодки", groupName: null, models: [] },
    ]);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("Строка 1");
    expect(errors[0]).toContain("служебный код");
    expect(errors[1]).toContain("Строка 2");
  });

  it("deduplicates by normalized number, first row wins", () => {
    const { rows } = parseReferenceCsv(
      "A4637200346;Диск тормозной\nA 463 720 03 46;Дубль того же номера",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Диск тормозной");
  });
});
