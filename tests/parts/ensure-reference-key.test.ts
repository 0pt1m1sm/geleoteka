import { describe, expect, it, vi } from "vitest";
import { ensurePartReference } from "@/lib/part-reference-lookup";

/**
 * Ключ номенклатуры при заведении ТОВАРА.
 *
 * Этот путь — основной: через него идут форма товара, «завести б/у» и заказ
 * поставщику. Прежние тесты закрывали форму справочника и импорт справочника,
 * а этот путь не проверял никто — и в нём кириллица дожила до ревью (PR #109,
 * вторая перепроверка).
 *
 * Чем это плохо на глаз: заведение выглядит успешным, товар лежит в базе, но
 * привязан ко ВТОРОЙ номенклатуре на тот же номер («А» и «A» — разные ключи в
 * уникальном индексе), и на странице своего номера его нет.
 */
function fakeClient() {
  const upsert = vi.fn().mockResolvedValue({ id: "ref-1" });
  return { client: { partReference: { upsert } }, upsert };
}

async function keyFor(article: string): Promise<string | null> {
  const { client, upsert } = fakeClient();
  const id = await ensurePartReference(client as never, { article, name: "Деталь" });
  if (id === null) return null;
  return upsert.mock.calls[0][0].where.oem as string;
}

describe("ensurePartReference: ключ справочника", () => {
  it("артикул в РУССКОЙ раскладке даёт ЛАТИНСКИЙ ключ", async () => {
    // Иначе на один номер появляются две номенклатуры, а товар оказывается
    // привязан к той, которой нет на индексируемой странице.
    expect(await keyFor("А0007601259")).toBe("A0007601259");
  });

  it("русская и латинская запись сходятся в ОДИН ключ", async () => {
    expect(await keyFor("А0007601259")).toBe(await keyFor("A0007601259"));
  });

  it("пунктуация и регистр не создают отдельных ключей", async () => {
    expect(await keyFor("a 000 760 12 59")).toBe("A0007601259");
  });

  it("кириллица без латинского двойника номенклатуру НЕ заводит", async () => {
    // Адрес страницы по номеру принимает только латиницу: по такому ключу
    // canonical карточки повёл бы на 404. Лучше товар без номенклатуры, чем
    // номенклатура с недостижимым адресом.
    expect(await keyFor("ДЕТАЛЬ123")).toBeNull();
  });

  it("служебный артикул номенклатуру не заводит — как и раньше", async () => {
    expect(await keyFor("ПОДЗАКАЗ-01")).toBeNull();
  });
});
