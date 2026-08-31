import { describe, expect, it } from "vitest";
import {
  GENERATION_MIN_PARTS,
  MODEL_MIN_DESCRIPTION,
  isGenerationIndexable,
  isModelIndexable,
} from "@/lib/models/index-policy";

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

describe("isModelIndexable", () => {
  it("одна строчка описания — НЕ содержание", () => {
    // У всех 22 моделей описание 69–163 знака, одинаковое по форме. Именно за
    // это Яндекс исключил 16 страниц моделей из 35.
    expect(isModelIndexable({ description: "Компактный хэтчбек с турбо-мотором.", partsCount: 0 })).toBe(false);
  });

  it("настоящий абзац — содержание", () => {
    expect(isModelIndexable({ description: "я".repeat(MODEL_MIN_DESCRIPTION), partsCount: 0 })).toBe(true);
  });

  it("свой набор запчастей тоже делает страницу нужной", () => {
    // У G-Class 523 привязки: страница перестаёт быть шаблоном.
    expect(isModelIndexable({ description: "Коротко.", partsCount: 523 })).toBe(true);
  });

  it("несколько деталей не спасают шаблон", () => {
    expect(isModelIndexable({ description: "Коротко.", partsCount: 3 })).toBe(false);
  });

  it("описания нет вовсе — нет", () => {
    expect(isModelIndexable({ description: null, partsCount: 0 })).toBe(false);
  });
});
