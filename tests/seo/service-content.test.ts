import { describe, expect, it } from "vitest";

import { faqToBlocks, normalizeFaq, parseFaqBlocks } from "@/lib/service-content";

describe("parseFaqBlocks", () => {
  it("splits blocks by blank lines: first line question, rest answer", () => {
    expect(
      parseFaqBlocks("Сколько идёт ТО?\nДва часа.\nИногда четыре.\n\nНужна запись?\nДа."),
    ).toEqual([
      { q: "Сколько идёт ТО?", a: "Два часа. Иногда четыре." },
      { q: "Нужна запись?", a: "Да." },
    ]);
  });

  it("drops blocks without an answer and handles CRLF/extra blanks", () => {
    expect(parseFaqBlocks("Только вопрос без ответа\r\n\r\n\r\nВ?\r\nО.")).toEqual([
      { q: "В?", a: "О." },
    ]);
  });

  it("returns empty for empty input", () => {
    expect(parseFaqBlocks("")).toEqual([]);
    expect(parseFaqBlocks("   \n\n  ")).toEqual([]);
  });
});

describe("faqToBlocks", () => {
  it("round-trips with parseFaqBlocks", () => {
    const faq = [
      { q: "Вопрос один?", a: "Ответ один." },
      { q: "Вопрос два?", a: "Ответ два." },
    ];
    expect(parseFaqBlocks(faqToBlocks(faq))).toEqual(faq);
  });
});

describe("normalizeFaq", () => {
  it("accepts only well-formed {q,a} entries", () => {
    expect(
      normalizeFaq([
        { q: "Ок?", a: "Да." },
        { q: "", a: "без вопроса" },
        { q: "без ответа" },
        "мусор",
        null,
      ]),
    ).toEqual([{ q: "Ок?", a: "Да." }]);
  });

  it("returns empty for non-arrays (null, объект, строка)", () => {
    expect(normalizeFaq(null)).toEqual([]);
    expect(normalizeFaq({ q: "x", a: "y" })).toEqual([]);
    expect(normalizeFaq("[]")).toEqual([]);
  });
});
