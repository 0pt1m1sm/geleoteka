import { describe, expect, it } from "vitest";
import { GENERATION_MIN_PARTS, isGenerationIndexable } from "@/lib/models/generation-index";

/**
 * Кого пускаем в индекс среди страниц поколений.
 *
 * Правило общее у страницы и карты сайта — они обязаны говорить одно и то же,
 * иначе карта заявляет адреса, которые сами себя закрывают. Порог не «хотя бы
 * одна деталь»: страница с единственной привязкой это код кузова, годы и одна
 * ссылка — те же ~765 знаков вместе с меню, за которые Яндекс исключил
 * половину сайта как малоценные.
 */
describe("isGenerationIndexable", () => {
  it("описание перевешивает количество деталей", () => {
    // Текст про слабые места ценен сам по себе, даже если запчастей не завели.
    expect(isGenerationIndexable({ description: "Про кузов", partsCount: 0 })).toBe(true);
  });

  it("пустое описание не считается описанием", () => {
    expect(isGenerationIndexable({ description: "   ", partsCount: 0 })).toBe(false);
  });

  it("одна-две детали НЕ делают страницу содержательной", () => {
    expect(isGenerationIndexable({ description: null, partsCount: 1 })).toBe(false);
    expect(isGenerationIndexable({ description: null, partsCount: 2 })).toBe(false);
  });

  it("с порога и выше — пускаем: получается оглавление по узлам", () => {
    expect(isGenerationIndexable({ description: null, partsCount: GENERATION_MIN_PARTS })).toBe(true);
    expect(isGenerationIndexable({ description: null, partsCount: 351 })).toBe(true);
  });

  it("ровно под порогом — не пускаем", () => {
    expect(isGenerationIndexable({ description: null, partsCount: GENERATION_MIN_PARTS - 1 })).toBe(false);
  });

  it("пусто по обоим признакам — точно нет", () => {
    expect(isGenerationIndexable({ description: null, partsCount: 0 })).toBe(false);
  });
});
