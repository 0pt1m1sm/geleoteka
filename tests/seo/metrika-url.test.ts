import { describe, expect, it } from "vitest";

import { trackableUrl } from "@/components/shared/MetrikaTracker";

/**
 * Что уходит в чужую аналитику, а что нет.
 *
 * Счётчик смонтирован в публичной группе, и это считалось достаточной защитой.
 * Оказалось — нет: в той же группе лежат страницы входа и страница сметы по
 * ссылке. Владелец увидел в отчёте «Просмотры URL» адреса вида
 * `/login?from=/admin/crm/...` — то есть внутренние маршруты админки. А рядом
 * туда же уходил `/estimate/<токен>`, и это уже не косметика: токен —
 * ключ доступа к смете клиента.
 */

describe("адрес для счётчика", () => {
  it("страницы входа не считаются вовсе", () => {
    expect(trackableUrl("/login", "?from=%2Fadmin%2Fcrm%2Finbox")).toBeNull();
    expect(trackableUrl("/register", "")).toBeNull();
    expect(trackableUrl("/reset-password/confirm", "?token=abc")).toBeNull();
    expect(trackableUrl("/verify-email", "?token=abc")).toBeNull();
  });

  it("страница сметы по ссылке не считается — в адресе ключ доступа", () => {
    expect(trackableUrl("/estimate/9f3c1a2b4d5e", "")).toBeNull();
  });

  it("публичные страницы считаются", () => {
    expect(trackableUrl("/", "")).toBe("/");
    expect(trackableUrl("/parts", "")).toBe("/parts");
    expect(trackableUrl("/services/to", "")).toBe("/services/to");
  });

  it("рекламные метки сохраняются — ради них счётчик и ставят", () => {
    expect(trackableUrl("/", "?utm_source=yandex&utm_campaign=g-class")).toBe(
      "/?utm_source=yandex&utm_campaign=g-class",
    );
    expect(trackableUrl("/parts", "?yclid=123")).toBe("/parts?yclid=123");
  });

  it("прочие параметры срезаются", () => {
    // Ни одна страница не обязана объяснять аналитике, откуда на неё пришли
    // внутри сайта, и тем более передавать чужие идентификаторы.
    expect(trackableUrl("/parts", "?ref=%2Fadmin%2Fcrm&page=2")).toBe("/parts");
    expect(trackableUrl("/blog", "?utm_source=vk&secret=xyz")).toBe("/blog?utm_source=vk");
  });

  it("похожий по началу путь не попадает под запрет по ошибке", () => {
    // `/registration-guide` — это не `/register`.
    expect(trackableUrl("/registration-guide", "")).toBe("/registration-guide");
  });
});
