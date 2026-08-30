import { describe, expect, it } from "vitest";
import { validateUsedPartFields } from "@/lib/parts/used-part-validation";

/**
 * Правила заведения б/у экземпляра. Вынесены из server action отдельной чистой
 * функцией именно ради тестируемости: на Story 1 верификатор показал мутацией,
 * что тесты вокруг хелперов не ловят подмену в вызывающем коде, — здесь
 * проверяется само правило, а экшен обязан его звать.
 */
describe("validateUsedPartFields", () => {
  it("новый товар не требует ни фото, ни заметки", () => {
    expect(validateUsedPartFields("NEW", [], "")).toBeNull();
  });

  it("б/у без фотографий отвергается", () => {
    // Фотографии — единственное доказательство состояния при гарантийном
    // возврате: владелец сознательно отказался от оценок и шкал.
    expect(validateUsedPartFields("USED", [], "Потёртости")).toMatch(/фотограф/i);
  });

  it("б/у без заметки о состоянии отвергается", () => {
    expect(validateUsedPartFields("USED", ["a.jpg"], "   ")).toMatch(/состояни/i);
  });

  it("б/у с фото и заметкой проходит", () => {
    expect(validateUsedPartFields("USED", ["a.jpg"], "Потёртости на корпусе")).toBeNull();
  });

  it("восстановленный подчиняется тем же правилам, что и б/у", () => {
    // Он тоже не новый: покупатель должен видеть, что именно ему предлагают.
    expect(validateUsedPartFields("REFURBISHED", [], "Заменены сальники")).toMatch(/фотограф/i);
    expect(validateUsedPartFields("REFURBISHED", ["a.jpg"], "Заменены сальники")).toBeNull();
  });

  it("слишком длинная заметка отвергается до похода в базу", () => {
    // Колонка VarChar(1000); без проверки P2002-подобная ошибка вылезла бы
    // сырой, а текст уходит в SSR-HTML и микроразметку каждой карточки.
    expect(validateUsedPartFields("USED", ["a.jpg"], "x".repeat(1001))).toMatch(/длин/i);
  });
});
