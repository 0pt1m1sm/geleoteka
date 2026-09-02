import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Настройки формата не должны уметь ронять страницу.
 *
 * Корневая разметка спрашивает их на КАЖДОЙ странице. Первая редакция ловила
 * только «строки арендатора нет» и падала на всём остальном — недоступная база,
 * незаданный `DATABASE_URL`. Этого хватило, чтобы уронить боевую сборку 02.09:
 * в окружении сборки базы нет, предрендер админской страницы умер, и вместе с
 * ним весь выкат.
 *
 * Цена и дата, показанные прежним форматом, — приемлемая деградация.
 * Упавшая страница — нет.
 */

const tenantDb = vi.fn();
vi.mock("@/lib/tenant/scoped-db", () => ({ tenantDb }));

const resolveTenant = vi.fn();
vi.mock("@/lib/tenant", () => ({ resolveTenant, TENANT_KEY: "test" }));

async function load(): Promise<typeof import("@/lib/i18n/server")> {
  vi.resetModules();
  return import("@/lib/i18n/server");
}

const PREVIOUS = { locale: "ru-RU", currency: "RUB", timeZone: "Europe/Moscow" };

describe("настройки формата арендатора", () => {
  beforeEach(() => {
    tenantDb.mockReset();
    resolveTenant.mockReset();
  });

  it("берутся у арендатора, когда база доступна", async () => {
    tenantDb.mockResolvedValue({});
    resolveTenant.mockResolvedValue({
      locale: "de-DE",
      currency: "EUR",
      timeZone: "Europe/Berlin",
    });
    const { tenantLocale } = await load();
    expect(await tenantLocale()).toEqual({
      locale: "de-DE",
      currency: "EUR",
      timeZone: "Europe/Berlin",
    });
  });

  it("не падают, когда база недоступна", async () => {
    // Ровно то, что случилось на сборке: клиент базы не поднялся.
    tenantDb.mockRejectedValue(new Error("PrismaClientInitializationError"));
    const { tenantLocale } = await load();
    await expect(tenantLocale()).resolves.toEqual(PREVIOUS);
  });

  it("не падают, когда запрос к базе бросает", async () => {
    tenantDb.mockResolvedValue({});
    resolveTenant.mockRejectedValue(new Error("connection refused"));
    const { tenantLocale } = await load();
    await expect(tenantLocale()).resolves.toEqual(PREVIOUS);
  });

  it("не падают, когда строки арендатора ещё нет", async () => {
    tenantDb.mockResolvedValue({});
    resolveTenant.mockResolvedValue(null);
    const { tenantLocale } = await load();
    await expect(tenantLocale()).resolves.toEqual(PREVIOUS);
  });
});
