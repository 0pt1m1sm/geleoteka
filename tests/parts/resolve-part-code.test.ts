import { describe, expect, it } from "vitest";
import { resolvePartIdByCode, type PartCodeLookupPort } from "@/lib/parts/resolve-part-code";

/**
 * Фейковый порт: минимум, который нужен резолверу. Тест намеренно проверяет
 * ПУТЬ РАЗРЕШЕНИЯ КОДА, а не чистую функцию — на Story 1 верификатор показал
 * мутацией, что тесты вокруг хелперов не ловят подмену в вызывающем коде.
 */
function port(rows: Array<{ id: string; sku: string; article: string }>): PartCodeLookupPort {
  return {
    findBySku: async (sku) => rows.find((r) => r.sku === sku) ?? null,
    findByArticle: async (article) => rows.filter((r) => r.article === article),
  };
}

const NEW_PART = { id: "p-new", sku: "A4634210098", article: "A4634210098" };
const USED_1 = { id: "p-u1", sku: "A4634210098-U1", article: "A4634210098" };
const USED_2 = { id: "p-u2", sku: "A4634210098-U2", article: "A4634210098" };

describe("resolvePartIdByCode", () => {
  it("с нашей этикетки находит по sku — это основной путь", async () => {
    const r = await resolvePartIdByCode(port([NEW_PART, USED_1]), "A4634210098-U1", "label");
    expect(r).toEqual({ status: "found", partId: "p-u1" });
  });

  it("с этикетки точный sku снимает неоднозначность номера", async () => {
    const r = await resolvePartIdByCode(port([NEW_PART, USED_1, USED_2]), "A4634210098", "label");
    expect(r).toEqual({ status: "found", partId: "p-new" });
  });

  it("падает на артикул, когда sku не совпал: человек читает номер с самой детали", async () => {
    const r = await resolvePartIdByCode(port([USED_1]), "A4634210098");
    expect(r).toEqual({ status: "found", partId: "p-u1" });
  });

  it("НЕ выбирает произвольный вариант, когда артикул неоднозначен", async () => {
    // Ровно та дыра, которую открыла Story 1: раньше findFirst без orderBy
    // возвращал произвольную строку, и кладовщик списывал остаток с чужой
    // позиции — новый товар вместо б/у экземпляра или наоборот.
    const r = await resolvePartIdByCode(port([NEW_PART, USED_1, USED_2]), "A4634210098");
    expect(r).toEqual({ status: "ambiguous", article: "A4634210098", count: 3 });
  });

  it("две б/у детали одного артикула — тоже неоднозначность, а не «первая попавшаяся»", async () => {
    const r = await resolvePartIdByCode(port([USED_1, USED_2]), "A4634210098");
    expect(r).toEqual({ status: "ambiguous", article: "A4634210098", count: 2 });
  });

  it("введённый вручную sku б/у экземпляра тоже разрешается", async () => {
    // Он не принадлежит ни одному артикулу, поэтому неоднозначности нет.
    const r = await resolvePartIdByCode(port([NEW_PART, USED_1, USED_2]), "A4634210098-U2");
    expect(r).toEqual({ status: "found", partId: "p-u2" });
  });

  it("ВВЕДЁННЫЙ ВРУЧНУЮ номер детали неоднозначен, даже если совпал с sku новой", async () => {
    // Номер штампует производитель — он одинаков на новой детали и на б/у,
    // поэтому «совпал с sku новой позиции» НЕ означает «человек держит новую».
    // Молчаливый выбор новой = списание остатка не с той строки.
    const r = await resolvePartIdByCode(port([NEW_PART, USED_1, USED_2]), "A4634210098", "raw");
    expect(r).toEqual({ status: "ambiguous", article: "A4634210098", count: 3 });
  });

  it("ничего не нашлось", async () => {
    const r = await resolvePartIdByCode(port([NEW_PART]), "НЕТ-ТАКОГО");
    expect(r).toEqual({ status: "not_found" });
  });

  it("пустой код не ходит в базу", async () => {
    let touched = false;
    const spy: PartCodeLookupPort = {
      findBySku: async () => {
        touched = true;
        return null;
      },
      findByArticle: async () => {
        touched = true;
        return [];
      },
    };
    expect(await resolvePartIdByCode(spy, "   ")).toEqual({ status: "not_found" });
    expect(touched).toBe(false);
  });
});
