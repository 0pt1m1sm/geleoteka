import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isChecked } from "@/lib/forms";

/**
 * Снятая галка обязана сниматься.
 *
 * На четырёх админских экранах — сотрудники, вакансии, поставщики, аренда —
 * стояло `formData.get("isActive") !== "off"`. Браузер снятый чекбокс НЕ
 * отправляет вовсе, поэтому `get()` возвращал `null`, а `null !== "off"` —
 * истина: галка читалась поднятой всегда, и снять сотрудника с сайта или
 * закрыть вакансию через форму было нельзя. Сохранение молча «получалось».
 */
describe("isChecked", () => {
  it("галка снята — поля в запросе нет вовсе, и это ЛОЖЬ", () => {
    // Ровно тот случай, который прежняя проверка разворачивала в истину.
    expect(isChecked(new FormData(), "isActive")).toBe(false);
  });

  it("галка поднята — браузер шлёт «on»", () => {
    const fd = new FormData();
    fd.set("isActive", "on");
    expect(isChecked(fd, "isActive")).toBe(true);
  });

  it("не зависит от атрибута value: у нас он где-то задан, где-то нет", () => {
    // Привязка к «on» сломалась бы на первой форме с другим значением.
    for (const value of ["on", "yes", "1", "true", ""]) {
      const fd = new FormData();
      fd.set("isActive", value);
      expect(isChecked(fd, "isActive")).toBe(true);
    }
  });

  it("«off» — тоже присутствие, а значит истина", () => {
    // Единственное значение, которое старый код считал выключением. Формы его
    // не шлют; если такое поле появится, оно будет означать наличие контрола.
    const fd = new FormData();
    fd.set("isActive", "off");
    expect(isChecked(fd, "isActive")).toBe(true);
  });
});

describe("дефект не вернулся ни в одном из мест", () => {
  const FILES = [
    "app/actions/team-members.ts",
    "app/actions/vacancies.ts",
    "app/actions/suppliers.ts",
    "app/actions/rentals.ts",
    "app/actions/parts.ts",
  ];

  it("нигде не осталось сравнения чекбокса с «off»", () => {
    // Сторож по исходнику, а не по поведению: серверные действия ходят в базу,
    // и разворачивать их ради одной строки разбора дороже, чем поймать саму
    // строку. Поведение самой проверки закрыто тестами выше.
    for (const file of FILES) {
      const src = readFileSync(file, "utf8");
      expect(src, `${file}: сравнение с "off" читает снятую галку как поднятую`).not.toMatch(
        /formData\.get\([^)]*\)\s*!==\s*"off"/,
      );
    }
  });

  it("создание арендной машины НЕ читает чекбокс, которого нет в его форме", () => {
    // Отсутствие поля и снятая галка неразличимы: если бы создание читало
    // чекбокс, каждая новая машина заводилась бы скрытой от клиентов.
    const src = readFileSync("app/actions/rentals.ts", "utf8");
    const create = src.slice(src.indexOf("export async function createRentalCar"));
    const body = create.slice(0, create.indexOf("export async function updateRentalCar"));
    expect(body).toContain("isAvailable: true");
    expect(body).not.toContain('isChecked(formData, "isAvailable")');
  });
});
