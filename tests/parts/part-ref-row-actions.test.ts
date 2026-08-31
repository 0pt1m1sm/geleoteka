import { describe, expect, it } from "vitest";
import { partRefRowLinks } from "@/components/admin/PartRefRowActions";

/**
 * Состав меню строки справочника.
 *
 * Три отдельные кнопки в строке («Б/у», «Создать товар», корзина) съедали на
 * телефоне больше половины ширины, и название обрезалось до «Глушитель
 * задни…» — в списке, где позицию ищут глазами по названию. Действия собраны
 * в одно меню. Здесь проверяется не оформление, а то, что при переносе ничего
 * не потерялось и что путь к б/у есть у КАЖДОЙ строки.
 */
describe("partRefRowLinks", () => {
  it("без товара в магазине предлагает его создать", () => {
    const links = partRefRowLinks("ref-1", null);
    expect(links[0]).toEqual({ label: "Создать товар", href: "/admin/parts/new?ref=ref-1" });
  });

  it("с товаром — ведёт в него, а не предлагает второй такой же", () => {
    const links = partRefRowLinks("ref-1", "part-9");
    expect(links[0]).toEqual({ label: "Открыть товар", href: "/admin/parts/part-9" });
  });

  it("б/у экземпляр можно завести в ЛЮБОМ случае — это главный сценарий разбора", () => {
    // Раньше строка с заведённым новым товаром показывала только значок «в
    // магазине» и корзину: чтобы добавить б/у, приходилось открывать карточку
    // позиции. Деталь, снятая с машины, есть и у той номенклатуры, у которой
    // новый товар давно заведён.
    for (const shopPartId of [null, "part-9"]) {
      const used = partRefRowLinks("ref-1", shopPartId).find((l) => l.label.includes("б/у"));
      expect(used?.href).toBe("/admin/parts/new?ref=ref-1&condition=USED");
    }
  });

  it("состояние в адресе задано явно — форма не должна угадывать", () => {
    // condition=USED читает форма заведения товара; без него интерфейс снова
    // вёл бы в «новый» и требовал ручного переключения.
    const used = partRefRowLinks("r", null)[1];
    expect(used.href).toContain("condition=USED");
    expect(partRefRowLinks("r", null)[0].href).not.toContain("condition=");
  });
});
