import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Приём заявки «сообщить о поступлении».
 *
 * Проверяется поведение действия целиком, а не отдельные строки: защита формы
 * тут не украшение, а единственное, что стоит между публичной формой и
 * автоматикой, и постановка требовала её именно потому, что «образца» в проекте
 * не было.
 */

// Как в tests/auth/login-rate-limit.test.ts: пакет server-only в vitest
// резолвится в клиентскую сборку и падает при импорте.
vi.mock("server-only", () => ({}));

const create = vi.fn();
const findUnique = vi.fn();
const publish = vi.fn();
let ip: string | null = "10.0.0.1";

vi.mock("@/lib/db", () => ({
  db: {
    partReference: { findUnique: (...a: unknown[]) => findUnique(...a) },
    partRequest: { create: (...a: unknown[]) => create(...a) },
    // Транзакция в тестах — просто вызов колбэка с тем же клиентом.
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ partRequest: { create: (...a: unknown[]) => create(...a) } }),
  },
}));
vi.mock("@/lib/audit", () => ({ clientIp: async () => ip }));
vi.mock("@/lib/staff-notifications/business-events", () => ({
  publishPartRequestCreated: (...a: unknown[]) => publish(...a),
}));

const REF = { id: "ref-1", oem: "A4634210098", name: "Суппорт тормозной" };

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function submit(fields: Record<string, string>) {
  const { createPartRequest } = await import("@/app/actions/part-requests");
  return createPartRequest(null, form(fields));
}

const GOOD = { oem: "A4634210098", contact: "+7 999 123-45-67" };

describe("createPartRequest", () => {
  beforeEach(async () => {
    create.mockReset();
    findUnique.mockReset();
    publish.mockReset();
    ip = "10.0.0.1";
    findUnique.mockResolvedValue(REF);
    create.mockResolvedValue({ id: "req-1", createdAt: new Date("2026-08-31") });
    publish.mockResolvedValue({});
    vi.resetModules();
    const { partRequestThrottle } = await import("@/lib/rate-limit");
    partRequestThrottle.reset();
  });

  it("принимает заявку и сохраняет СНИМОК номера и названия", async () => {
    // Снимок, а не только связь: заявка обязана читаться, даже если
    // номенклатуру потом удалят (связь объявлена SetNull).
    const res = await submit(GOOD);
    expect(res).toEqual({ error: null, success: true });
    const data = create.mock.calls[0][0].data;
    expect(data.oem).toBe(REF.oem);
    expect(data.partName).toBe(REF.name);
    expect(data.referenceId).toBe(REF.id);
  });

  it("уведомляет ПЕРСОНАЛ — иначе заявка лежит, пока не откроют админку", async () => {
    await submit(GOOD);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][1]).toMatchObject({ requestId: "req-1", oem: REF.oem });
  });

  it("в сводку уведомления НЕ попадает контакт", async () => {
    // Сводка уходит во внешние каналы (Telegram); контакт — персональные данные.
    await submit({ ...GOOD, contact: "+79991234567" });
    expect(JSON.stringify(publish.mock.calls[0][1])).not.toContain("79991234567");
  });

  it("HONEYPOT: заполненная ловушка не создаёт строку, но отвечает как успех", async () => {
    // Сказать боту «ты распознан» значит подсказать, что поправить.
    const res = await submit({ ...GOOD, contact_confirm_url: "http://spam.example" });
    expect(res).toEqual({ error: null, success: true });
    expect(create).not.toHaveBeenCalled();
  });

  it("ТРОТТЛИНГ: шестая заявка с одного адреса отвергается", async () => {
    for (let i = 0; i < 5; i++) expect((await submit(GOOD)).success).toBe(true);
    const sixth = await submit(GOOD);
    expect(sixth.error).toBeTruthy();
    expect(create).toHaveBeenCalledTimes(5);
  });

  it("троттлинг считает и НЕВАЛИДНЫЕ попытки", async () => {
    // Иначе перебор заведомо мусорными данными не стоил бы автомату ничего.
    for (let i = 0; i < 5; i++) await submit({ oem: REF.oem, contact: "нет" });
    expect((await submit(GOOD)).error).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it("троттлинг у разных адресов независим", async () => {
    for (let i = 0; i < 5; i++) await submit(GOOD);
    ip = "10.0.0.2";
    expect((await submit(GOOD)).success).toBe(true);
  });

  it("контакт обязателен и должен быть похож на телефон или почту", async () => {
    for (const contact of ["", "нет", "12345", "не скажу"]) {
      create.mockClear();
      const res = await submit({ oem: REF.oem, contact });
      expect(res.error, contact).toBeTruthy();
      expect(create).not.toHaveBeenCalled();
      const { partRequestThrottle } = await import("@/lib/rate-limit");
      partRequestThrottle.reset();
    }
  });

  it("почта принимается наравне с телефоном", async () => {
    expect((await submit({ oem: REF.oem, contact: "ivan@example.ru" })).success).toBe(true);
  });

  it("номер в русской раскладке находит позицию — как и на самой странице", async () => {
    await submit({ ...GOOD, oem: "А4634210098" });
    expect(findUnique.mock.calls[0][0].where.oem).toBe("A4634210098");
  });

  it("несуществующий номер — отказ, а не пустая строка в базе", async () => {
    findUnique.mockResolvedValue(null);
    expect((await submit(GOOD)).error).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });
});
